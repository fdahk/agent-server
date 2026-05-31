import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { execSync } from 'node:child_process';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
import { LlmService } from '../../src/shared/llm/llm.service';
import {
  QdrantService,
  type ChunkPoint,
} from '../../src/shared/qdrant/qdrant.service';
import { RunProcessor } from '../../src/modules/runs/run.processor';
import { IngestionService } from '../../src/modules/documents/ingestion.service';
import {
  RUNS_QUEUE,
  type RunJobData,
} from '../../src/shared/queue/queue.types';
import { runChannel } from '../../src/shared/run-engine/run-engine.types';

// 假 LLM:返回定长向量,不调真模型
const fakeLlm = {
  embed: vi.fn((input: string | string[]) => {
    const batch = Array.isArray(input) ? input : [input];
    return Promise.resolve(batch.map(() => [0.1, 0.2, 0.3]));
  }),
};

// 假 Qdrant:记录写入的点,断言双写而不依赖真向量库
const upserted: ChunkPoint[] = [];
const fakeQdrant = {
  upsertChunks: vi.fn((points: ChunkPoint[]) => {
    upserted.push(...points);
    return Promise.resolve();
  }),
  deleteByDocument: vi.fn(() => Promise.resolve()),
  searchByUser: vi.fn(() => Promise.resolve([])),
};

// 复刻 worker 模块图,但把 LLM/Qdrant 换成假实现
@Module({
  imports: [PrismaModule, RedisModule, RunEngineModule, QueueModule],
  providers: [
    RunProcessor,
    IngestionService,
    { provide: LlmService, useValue: fakeLlm },
    { provide: QdrantService, useValue: fakeQdrant },
  ],
})
class TestIngestionModule {}

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

  app = await NestFactory.createApplicationContext(TestIngestionModule, {
    logger: false,
  });
  prisma = app.get(PrismaService);
  redis = app.get(RedisService);
  engine = app.get(RunEngineService);
  queue = app.get<Queue<RunJobData>>(getQueueToken(RUNS_QUEUE));

  const user = await prisma.user.create({
    data: {
      username: `ingest-${Date.now()}`,
      passwordHash: 'x',
      displayName: 'I',
      roleCode: 'USER',
    },
  });
  userId = user.id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await Promise.all([pg?.stop(), redisContainer?.stop()]);
});

describe('文档摄取端到端(集成)', () => {
  it('上传文件 → worker 解析切分 embedding → 双写 Postgres + Qdrant', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ingest-'));
    const storagePath = join(dir, 'note.md');
    const content = Array.from(
      { length: 30 },
      (_, i) => `第 ${i} 段内容。`,
    ).join('\n\n');
    await writeFile(storagePath, content, 'utf-8');

    const doc = await prisma.document.create({
      data: {
        userId,
        filename: 'note.md',
        mimeType: 'text/markdown',
        sizeBytes: Buffer.byteLength(content),
        storagePath,
        status: 'queued',
      },
    });

    const run = await engine.createRun({
      userId,
      kind: 'ingestion',
      task: 'ingest:note.md',
      refId: String(doc.id),
    });

    const sub = redis.duplicate();
    const events: string[] = [];
    const done = new Promise<void>((resolve) => {
      sub.on('message', (_ch, raw) => {
        const e = JSON.parse(raw) as { eventType: string };
        events.push(e.eventType);
        if (e.eventType === 'run_completed') resolve();
      });
    });
    await sub.subscribe(runChannel(run.runId));

    await queue.add('ingestion', { runId: run.runId, userId });
    await done;

    // 事件轨迹:起始 → parsing → chunking → embedding(≥1)→ 终态
    expect(events[0]).toBe('run_started');
    expect(events).toContain('step');
    expect(events.at(-1)).toBe('run_completed');

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: doc.id },
      orderBy: { chunkIndex: 'asc' },
    });
    expect(chunks.length).toBeGreaterThan(0);
    // 每个 chunk 都回填了 qdrantPointId,且与写入 Qdrant 的点一一对应
    for (const c of chunks) expect(c.qdrantPointId).toMatch(/^[0-9a-f-]{36}$/);
    expect(upserted.length).toBe(chunks.length);
    expect(upserted.every((p) => p.payload.user_id === userId)).toBe(true);
    expect(upserted.every((p) => p.payload.document_id === doc.id)).toBe(true);

    const refreshed = await prisma.document.findUnique({
      where: { id: doc.id },
    });
    expect(refreshed?.status).toBe('ready');
    expect(refreshed?.chunkCount).toBe(chunks.length);

    await sub.quit();
  }, 30_000);
});
