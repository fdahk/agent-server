import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AxiosHttpClient } from '../../../shared/clients/axios-http.client';

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

@Injectable()
export class OllamaProvider {
  // 作为 Nest Provider 承载模型服务配置与调用封装，供模块内其他服务通过依赖注入复用
  constructor(private readonly httpClient: AxiosHttpClient) {}

  private readonly baseUrl =
    process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  private readonly defaultModel = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
  private readonly timeoutMs = Number(
    process.env.OLLAMA_HTTP_TIMEOUT_MS ?? 120000,
  );

  async completeText(params: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    temperature?: number;
  }): Promise<string> {
    // 对业务层暴露“拿纯文本”的简单接口，底层仍然走 /api/chat
    const data = await this.requestChat({
      messages: [
        { role: 'system', content: params.systemPrompt },
        { role: 'user', content: params.userPrompt },
      ],
      model: params.model,
      temperature: params.temperature ?? 0.2,
    });

    const content = data.message?.content?.trim();

    if (!content) {
      throw new ServiceUnavailableException('Ollama 返回了空响应');
    }

    return content;
  }

  async completeJson<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    temperature?: number;
  }): Promise<T> {
    // 先拿文本，再从模型回复里截出 JSON 片段并解析成目标类型
    const text = await this.completeText({
      ...params,
      temperature: params.temperature ?? 0,
    });

    const normalized = this.extractJson(text);
    return JSON.parse(normalized) as T;
  }

  resolveModel(inputModel?: string): string {
    return inputModel?.trim() || this.defaultModel;
  }

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
          // 关闭 Ollama 自身流式输出，当前项目统一由后端自己的 SSE 往前端推业务事件
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
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `无法调用 Ollama：${error.message}`
          : '无法调用 Ollama 服务',
      );
    }
  }

  // 从文本中提取 JSON 片段
  private extractJson(text: string): string {
    // 匹配 ```json 和 ``` 之间的内容，[\s\S]*? 表示匹配任意字符，包括换行符
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);

    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    // 从文本中提取 JSON 片段的兜底策略：从第一个 { 或 [ 开始截取，兼容模型前面多说了几句说明文字
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
