/**
 * Agent 执行计划步骤（领域层值对象）
 *
 * AI 在执行任务时会先生成一个执行计划，将大任务拆分为若干小步骤。
 * 每个步骤有标题、详情和当前状态。前端可以据此展示任务进度条和步骤列表。
 */
package com.agentserver.server.modules.agent.domain;

/**
 * AgentPlanStep —— 执行计划中的单个步骤
 *
 * @param id     步骤的唯一标识
 * @param title  步骤的标题（简短描述，如"收集网页资源"）
 * @param detail 步骤的详细描述（如"从给定 URL 抓取并解析网页内容"）
 * @param status 步骤的当前状态（如 "pending"、"running"、"done"）
 */
public record AgentPlanStep(
    String id,
    String title,
    String detail,
    String status
) {
    /**
     * 创建一个状态被更新的新步骤对象。
     *
     * 由于 record 是不可变的，不能直接修改 status 字段，
     * 所以提供了这个 "with" 风格的方法：保留原有的 id/title/detail，
     * 只用新的 status 值创建并返回一个全新的 AgentPlanStep 实例。
     * 这种模式在函数式编程中很常见，被称为"不可变更新"。
     *
     * @param nextStatus 新的步骤状态
     * @return 一个包含新状态的全新 AgentPlanStep 对象
     */
    public AgentPlanStep withStatus(String nextStatus) {
        return new AgentPlanStep(id, title, detail, nextStatus);
    }
}
