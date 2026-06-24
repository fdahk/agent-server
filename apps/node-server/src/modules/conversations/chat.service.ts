import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LlmService, type ChatMessage } from '../../shared/llm/llm.service';
import {
  RagRetriever,
  type RetrievedChunk,
} from '../../shared/rag/rag.retriever';
import { ConversationsService } from './conversations.service';
import type { Citation } from '../../contracts/gen/ourchat/agent/v1/agent';

/** 拼进 prompt 的最近历史条数(控制总 token,长对话需另做摘要压缩) */
const HISTORY_LIMIT = 10;

const SYSTEM_PROMPT = [
  '你是一个个人知识助手,只能依据下方「资料」回答用户问题。',
  '若资料不足以回答,如实说明"资料中没有相关内容",不要编造。',
  '引用资料时用 [n] 标注来源编号(对应资料前的序号)。',
].join('\n');

/** 流式过程中产出给 SSE 的事件 */
export type ChatStreamEvent =
  | { type: 'token'; value: string }
  | { type: 'done'; messageId: number; citations: Citation[] };

export type { Citation };

/**
 * RAG 对话编排:存提问 → 检索(强制 user 过滤)→ 拼 prompt(system+资料+历史+提问)
 * → 流式生成并逐 token 产出 → 存 assistant 回答 + citations。
 *
 * 全程在 web 进程同步完成(检索快、生成流式),不走 worker。
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly retriever: RagRetriever,
    private readonly conversations: ConversationsService,
  ) {}

  async *streamAnswer(
    userId: number,
    conversationId: number,
    query: string,
    topK?: number,
  ): AsyncIterable<ChatStreamEvent> {
    const conv = await this.conversations.ensureOwned(userId, conversationId);

    // 取历史(在写入本轮提问之前),最多最近 HISTORY_LIMIT 条,按时间升序拼 prompt
    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    history.reverse();

    await this.prisma.message.create({
      data: { conversationId, role: 'user', content: query },
    });

    const chunks = await this.retriever.retrieve(userId, query, topK);
    const messages = this.buildMessages(chunks, history, query);

    let answer = '';
    for await (const token of this.llm.chatStream(messages)) {
      answer += token;
      yield { type: 'token', value: token };
    }

    const citations: Citation[] = chunks.map((c) => ({
      chunkId: c.chunkId,
      documentId: c.documentId,
      score: c.score,
    }));
    const saved = await this.prisma.message.create({
      data: {
        conversationId,
        role: 'assistant',
        content: answer,
        citations: citations as unknown as object,
      },
    });

    // 首轮提问顺手把默认标题改成问题摘要;并 bump updatedAt 供会话列表排序
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data:
        conv.title === '新对话'
          ? { title: query.slice(0, 64) }
          : { updatedAt: new Date() },
    });

    this.logger.log(
      `对话生成完成 conversation=${conversationId} chunks=${chunks.length} len=${answer.length}`,
    );
    yield { type: 'done', messageId: saved.id, citations };
  }

  /** system(含资料)+ 历史 + 本轮提问 */
  private buildMessages(
    chunks: RetrievedChunk[],
    history: { role: string; content: string }[],
    query: string,
  ): ChatMessage[] {
    const context =
      chunks.length === 0
        ? '(无检索到的资料)'
        : chunks
            .map((c, i) => `[${i + 1}] (文档 ${c.documentId}) ${c.content}`)
            .join('\n\n');

    return [
      { role: 'system', content: `${SYSTEM_PROMPT}\n\n资料:\n${context}` },
      ...history.map(
        (m): ChatMessage =>
          m.role === 'assistant'
            ? { role: 'assistant', content: m.content }
            : { role: 'user', content: m.content },
      ),
      { role: 'user', content: query },
    ];
  }
}
