import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedUser } from './jwt.strategy';

/** 取出经 JWT 守卫挂上的当前用户;受保护 handler 用 @CurrentUser() user 注入 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthedUser }>();
    return req.user;
  },
);
