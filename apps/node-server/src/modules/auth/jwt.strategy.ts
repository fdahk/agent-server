/**
 * JWT 鉴权策略(Passport Strategy)。
 *
 * Passport 是 Node 生态最主流的鉴权中间件,它把"如何验证身份"抽象成一个个
 * "策略(strategy)":本地用户名密码、OAuth、JWT…… 本文件定义 "jwt" 策略——
 * 怎么从请求里取出 token、用什么密钥验签、验过之后把什么挂到 req.user 上。
 *
 * 流程:请求进来 → AuthGuard('jwt') 触发本策略 → jwtFromRequest 取 token →
 * 用 secretOrKey 验签并查有效期 → 通过则调 validate() → 其返回值挂到 req.user。
 *
 * - @nestjs/passport —— PassportStrategy 工厂,把 passport 策略适配成 Nest 的类。
 * - passport-jwt —— Passport 的 JWT 策略实现(验签 + 取 token 的工具)。
 */
import { Injectable } from '@nestjs/common';
// PassportStrategy(Strategy) —— 生成一个基类,继承它即把该 passport 策略接入 Nest
import { PassportStrategy } from '@nestjs/passport';
// Strategy —— passport-jwt 的核心策略类; ExtractJwt —— 一组"从请求取 token"的提取器
import { ExtractJwt, Strategy } from 'passport-jwt';

/** JWT 载荷:sub 存 userId(字符串) */
export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

/** 校验通过后挂到 req.user 上的对象 */
export interface AuthedUser {
  userId: number;
  username: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // jwtFromRequest 是nestjs/passport-jwt提供的一个选项,用来指定从请求哪里取 JWT token;
      // 优先取 Authorization: Bearer;再兜底 ?access_token= 查询参数。
      // 原生 EventSource 无法设置自定义请求头,SSE 只能把 token 放 query,
      // 这是 SSE 鉴权的通行做法;代价是 token 可能进访问日志,故仅作兜底。
      jwtFromRequest: ExtractJwt.fromExtractors([
        // fromAuthHeaderAsBearerToken() 只从 Authorization 头取 Bearer token,不从 query 取;
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // fromUrlQueryParameter() 从 URL 查询参数取 token,不从 header 取;只查 access_token 这个参数名;
        ExtractJwt.fromUrlQueryParameter('access_token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret',
    });
  }

  // 返回值即 req.user;sub 转回 number 与数据库主键一致
  validate(payload: JwtPayload): AuthedUser {
    return {
      userId: Number(payload.sub),
      username: payload.username,
      role: payload.role,
    };
  }
}
