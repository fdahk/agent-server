/**
 * 资源整理 Agent 功能模块（AgentModule）
 *
 * 本文件是"资源整理 Agent"功能的模块定义文件。
 * 在 NestJS 中，每个功能域通常对应一个模块，模块负责把相关的控制器、服务"打包"在一起。
 *
 * 本模块包含的核心能力：
 *   - 接收 Java Core 发来的 AI 执行请求（InternalAgentController）
 *   - 编排 AI 任务：计划生成 → 资源采集 → 摘要提炼 → 记忆聚合 → 报告生成（AgentService）
 *   - 调用 Ollama 本地大模型（OllamaProvider）
 *   - 采集本地文件和网页资源（ResourceCollectionService）
 *   - HTTP 请求发送（AxiosHttpClient）
 *
 * 本模块被 AppModule（根模块）通过 imports 导入后，其中注册的控制器路由才会生效。
 */

/**
 * Module 装饰器：将一个类标记为 NestJS 模块。
 * 模块是 NestJS 组织代码的基本单位，每个模块都是一个"功能包"。
 */
import { Module } from '@nestjs/common';
import { AxiosHttpClient } from '../../shared/clients/axios-http.client';
import { InternalAgentController } from './internal.controller';
import { OllamaProvider } from './providers/ollama.provider';
import { AgentService } from './service';
import { ResourceCollectionService } from './services/resource-collection.service';

/**
 * @Module() 配置说明：
 *
 * controllers —— 本模块拥有的控制器列表
 *   InternalAgentController 负责处理 /api/internal/agent/* 路由下的请求。
 *
 * providers —— 本模块拥有的服务/提供者列表
 *   NestJS 会为这些类创建实例并管理它们的依赖关系（依赖注入）。
 *   - AxiosHttpClient：HTTP 客户端，被 OllamaProvider 和 ResourceCollectionService 共同依赖
 *   - AgentService：Agent 编排核心服务，负责调度整个 AI 任务流程
 *   - OllamaProvider：Ollama 大模型调用封装
 *   - ResourceCollectionService：资源采集服务（本地文件扫描 + 网页抓取）
 *
 * 【依赖注入的实际流程】
 * NestJS 看到 AgentService 的构造函数需要 OllamaProvider 和 ResourceCollectionService，
 * 就会先实例化这两个类，再把它们的实例注入到 AgentService 中。
 * 而 OllamaProvider 和 ResourceCollectionService 又各自依赖 AxiosHttpClient，
 * NestJS 会确保 AxiosHttpClient 只实例化一次（单例），然后共享给两者。
 */
@Module({
  controllers: [InternalAgentController],
  providers: [
    AxiosHttpClient,
    AgentService,
    OllamaProvider,
    ResourceCollectionService,
  ],
})
export class AgentModule {}
