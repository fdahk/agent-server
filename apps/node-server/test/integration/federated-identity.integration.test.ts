import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { FederatedIdentityService } from '../../src/modules/auth/federated-identity.service';
import type { PrismaService } from '../../src/shared/prisma/prisma.service';

/**
 * 联合身份 zero-touch 用户同步(testcontainers 起真 postgres)
 *
 * 验证内容:
 * - 首次见外部主体 → 建一行本地用户(自增 id,与 sub 无关)
 * - 重复解析同 (issuer, subject) → 命中同一本地 id,且不再多建行(缓存 + 唯一约束)
 * - 不同 subject → 不同本地用户
 * - 联合用户的本地 id 可被 Conversation 外键引用(FK 不再因 sub 无对应 users 行而失败)
 * - 并发首见 → 仍只建一行,所有调用收敛到同一 id
 */

const ISSUER = 'http://localhost:3007';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;
let svc: FederatedIdentityService;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
  prisma = new PrismaClient();
  await prisma.$connect();
  // 每个 service 实例自带进程内缓存,直接用真 PrismaClient 当 PrismaService。
  svc = new FederatedIdentityService(prisma as unknown as PrismaService);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

describe('FederatedIdentityService(集成)', () => {
  it('首次解析建本地用户,本地 id 与外部 sub 无关', async () => {
    const id = await svc.resolveLocalUserId({ issuer: ISSUER, subject: '5' });
    const row = await prisma.user.findUnique({ where: { id } });
    expect(row?.issuer).toBe(ISSUER);
    expect(row?.subject).toBe('5');
    expect(row?.username).toBe('oc_5');
    expect(row?.passwordHash).toBe('');
    expect(row?.roleCode).toBe('USER');
  });

  it('重复解析同主体命中同一 id,不重复建行', async () => {
    const first = await svc.resolveLocalUserId({
      issuer: ISSUER,
      subject: '42',
    });
    const second = await svc.resolveLocalUserId({
      issuer: ISSUER,
      subject: '42',
    });
    expect(second).toBe(first);
    const count = await prisma.user.count({
      where: { issuer: ISSUER, subject: '42' },
    });
    expect(count).toBe(1);
  });

  it('不同 subject 映射到不同本地用户', async () => {
    const a = await svc.resolveLocalUserId({ issuer: ISSUER, subject: '100' });
    const b = await svc.resolveLocalUserId({ issuer: ISSUER, subject: '200' });
    expect(a).not.toBe(b);
  });

  it('联合用户本地 id 可被 Conversation 外键引用', async () => {
    const id = await svc.resolveLocalUserId({ issuer: ISSUER, subject: '777' });
    const conv = await prisma.conversation.create({
      data: { userId: id, title: 'fed-fk' },
    });
    expect(conv.userId).toBe(id);
  });

  it('并发首见同主体只建一行,全部收敛到同一 id', async () => {
    // 绕开缓存:新建一个无缓存的 service 实例,模拟多副本/多请求并发首见。
    const fresh = new FederatedIdentityService(
      prisma as unknown as PrismaService,
    );
    const ids = await Promise.all(
      Array.from({ length: 8 }, () =>
        fresh.resolveLocalUserId({ issuer: ISSUER, subject: '999' }),
      ),
    );
    const unique = new Set(ids);
    expect(unique.size).toBe(1);
    const count = await prisma.user.count({
      where: { issuer: ISSUER, subject: '999' },
    });
    expect(count).toBe(1);
  });
});
