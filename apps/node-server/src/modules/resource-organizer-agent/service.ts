/**
 * Agent 编排核心服务 —— AI 任务执行的"大脑"
 *
 * 这是整个 Node AI Gateway 最核心的文件。它负责编排一次完整的 AI 资源整理任务，
 * 按照以下流程依次执行：
 *
 *   1. 构建执行计划（buildPlan）—— 让 AI 规划任务步骤
 *   2. 采集本地目录资源（collectFromDirectories）—— 扫描指定目录下的文件
 *   3. 采集网页资源（collectFromUrls）—— 抓取指定 URL 的网页内容
 *   4. 逐条提炼资源摘要（summarizeResource）—— AI 为每份资源生成摘要和分类
 *   5. 整理全局记忆（buildMemory）—— AI 将所有摘要聚合为主题聚类
 *   6. 生成最终报告（generateFinalAnswer）—— AI 输出总结报告
 *
 * 执行过程中会产生事件流（events），Java Core 可据此向前端推送实时进度。
 *
 * 【Service 在 NestJS 中的定位】
 * Service 是"业务逻辑层"，所有核心的业务编排都在这里完成。
 * Controller 只负责接收请求和返回响应，不关心具体实现。
 */

import { Injectable } from '@nestjs/common';
import type {
  AgentExecutionEvent,
  AgentExecutionResult,
  AgentMemory,
  AgentPlanStep,
  CollectedResource,
  InternalExecuteRequest,
  ResourceSummary,
} from './types/types';
import { OllamaProvider } from './providers/ollama.provider';
import { ResourceCollectionService } from './services/resource-collection.service';

/**
 * AgentService —— 资源整理 Agent 的核心编排服务
 *
 * @Injectable() 使本类成为 NestJS 依赖注入容器中的 provider（单例）。
 * 它被 InternalAgentController 通过构造函数注入并调用。
 */
@Injectable()
export class AgentService {
  /**
   * 构造函数注入两个依赖服务：
   * - ollamaProvider：负责与 Ollama 大模型通信（发 prompt、解析响应）
   * - resourceCollectionService：负责从本地目录和网页 URL 采集资源
   *
   * NestJS 看到这两个参数的类型后，会自动从容器中找到对应的实例注入进来。
   */
  constructor(
    private readonly ollamaProvider: OllamaProvider,
    private readonly resourceCollectionService: ResourceCollectionService,
  ) {}

