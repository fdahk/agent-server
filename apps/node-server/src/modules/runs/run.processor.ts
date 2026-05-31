import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RunEngineService } from '../../shared/run-engine/run-engine.service';
import { RUNS_QUEUE, type RunJobData } from '../../shared/queue/queue.types';
import { IngestionService } from '../documents/ingestion.service';

/** 演示作业的假步骤(agent_task kind),仅供 run-engine 链路自检 */
const DEMO_STEPS = ['parsing', 'chunking', 'embedding', 'indexing'] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * runs 队列消费者(仅在 worker 进程加载)。
 *
 * 统一包住 start→...→complete/fail 生命周期,按 Run.kind 分派到具体处理逻辑;
 * 每一步都经 RunEngine.emit 落库 + Redis 广播,持有 SSE 连接的 web 副本据此实时推送。
 */
@Processor(RUNS_QUEUE)
export class RunProcessor extends WorkerHost {
  private readonly logger = new Logger(RunProcessor.name);

  constructor(
    private readonly runEngine: RunEngineService,
    private readonly ingestion: IngestionService,
  ) {
    super();
  }

  async process(job: Job<RunJobData>): Promise<void> {
    const { runId } = job.data;
    this.logger.log(`开始处理 run=${runId} (job ${job.id})`);
    const run = await this.runEngine.getRun(runId);
    if (!run) throw new Error(`run 不存在: ${runId}`);

    try {
      await this.runEngine.start(runId);
      switch (run.kind) {
        case 'ingestion':
          await this.ingestion.ingest(run);
          await this.runEngine.complete(runId, 'ready');
          break;
        default:
          await this.runDemo(runId);
          await this.runEngine.complete(runId, 'done');
      }
      this.logger.log(`完成 run=${runId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.runEngine.fail(runId, msg);
      throw err; // 交回 BullMQ 走重试/失败计数
    }
  }

  private async runDemo(runId: string): Promise<void> {
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      await this.runEngine.emit(runId, 'step', {
        step: DEMO_STEPS[i],
        index: i + 1,
        total: DEMO_STEPS.length,
      });
      await sleep(200);
    }
  }
}
