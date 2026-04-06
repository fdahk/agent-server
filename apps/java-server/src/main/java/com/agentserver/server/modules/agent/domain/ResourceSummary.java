/**
 * 资源摘要（领域层值对象）
 *
 * AI 在执行任务过程中会收集和分析多个资源（文件、网页等）。
 * 每个资源被分析后会生成一份摘要，包含标题、来源、分类、标签、内容概要和相关性评估。
 * 这些摘要既用于报告生成，也会以 JSON 形式单独保存为 sources.json 文件。
 */
package com.agentserver.server.modules.agent.domain;

import java.util.List;

/**
 * ResourceSummary —— 单个资源的摘要信息
 *
 * @param resourceId 资源的唯一标识（由 AI Gateway 生成），可被 AgentMemoryCluster 的 sourceIds 引用
 * @param title      资源标题（如网页标题或文件名）
 * @param source     资源来源（如 URL 地址或文件路径）
 * @param kind       资源种类（如 "webpage"、"file"、"directory" 等）
 * @param category   资源分类（如 "技术文档"、"新闻资讯"等，由 AI 自动归类）
 * @param tags       资源标签列表（如 ["React", "前端", "性能"]），便于检索和分组
 * @param summary    AI 对该资源内容的摘要总结
 * @param relevance  与用户任务的相关性评估（如 "high"、"medium"、"low"）
 */
public record ResourceSummary(
    String resourceId,
    String title,
    String source,
    String kind,
    String category,
    List<String> tags,
    String summary,
    String relevance
) {
}
