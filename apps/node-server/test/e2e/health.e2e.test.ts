import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { execSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { StartedTestContainer } from 'testcontainers';
import { AppModule } from '../../src/app.module';
import { startMilvusContainer } from '../helpers/milvus-container';

/**
 * /api/health 端到端测试 —— 启全栈基础设施 + boot AppModule + 请求 /api/health
 *
 * 证明 web 进程能同时与 postgres / redis / milvus 通信。
 * 三个 testcontainer 并行启动以节省时间。
 */

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let milvusContainer: StartedTestContainer;
let app: INestApplication;

beforeAll(async () => {
  // 并行起 3 个容器
  const [pg, redis, milvus] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
    startMilvusContainer(),
  ]);
  pgContainer = pg;
  redisContainer = redis;
  milvusContainer = milvus.container;

  process.env.DATABASE_URL = pgContainer.getConnectionUri();
  process.env.REDIS_URL = redisContainer.getConnectionUrl();
  process.env.MILVUS_ADDRESS = milvus.address;
  process.env.MILVUS_VECTOR_SIZE = '4';
  process.env.MILVUS_COLLECTION = 'health_chunks';

  // 应用迁移到测试库
  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });

  // 启动 NestJS app
  const mod: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
}, 240_000);

afterAll(async () => {
  await app?.close();
  await Promise.all([
    pgContainer?.stop(),
    redisContainer?.stop(),
    milvusContainer?.stop(),
  ]);
});

describe('GET /api/health', () => {
  it('200 + status=ok,三件基础设施全部 up', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(server).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      details: {
        postgres: { status: 'up' },
        redis: { status: 'up' },
        milvus: { status: 'up' },
      },
    });
  });
});
