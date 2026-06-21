import type OpenAI from 'openai';

/** 工具执行时的上下文:始终带 userId(多租户隔离)+ runId(便于追踪) */
export interface ToolContext {
  userId: number;
  runId: string;
}

/**
 * agent 可调用的工具。
 * - schema:给 LLM 的 function-calling 声明(name/description/parameters)
 * - run:实际执行,入参是 LLM 给的(已解析的)JSON 参数,返回喂回模型的文本结果
 *
 * 约定:工具内部任何对用户数据的查询都必须用 ctx.userId 过滤,严禁跨租户。
 */
export interface AgentTool {
  readonly schema: OpenAI.Chat.Completions.ChatCompletionFunctionTool;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}
