/**
 * AI 网关执行结果（领域层值对象）
 *
 * 当 Java Core 通过 HTTP 调用 Node AI Gateway 的 /api/internal/agent/execute 接口后，
 * Node 端会返回一个 JSON 响应。本 record 就是这个 JSON 响应在 Java 侧的映射对象，
 * 包含了 AI 编排的所有产出：执行计划、资源摘要、记忆、最终回答、过程事件等。
 */
package com.agentserver.server.modules.agent.domain;

import java.util.List;

/**
 * AgentExecutionGatewayResult —— AI 网关返回的执行结果
 *
 * @param model       AI 实际使用的模型名称（如 "gpt-4o"）
 * @param plan        AI 生成的执行计划，每一步是一个 AgentPlanStep
 * @param resources   AI 收集并整理的资源摘要列表
 * @param memory      AI 在执行过程中积累的记忆（关键洞察 + 聚类分析）
 * @param finalAnswer AI 最终输出的整理结果文本
 * @param startedAt   AI 执行开始时间（ISO 格式字符串，由 Node 端提供）
 * @param completedAt AI 执行完成时间（ISO 格式字符串，由 Node 端提供）
 * @param events      AI 执行过程中产生的事件列表（用于回放实时进度）
 */
public record AgentExecutionGatewayResult(
    String model,
    List<AgentPlanStep> plan,
    List<ResourceSummary> resources,
    AgentMemory memory,
    String finalAnswer,
    String startedAt,
    String completedAt,
    List<AgentExecutionEvent> events
) {
}
