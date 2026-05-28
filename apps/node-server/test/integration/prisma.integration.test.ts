import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 数据模型集成测试(testcontainers 起真 postgres)
 *
 * 验证内容:
 * - 迁移 SQL 能在干净 postgres 上 apply 成功
 * - 基本 CRUD 通
 * - 外键级联删除(onDelete: Cascade)
 * - RunEvent.sequenceNo 在同 run 内唯一(事件溯源单调性)
 */

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  // 把 prisma/migrations/*/migration.sql 应用到 testcontainer 库
  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  prisma = new PrismaClient();
  await prisma.$connect();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('Prisma 数据模型(集成)', () => {
  it('迁移后能创建并查回 user', async () => {
    const username = `alice-${Date.now()}`;
    const u = await prisma.user.create({
      data: { username, passwordHash: 'x', displayName: 'Alice', roleCode: 'USER' },
    });
    const got = await prisma.user.findUnique({ where: { id: u.id } });
    expect(got?.username).toBe(username);
  });

  it('级联删:删 user 连带删其 document', async () => {
    const u = await prisma.user.create({
      data: {
        username: `bob-${Date.now()}`,
        passwordHash: 'x',
        displayName: 'Bob',
        roleCode: 'USER',
      },
    });
    const d = await prisma.document.create({
      data: {
        userId: u.id,
        filename: 'a.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storagePath: '/tmp/a.pdf',
        status: 'uploaded',
      },
    });
    await prisma.user.delete({ where: { id: u.id } });
    const got = await prisma.document.findUnique({ where: { id: d.id } });
    expect(got).toBeNull();
  });

  it('RunEvent.sequenceNo 在同一 run 内唯一(事件溯源单调性)', async () => {
    const u = await prisma.user.create({
      data: {
        username: `carol-${Date.now()}`,
        passwordHash: 'x',
        displayName: 'Carol',
        roleCode: 'USER',
      },
    });
    const runId = `run-${Date.now()}`;
    await prisma.run.create({
      data: { runId, userId: u.id, kind: 'ingestion', task: 't', status: 'queued' },
    });
    await prisma.runEvent.create({
      data: { runId, sequenceNo: 1, eventType: 'start', payload: {} },
    });
    // 同一 (runId, sequenceNo) 必须冲突
    await expect(
      prisma.runEvent.create({
        data: { runId, sequenceNo: 1, eventType: 'dup', payload: {} },
      }),
    ).rejects.toThrow();
  });

  it('Json 列:Message.citations 能写入并查回结构', async () => {
    const u = await prisma.user.create({
      data: {
        username: `dave-${Date.now()}`,
        passwordHash: 'x',
        displayName: 'Dave',
        roleCode: 'USER',
      },
    });
    const c = await prisma.conversation.create({
      data: { userId: u.id, title: 'test' },
    });
    const m = await prisma.message.create({
      data: {
        conversationId: c.id,
        role: 'assistant',
        content: 'see source',
        citations: [{ chunkId: 1, documentId: 1, score: 0.9 }],
      },
    });
    const got = await prisma.message.findUnique({ where: { id: m.id } });
    expect(Array.isArray(got?.citations)).toBe(true);
    expect((got?.citations as Array<{ chunkId: number }>)[0].chunkId).toBe(1);
  });
});
