import { describe, it, expect, vi, beforeEach } from 'vitest';
import type OpenAI from 'openai';
import { LlmService } from './llm.service';

/**
 * LlmService 单元测试 —— mock OpenAI 客户端,不调真模型
 */

function makeMockClient() {
  const chatCreate = vi.fn();
  const embedCreate = vi.fn();
  const client = {
    chat: { completions: { create: chatCreate } },
    embeddings: { create: embedCreate },
  } as unknown as OpenAI;
  return { client, chatCreate, embedCreate };
}

describe('LlmService', () => {
  let svc: LlmService;
  let chatCreate: ReturnType<typeof vi.fn>;
  let embedCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const m = makeMockClient();
    svc = new LlmService(m.client, 'mock-chat', 'mock-embed');
    chatCreate = m.chatCreate;
    embedCreate = m.embedCreate;
  });

  it('chat 用配置的 model + stream=false 发请求,返回 content', async () => {
    chatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'hi' } }],
    });

    const out = await svc.chat([{ role: 'user', content: 'hello' }]);

    expect(chatCreate).toHaveBeenCalledTimes(1);
    expect(chatCreate).toHaveBeenCalledWith({
      model: 'mock-chat',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    });
    expect(out).toBe('hi');
  });

  it('chat 在 content 缺失时返回空串(不抛错)', async () => {
    chatCreate.mockResolvedValueOnce({ choices: [{ message: {} }] });
    const out = await svc.chat([{ role: 'user', content: 'x' }]);
    expect(out).toBe('');
  });

  it('embed 单 string 自动包成 [string] 并使用配置的 embed model', async () => {
    embedCreate.mockResolvedValueOnce({
      data: [{ embedding: [1, 0] }],
    });

    const out = await svc.embed('hello');

    expect(embedCreate).toHaveBeenCalledWith({
      model: 'mock-embed',
      input: ['hello'],
    });
    expect(out).toEqual([[1, 0]]);
  });

  it('embed 批数组按顺序返回二维向量', async () => {
    embedCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
    });

    const out = await svc.embed(['a', 'b']);

    expect(embedCreate).toHaveBeenCalledWith({
      model: 'mock-embed',
      input: ['a', 'b'],
    });
    expect(out).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });
});
