/** 运行状态机:queued → running → completed | failed */
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

/** 运行类型:文档摄取作业 / agent 任务 */
export type RunKind = 'ingestion' | 'agent_task';

/** 某个 run 的事件广播频道名 */
export function runChannel(runId: string): string {
  return `run:${runId}`;
}
