import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
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
      // 优先取 Authorization: Bearer;再兜底 ?access_token= 查询参数。
      // 原生 EventSource 无法设置自定义请求头,SSE 只能把 token 放 query,
      // 这是 SSE 鉴权的通行做法;代价是 token 可能进访问日志,故仅作兜底。
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('access_token'),
      ]),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production',
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
