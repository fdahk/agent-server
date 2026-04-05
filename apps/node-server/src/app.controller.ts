/**
 * 应用根控制器 —— 健康检查接口
 *
 * 这是最简单的一个控制器，仅提供 GET /api 接口用于健康检查。
 * 运维或 Java Core 可通过调用此接口确认 Node AI Gateway 服务是否存活。
 *
 * 【什么是控制器（Controller）？】
 * 在 NestJS 中，控制器负责处理传入的 HTTP 请求并返回响应。
 * 你可以把它理解为前端路由的后端对应物：
 *   - 前端路由：URL → 页面组件
 *   - 后端控制器：URL → 处理函数
 */

/**
 * Controller 装饰器：标记一个类为 NestJS 控制器，括号内的字符串是路由前缀。
 * Get 装饰器：标记一个方法处理 HTTP GET 请求。
 */
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * @Controller() 括号为空，表示路由前缀为空。
 * 结合 main.ts 中设置的全局前缀 'api'，这个控制器挂载在 /api 下。
 */
@Controller()
export class AppController {
  /**
   * 构造函数注入（Constructor Injection）：
   * NestJS 看到参数类型是 AppService，就会自动从依赖注入容器中
   * 找到 AppService 的实例并注入进来。
   *
   * private readonly 是 TypeScript 的简写语法，等价于：
   *   private readonly appService: AppService;
   *   constructor(appService: AppService) { this.appService = appService; }
   *
   * - private：仅本类内部可访问
   * - readonly：赋值后不可修改，保证服务引用不会被意外篡改
   */
  constructor(private readonly appService: AppService) {}

  /**
   * @Get() 装饰器表示此方法处理 GET 请求。
   * 括号为空表示路径就是控制器前缀本身，即 GET /api。
   *
   * 返回类型 string 表示直接返回纯文本响应。
   * NestJS 会自动设置 Content-Type 为 text/html。
   */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
