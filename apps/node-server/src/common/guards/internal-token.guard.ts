/**
 * 内部调用鉴权守卫（Guard）
 *
 * 在混合架构中，Java Core 通过 HTTP 调用 Node AI Gateway 的内部接口。
 * 为了防止未授权的外部请求直接访问 AI 编排接口，本守卫会校验请求头中的
 * x-internal-token 是否与环境变量 INTERNAL_TOKEN 一致。
 *
 * 【什么是守卫（Guard）？】
 * Guard 是 NestJS 的请求生命周期中"认证/鉴权"环节的核心机制。
 * 请求到达控制器方法之前，会先经过 Guard 的 canActivate() 方法：
 *   - 返回 true → 请求继续流转到控制器
 *   - 返回 false 或抛出异常 → 请求被拦截，直接返回错误响应
 *
 * 请求处理流程：Client → Middleware → Guard → Interceptor → Controller
 */

import {
  /**
   * CanActivate 是一个接口（interface），定义了守卫必须实现的 canActivate 方法。
   * 实现此接口意味着"我承诺提供一个 canActivate 方法给 NestJS 调用"。
   */
  CanActivate,
  /**
   * ExecutionContext 是 NestJS 对"当前请求上下文"的抽象封装。
   * 它可以获取到当前请求的 HTTP request/response 对象，
   * 也支持 WebSocket、gRPC 等其他协议的上下文切换。
   */
  ExecutionContext,
  /** Injectable 装饰器：标记此类可被依赖注入容器管理 */
  Injectable,
  /** UnauthorizedException 是 NestJS 内置的 HTTP 异常类，对应 HTTP 401 状态码 */
  UnauthorizedException,
} from '@nestjs/common';

/**
 * InternalTokenGuard —— 内部服务间调用的令牌校验守卫
 *
 * 使用方式：在控制器或方法上添加 @UseGuards(InternalTokenGuard)
 *
 * @Injectable() 使守卫也成为 NestJS 依赖注入容器中的 provider，
 * 这意味着它也可以注入其他服务（虽然本守卫目前不需要）。
 *
 * implements CanActivate 是 TypeScript 的"接口实现"语法，
 * 它强制要求本类必须实现 canActivate 方法，否则编译报错。
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  /**
   * canActivate —— 守卫的核心方法，NestJS 在每次请求时自动调用
   *
   * @param context - 执行上下文，包含当前请求的所有信息
   * @returns boolean - true 表示放行，false 或抛异常表示拦截
   *
   * 业务逻辑：
   *   1. 读取环境变量 INTERNAL_TOKEN 作为期望的令牌
   *   2. 如果未配置令牌（开发环境），直接放行
   *   3. 从请求头 x-internal-token 中提取实际令牌
   *   4. 比对两个令牌，不一致则抛出 401 异常
   */
  canActivate(context: ExecutionContext): boolean {
    /**
     * process.env.INTERNAL_TOKEN 从环境变量读取期望的令牌值。
     * ?.trim() 是可选链 + trim：如果值存在则去除首尾空格，不存在则返回 undefined。
     */
    const expectedToken = process.env.INTERNAL_TOKEN?.trim();

    /** 如果环境变量未配置令牌，则跳过校验（便于本地开发） */
    if (!expectedToken) {
      return true;
    }

    /**
     * context.switchToHttp() 将通用执行上下文切换为 HTTP 上下文，
     * 然后 .getRequest() 获取原始的 HTTP 请求对象。
     *
     * 泛型 <{ headers: Record<string, string | undefined> }> 是 TypeScript 的类型断言，
     * 告诉编译器"请求对象的 headers 字段是一个键值对，值为 string 或 undefined"。
     * Record<K, V> 是 TypeScript 内置工具类型，表示键类型为 K、值类型为 V 的对象。
     */
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();

    /** 从请求头中读取实际传入的内部令牌 */
    const actualToken = request.headers['x-internal-token'];

    /** 令牌不存在或不匹配时，抛出 401 Unauthorized 异常 */
    if (!actualToken || actualToken !== expectedToken) {
      throw new UnauthorizedException('Invalid internal token');
    }

    /** 校验通过，放行请求 */
    return true;
  }
}
