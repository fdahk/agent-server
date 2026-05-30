import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RunEngineService } from '../../shared/run-engine/run-engine.service';
import { RUNS_QUEUE, type RunJobData } from '../../shared/queue/queue.types';

/** M2 演示用的假摄取步骤;M3 起替换为真实 解析→切分→embedding→入库 */
const DEMO_STEPS = ['parsing', 'chunking', 'embedding', 'indexing'] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * runs 队列消费者(仅在 worker 进程加载)。
 *
 * 每一步都经 RunEngine.emit 落库 + Redis 广播,持有 SSE 连接的 web 副本据此实时推送。
 * 这条进度链路是 M3 摄取 / M5 agent 的共同地基。
 */
@Processor(RUNS_QUEUE)
export class RunProcessor extends WorkerHost {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(private readonly runEngine: RunEngineService) {
    super();
  }

  async process(job: Job<RunJobData>): Promise<void> {
    const { runId } = job.data;
    this.logger.log(`开始处理 run=${runId} (job ${job.id})`);
    try {
      await this.runEngine.start(runId);
      for (let i = 0; i < DEMO_STEPS.length; i++) {
        await this.runEngine.emit(runId, 'step', {
          step: DEMO_STEPS[i],
          index: i + 1,
          total: DEMO_STEPS.length,
        });
        await sleep(200);
      }
      await this.runEngine.complete(runId, 'done');
      this.logger.log(`完成 run=${runId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.runEngine.fail(runId, msg);
      throw err; // 交回 BullMQ 走重试/失败计数
    }
  }
}
