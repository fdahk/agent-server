/**
 * Agent 的所有类型定义
 *
 * 集中定义类型的好处：
 *   1. 所有文件引用同一份类型，保证数据结构一致
 *   2. 修改类型时只需改一处，TypeScript 编译器会自动检查所有引用方
 *   3. 这些类型同时也是"Java Core ↔ Node AI Gateway"的接口契约文档
 */

export type AgentPlanStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

/**
 * AgentPlanStep —— 计划中的单个执行步骤
 *
 * Agent 在开始执行前会先生成一个计划，每个计划包含多个步骤。
 * 步骤在执行过程中会经历 pending → running → completed/failed 的状态流转。
 */
export type AgentPlanStep = {
  /** 步骤唯一标识，如 'scan_local_directory'、'summarize_resources' 等 */
  id: string;
  /** 步骤中文标题，如 "扫描指定目录" */
  title: string;
  /** 步骤详细描述，解释这一步具体做什么 */
  detail: string;
  /** 当前执行状态 */
  status: AgentPlanStepStatus;
};

/**
 * CollectedResourceKind —— 采集到的资源类型
 *
 * - 'local_file'：来自本地文件系统的文件
 * - 'web_page'：来自网页抓取的内容
 */
export type CollectedResourceKind = 'local_file' | 'web_page';

/**
 * CollectedResource —— 采集到的原始资源（AI 处理前的原始数据）
 *
 * 这是资源采集阶段的输出格式，包含文件/网页的原始内容和元数据。
 */
export type CollectedResource = {
  /** 资源唯一标识（UUID v4） */
  id: string;
  /** 资源类型：本地文件 or 网页 */
  kind: CollectedResourceKind;
  /** 资源标题（文件名或网页标题） */
  title: string;
  /** 资源来源（文件绝对路径或网页 URL） */
  source: string;
  /** 完整内容文本（可能被截断到 maxCharsPerResource） */
  content: string;
  /** 内容片段/预览（前 180 个字符），用于事件推送时的快速展示 */
  snippet: string;
  /**
   * 元数据（键值对）：存储资源的附加信息
   *
   * Record<string, string | number | boolean | null> 表示：
   * 键为 string，值可以是 string/number/boolean/null 之一。
   *
   * 对于本地文件，通常包含 path、extension、size。
   * 对于网页，通常包含 url、hostname、description。
   */
  metadata: Record<string, string | number | boolean | null>;
};

/**
 * ResourceSummary —— AI 生成的资源摘要（AI 处理后的结构化数据）
 *
 * 每个 CollectedResource 经过 AI 摘要后生成一个 ResourceSummary。
 * 包含分类、标签、摘要和与任务的相关性分析。
 */
export type ResourceSummary = {
  /** 关联的原始资源 ID */
  resourceId: string;
  /** 资源标题 */
  title: string;
  /** 资源来源 */
  source: string;
  /** 资源类型 */
  kind: CollectedResourceKind;
  /** AI 分配的分类，如 "技术文档"、"网页资料" 等 */
  category: string;
  /** AI 生成的中文标签数组，长度 2-5 */
  tags: string[];
  /** AI 生成的中文摘要 */
  summary: string;
  /** AI 对该资源与用户任务相关性的分析 */
  relevance: string;
};

/**
 * AgentMemory —— Agent 的全局记忆（所有资源的聚合分析）
 *
 * 在逐条摘要之后，AI 会将所有摘要聚合为"全局记忆"：
 * 提取跨资源的共同主题（clusters）和关键洞察（keyInsights）。
 */
export type AgentMemory = {
  /** 关键洞察列表：3-6 条中文短句，概括所有资源的核心要点 */
  keyInsights: string[];
  /**
   * 主题聚类列表：将相关资源按主题分组
   *
   * Array<{ ... }> 是 TypeScript 定义对象数组的方式，
   * 等价于先定义一个 type Cluster = { name; takeaway; sourceIds }
   * 然后写 Cluster[]。这里因为只在一处使用，所以内联定义。
   */
  clusters: Array<{
    /** 聚类/主题名称，如 "前端架构" */
    name: string;
    /** 该主题的核心结论 */
    takeaway: string;
    /** 属于该主题的资源 ID 列表 */
    sourceIds: string[];
  }>;
};

// --- Java Core 内部调用契约 ---

/**
 * InternalExecuteRequest —— Java Core → Node AI Gateway 的请求体格式
 *
 * 这是 Java Core 通过 POST /api/internal/agent/execute 发送的请求体类型。
 * 它定义了"Java Core 和 Node 之间的接口契约"。
 */
export type InternalExecuteRequest = {
  /** 运行标识，由 Java Core 生成，用于追踪整次执行 */
  runId: string;
  /** 用户的整理任务描述，如 "帮我整理这些 API 文档的要点" */
  task: string;
  /** 需要扫描的本地目录路径列表 */
  directories: string[];
  /** 需要抓取的网页 URL 列表 */
  urls: string[];
  /**
   * 可选的模型名称，不传则使用默认模型。
   * ? 表示该字段是可选的（Optional），即可以不存在或为 undefined。
   */
  model?: string;
};

/**
 * AgentExecutionEvent —— Agent 执行过程中产生的事件
 *
 * 【什么是可辨识联合类型（Discriminated Union）？】
 * 每个事件都有一个 type 字段作为"标签/判别符"（discriminant），
 * TypeScript 可以根据 type 的值自动推断 payload 的具体类型。
 * 例如：
 *   if (event.type === 'plan_ready') {
 *     event.payload.plan  // TypeScript 自动知道 payload 有 plan 字段
 *   }
 *
 * 这些事件会被收集到 AgentExecutionResult.events 中返回给 Java Core，
 * Java Core 可据此向前端推送实时进度。
 */
export type AgentExecutionEvent =
  /** 计划生成完成 */
  | { type: 'plan_ready'; payload: { plan: AgentPlanStep[] } }
  /** 某个步骤开始执行 */
  | {
      type: 'step_started';
      payload: { stepId: string; title: string; detail: string };
    }
  /**
   * 单个资源采集完成
   * Omit<CollectedResource, 'content'> 表示去除 content 字段的 CollectedResource，
   * 因为事件推送不需要携带完整内容，节省传输量。
   */
  | {
      type: 'resource_collected';
      payload: { resource: Omit<CollectedResource, 'content'> };
    }
  /** 单个资源摘要完成 */
  | { type: 'resource_summarized'; payload: ResourceSummary }
  /** 全局记忆更新完成 */
  | { type: 'memory_updated'; payload: AgentMemory };

/**
 * AgentExecutionResult —— 一次完整 AI 执行任务的最终返回结果
 *
 * 这是 Node AI Gateway 返回给 Java Core 的完整响应体。
 * Java Core 会从中提取 finalAnswer（最终报告）、events（事件流）等信息，
 * 分别存储到数据库并通过 SSE 推送给前端。
 */
export type AgentExecutionResult = {
  /** 实际使用的模型名称 */
  model: string;
  /** 执行计划（所有步骤及其最终状态） */
  plan: AgentPlanStep[];
  /** 所有资源的 AI 摘要列表 */
  resources: ResourceSummary[];
  /** 全局记忆（主题聚类和关键洞察） */
  memory: AgentMemory;
  /** AI 生成的最终 Markdown 报告 */
  finalAnswer: string;
  /** 任务开始时间（ISO 8601 格式） */
  startedAt: string;
  /** 任务完成时间（ISO 8601 格式） */
  completedAt: string;
  /** 执行过程中产生的所有事件，按时间顺序排列 */
  events: AgentExecutionEvent[];
};
