/**
 * Agent 记忆（领域层值对象）
 *
 * AI 在执行任务过程中会对分析结果进行总结和归纳，形成"记忆"。
 * 记忆包含两部分：关键洞察（keyInsights）是一组精炼的结论性文字；
 * 聚类（clusters）则是将相关信息按主题分组归纳后的结构化数据。
 * 这些信息最终会出现在生成的报告文件中，帮助用户快速理解任务结果。
 */
package com.agentserver.server.modules.agent.domain;

import java.util.List;

/**
 * AgentMemory —— Agent 执行记忆
 *
 * @param keyInsights 关键洞察列表，每条是一句简短的总结性文字（如"该项目使用 React 框架"）
 * @param clusters    聚类视角列表，将多条信息按主题分组归纳
 */
public record AgentMemory(
    List<String> keyInsights,
    List<AgentMemoryCluster> clusters
) {
}
