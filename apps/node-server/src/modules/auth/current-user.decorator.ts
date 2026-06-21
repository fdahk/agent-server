/**
 * 自定义参数装饰器 @CurrentUser()。
 *
 * jwt 策略验证通过后把用户对象挂在 req.user 上。每个 handler 都写
 * `ctx.switchToHttp().getRequest().user` 太麻烦,这里封装成 @CurrentUser(),
 * handler 直接写 `me(@CurrentUser() user: AuthedUser)` 就能拿到。
 * me(...) —— controller 里的方法(对应某个路由 handler)。
 * @CurrentUser() —— 这是一个参数装饰器(Parameter Decorator),贴在参数前面。
 * 参数装饰器的作用:告诉框架"这个参数的值从哪来、怎么取"。
 *
 * - @nestjs/common —— createParamDecorator 是 Nest 提供的"自定义参数装饰器"工厂;
 *   ExecutionContext 是统一的请求上下文抽象,用它拿到底层 HTTP request。
 */
// createParamDecorator —— 把"如何从请求里取一个参数"的逻辑封装成可复用的装饰器
// ExecutionContext —— 当前请求上下文,switchToHttp() 后取到原始 request 对象
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedUser } from './jwt.strategy';

/** 取出经 JWT 守卫挂上的当前用户;受保护 handler 用 @CurrentUser() user 注入 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthedUser }>();
    return req.user;
  },
);
