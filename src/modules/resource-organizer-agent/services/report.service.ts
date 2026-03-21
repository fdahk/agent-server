import { Injectable } from '@nestjs/common';
import { mkdir, stat, writeFile } from 'node:fs/promises'; // 文件系统操作
import * as path from 'node:path'; // 路径处理
import type {
  AgentArtifact,
  AgentPlanStep,
  AgentRunRequest,
  AgentMemory,
  ResourceSummary,
} from '../types/types';

@Injectable()
export class AgentReportService {
  // 默认输出目录跟随当前进程工作目录；也可通过环境变量覆盖
  private readonly outputRoot = path.resolve(
    process.env.AGENT_OUTPUT_ROOT ??
      path.join(process.cwd(), 'storage', 'agent-runs'),
  );

  async writeArtifacts(params: {
    runId: string;
    request: AgentRunRequest;
    model: string;
    plan: AgentPlanStep[];
    memory: AgentMemory;
    resources: ResourceSummary[];
    finalAnswer: string;
    startedAt: string;
    completedAt: string;
  }): Promise<AgentArtifact[]> {
    const runDir = path.join(this.outputRoot, params.runId);
    // recursive: true 表示目录已存在时也不会报错，适合做“确保目录存在”
    await mkdir(runDir, { recursive: true });

    const markdownPath = path.join(runDir, 'report.md');
    const reportJsonPath = path.join(runDir, 'report.json');
    const sourcesJsonPath = path.join(runDir, 'sources.json');

    // 一次运行同时产出给人读的 Markdown、给程序读的 JSON，以及资源索引
    await writeFile(markdownPath, this.buildMarkdown(params), 'utf-8');
    await writeFile(
      reportJsonPath,
      JSON.stringify(
        {
          runId: params.runId,
          task: params.request.task,
          model: params.model,
          plan: params.plan,
          memory: params.memory,
          finalAnswer: params.finalAnswer,
          input: {
            directories: params.request.directories,
            urls: params.request.urls,
          },
          startedAt: params.startedAt,
          completedAt: params.completedAt,
        },
        null,
        2,
      ),
      'utf-8',
    );
    await writeFile(
      sourcesJsonPath,
      JSON.stringify(params.resources, null, 2),
      'utf-8',
    );

    const files = [markdownPath, reportJsonPath, sourcesJsonPath];
    const artifacts: AgentArtifact[] = [];

    for (const filePath of files) {
      // 重新 stat 一次，把真实文件大小回填到给前端展示的 artifact 元数据中
      const fileStat = await stat(filePath);
      artifacts.push({
        name: path.basename(filePath),
        path: filePath,
        size: fileStat.size,
        kind: filePath.endsWith('.md') ? 'markdown' : 'json',
      });
    }

    return artifacts;
  }

  private buildMarkdown(params: {
    request: AgentRunRequest;
    model: string;
    plan: AgentPlanStep[];
    memory: AgentMemory;
    resources: ResourceSummary[];
    finalAnswer: string;
    startedAt: string;
    completedAt: string;
  }): string {
    const planLines = params.plan
      .map((step, index) => `${index + 1}. ${step.title} - ${step.detail}`)
      .join('\n');
    const insightLines = params.memory.keyInsights
      .map((item) => `- ${item}`)
      .join('\n');
    const clusterLines = params.memory.clusters
      .map(
        (cluster) =>
          `- ${cluster.name}: ${cluster.takeaway}（来源：${cluster.sourceIds.join('、')}）`,
      )
      .join('\n');
    const resourceLines = params.resources
      .map(
        (resource) =>
          `### ${resource.title}\n- 来源：${resource.source}\n- 分类：${resource.category}\n- 标签：${resource.tags.join('、')}\n- 摘要：${resource.summary}\n- 相关性：${resource.relevance}`,
      )
      .join('\n\n');

    return [
      '# 资源整理报告',
      '',
      '## 任务',
      params.request.task,
      '',
      '## 输入',
      `- 目录：${params.request.directories.length > 0 ? params.request.directories.join('、') : '无'}`,
      `- URL：${params.request.urls.length > 0 ? params.request.urls.join('、') : '无'}`,
      `- 模型：${params.model}`,
      '',
      '## 执行计划',
      planLines || '无',
      '',
      '## 核心洞察',
      insightLines || '- 无',
      '',
      '## 聚类视角',
      clusterLines || '- 无',
      '',
      '## 资源摘要',
      resourceLines || '无',
      '',
      '## 最终整理结果',
      params.finalAnswer,
      '',
      '## 运行时间',
      `- 开始：${params.startedAt}`,
      `- 结束：${params.completedAt}`,
      '',
    ].join('\n');
  }
}
