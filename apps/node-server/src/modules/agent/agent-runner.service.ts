import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Run } from '@prisma/client';
import { LlmService, type ChatMessage } from '../../shared/llm/llm.service';
import { RunEngineService } from '../../shared/run-engine/run-engine.service';
import { ToolRegistry } from './tool.registry';
import type { ToolContext } from './tool.types';

/** 推理步数上限:防工具调用死循环把上下文/费用打爆 */
const MAX_ITERATIONS = 8;

const SYSTEM_PROMPT = [
  '你是一个能调用工具操作用户个人知识库的助手。',
  '可用工具:list_documents(看有哪些文档)、organize(按关键词筛某类文档)、',
  'summarize_document(概括某个文档)、retrieve_knowledge(语义检索资料片段)。',
  '请先用工具收集信息,再综合作答;最终回答要基于工具返回的真实内容,',
  '涉及具体文档时用「文档 N」标注来源,不要编造不存在的文档或内容。',
].join('\n');

/**
 * agent 工具编排循环(自建,不依赖 LangGraph/LangChain)。
 *
 * 每步都经 RunEngine.emit 落库 + 广播,形成可断线重连回放的审计轨迹:
 * tool_called / tool_result(每次调工具)、final_answer(收敛)。
 * start/complete 由 RunProcessor 在外层统一包裹,这里只产出领域事件。
 */
@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly registry: ToolRegistry,
    private readonly runEngine: RunEngineService,
  ) {}

  async run(run: Run): Promise<void> {
    const ctx: ToolContext = { userId: run.userId, runId: run.runId };
    const tools = this.registry.schemas();
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: run.task },
    ];

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const msg = await this.llm.chatWithTools(messages, tools);
      messages.push(msg);

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        await this.runEngine.emit(run.runId, 'final_answer', {
          content: msg.content ?? '',
        });
        return;
      }

      for (const call of toolCalls) {
        if (call.type !== 'function') continue;
        const name = call.function.name;
        const args = this.parseArgs(call.function.arguments);
        await this.runEngine.emit(run.runId, 'tool_called', {
          name,
          args: args as Prisma.InputJsonValue,
        });

        const result = await this.execTool(name, args, ctx);
        await this.runEngine.emit(run.runId, 'tool_result', {
          name,
          result: result.slice(0, 2000),
        });
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }

    // 兜底:达到步数上限仍未收敛,给前端一个终态 final_answer 而非悬挂
    this.logger.warn(`run=${run.runId} 达到最大推理步数 ${MAX_ITERATIONS}`);
    await this.runEngine.emit(run.runId, 'final_answer', {
      content: '(已达最大推理步数,未能得出最终答案)',
      truncated: true,
    });
  }

  /** 工具异常不让整个 run 崩,而是把错误文本喂回模型,让它自行纠偏/换路 */
  private async execTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<string> {
    const tool = this.registry.get(name);
    if (!tool) return `错误:未知工具 ${name}`;
    try {
      return await tool.run(args, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`工具 ${name} 执行失败:${msg}`);
      return `工具执行失败:${msg}`;
    }
  }

  /** 模型给的 arguments 是 JSON 字符串,可能为空或不合法,统一兜成 {} */
  private parseArgs(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
