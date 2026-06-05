/**
 * JWT 鉴权策略(Passport Strategy)。
 *
 * 同时支持两种来源:
 *   1. **RS256 + JWKS**(生产路径):跨服务鉴权,token 由 our-chat IdP 经 OAuth 2.1 + PKCE 签发,
 *      `iss/aud` 校验严格(详见 docs/backend/跨服务鉴权方案/方案F-OAuth2授权码PKCE.md)。
 *      env `OAUTH_JWKS_URI` 配置 JWKS 端点 URL 时启用。
 *   2. **HS256 + secret**(dev/test 兜底):兼容现有 /auth/login 签发的本地 token,后续完全迁移
 *      到 RS256 后可移除。env `JWT_SECRET` 配置共享密钥。
 *
 * 选择策略:按 JWT header 的 `alg` 字段 dispatch。RS256 → JWKS,HS256 → 共享密钥。
 *
 * 流程:请求进来 → AuthGuard('jwt') 触发本策略 → jwtFromRequest 取 token →
 * secretOrKeyProvider 根据 alg 拿验签材料 → 通过则 validate() → 挂 req.user。
 *
 * - @nestjs/passport / passport-jwt —— Passport 适配层 + JWT 策略
 * - jwks-rsa —— 缓存型 JWKS 客户端,自动按 kid 拉公钥
 */
import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtFromRequestFunction } from 'passport-jwt';
import { decode as jwtDecode } from 'jsonwebtoken';
import jwksClient, { type JwksClient } from 'jwks-rsa';

/** JWT 载荷:OAuth 2.1 标准 + 历史 HS256 自家约定混用 */
export interface JwtPayload {
  sub: string;
  username?: string;
  role?: string;
  preferred_username?: string;
  scope?: string;
  client_id?: string;
  aud?: string | string[];
  iss?: string;
}

/** 校验通过后挂到 req.user 上的对象 */
export interface AuthedUser {
  userId: number;
  username: string;
  role: string;
  scope: string[];
}

const RESOURCE_AUDIENCE = 'agent-server';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static readonly logger = new Logger(JwtStrategy.name);

  constructor() {
    const { extractor, providerOptions } = JwtStrategy.buildOptions();
    super({
      jwtFromRequest: extractor,
      ignoreExpiration: false,
      ...providerOptions,
      algorithms: ['RS256', 'HS256'],
      // OAuth 路径强制校验 iss/aud(RS256 token 才带这些 claim);
      // HS256 token 没有 iss/aud 时跳过这两个校验:passport-jwt 校验逻辑会因 audience 不匹配拒绝,
      // 所以 HS256 兜底路径下不传 audience。
      ...(process.env.OAUTH_JWKS_URI ? { audience: [RESOURCE_AUDIENCE] } : {}),
      ...(process.env.OAUTH_ISSUER ? { issuer: process.env.OAUTH_ISSUER } : {}),
      jsonWebTokenOptions: { clockTolerance: 30 },
    });
  }

  private static buildOptions(): {
    extractor: JwtFromRequestFunction;
    providerOptions:
      | { secretOrKey: string }
      | {
          secretOrKeyProvider: (
            req: unknown,
            rawJwt: string,
            done: (err: Error | null, key?: string) => void,
          ) => void;
        };
  } {
    // SSE 鉴权兜底:原生 EventSource 不能加自定义头,只能把 token 放 query。
    // 代价:token 可能进访问日志,故仅作兜底。
    const extractor = ExtractJwt.fromExtractors([
      ExtractJwt.fromAuthHeaderAsBearerToken(),
      ExtractJwt.fromUrlQueryParameter('access_token'),
    ]);

    const jwksUri = process.env.OAUTH_JWKS_URI;
    if (!jwksUri) {
      // 纯 HS256 模式(无 OAuth 配置)
      return {
        extractor,
        providerOptions: {
          secretOrKey: process.env.JWT_SECRET ?? 'dev-secret',
        },
      };
    }

    // 双模:RS256 经 JWKS,HS256 用共享 secret 兜底
    const client = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    const hsSecret = process.env.JWT_SECRET ?? 'dev-secret';
    const providerOptions = {
      secretOrKeyProvider: (
        _req: unknown,
        rawJwt: string,
        done: (err: Error | null, key?: string) => void,
      ) => {
        JwtStrategy.resolveKey(client, hsSecret, rawJwt).then(
          (key) => done(null, key),
          (err: Error) => done(err),
        );
      },
    };
    return { extractor, providerOptions };
  }

  private static async resolveKey(
    client: JwksClient,
    hsSecret: string,
    rawJwt: string,
  ): Promise<string> {
    const decoded = jwtDecode(rawJwt, { complete: true });
    const header = decoded?.header as
      | { alg?: string; kid?: string }
      | undefined;
    if (header?.alg === 'RS256') {
      if (!header.kid) throw new Error('RS256 token 缺少 kid');
      const key = await client.getSigningKey(header.kid);
      return key.getPublicKey();
    }
    if (header?.alg === 'HS256') {
      return hsSecret;
    }
    throw new Error(`不支持的 alg: ${header?.alg ?? 'unknown'}`);
  }

  // 返回值即 req.user;sub 转回 number 与数据库主键一致
  validate(payload: JwtPayload): AuthedUser {
    const scope = (payload.scope ?? '').split(/\s+/).filter(Boolean);
    return {
      userId: Number(payload.sub),
      username: payload.username ?? payload.preferred_username ?? '',
      role: payload.role ?? 'USER',
      scope,
    };
  }
}
