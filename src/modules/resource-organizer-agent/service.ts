import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { AgentReportService } from './services/report.service';
import { AgentRunStoreService } from './services/run-store.service';
import type {
  AgentMemory,
  AgentPlanStep,
  AgentRunRequest,
  AgentRunResult,
  CollectedResource,
  ResourceSummary,
} from './types/types';
import { OllamaProvider } from './providers/ollama.provider';
import { ResourceCollectionService } from './services/resource-collection.service';

@Injectable()
export class AgentService {
  // 业务编排层：把状态存储、模型调用、资源采集、报告输出串成一次完整运行
  constructor(
    private readonly runStore: AgentRunStoreService,
    private readonly ollamaProvider: OllamaProvider,
    private readonly resourceCollectionService: ResourceCollectionService,
    private readonly agentReportService: AgentReportService,
  ) {}

  /**
   * 同步创建 run 并启动后台 executeRun；HTTP 立即返回 runId。
   * 执行过程中的进度通过 runStore.publish → SSE stream 推给前端。
   */
  createRun(request: AgentRunRequest): { runId: string } {
    const runId = `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
    this.runStore.create(runId);
    void this.executeRun(runId, request);
    return { runId };
  }

  // 获取运行快照，如果运行不存在，则抛出异常
  getRunSnapshot(runId: string) {
    return this.runStore.getRunSnapshot(runId);
  }

  /** Controller @Sse 入口：每个 HTTP 连接一个 Observable */
  streamRun(runId: string): Observable<MessageEvent> {
    return this.runStore.stream(runId);
  }

  /** 长链路异步任务；各阶段 publish(AgentRunEvent)，与前端 EventSource 事件一一对应 */
  private async executeRun(
    runId: string,
    request: AgentRunRequest,
  ): Promise<void> {
    const model = this.ollamaProvider.resolveModel(request.model);
    const startedAt = new Date().toISOString();

    this.runStore.setStatus(runId, 'running');
    // SSE 的第一条事件：告诉前端这次 run 已真正开始执行
    this.runStore.publish({
      type: 'run_started',
      runId,
      payload: {
        task: request.task,
        model,
        input: {
          directories: request.directories,
          urls: request.urls,
        },
      },
    });

    try {
      const plan = await this.buildPlan(request, model);

      // 规划完成后立即推送，让前端先渲染出步骤时间线
      this.runStore.publish({
        type: 'plan_ready',
        runId,
        payload: {
          plan,
        },
      });

      const collectedResources: CollectedResource[] = [];

      if (request.directories.length > 0) {
        this.startStep(runId, plan, 'scan_local_directory');
        const localResources =
          await this.resourceCollectionService.collectFromDirectories(
            request.directories,
          );
        collectedResources.push(...localResources);
        localResources.forEach((resource) => {
          this.runStore.publish({
            type: 'resource_collected',
            runId,
            payload: {
              resource: this.toResourcePreview(resource),
            },
          });
        });
        this.finishStep(plan, 'scan_local_directory');
      }

      if (request.urls.length > 0) {
        this.startStep(runId, plan, 'fetch_web_resources');
        const webResources =
          await this.resourceCollectionService.collectFromUrls(request.urls);
        collectedResources.push(...webResources);
        webResources.forEach((resource) => {
          this.runStore.publish({
            type: 'resource_collected',
            runId,
            payload: {
              resource: this.toResourcePreview(resource),
            },
          });
        });
        this.finishStep(plan, 'fetch_web_resources');
      }

      if (collectedResources.length === 0) {
        throw new Error(
          '没有采集到可整理的资源，请检查目录路径、网页地址或资源格式限制。',
        );
      }

      this.startStep(runId, plan, 'summarize_resources');
      const summaries: ResourceSummary[] = [];

      for (const resource of collectedResources) {
        const summary = await this.summarizeResource(
          request.task,
          resource,
          model,
        );
        summaries.push(summary);
        this.runStore.publish({
          type: 'resource_summarized',
          runId,
          payload: summary,
        });
      }

      this.finishStep(plan, 'summarize_resources');

      this.startStep(runId, plan, 'build_memory');
      const memory = await this.buildMemory(request.task, summaries, model);
      this.runStore.publish({
        type: 'memory_updated',
        runId,
        payload: memory,
      });
      this.finishStep(plan, 'build_memory');

      this.startStep(runId, plan, 'generate_report');
      const finalAnswer = await this.generateFinalAnswer(
        request.task,
        summaries,
        memory,
        model,
      );
      this.finishStep(plan, 'generate_report');

      this.startStep(runId, plan, 'write_output_files');
      const completedAt = new Date().toISOString();
      const artifacts = await this.agentReportService.writeArtifacts({
        runId,
        request,
        model,
        plan,
        memory,
        resources: summaries,
        finalAnswer,
        startedAt,
        completedAt,
      });
      // 把落盘后的每个文件单独推给前端，便于 UI 增量展示产物列表
      artifacts.forEach((artifact) => {
        this.runStore.publish({
          type: 'file_written',
          runId,
          payload: artifact,
        });
      });
      this.finishStep(plan, 'write_output_files');

      const result: AgentRunResult = {
        runId,
        task: request.task,
        status: 'completed',
        model,
        input: {
          directories: request.directories,
          urls: request.urls,
        },
        plan,
        resources: summaries,
        memory,
        finalAnswer,
        artifacts,
        startedAt,
        completedAt,
      };

      // 终态事件：runStore 会在 publish 后 complete 对应 subject，SSE 流随之结束
      this.runStore.publish({
        type: 'run_completed',
        runId,
        payload: result,
      });
    } catch (error) {
      // 失败同样作为终态事件推送给前端，而不是直接把异常抛给已开始的 SSE 连接
      this.runStore.publish({
        type: 'run_failed',
        runId,
        payload: {
          message: error instanceof Error ? error.message : 'Agent 运行失败',
        },
      });
    }
  }

  // 构建执行计划，如果构建失败，则回退到本地兜底计划，保证整个流程还能继续
  private async buildPlan(
    request: AgentRunRequest,
    model: string,
  ): Promise<AgentPlanStep[]> {
    const fallbackPlan = this.buildFallbackPlan(request);

    try {
      // 让模型只返回允许的 step id；后面再做一次白名单过滤，避免模型输出越界结构
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

      const allowed = new Set(fallbackPlan.map((step) => step.id));
      const normalized = plan
        .filter((step) => allowed.has(step.id))
        .map((step) => ({
          id: step.id,
          title: step.title,
          detail: step.detail,
          status: 'pending' as const,
        }));

      return normalized.length > 0 ? normalized : fallbackPlan;
    } catch {
      // 规划失败时回退到本地兜底计划，保证整个流程还能继续
      return fallbackPlan;
    }
  }

  private buildFallbackPlan(request: AgentRunRequest): AgentPlanStep[] {
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
      {
        id: 'write_output_files',
        title: '落盘输出整理结果',
        detail: '写出 Markdown 报告、结构化 JSON 和资源摘要索引。',
        status: 'pending',
      },
    );

    return plan;
  }

  // 摘要资源，如果摘要失败，则回退到本地兜底摘要，保证整个流程还能继续
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

  // 构建记忆，如果构建失败，则回退到本地兜底记忆，保证整个流程还能继续
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
        userPrompt: JSON.stringify(
          {
            task,
            resources,
          },
          null,
          2,
        ),
      });
    } catch {
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

  // 生成最终答案，如果生成失败，则回退到本地兜底答案，保证整个流程还能继续
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
        userPrompt: JSON.stringify(
          {
            task,
            memory,
            resources,
          },
          null,
          2,
        ),
      });
    } catch {
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

  // 标记步骤为运行中
  private startStep(
    runId: string,
    plan: AgentPlanStep[],
    stepId: string,
  ): void {
    const step = plan.find((item) => item.id === stepId);

    if (!step) {
      return;
    }

    step.status = 'running';
    this.runStore.publish({
      type: 'step_started',
      runId,
      payload: {
        stepId,
        title: step.title,
        detail: step.detail,
      },
    });
  }

  private finishStep(plan: AgentPlanStep[], stepId: string): void {
    const step = plan.find((item) => item.id === stepId);

    if (step) {
      step.status = 'completed';
    }
  }

  // 转换资源预览，只返回部分字段，避免泄露敏感信息
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
