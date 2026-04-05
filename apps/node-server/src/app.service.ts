/**
 * 应用根服务 —— 提供基础的健康检查逻辑
 *
 * 这是最简单的服务类，只包含一个返回字符串的方法。
 * 在实际项目中，服务（Service）层负责封装业务逻辑，
 * 控制器（Controller）只负责接收请求和返回响应，不处理具体业务。
 *
 * 【为什么要把 getHello 放在 Service 而不是直接写在 Controller？】
 * 这是 NestJS 推荐的"关注点分离"模式：
 *   - Controller：路由分发、请求校验、响应格式化
 *   - Service：核心业务逻辑
 * 即使逻辑很简单，也保持这种分层习惯，方便日后扩展。
 */

/**
 * Injectable 装饰器：标记一个类为"可注入的提供者（Provider）"。
 * 被 @Injectable() 标记的类可以：
 *   1. 被 NestJS 的依赖注入容器管理生命周期（默认单例模式）
 *   2. 通过构造函数注入到其他类中
 *   3. 在 @Module() 的 providers 数组中注册后生效
 *
 * 如果一个类没有加 @Injectable()，NestJS 就不知道它是可注入的，
 * 在其他类的构造函数中请求它时会报错。
 */
import { Injectable } from '@nestjs/common';

/**
 * AppService —— 应用根服务
 *
 * @Injectable() 使得这个类成为 NestJS 依赖注入系统中的一个"提供者"。
 * 默认情况下，NestJS 中的 provider 是单例的：整个应用只创建一个实例，
 * 所有注入它的地方共享同一个对象。
 */
@Injectable()
export class AppService {
  /**
   * 返回一个简单的问候字符串，用于健康检查。
   * 访问 GET /api 时会调用此方法。
   */
  getHello(): string {
    return 'Hello World!';
  }
}
