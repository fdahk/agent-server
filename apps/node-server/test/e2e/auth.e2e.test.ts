import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { execSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../../src/app.module';

/**
 * /api/auth 端到端:启全栈基础设施 → boot AppModule → 跑注册/登录全链路。
 * 真实 bcrypt + 真实 JWT 签发,只在 testcontainer 起 postgres,绝不调外部服务。
 */

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let qdrantContainer: StartedTestContainer;
let app: INestApplication;

beforeAll(async () => {
  [pgContainer, redisContainer, qdrantContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
    new GenericContainer('qdrant/qdrant:latest')
      .withExposedPorts(6333)
      .withWaitStrategy(Wait.forHttp('/readyz', 6333))
      .start(),
  ]);

  process.env.DATABASE_URL = pgContainer.getConnectionUri();
  process.env.REDIS_URL = redisContainer.getConnectionUrl();
  process.env.QDRANT_URL = `http://${qdrantContainer.getHost()}:${qdrantContainer.getMappedPort(6333)}`;
  process.env.QDRANT_VECTOR_SIZE = '4';
  process.env.QDRANT_COLLECTION = 'auth_test_chunks';
  process.env.JWT_SECRET = 'test-secret-for-e2e-only';
  process.env.JWT_EXPIRE_SECONDS = '3600';

  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });

  const mod: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = mod.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();
}, 240_000);

afterAll(async () => {
  await app?.close();
  await Promise.all([
    pgContainer?.stop(),
    redisContainer?.stop(),
    qdrantContainer?.stop(),
  ]);
});

type AuthBody = {
  token?: string;
  user?: {
    id?: number;
    username?: string;
    displayName?: string;
    roleCode?: string;
    passwordHash?: string;
  };
  code?: string;
  message?: string;
};

describe('/api/auth', () => {
  const username = `alice-${Date.now()}`;
  const password = 'strong-pw-12';

  it('POST /api/auth/register 注册新用户:201 + token + user(无 passwordHash)', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(server)
      .post('/api/auth/register')
      .send({ username, password, displayName: 'Alice' });
    const body = res.body as AuthBody;

    expect(res.status).toBe(201);
    expect(body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/); // JWT 三段式
    expect(body.user).toMatchObject({
      username,
      displayName: 'Alice',
      roleCode: 'USER',
    });
    expect(body.user?.passwordHash).toBeUndefined();
  });

  it('POST /api/auth/register 用户名重复:409(USERNAME_TAKEN)', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(server)
      .post('/api/auth/register')
      .send({ username, password, displayName: 'Alice2' });
    const body = res.body as AuthBody;

    expect(res.status).toBe(409);
    expect(body.code).toBe('USERNAME_TAKEN');
  });

  it('POST /api/auth/login 正确密码:200 + token', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(server)
      .post('/api/auth/login')
      .send({ username, password });
    const body = res.body as AuthBody;

    expect(res.status).toBe(200);
    expect(body.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(body.user?.username).toBe(username);
  });

  it('POST /api/auth/login 错密码:401(INVALID_CREDENTIALS)', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(server)
      .post('/api/auth/login')
      .send({ username, password: 'totally-wrong' });
    const body = res.body as AuthBody;

    expect(res.status).toBe(401);
    expect(body.code).toBe('INVALID_CREDENTIALS');
  });

  it('POST /api/auth/login 不存在的用户:401,与错密码同一句话(防账号枚举)', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const ghost = await request(server)
      .post('/api/auth/login')
      .send({ username: 'ghost-user-xx', password: 'whatever' });
    const wrongPw = await request(server)
      .post('/api/auth/login')
      .send({ username, password: 'wrong' });
    const ghostBody = ghost.body as AuthBody;
    const wrongBody = wrongPw.body as AuthBody;

    expect(ghost.status).toBe(401);
    expect(wrongPw.status).toBe(401);
    expect(ghostBody.message).toBe(wrongBody.message);
  });

  it('POST /api/auth/register 校验:密码 < 8 字符 → 400', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(server)
      .post('/api/auth/register')
      .send({ username: 'shortpw', password: 'short', displayName: 'X' });
    expect(res.status).toBe(400);
  });
});
