import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

/**
 * Chat 消息类型直接复用 OpenAI SDK 的判别联合
 * 模块本就是 OpenAI 兼容协议(对接 Ollama / DeepSeek / 硅基流动 等),
 * 不另起一套 wrapper 类型,既保证 SDK 严格类型,又避免 cast hack
 */
export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * LlmService —— 模型层唯一入口(OpenAI 兼容协议)
 *
 * - 所有调用走 OpenAI 兼容协议,业务代码不依赖具体厂商
 * - 切换 Ollama → DeepSeek/通义/硅基流动 等只需改 LLM_BASE_URL / API_KEY / MODEL
 * - chat 默认 stream=false,需要流式时再加重载
 * - embed 始终批处理(input 接数组),减少 HTTP 往返
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly client: OpenAI,
    public readonly chatModel: string,
    public readonly embedModel: string,
  ) {}

  /** 非流式 chat。返回 assistant 回答的 content 字符串 */
  async chat(messages: ChatMessage[]): Promise<string> {
    const resp = await this.client.chat.completions.create({
      model: this.chatModel,
      messages,
      stream: false,
    });
    return resp.choices[0]?.message?.content ?? '';
  }

  /**
   * 流式 chat:逐 token 产出 delta.content,供 RAG 对话边生成边经 SSE 推前端。
   * 调用方用 `for await (const token of llm.chatStream(msgs))` 消费。
   */
  async *chatStream(messages: ChatMessage[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.chatModel,
      messages,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  /** 批量 embedding。单 string 自动包成 [string] */
  async embed(input: string | string[]): Promise<number[][]> {
    const batch = Array.isArray(input) ? input : [input];
    const resp = await this.client.embeddings.create({
      model: this.embedModel,
      input: batch,
    });
    return resp.data.map((d) => d.embedding);
  }
}
