/**
 * Agent 记忆聚类（领域层值对象）
 *
 * 在 Agent 记忆中，"聚类"是指将来自不同资源的相关信息按主题分组。
 * 例如，多个网页都提到了"性能优化"这个话题，AI 会把它们聚合为一个 cluster，
 * 并给出一个总结性的要点（takeaway）。这有助于用户从多维度理解分析结果。
 */
package com.agentserver.server.modules.agent.domain;

import java.util.List;

/**
 * AgentMemoryCluster —— 记忆聚类中的一个分组
 *
 * @param name      聚类的名称/主题（如"技术架构"、"安全风险"等）
 * @param takeaway  该聚类的核心要点总结
 * @param sourceIds 该聚类关联的资源 ID 列表，对应 ResourceSummary 的 resourceId，
 *                  用于追溯这些总结来自哪些原始资源
 */
public record AgentMemoryCluster(
    String name,
    String takeaway,
    List<String> sourceIds
) {
}
