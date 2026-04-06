/**
 * Agent 运行最终结果（领域层值对象）
 *
 * 当一次 Agent 运行完成后，系统会将所有信息聚合成一个完整的结果对象。
 * 这个对象包含了任务描述、状态、输入来源、执行计划、资源摘要、记忆、最终回答、
 * 输出产物等全部信息。它会作为 "run_completed" 事件的 payload 通过 SSE 推送给前端，
 * 也会被序列化为 JSON 存入数据库的事件记录中。
 */
package com.agentserver.server.modules.agent.domain;

import java.util.List;

/**
 * AgentRunResult —— 一次 Agent 运行的完整结果
 *
 * @param runId       运行的唯一标识（如 "run-abc123..."）
 * @param task        用户提交的任务描述
 * @param status      运行最终状态（如 "completed"）
 * @param model       实际使用的 AI 模型名称
 * @param input       输入来源信息（包含目录列表和 URL 列表）
 * @param plan        AI 生成的执行计划步骤列表
 * @param resources   AI 收集的资源摘要列表
 * @param memory      AI 执行过程中积累的记忆
 * @param finalAnswer AI 最终输出的整理结果文本
 * @param artifacts   运行产生的输出文件（报告文件等）
 * @param startedAt   运行开始时间
 * @param completedAt 运行完成时间
 */
public record AgentRunResult(
    String runId,
    String task,
    String status,
    String model,
    AgentInputSource input,
    List<AgentPlanStep> plan,
    List<ResourceSummary> resources,
    AgentMemory memory,
    String finalAnswer,
    List<AgentArtifact> artifacts,
    String startedAt,
    String completedAt
) {
}
