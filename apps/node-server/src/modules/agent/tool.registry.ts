import { Injectable } from '@nestjs/common';
import type OpenAI from 'openai';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LlmService } from '../../shared/llm/llm.service';
import { RagRetriever } from '../../shared/rag/rag.retriever';
import type { AgentTool } from './tool.types';

/** 喂回模型的工具结果上限,防单条工具输出塞爆上下文 */
const MAX_DOC_CHARS = 6000;

/** LLM 给的工具参数是任意 JSON,非字符串一律当空串,避免 [object Object] */
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * 工具注册表:集中声明 agent 可用的全部工具,并按名取用。
 *
 * 工具实现内联在此(无独立 provider):每个工具只是 { schema, run } 对,
 * 捕获注入的 Rag/Prisma/Llm 依赖。所有读用户数据的工具都按 ctx.userId 过滤。
 */
@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  constructor(
    private readonly retriever: RagRetriever,
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {
    for (const tool of [
      this.retrieveKnowledge(),
      this.listDocuments(),
      this.summarizeDocument(),
      this.organize(),
    ]) {
      this.tools.set(tool.schema.function.name, tool);
    }
  }

  /** 全部工具的 schema,直接喂给 chatWithTools */
  schemas(): OpenAI.Chat.Completions.ChatCompletionFunctionTool[] {
    return [...this.tools.values()].map((t) => t.schema);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /** 语义检索个人知识库(复用唯一检索入口 RagRetriever,user 过滤写死在那一层) */
  private retrieveKnowledge(): AgentTool {
    return {
      schema: {
        type: 'function',
        function: {
          name: 'retrieve_knowledge',
          description:
            '在用户的个人知识库中按语义检索相关片段,返回命中的资料文本及其文档编号。回答涉及资料内容的问题时优先用它。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '检索关键词或问题' },
            },
            required: ['query'],
          },
        },
      },
      run: async (args, ctx) => {
        const query = asString(args.query).trim();
        if (!query) return '错误:query 不能为空';
        const chunks = await this.retriever.retrieve(ctx.userId, query);
        if (chunks.length === 0) return '没有检索到相关资料。';
        return chunks
          .map((c, i) => `[${i + 1}] (文档 ${c.documentId}) ${c.content}`)
          .join('\n\n');
      },
    };
  }

  /** 列出用户已上传的全部文档(供 agent 先看清有哪些资料) */
  private listDocuments(): AgentTool {
    return {
      schema: {
        type: 'function',
        function: {
          name: 'list_documents',
          description:
            '列出用户已上传的全部文档(编号、文件名、摄取状态、片段数)。需要先了解用户有哪些资料时调用。',
          parameters: { type: 'object', properties: {} },
        },
      },
      run: async (_args, ctx) => {
        const docs = await this.prisma.document.findMany({
          where: { userId: ctx.userId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, filename: true, status: true, chunkCount: true },
        });
        if (docs.length === 0) return '用户还没有上传任何文档。';
        return docs
          .map(
            (d) =>
              `文档 ${d.id}:${d.filename}(状态 ${d.status},${d.chunkCount} 片段)`,
          )
          .join('\n');
      },
    };
  }

  /** 概括某个文档:取其片段拼起来让模型生成摘要 */
  private summarizeDocument(): AgentTool {
    return {
      schema: {
        type: 'function',
        function: {
          name: 'summarize_document',
          description:
            '概括某一个文档的要点。传入 list_documents 返回的文档编号。',
          parameters: {
            type: 'object',
            properties: {
              documentId: { type: 'integer', description: '文档编号' },
            },
            required: ['documentId'],
          },
        },
      },
      run: async (args, ctx) => {
        const documentId = Number(args.documentId);
        if (!Number.isInteger(documentId)) {
          return '错误:documentId 必须是整数';
        }
        const doc = await this.prisma.document.findFirst({
          where: { id: documentId, userId: ctx.userId },
        });
        if (!doc) return `错误:文档 ${documentId} 不存在或无权访问`;
        const chunks = await this.prisma.documentChunk.findMany({
          where: { documentId, userId: ctx.userId },
          orderBy: { chunkIndex: 'asc' },
          take: 20,
        });
        if (chunks.length === 0) {
          return `文档 ${documentId}(${doc.filename})还没有可用片段(可能尚未摄取完成)。`;
        }
        const text = chunks
          .map((c) => c.content)
          .join('\n')
          .slice(0, MAX_DOC_CHARS);
        const summary = await this.llm.chat([
          {
            role: 'system',
            content: '用 3-5 句话概括下面文档内容的要点,只输出概括本身。',
          },
          { role: 'user', content: text },
        ]);
        return `文档 ${documentId}(${doc.filename})摘要:\n${summary}`;
      },
    };
  }

  /** 按关键词筛选文档(匹配文件名):把"某一类"资料先圈出来再逐个处理 */
  private organize(): AgentTool {
    return {
      schema: {
        type: 'function',
        function: {
          name: 'organize',
          description:
            '按关键词筛选用户文档(匹配文件名),用于把"某一类"文档先圈出来,再逐个 summarize_document。',
          parameters: {
            type: 'object',
            properties: {
              keyword: {
                type: 'string',
                description: '用于匹配文件名的关键词',
              },
            },
            required: ['keyword'],
          },
        },
      },
      run: async (args, ctx) => {
        const keyword = asString(args.keyword).trim();
        if (!keyword) return '错误:keyword 不能为空';
        const docs = await this.prisma.document.findMany({
          where: {
            userId: ctx.userId,
            filename: { contains: keyword, mode: 'insensitive' },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, filename: true, status: true, chunkCount: true },
        });
        if (docs.length === 0) {
          return `没有文件名包含「${keyword}」的文档。`;
        }
        return docs
          .map(
            (d) =>
              `文档 ${d.id}:${d.filename}(状态 ${d.status},${d.chunkCount} 片段)`,
          )
          .join('\n');
      },
    };
  }
}
