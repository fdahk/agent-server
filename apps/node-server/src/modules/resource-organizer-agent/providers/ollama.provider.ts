/**
 * Ollama 大模型调用封装（Provider）
 *
 * 本文件封装了与 Ollama 本地大模型服务的所有通信逻辑。
 * Ollama 是一个本地运行的 LLM 推理服务，提供类似 OpenAI 的 Chat API。
 *
 * OllamaProvider 对外提供两个核心能力：
 *   - completeText()：发送 prompt，获取纯文本回复
 *   - completeJson<T>()：发送 prompt，获取结构化 JSON 回复并解析为指定类型
 *
 * 【什么是 Provider？】
 * 在 NestJS 中，Provider 是一个宽泛的概念，包括服务（Service）、工厂、辅助工具等。
 * 只要是被 @Injectable() 标记且在 @Module() 的 providers 中注册的类，都是 Provider。
 * 这里命名为 "Provider" 而非 "Service"，强调它是一个"外部能力的提供者/适配器"，
 * 而非业务编排者。
 */

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AxiosHttpClient } from '../../../shared/clients/axios-http.client';

/**
 * OllamaMessage —— Ollama Chat API 的消息格式
 *
 * 每条消息有一个角色（role）和内容（content）：
 *   - 'system'：系统指令，用于设定 AI 的行为规则（不参与对话显示）
 *   - 'user'：用户输入
 *   - 'assistant'：AI 的回复
 *
 * 这与 OpenAI 的 ChatCompletion API 消息格式完全一致。
 */
type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * OllamaChatResponse —— Ollama /api/chat 接口的响应格式
 *
 * message?.content 包含 AI 生成的文本回复。
 * 使用 ? 可选属性标记，因为异常情况下这些字段可能不存在。
 */
type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

/**
 * OllamaProvider —— Ollama 模型调用服务
 *
 * @Injectable() 标记后可被 NestJS 依赖注入。
 * 它依赖 AxiosHttpClient 来发送 HTTP 请求。
 */
@Injectable()
export class OllamaProvider {
  /**
   * 构造函数注入 AxiosHttpClient。
   * NestJS 会自动注入在同一模块 providers 中注册的 AxiosHttpClient 实例。
   */
  constructor(private readonly httpClient: AxiosHttpClient) {}

  /**
   * Ollama 服务的基础 URL。
   * 从环境变量读取，默认为本地 11434 端口（Ollama 默认端口）。
   */
  private readonly baseUrl =
    process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';

  /**
   * 默认使用的模型名称。
   * 从环境变量读取，默认为 qwen2.5:7b（通义千问 2.5 7B 参数版本）。
   */
  private readonly defaultModel = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';

  /**
   * 单次 AI 调用的 HTTP 超时时间（毫秒）。
   * AI 推理可能较慢，默认给 120 秒。
   */
  private readonly timeoutMs = Number(
    process.env.OLLAMA_HTTP_TIMEOUT_MS ?? 120000,
  );

