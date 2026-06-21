/**
 * 自定义方法装饰器 @Public()。
 *
 * 全局 JwtAuthGuard 默认拦截所有路由,本装饰器给某个 handler 打一个
 * isPublic=true 的元数据标记;守卫读到这个标记就放行(用于注册/登录等公开端点)。
 * 它和 jwt-auth.guard.ts 里的 Reflector 是"写标记/读标记"的一对。
 *
 * - @nestjs/common —— SetMetadata 把一对 key/value 作为元数据附到目标(handler/类)上,
 *   之后可由 Reflector 读出。这就是 Nest 里"装饰器写、Guard 读"的元数据机制。
 */
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记某个路由跳过全局 JWT 守卫(注册/登录/健康检查等无需鉴权的端点) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
