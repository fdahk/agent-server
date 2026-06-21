/**
 * 全局 JWT 守卫(NestJS Guard)。
 *
 * Guard 是 Nest 的"放行/拦截"组件:在 handler 执行前运行 canActivate()
 * 返回true 放行、false 则拦截。本守卫复用 jwt.strategy 做鉴权,
 * 但额外读 @Public()元数据,给登录/注册等公开端点开个口子。
 *
 * - @nestjs/common —— Injectable 让守卫可注入;ExecutionContext 是对"当前请求上下文"
 *   的统一抽象(HTTP/WS/RPC 通吃),用它能拿到本次命中的 handler 与 controller 类。
 * - @nestjs/core —— Reflector 用来读取装饰器(如 @Public())写进去的元数据。
 * - @nestjs/passport —— AuthGuard('jwt') 生成一个跑 "jwt" 策略的守卫基类。
 */
import { ExecutionContext, Injectable } from '@nestjs/common';
// Reflector —— 元数据读取器, getAllAndOverride 从 handler/class 上读 IS_PUBLIC_KEY
import { Reflector } from '@nestjs/core';
// AuthGuard —— 传策略名生成守卫基类;super.canActivate 即触发上面那条 jwt 策略
import { AuthGuard } from '@nestjs/passport';
// IS_PUBLIC_KEY —— @Public() 的元数据键,用它读出这个路由是否公开(跳过 JWT 验证)
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * 全局 JWT 守卫:默认所有路由都要 Bearer token,@Public() 的路由放行。
 * 注册为 APP_GUARD 后对全应用生效,避免每个 controller 手动加守卫漏掉。
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // 先读 @Public() 元数据,有就放行; 没有就走 JWT 守卫正常验证(token 不对/过期会被 AuthGuard 拦截掉)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // getHandler() 拿到被 @Get/@Post 等装饰的函数(路由 handler)
      context.getClass(), // getClass() 拿到这个 handler 所在的类(通常是 controller)
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
