import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { execSync } from 'node:child_process';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';

/**
 * JWKS 跨服务鉴权桥 + 联合身份 zero-touch 端到端(模拟 our-chat IdP)。
 *
 * 自起一个本地 JWKS 端点(RS256 公钥),把 OAUTH_JWKS_URI/OAUTH_ISSUER 指向它,
 * 再 boot AppModule(此时 JwtStrategy 进 RS256+JWKS 模式)。然后用对应私钥签一枚
 * iss/aud 合规的 access_token 打受保护路由,验证:
 *   1. our-chat 风格 token 经 JWKS 按 kid 拉公钥验签通过(doc 17 P3 验收①)
 *   2. 首次访问 zero-touch 在 agent-server 本地建账,/me 取回该联合用户(验收②)
 *   3. 本地 id 与外部 sub 不同号段(不复用 sub 作主键)
 *   4. iss 不匹配 / 伪造签名 → 401
 */

type ProfileBody = {
  id: number;
  username: string;
  displayName: string;
  roleCode: string;
};

const ISSUER = 'http://our-chat.local/oauth';
const AUDIENCE = 'agent-server';
const KID = 'oc-test-key-1';
const EXTERNAL_SUB = '880088'; // our-chat 侧 userId,与 agent-server 本地号段无关

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let qdrantContainer: StartedTestContainer;
let jwksServer: HttpServer;
let app: INestApplication;
let prisma: PrismaClient;
let privateKeyPem: string;

function signExternalToken(
  overrides: Record<string, unknown> = {},
  key = privateKeyPem,
): string {
  return jwt.sign(
    { scope: 'agent-server', client_id: 'our-chat-web', ...overrides },
    key,
    {
      algorithm: 'RS256',
      keyid: KID,
      issuer: ISSUER,
      audience: AUDIENCE,
      subject: EXTERNAL_SUB,
      expiresIn: 3600,
    },
  );
}

beforeAll(async () => {
  // RS256 keypair + 本地 JWKS 端点(把公钥导成 JWK,带 kid)。
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  privateKeyPem = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  const jwk = publicKey.export({ format: 'jwk' });
  const jwks = { keys: [{ ...jwk, kid: KID, use: 'sig', alg: 'RS256' }] };

  await new Promise<void>((resolve) => {
    jwksServer = createServer((req, res) => {
      if (req.url?.startsWith('/.well-known/jwks.json')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(jwks));
        return;
      }
      res.writeHead(404).end();
    });
    jwksServer.listen(0, () => resolve());
  });
  const jwksPort = (jwksServer.address() as AddressInfo).port;

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
  process.env.QDRANT_COLLECTION = 'jwks_test_chunks';
  // RS256+JWKS 模式开关:必须在 boot AppModule(JwtStrategy 构造)之前设置。
  process.env.OAUTH_JWKS_URI = `http://127.0.0.1:${jwksPort}/.well-known/jwks.json`;
  process.env.OAUTH_ISSUER = ISSUER;

  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });
  prisma = new PrismaClient();
  await prisma.$connect();

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
  await prisma?.$disconnect();
  await new Promise<void>((r) => jwksServer?.close(() => r()));
  await Promise.all([
    pgContainer?.stop(),
    redisContainer?.stop(),
    qdrantContainer?.stop(),
  ]);
});

describe('JWKS 桥 + 联合身份 zero-touch(e2e)', () => {
  it('our-chat RS256 token 经 JWKS 验签通过 → /me 200,zero-touch 建联合用户', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const token = signExternalToken();
    const res = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as ProfileBody;
    expect(body.username).toBe(`oc_${EXTERNAL_SUB}`);
    expect(body.roleCode).toBe('USER');

    const row = await prisma.user.findUnique({
      where: { issuer_subject: { issuer: ISSUER, subject: EXTERNAL_SUB } },
    });
    expect(row).not.toBeNull();
    expect(body.id).toBe(row!.id);
    // 本地自增 id 与外部 sub 不同号段(不复用 sub)。
    expect(String(row!.id)).not.toBe(EXTERNAL_SUB);
  });

  it('同一外部主体二次访问命中同一本地用户,不重复建行', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const res = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signExternalToken()}`);
    expect(res.status).toBe(200);
    const count = await prisma.user.count({
      where: { issuer: ISSUER, subject: EXTERNAL_SUB },
    });
    expect(count).toBe(1);
  });

  it('iss 不匹配 → 401', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const token = jwt.sign({ scope: 'agent-server' }, privateKeyPem, {
      algorithm: 'RS256',
      keyid: KID,
      issuer: 'http://evil.local',
      audience: AUDIENCE,
      subject: EXTERNAL_SUB,
      expiresIn: 3600,
    });
    const res = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('用错误私钥签名(JWKS 验签失败)→ 401', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const { privateKey: wrongKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const token = signExternalToken(
      {},
      wrongKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    const res = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('aud 不是 agent-server → 401', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const token = jwt.sign({ scope: 'other' }, privateKeyPem, {
      algorithm: 'RS256',
      keyid: KID,
      issuer: ISSUER,
      audience: 'some-other-service',
      subject: randomUUID(),
      expiresIn: 3600,
    });
    const res = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
