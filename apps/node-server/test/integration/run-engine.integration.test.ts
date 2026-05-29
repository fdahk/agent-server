import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { execSync } from 'node:child_process';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { RedisService } from '../../src/shared/redis/redis.service';
import { RunEngineService } from '../../src/shared/run-engine/run-engine.service';
import { runChannel } from '../../src/shared/run-engine/run-engine.types';

let pg: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let prisma: PrismaService;
let redis: RedisService;
let engine: RunEngineService;
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

  prisma = new PrismaService();
  await prisma.onModuleInit();
  redis = new RedisService();
  await redis.onModuleInit();
  engine = new RunEngineService(prisma, redis);

  const user = await prisma.user.create({
    data: {
      username: `runner-${Date.now()}`,
      passwordHash: 'x',
      displayName: 'Runner',
      roleCode: 'USER',
    },
  });
  userId = user.id;
}, 180_000);

afterAll(async () => {
  await prisma?.onModuleDestroy();
  await redis?.onModuleDestroy();
  await Promise.all([pg?.stop(), redisContainer?.stop()]);
});

describe('RunEngineService(集成)', () => {
  it('createRun:初始 queued', async () => {
    const run = await engine.createRun({
      userId,
      kind: 'ingestion',
      task: '整理文档',
    });
    expect(run.runId).toMatch(/^run-/);
    expect(run.status).toBe('queued');
    expect(run.startedAt).toBeNull();
  });

  it('start/complete:状态流转 + 时间戳', async () => {
    const run = await engine.createRun({
      userId,
      kind: 'ingestion',
      task: 't',
    });
    await engine.start(run.runId);
    let snap = await engine.getSnapshot(run.runId);
    expect(snap?.run.status).toBe('running');
    expect(snap?.run.startedAt).not.toBeNull();

    await engine.complete(run.runId, '完成');
    snap = await engine.getSnapshot(run.runId);
    expect(snap?.run.status).toBe('completed');
    expect(snap?.run.completedAt).not.toBeNull();
  });

  it('emit:序号从 1 自增并落库', async () => {
    const run = await engine.createRun({
      userId,
      kind: 'ingestion',
      task: 't',
    });
    const e1 = await engine.emit(run.runId, 'step', { i: 1 });
    const e2 = await engine.emit(run.runId, 'step', { i: 2 });
    const e3 = await engine.emit(run.runId, 'step', { i: 3 });
    expect([e1.sequenceNo, e2.sequenceNo, e3.sequenceNo]).toEqual([1, 2, 3]);

    const snap = await engine.getSnapshot(run.runId);
    expect(snap?.events).toHaveLength(3);
  });

  it('emit:同时 publish 到 Redis run:{runId} 频道(SSE backplane)', async () => {
    const run = await engine.createRun({
      userId,
      kind: 'agent_task',
      task: 't',
    });
    const sub = redis.duplicate();
    const received = new Promise<string>((resolve) => {
      sub.on('message', (_channel, message) => resolve(message));
    });
    await sub.subscribe(runChannel(run.runId));
    await new Promise((r) => setTimeout(r, 50));

    await engine.emit(run.runId, 'tool_called', { name: 'retrieve' });

    const raw = await received;
    const parsed = JSON.parse(raw) as { eventType: string; sequenceNo: number };
    expect(parsed.eventType).toBe('tool_called');
    expect(parsed.sequenceNo).toBe(1);
    await sub.quit();
  });

  it('fail:落 failed + 先发 run_failed 事件', async () => {
    const run = await engine.createRun({
      userId,
      kind: 'ingestion',
      task: 't',
    });
    await engine.fail(run.runId, '解析失败');
    const snap = await engine.getSnapshot(run.runId);
    expect(snap?.run.status).toBe('failed');
    expect(snap?.run.completedAt).not.toBeNull();
    expect(snap?.events.at(-1)?.eventType).toBe('run_failed');
    expect((snap?.events.at(-1)?.payload as { error: string }).error).toBe(
      '解析失败',
    );
  });

  it('getEventsSince:只返回指定序号之后的事件(断线重连补缺)', async () => {
    const run = await engine.createRun({
      userId,
      kind: 'ingestion',
      task: 't',
    });
    await engine.emit(run.runId, 'a', {});
    await engine.emit(run.runId, 'b', {});
    await engine.emit(run.runId, 'c', {});

    const since1 = await engine.getEventsSince(run.runId, 1);
    expect(since1.map((e) => e.eventType)).toEqual(['b', 'c']);
  });
});
