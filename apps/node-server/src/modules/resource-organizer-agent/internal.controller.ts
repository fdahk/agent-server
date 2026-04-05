/**
 * Agent 内部接口控制器
 *
 * 这是 Java Core 调用 Node AI Gateway 的入口点。
 * Java Core 通过 POST /api/internal/agent/execute 将 AI 执行任务发送到这里，
 * 本控制器负责：
 *   1. 校验内部调用令牌（通过 InternalTokenGuard）
 *   2. 解析并校验请求参数
 *   3. 调用 AgentService 执行 AI 编排任务
 *   4. 将执行结果返回给 Java Core
 *
 * 【控制器在 NestJS 中的角色】
 * 控制器是"请求的入口"，它不包含具体的业务逻辑，
 * 只负责：接收请求 → 参数校验/转换 → 调用服务 → 返回响应。
 */

import {
  /**
   * BadRequestException 是 NestJS 内置的 HTTP 异常类，对应 HTTP 400 状态码。
   * 当请求参数不合法时抛出它，NestJS 会自动返回 400 错误响应。
   */
  BadRequestException,
  /**
   * @Body() 是参数装饰器，用于从 HTTP 请求体（request body）中提取数据。
   * 类似前端 axios.post(url, data) 中的 data 部分。
   */
  Body,
  /** @Controller() 装饰器：标记类为控制器，参数为路由前缀 */
  Controller,
  /** @Post() 装饰器：标记方法处理 HTTP POST 请求 */
  Post,
  /** @UseGuards() 装饰器：为控制器或方法绑定一个或多个守卫 */
  UseGuards,
} from '@nestjs/common';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard';
import { AgentService } from './service';

/**
 * 【TypeScript 语法：import type】
 * import type 只导入类型信息，不会在编译后的 JavaScript 中产生任何代码。
 * 它用于纯类型标注，不会被 NestJS 的依赖注入系统处理。
 * 普通 import 则会导入实际的值（类、函数、常量等），编译后仍然存在。
 */
import type { InternalExecuteRequest } from './types/types';

/**
 * InternalAgentController —— Agent 内部接口控制器
 *
 * @Controller('internal/agent') 定义路由前缀为 internal/agent，
 * 结合全局前缀 api，实际路径为 /api/internal/agent/*。
 *
 * @UseGuards(InternalTokenGuard) 将令牌校验守卫应用到本控制器的所有方法，
 * 即所有请求都必须通过内部令牌校验才能到达 execute 等方法。
 * 如果只想保护单个方法，可以把 @UseGuards 放到方法上面。
 */
@Controller('internal/agent')
@UseGuards(InternalTokenGuard)
export class InternalAgentController {
  /**
   * 构造函数注入 AgentService。
   * NestJS 自动从依赖注入容器中获取 AgentService 的单例实例并注入。
   */
  constructor(private readonly agentService: AgentService) {}

  /**
   * 执行 AI 资源整理任务
   *
   * @Post('execute') 表示处理 POST /api/internal/agent/execute 请求。
   *
   * @Body() body 从请求体提取数据。
   * Record<string, unknown> 是 TypeScript 类型，表示"键为 string、值为 unknown 的对象"。
   * 这里用 Record 而非具体类型，是因为参数校验在 normalizeExecuteRequest 中手动完成。
   *
   * 方法没有标注 async，但返回的是 AgentService.executeTask() 的 Promise，
   * NestJS 会自动 await 这个 Promise 并将结果序列化为 JSON 响应。
   */
  @Post('execute')
  execute(@Body() body: Record<string, unknown>) {
    const request = this.normalizeExecuteRequest(body);
    return this.agentService.executeTask(request);
  }

  /**
   * 请求参数标准化与校验
   *
   * private 方法，仅在本控制器内部使用。
   * 将原始的 body 对象手动解析为强类型的 InternalExecuteRequest。
   *
   * 【为什么不直接用 DTO + class-validator？】
   * DTO（Data Transfer Object）+ class-validator 是 NestJS 推荐的参数校验方式，
   * 但本项目选择了手动校验，更轻量，也更灵活地控制校验逻辑和错误提示。
   *
   * @param body - 原始请求体
   * @returns InternalExecuteRequest - 校验通过后的强类型请求对象
   * @throws BadRequestException - 参数不合法时抛出 400 错误
   */
  private normalizeExecuteRequest(
    body: Record<string, unknown>,
  ): InternalExecuteRequest {
    /** 提取 runId：运行标识，如果不是 string 则默认为空字符串 */
    const runId = typeof body.runId === 'string' ? body.runId.trim() : '';

    /** 提取 task：用户的整理任务描述 */
    const task = typeof body.task === 'string' ? body.task.trim() : '';

    /**
     * 提取 directories：用户指定的本地目录列表
     *
     * Array.isArray() 判断是否为数组。
     * .filter((item): item is string => ...) 是 TypeScript 的"类型谓词"语法：
     *   item is string 告诉编译器"过滤后的数组元素类型缩窄为 string"。
     * .map(item => item.trim()) 去除每个路径的首尾空格。
     * .filter(Boolean) 去除空字符串（空字符串是 falsy 值，Boolean('') === false）。
     */
    const directories = Array.isArray(body.directories)
      ? body.directories
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    /** 提取 urls：用户指定的网页 URL 列表，处理逻辑同 directories */
    const urls = Array.isArray(body.urls)
      ? body.urls
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    /** 提取 model：可选的模型名称，不传则由 OllamaProvider 使用默认模型 */
    const model =
      typeof body.model === 'string' ? body.model.trim() : undefined;

    /** 校验：task 不能为空 */
    if (!task) {
      throw new BadRequestException('task 不能为空');
    }

    /** 校验：至少提供一个目录或一个 URL */
    if (directories.length === 0 && urls.length === 0) {
      throw new BadRequestException('至少需要提供一个目录或一个 URL');
    }

    return { runId, task, directories, urls, model };
  }
}