  /**
   * 执行一次完整的 AI 资源整理任务（核心入口方法）
   *
   * 这是被 Controller 调用的公开方法，编排了整个任务的生命周期。
   *
   * @param request - 来自 Java Core 的执行请求，包含任务描述、目录、URL 等
   * @returns Promise<AgentExecutionResult> - 异步返回完整的执行结果
   *
   * 【async/await 在这里的作用】
   * 本方法是 async 的，因为内部有多个需要等待的 AI 调用和文件 I/O 操作。
   * await 让这些异步操作按顺序执行（步骤间有依赖关系，不能并行）。
   */
  async executeTask(
    request: InternalExecuteRequest,
  ): Promise<AgentExecutionResult> {
    /** 确定使用的模型（用户指定 or 默认模型） */
    const model = this.ollamaProvider.resolveModel(request.model);
    /** 记录任务开始时间（ISO 8601 格式字符串） */
    const startedAt = new Date().toISOString();
    /** 事件列表：记录任务执行过程中的每一步变化，供 Java Core 做进度推送 */
    const events: AgentExecutionEvent[] = [];

    // ————— 步骤 1：构建执行计划 —————
    /** 调用 AI 生成任务执行计划，如果 AI 调用失败则使用兜底计划 */
    let plan = await this.buildPlan(request, model);
    /** 发出"计划就绪"事件 */
    events.push({ type: 'plan_ready', payload: { plan } });

    /** 存储所有采集到的资源（本地文件 + 网页） */
    const collectedResources: CollectedResource[] = [];

    // ————— 步骤 2：采集本地目录资源 —————
    if (request.directories.length > 0) {
      /** 将"扫描本地目录"步骤标记为 running，并发出 step_started 事件 */
      plan = this.markStepRunning(events, plan, 'scan_local_directory');
      /** 调用资源采集服务扫描目录 */
      const localResources =
        await this.resourceCollectionService.collectFromDirectories(
          request.directories,
        );
      collectedResources.push(...localResources);
      /** 为每个采集到的资源发出 resource_collected 事件（不含完整内容，只有预览） */
      for (const resource of localResources) {
        events.push({
          type: 'resource_collected',
          payload: { resource: this.toResourcePreview(resource) },
        });
      }
      /** 标记步骤完成 */
      plan = this.markStepCompleted(plan, 'scan_local_directory');
    }

    // ————— 步骤 3：采集网页资源 —————
    if (request.urls.length > 0) {
      plan = this.markStepRunning(events, plan, 'fetch_web_resources');
      const webResources = await this.resourceCollectionService.collectFromUrls(
        request.urls,
      );
      collectedResources.push(...webResources);
      for (const resource of webResources) {
        events.push({
          type: 'resource_collected',
          payload: { resource: this.toResourcePreview(resource) },
        });
      }
      plan = this.markStepCompleted(plan, 'fetch_web_resources');
    }

    /** 如果没有采集到任何资源，直接抛出错误，终止任务 */
    if (collectedResources.length === 0) {
      throw new Error(
        '没有采集到可整理的资源，请检查目录路径、网页地址或资源格式限制。',
      );
    }

    // ————— 步骤 4：逐条提炼资源摘要 —————
    plan = this.markStepRunning(events, plan, 'summarize_resources');
    const summaries: ResourceSummary[] = [];
    for (const resource of collectedResources) {
      /** 调用 AI 为单个资源生成摘要、分类和标签 */
      const summary = await this.summarizeResource(
        request.task,
        resource,
        model,
      );
      summaries.push(summary);
      events.push({ type: 'resource_summarized', payload: summary });
    }
    plan = this.markStepCompleted(plan, 'summarize_resources');

    // ————— 步骤 5：整理全局记忆 —————
    plan = this.markStepRunning(events, plan, 'build_memory');
    /** 调用 AI 将所有摘要聚合为主题聚类和关键洞察 */
    const memory = await this.buildMemory(request.task, summaries, model);
    events.push({ type: 'memory_updated', payload: memory });
    plan = this.markStepCompleted(plan, 'build_memory');

    // ————— 步骤 6：生成最终报告 —————
    plan = this.markStepRunning(events, plan, 'generate_report');
    /** 调用 AI 生成最终的 Markdown 格式总结报告 */
    const finalAnswer = await this.generateFinalAnswer(
      request.task,
      summaries,
      memory,
      model,
    );
    plan = this.markStepCompleted(plan, 'generate_report');

    /** 记录任务完成时间 */
    const completedAt = new Date().toISOString();

    /**
     * 组装并返回最终执行结果。
     * 这个对象会被 NestJS 自动序列化为 JSON 返回给 Java Core。
     */
    return {
      model,
      plan,
      resources: summaries,
      memory,
      finalAnswer,
      startedAt,
      completedAt,
      events,
    };
  }

  // ==================== AI 调用层 ====================

  /**
   * 构建执行计划：让 AI 根据用户任务生成步骤列表
   *
   * @param request - 执行请求（包含任务描述和资源信息）
   * @param model   - 使用的模型名称
   * @returns Promise<AgentPlanStep[]> - 计划步骤数组
   *
   * 如果 AI 调用失败或返回不合法数据，会回退到 buildFallbackPlan 生成的固定计划。
   * 这种"优雅降级"策略确保即使 AI 不可用，任务也能正常推进。
   */
  private async buildPlan(
    request: InternalExecuteRequest,
    model: string,
  ): Promise<AgentPlanStep[]> {
    /** 先生成兜底计划，确保一定有可用的计划 */
    const fallbackPlan = this.buildFallbackPlan(request);

    try {
      /**
       * completeJson<T> 是 OllamaProvider 提供的方法：
       * 它发送 prompt 给 AI，然后将 AI 的文本响应解析为类型 T 的 JSON 对象。
       *
       * Array<Pick<AgentPlanStep, 'id' | 'title' | 'detail'>> 是泛型参数：
       *   - Pick<T, K> 是 TypeScript 工具类型，从 T 中选取指定的属性 K
       *   - 这里只需要 AI 返回 id、title、detail 三个字段，status 由代码控制
       */
      const plan = await this.ollamaProvider.completeJson<
        Array<Pick<AgentPlanStep, 'id' | 'title' | 'detail'>>
      >({
        model,
        systemPrompt: [
          '你是一个资源整理 Agent 的规划器。',
          '你只能输出 JSON 数组，不要输出 markdown，不要输出解释。',
          '每个 step 只能使用这些 id：scan_local_directory、fetch_web_resources、summarize_resources、build_memory、generate_report、write_output_files。',
          'title 和 detail 必须用中文，简洁、可执行。',
        ].join('\n'),
        userPrompt: JSON.stringify(
          {
            task: request.task,
            hasDirectories: request.directories.length > 0,
            hasUrls: request.urls.length > 0,
            directories: request.directories,
            urls: request.urls,
          },
          null,
          2,
        ),
      });

      /** 校验 AI 返回的步骤 ID 是否在允许范围内 */
      const allowed = new Set(fallbackPlan.map((step) => step.id));
      const normalized = plan
        .filter((step) => allowed.has(step.id))
        .map((step) => ({
          id: step.id,
          title: step.title,
          detail: step.detail,
          /** as const 是 TypeScript 的"常量断言"，将 'pending' 缩窄为字面量类型 */
          status: 'pending' as const,
        }));

      /** AI 计划有效则使用，否则回退到兜底计划 */
      return normalized.length > 0 ? normalized : fallbackPlan;
    } catch {
      return fallbackPlan;
    }
  }

