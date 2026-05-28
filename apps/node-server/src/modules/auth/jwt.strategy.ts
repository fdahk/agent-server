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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
