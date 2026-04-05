/**
 * 应用根模块（Root Module）
 *
 * 在 NestJS 中，"模块（Module）"是组织代码的基本单位，类似前端框架中的"路由配置 + 依赖声明"。
 * 每个 NestJS 应用必须有且只有一个根模块，它负责：
 *   - 导入所有子模块（imports）
 *   - 声明根级别的控制器和服务
 *
 * 本文件将 AgentModule（AI 资源整理 Agent 模块）注册到应用中，
 * 使 Java Core 可以通过 /api/internal/agent/execute 调用 AI 编排能力。
 */

/**
 * Module 是 NestJS 提供的装饰器（Decorator）。
 * 装饰器是 TypeScript 的一种特殊语法，以 @ 开头，用于给类/方法/属性附加元数据。
 * @Module() 装饰器告诉 NestJS："这个类是一个模块"，并通过参数配置模块的内容。
 */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentModule } from './modules/resource-organizer-agent/module';

/**
 * @Module() 装饰器的配置项说明：
 *
 * - imports：导入其他模块。被导入模块中 exports 的 provider 可在本模块中使用。
 *   这里导入了 AgentModule，它包含了 AI 资源整理相关的所有控制器和服务。
 *
 * - controllers：声明本模块拥有的控制器。控制器负责"接收 HTTP 请求，返回响应"。
 *   这里的 AppController 提供了一个简单的健康检查接口。
 *
 * - providers：声明本模块拥有的"提供者"（通常是服务类）。
 *   NestJS 的依赖注入容器会自动管理这些类的实例化和生命周期。
 *   这里的 AppService 是 AppController 所依赖的服务。
 *
 * 【什么是依赖注入（DI）？】
 * 简单说：你不需要自己 new 一个服务实例，只需在构造函数参数中声明它，
 * NestJS 会自动帮你创建并注入。这样做的好处是解耦、可测试、易替换。
 */
@Module({
  imports: [AgentModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
