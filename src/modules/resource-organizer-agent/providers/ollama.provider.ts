import { Injectable, ServiceUnavailableException } from '@nestjs/common';

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
    // fetch 自身没有内建超时，这里用 AbortController + setTimeout 手动实现
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.resolveModel(params.model),
          // 这里关闭 Ollama 自身流式输出，当前项目统一由后端自己的 SSE 往前端推业务事件
          stream: false,
          messages: params.messages,
          options: {
            temperature: params.temperature,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Ollama 请求失败，状态码 ${response.status}。请确认本地模型服务可用。`,
        );
      }

      return (await response.json()) as OllamaChatResponse;
    } catch (error) {
      throw new ServiceUnavailableException(
        error instanceof Error
          ? `无法调用 Ollama：${error.message}`
          : '无法调用 Ollama 服务',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private extractJson(text: string): string {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);

    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

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

    // 兜底策略：从第一个 { 或 [ 开始截取，兼容模型前面多说了几句说明文字
    return text.slice(start).trim();
  }
}