  /**
   * 调用 AI 获取纯文本回复
   *
   * @param params.systemPrompt  - 系统指令（设定 AI 的角色和行为规则）
   * @param params.userPrompt    - 用户输入（具体的任务内容）
   * @param params.model         - 可选，指定模型
   * @param params.temperature   - 可选，控制回复的随机性（0=确定性最高，1=最随机）
   * @returns Promise<string>    - AI 生成的文本
   * @throws ServiceUnavailableException - 当 AI 返回空响应时抛出 503 异常
   *
   * ServiceUnavailableException 对应 HTTP 503 状态码，表示"服务暂时不可用"。
   */
  async completeText(params: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    temperature?: number;
  }): Promise<string> {
    const data = await this.requestChat({
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      model: params.model,
      /** ?? 空值合并：temperature 未传时默认 0.2（偏确定性） */
      temperature: params.temperature ?? 0.2,
    });

    /**
     * ?. 可选链：如果 data.message 为 null/undefined，直接返回 undefined 而不报错。
     * 这是处理可能缺失的嵌套属性的安全方式。
     */
    const content = data.message?.content?.trim();
    if (!content) {
      throw new ServiceUnavailableException('Ollama 返回了空响应');
    }

    return content;
  }

  /**
   * 调用 AI 获取结构化 JSON 回复并解析为指定类型
   *
   * 内部先调用 completeText 获取文本，再通过 extractJson 提取 JSON 部分，
   * 最后用 JSON.parse 解析为类型 T。
   *
   * @param params - 同 completeText 参数
   * @returns Promise<T> - 解析后的 JSON 对象，类型由调用方的泛型参数决定
   *
   * 【as T 类型断言】
   * JSON.parse() 的返回类型是 any，通过 as T 告诉 TypeScript"我确定这是 T 类型"。
   * 这是一种"信任 AI 输出格式"的做法，实际生产中可能需要额外的 schema 校验。
   */
  async completeJson<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    temperature?: number;
  }): Promise<T> {
    const text = await this.completeText({
      ...params,
      /** JSON 解析要求更高的确定性，默认 temperature 为 0 */
      temperature: params.temperature ?? 0,
    });

    /** 从文本中提取 JSON 字符串（处理 AI 可能添加的 markdown 围栏等） */
    const normalized = this.extractJson(text);
    return JSON.parse(normalized) as T;
  }

  /**
   * 解析模型名称：使用用户指定的模型，或回退到默认模型
   *
   * @param inputModel - 用户传入的模型名称（可选）
   * @returns string   - 最终使用的模型名称
   */
  resolveModel(inputModel?: string): string {
    return inputModel?.trim() || this.defaultModel;
  }

  /**
   * 实际发送 HTTP 请求到 Ollama /api/chat 接口（私有方法）
   *
   * @param params.messages    - 消息列表（system + user）
   * @param params.model       - 模型名称
   * @param params.temperature - 温度参数
   * @returns Promise<OllamaChatResponse> - Ollama 的原始响应
   * @throws ServiceUnavailableException - 请求失败时抛出 503 异常
   */
  private async requestChat(params: {
    messages: OllamaMessage[];
    model?: string;
    temperature: number;
  }): Promise<OllamaChatResponse> {
    try {
      const response = await this.httpClient.post<OllamaChatResponse>(
        `${this.baseUrl}/api/chat`,
        {
          model: this.resolveModel(params.model),
          /** stream: false 表示非流式响应，等待 AI 生成完整回复后一次性返回 */
          stream: false,
          messages: params.messages,
          options: {
            temperature: params.temperature,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.timeoutMs,
        },
      );

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Ollama 请求失败，状态码 ${response.status}。请确认本地模型服务可用。`,
        );
      }

      return response.data;
    } catch (error) {
      /**
       * instanceof 运算符检查 error 是否是 Error 类的实例。
       * 如果是，使用其 message 属性提供更详细的错误信息；
       * 否则返回通用错误描述。
       */
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `无法调用 Ollama：${error.message}`
          : '无法调用 Ollama 服务',
      );
    }
  }

  /**
   * 从 AI 的文本回复中提取 JSON 字符串
   *
   * AI 有时会在 JSON 外面包一层 markdown 代码块（```json ... ```），
   * 或者在 JSON 前后加上解释性文字。这个方法负责"剥离杂质，提取纯 JSON"。
   *
   * 提取策略：
   *   1. 优先匹配 ```json ... ``` 代码块内的内容
   *   2. 否则找到第一个 { 或 [ 的位置，从那里截取到末尾
   *   3. 都找不到则抛出异常
   */
  private extractJson(text: string): string {
    /** 正则匹配 markdown JSON 代码块：```json\n{...}\n``` */
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);

    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    /** 找到第一个 { 或 [ 出现的位置 */
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const start =
      firstBrace === -1
        ? firstBracket
        : firstBracket === -1
          ? firstBrace
          : Math.min(firstBrace, firstBracket);

    if (start === -1) {
      throw new ServiceUnavailableException('Ollama 没有返回可解析的 JSON');
    }

    return text.slice(start).trim();
  }
}
