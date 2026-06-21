import { describe, it, expect, vi, type Mock } from 'vitest';
import type { Run } from '@prisma/client';
import { AgentRunnerService } from './agent-runner.service';
import type { LlmService } from '../../shared/llm/llm.service';
import type { ToolRegistry } from './tool.registry';
import type { RunEngineService } from '../../shared/run-engine/run-engine.service';
import type { AgentTool } from './tool.types';

type Mocks = {
  chatWithTools: Mock;
  get: Mock;
  emit: Mock;
  runner: AgentRunnerService;
};

function makeMocks(): Mocks {
  const chatWithTools = vi.fn();
  const get = vi.fn();
  const emit = vi.fn().mockResolvedValue(undefined);
  const llm = { chatWithTools } as unknown as LlmService;
  const registry = { schemas: () => [], get } as unknown as ToolRegistry;
  const runEngine = { emit } as unknown as RunEngineService;
  return {
    chatWithTools,
    get,
    emit,
    runner: new AgentRunnerService(llm, registry, runEngine),
  };
}

const run = { runId: 'r1', userId: 7, task: '整理资料' } as Run;

const toolCallMsg = (name: string, args = '{}') => ({
  role: 'assistant',
  content: null,
  tool_calls: [
    { id: 'c1', type: 'function', function: { name, arguments: args } },
  ],
});
const finalMsg = (content: string) => ({
  role: 'assistant',
  content,
  tool_calls: [],
});
const stubTool = (result: string): AgentTool => ({
  schema: {
    type: 'function',
    function: { name: 'x', parameters: { type: 'object', properties: {} } },
  },
  run: vi.fn().mockResolvedValue(result),
});

const types = (emit: Mock) => emit.mock.calls.map((c) => c[1] as string);

describe('AgentRunnerService', () => {
  it('调工具 → 收敛:emit 轨迹 tool_called → tool_result → final_answer', async () => {
    const m = makeMocks();
    m.chatWithTools
      .mockResolvedValueOnce(toolCallMsg('list_documents'))
      .mockResolvedValueOnce(finalMsg('这是综述'));
    m.get.mockReturnValueOnce(stubTool('文档 1:a'));

    await m.runner.run(run);

    expect(types(m.emit)).toEqual([
      'tool_called',
      'tool_result',
      'final_answer',
    ]);
    const toolResult = m.emit.mock.calls.find((c) => c[1] === 'tool_result');
    expect(toolResult?.[2]).toMatchObject({
      name: 'list_documents',
      result: '文档 1:a',
    });
    const final = m.emit.mock.calls.find((c) => c[1] === 'final_answer');
    expect(final?.[2]).toMatchObject({ content: '这是综述' });
  });

  it('未知工具不崩:把错误文本喂回模型,循环继续到收敛', async () => {
    const m = makeMocks();
    m.chatWithTools
      .mockResolvedValueOnce(toolCallMsg('nope'))
      .mockResolvedValueOnce(finalMsg('done'));
    m.get.mockReturnValueOnce(undefined);

    await m.runner.run(run);

    const toolResult = m.emit.mock.calls.find((c) => c[1] === 'tool_result');
    expect(toolResult?.[2]).toMatchObject({ result: '错误:未知工具 nope' });
    expect(types(m.emit).at(-1)).toBe('final_answer');
  });

  it('达到步数上限:兜底 final_answer 标记 truncated,不无限循环', async () => {
    const m = makeMocks();
    m.chatWithTools.mockResolvedValue(toolCallMsg('list_documents'));
    m.get.mockReturnValue(stubTool('x'));

    await m.runner.run(run);

    expect(m.chatWithTools).toHaveBeenCalledTimes(8);
    const final = m.emit.mock.calls.find((c) => c[1] === 'final_answer');
    expect(final?.[2]).toMatchObject({ truncated: true });
  });
});
