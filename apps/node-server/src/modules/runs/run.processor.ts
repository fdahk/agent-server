// Logger 是 NestJS 内置的日志工具,用法很简单:在类里声明一个 logger 属性,类型是 Logger
// 构造函数里 new 一个 Logger 实例并传入当前类的名字;然后就可以在方法里用 this.logger.log()、this.logger.error() 等记日志
// 为什么要每次 new Logger() 而不是全局一个? 因为 Logger 内部会记录这个名字,日志输出时就能显示是哪个类/模块产出的日志了
import { Logger } from '@nestjs/common';
// Processor 和 WorkerHost 是 NestJS BullMQ 模块提供的装饰器和基类,用来定义一个队列消费者
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq'; // Job 是 BullMQ 里表示一个队列任务的类,它有 data 属性包含任务数据,还有一些方法用来控制任务生命周期
import { RunEngineService } from '../../shared/run-engine/run-engine.service';
import { RUNS_QUEUE, type RunJobData } from '../../shared/queue/queue.types';
import { IngestionService } from '../documents/ingestion.service';

/** 演示作业的假步骤(agent_task kind),仅供 run-engine 链路自检 */
const DEMO_STEPS = ['parsing', 'chunking', 'embedding', 'indexing'] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * runs 队列消费者(仅在 worker 进程加载)。
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