  /**
   * 构建兜底计划：当 AI 规划失败时，使用固定的步骤列表
   *
   * 根据请求中是否包含目录/URL 动态组合步骤。
   * 每个步骤都有固定的 id、中文标题和详细说明。
   */
  private buildFallbackPlan(request: InternalExecuteRequest): AgentPlanStep[] {
    const plan: AgentPlanStep[] = [];

    if (request.directories.length > 0) {
      plan.push({
        id: 'scan_local_directory',
        title: '扫描指定目录',
        detail: '遍历用户显式指定的目录，只读取受支持的文本资源。',
        status: 'pending',
      });
    }

    if (request.urls.length > 0) {
      plan.push({
        id: 'fetch_web_resources',
        title: '抓取网页正文',
        detail: '访问用户提供的 URL，抽取页面标题与正文文本。',
        status: 'pending',
      });
    }

    plan.push(
      {
        id: 'summarize_resources',
        title: '逐条提炼资源摘要',
        detail: '为每份资源生成摘要、分类与标签。',
        status: 'pending',
      },
      {
        id: 'build_memory',
        title: '整理全局记忆',
        detail: '把所有摘要合并为主题聚类和关键洞察。',
        status: 'pending',
      },
      {
        id: 'generate_report',
        title: '生成最终整理结论',
        detail: '围绕用户任务输出最终报告草案和建议。',
        status: 'pending',
      },
    );

    return plan;
  }

  /**
   * 为单个资源生成 AI 摘要
   *
   * 将资源内容发送给 AI，要求其返回结构化的摘要 JSON。
   * 如果 AI 调用失败，返回一个带有"待人工确认"标记的降级摘要。
   *
   * @param task     - 用户的任务描述（提供上下文，让 AI 摘要更聚焦）
   * @param resource - 原始采集到的资源
   * @param model    - 使用的模型名称
   * @returns Promise<ResourceSummary> - 资源摘要
   */
  private async summarizeResource(
    task: string,
    resource: CollectedResource,
    model: string,
  ): Promise<ResourceSummary> {
    try {
      return await this.ollamaProvider.completeJson<ResourceSummary>({
        model,
        systemPrompt: [
          '你是资源整理 Agent 的摘要器。',
          '只返回 JSON 对象，不要使用 markdown。',
          '字段必须严格是：resourceId、title、source、kind、category、tags、summary、relevance。',
          'summary 和 relevance 用中文，tags 是中文字符串数组，长度 2-5。',
        ].join('\n'),
        userPrompt: JSON.stringify(
          {
            task,
            resource: {
              id: resource.id,
              title: resource.title,
              source: resource.source,
              kind: resource.kind,
              snippet: resource.snippet,
              content: resource.content,
            },
          },
          null,
          2,
        ),
      });
    } catch {
      /** AI 摘要失败时的降级处理：使用原始片段和默认分类 */
      return {
        resourceId: resource.id,
        title: resource.title,
        source: resource.source,
        kind: resource.kind,
        category: resource.kind === 'web_page' ? '网页资料' : '本地文档',
        tags:
          resource.kind === 'web_page'
            ? ['网页', '待人工确认']
            : ['本地文件', '待人工确认'],
        summary: resource.snippet,
        relevance: '模型摘要失败，暂时保留原始片段供后续人工检查。',
      };
    }
  }

