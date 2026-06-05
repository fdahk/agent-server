import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { JwtStrategy } from './jwt.strategy';

// 暴露 JwtStrategy 的 private static resolveKey 以便单测
interface MockClient {
  getSigningKey: (kid: string) => Promise<{ getPublicKey: () => string }>;
}
type Resolver = (
  client: MockClient,
  hsSecret: string,
  rawJwt: string,
) => Promise<string>;
const resolveKey: Resolver = (
  JwtStrategy as unknown as { resolveKey: Resolver }
).resolveKey;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

// 不必真签:测试只看 header 分支,签名只要是字符串占位即可
function makeToken(header: object, payload: object): string {
  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  return `${h}.${p}.signature-placeholder`;
}

describe('JwtStrategy.resolveKey 分支选择', () => {
  it('RS256 + kid → 调 client.getSigningKey 返回公钥', async () => {
    const fakePub = '-----BEGIN PUBLIC KEY-----FAKE-----END PUBLIC KEY-----';
    const getSigningKey = vi.fn(
      (kid: string): Promise<{ getPublicKey: () => string }> => {
        expect(kid).toBe('k-1');
        return Promise.resolve({ getPublicKey: () => fakePub });
      },
    );
    const client: MockClient = { getSigningKey };
    const token = makeToken(
      { alg: 'RS256', kid: 'k-1', typ: 'at+jwt' },
      { sub: '7' },
    );
    const key = await resolveKey(client, 'hs-secret', token);
    expect(key).toBe(fakePub);
    expect(getSigningKey).toHaveBeenCalledTimes(1);
  });

  it('RS256 缺 kid → 直接抛错,不调 JWKS', async () => {
    const getSigningKey = vi.fn();
    const client: MockClient = { getSigningKey: getSigningKey as never };
    const token = makeToken({ alg: 'RS256' }, { sub: '7' });
    await expect(resolveKey(client, 'hs-secret', token)).rejects.toThrow(/kid/);
    expect(getSigningKey).not.toHaveBeenCalled();
  });

  it('HS256 → 返回 hsSecret,不调 JWKS', async () => {
    const getSigningKey = vi.fn();
    const client: MockClient = { getSigningKey: getSigningKey as never };
    const token = makeToken({ alg: 'HS256' }, { sub: '7' });
    const key = await resolveKey(client, 'my-secret', token);
    expect(key).toBe('my-secret');
    expect(getSigningKey).not.toHaveBeenCalled();
  });

  it('不支持的 alg(如 none / ES256)→ 抛错', async () => {
    const client: MockClient = { getSigningKey: vi.fn() as never };
    const tokenNone = makeToken({ alg: 'none' }, { sub: '7' });
    await expect(resolveKey(client, 'hs', tokenNone)).rejects.toThrow(/不支持/);
    const tokenEs = makeToken({ alg: 'ES256' }, { sub: '7' });
    await expect(resolveKey(client, 'hs', tokenEs)).rejects.toThrow(/不支持/);
  });
});

describe('JwtStrategy.validate 载荷映射', () => {
  let prevSecret: string | undefined;
  let prevJwksUri: string | undefined;
  let prevIssuer: string | undefined;

  beforeEach(() => {
    prevSecret = process.env.JWT_SECRET;
    prevJwksUri = process.env.OAUTH_JWKS_URI;
    prevIssuer = process.env.OAUTH_ISSUER;
    // 强制走纯 HS256 路径,避免 ctor 尝试拉 JWKS
    delete process.env.OAUTH_JWKS_URI;
    delete process.env.OAUTH_ISSUER;
    process.env.JWT_SECRET = 'unit-test-secret';
  });

  afterEach(() => {
    process.env.JWT_SECRET = prevSecret;
    process.env.OAUTH_JWKS_URI = prevJwksUri;
    process.env.OAUTH_ISSUER = prevIssuer;
  });

  it('HS256 自家 token 字段 username/role 透传,scope 空数组', () => {
    const s = new JwtStrategy();
    const u = s.validate({ sub: '42', username: 'neo', role: 'USER' });
    expect(u).toEqual({ userId: 42, username: 'neo', role: 'USER', scope: [] });
  });

  it('RS256 OAuth token 字段 preferred_username/scope 映射', () => {
    const s = new JwtStrategy();
    const u = s.validate({
      sub: '99',
      preferred_username: 'alice',
      scope: 'openid agent-server',
    });
    expect(u.userId).toBe(99);
    expect(u.username).toBe('alice');
    expect(u.role).toBe('USER');
    expect(u.scope).toEqual(['openid', 'agent-server']);
  });

  it('username 优先于 preferred_username(混合 token 时)', () => {
    const s = new JwtStrategy();
    const u = s.validate({
      sub: '1',
      username: 'old',
      preferred_username: 'new',
    });
    expect(u.username).toBe('old');
  });
});
// 防止 lint 警告未使用
void createSign;
void generateKeyPairSync;
