import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { execSync } from 'node:child_process';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaModule } from '../../src/shared/prisma/prisma.module';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { RedisModule } from '../../src/shared/redis/redis.module';
import { RedisService } from '../../src/shared/redis/redis.service';
import { RunEngineModule } from '../../src/shared/run-engine/run-engine.module';
import { RunEngineService } from '../../src/shared/run-engine/run-engine.service';
import { QueueModule } from '../../src/shared/queue/queue.module';
import { RunProcessor } from '../../src/modules/runs/run.processor';
import { IngestionService } from '../../src/modules/documents/ingestion.service';
import {
  RUNS_QUEUE,
  type RunJobData,
} from '../../src/shared/queue/queue.types';
import { runChannel } from '../../src/shared/run-engine/run-engine.types';

// 复刻 worker 进程的模块图:基础设施 + runs 消费者(无 controller)。
// 这里只测 agent_task 演示作业,摄取分支用不到,用桩替掉 IngestionService。
@Module({
  imports: [PrismaModule, RedisModule, RunEngineModule, QueueModule],
  providers: [
    RunProcessor,
    {
      provide: IngestionService,
      useValue: { ingest: () => Promise.resolve() },
    },
  ],
})
class TestWorkerModule {}

let pg: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let app: INestApplicationContext;
let prisma: PrismaService;
let redis: RedisService;
let engine: RunEngineService;
let queue: Queue<RunJobData>;
let userId: number;

beforeAll(async () => {
  [pg, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);
  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.REDIS_URL = redisContainer.getConnectionUrl();
  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });

  app = await NestFactory.createApplicationContext(TestWorkerModule, {
    logger: false,
  });
  prisma = app.get(PrismaService);
  redis = app.get(RedisService);
  engine = app.get(RunEngineService);
  queue = app.get<Queue<RunJobData>>(getQueueToken(RUNS_QUEUE));

  const user = await prisma.user.create({
    data: {
      username: `queue-${Date.now()}`,
      passwordHash: 'x',
      displayName: 'Q',
      roleCode: 'USER',
    },
  });
  userId = user.id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await Promise.all([pg?.stop(), redisContainer?.stop()]);
});

/** 轮询等待 run 落到目标状态(complete 是"先发事件再落状态",状态稍滞后于广播) */
async function waitForStatus(runId: string, status: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const snap = await engine.getSnapshot(runId);
    if (snap?.run.status === status) return snap;
    if (Date.now() > deadline) return snap;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('runs 队列端到端(集成)', () => {
  it('入队 → worker 消费 → 事件落库 + Redis 广播 + 终态 completed', async () => {
    const run = await engine.createRun({
      userId,
      kind: 'agent_task',
      task: 'demo job',
    });

    // 先订阅,确保不漏 worker 发出的任何事件
    const sub = redis.duplicate();
    const received: string[] = [];
    const done = new Promise<void>((resolve) => {
      sub.on('message', (_ch, raw) => {
        const e = JSON.parse(raw) as { eventType: string };
        received.push(e.eventType);
        if (e.eventType === 'run_completed') resolve();
      });
    });
    await sub.subscribe(runChannel(run.runId));

    await queue.add('demo', { runId: run.runId, userId });
    await done;

    // 广播顺序:run_started → 4 个 step → run_completed
    expect(received).toEqual([
      'run_started',
      'step',
      'step',
      'step',
      'step',
      'run_completed',
    ]);

    // 注意:complete() 刻意"先发 run_completed 事件、再落 completed 状态"
    // (保证晚连入的 SSE 总能回放到终态事件),故收到广播时状态翻转可能尚未提交,
    // 这里轮询等状态落库,再校验落库一致性。
    const snap = await waitForStatus(run.runId, 'completed');
    expect(snap?.run.status).toBe('completed');
    expect(snap?.events.map((e) => e.sequenceNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(snap?.events.at(-1)?.eventType).toBe('run_completed');

    await sub.quit();
  }, 30_000);

  it('断线重连:getEventsSince 从指定序号补缺,可衔接实时', async () => {
    const run = await engine.createRun({
      userId,
      kind: 'agent_task',
      task: 'demo job',
    });
    await queue.add('demo', { runId: run.runId, userId });

    // 等作业跑完
    await new Promise<void>((resolve) => {
      const sub = redis.duplicate();
      void sub.subscribe(runChannel(run.runId)).then(() => {
        sub.on('message', (_ch, raw) => {
          if (
            (JSON.parse(raw) as { eventType: string }).eventType ===
            'run_completed'
          ) {
            void sub.quit().then(() => resolve());
          }
        });
      });
    });

    // 模拟"已收到前 3 条"后重连:只应补 4、5、6
    const missed = await engine.getEventsSince(run.runId, 3);
    expect(missed.map((e) => e.sequenceNo)).toEqual([4, 5, 6]);
  }, 30_000);
});