  /**
   * 构建全局记忆：将所有资源摘要聚合为主题聚类
   *
   * AI 会识别跨资源的共同主题，将相关资源归类，并提取关键洞察。
   * 失败时降级为按资源顺序的简单展示。
   *
   * @param task      - 用户任务描述
   * @param resources - 所有资源的摘要列表
   * @param model     - 使用的模型名称
   * @returns Promise<AgentMemory> - 包含 keyInsights 和 clusters 的记忆对象
   */
  private async buildMemory(
    task: string,
    resources: ResourceSummary[],
    model: string,
  ): Promise<AgentMemory> {
    try {
      return await this.ollamaProvider.completeJson<AgentMemory>({
        model,
        systemPrompt: [
          '你是资源整理 Agent 的记忆聚合器。',
          '只返回 JSON 对象，不要输出解释。',
          '字段必须严格是：keyInsights、clusters。',
          'keyInsights 是 3-6 条中文短句；clusters 是数组，每项包含 name、takeaway、sourceIds。',
        ].join('\n'),
        userPrompt: JSON.stringify({ task, resources }, null, 2),
      });
    } catch {
      /** 降级处理：直接将前 5 条资源摘要作为洞察，所有资源归为一个默认分组 */
      return {
        keyInsights: resources
          .slice(0, 5)
          .map((resource) => `${resource.title}：${resource.summary}`),
        clusters: [
          {
            name: '默认整理视角',
            takeaway: '模型聚类失败，已回退为按资源顺序展示。',
            sourceIds: resources.map((resource) => resource.resourceId),
          },
        ],
      };
    }
  }

  /**
   * 生成最终报告：基于所有摘要和记忆，输出 Markdown 格式的总结
   *
   * 这是 AI 编排的最后一步，生成面向用户阅读的结论性报告。
   * 失败时降级为简单的列表拼接。
   *
   * @param task      - 用户任务描述
   * @param resources - 资源摘要列表
   * @param memory    - 全局记忆（聚类和洞察）
   * @param model     - 使用的模型名称
   * @returns Promise<string> - Markdown 格式的最终报告
   */
  private async generateFinalAnswer(
    task: string,
    resources: ResourceSummary[],
    memory: AgentMemory,
    model: string,
  ): Promise<string> {
    try {
      return await this.ollamaProvider.completeText({
        model,
        systemPrompt: [
          '你是资源整理 Agent 的总结器。',
          '请输出中文 Markdown，总结任务结果、核心洞察、建议的后续动作。',
          '不要虚构没有出现过的资源。',
        ].join('\n'),
        userPrompt: JSON.stringify({ task, memory, resources }, null, 2),
      });
    } catch {
      /** 降级处理：拼接简单的 Markdown 列表 */
      return [
        '## 整理结果',
        '',
        ...memory.keyInsights.map((item) => `- ${item}`),
        '',
        '## 资源摘要',
        '',
        ...resources.map(
          (resource) => `- ${resource.title}：${resource.summary}`,
        ),
      ].join('\n');
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 将计划中某个步骤标记为"执行中"，并发出 step_started 事件
   *
   * 使用不可变方式更新：通过 map 创建新数组，而非修改原数组。
   * 这是函数式编程风格，避免了对原始数据的副作用。
   *
   * @param events - 事件列表（会被追加新事件，这里是可变操作）
   * @param plan   - 当前计划步骤数组
   * @param stepId - 要标记的步骤 ID
   * @returns 更新后的计划步骤数组（新数组）
   */
  private markStepRunning(
    events: AgentExecutionEvent[],
    plan: AgentPlanStep[],
    stepId: string,
  ): AgentPlanStep[] {
    const updatedPlan = plan.map((step) =>
      step.id === stepId ? { ...step, status: 'running' as const } : step,
    );
    const step = updatedPlan.find((item) => item.id === stepId);
    if (step) {
      events.push({
        type: 'step_started',
        payload: { stepId, title: step.title, detail: step.detail },
      });
    }
    return updatedPlan;
  }

  /**
   * 将计划中某个步骤标记为"已完成"
   *
   * @param plan   - 当前计划步骤数组
   * @param stepId - 要标记的步骤 ID
   * @returns 更新后的计划步骤数组（新数组）
   */
  private markStepCompleted(
    plan: AgentPlanStep[],
    stepId: string,
  ): AgentPlanStep[] {
    return plan.map((step) =>
      step.id === stepId ? { ...step, status: 'completed' as const } : step,
    );
  }

  /**
   * 将采集到的资源转换为"预览"格式（去除 content 字段）
   *
   * content 字段可能包含大量文本，在事件推送时不需要传输完整内容。
   *
   * Omit<CollectedResource, 'content'> 是 TypeScript 工具类型：
   * 从 CollectedResource 类型中排除 content 字段，得到一个新类型。
   */
  private toResourcePreview(
    resource: CollectedResource,
  ): Omit<CollectedResource, 'content'> {
    return {
      id: resource.id,
      kind: resource.kind,
      title: resource.title,
      source: resource.source,
      snippet: resource.snippet,
      metadata: resource.metadata,
    };
  }
}
