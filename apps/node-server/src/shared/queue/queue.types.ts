/** BullMQ 队列名:摄取/agent 等异步作业统一走这一条 runs 队列 */
export const RUNS_QUEUE = 'runs';

/** 入队作业的载荷:只带定位信息,业务状态以 DB 的 Run 为准 */
export interface RunJobData {
  runId: string;
  userId: number;
}
