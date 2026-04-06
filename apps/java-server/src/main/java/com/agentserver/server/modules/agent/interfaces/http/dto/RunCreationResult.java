/**
 * 运行创建结果（内部传递用 DTO）
 *
 * 本 record 在 createRun 完成后生成，用于在应用层内部传递运行创建后的关键信息。
 * 它与 CreateRunResponse（返回给前端的响应）不同——前者包含了后续执行所需的全部参数
 * （task、directories、urls、model），而后者只返回 runId 给前端。
 *
 * 【设计思路】分离内部传递对象和外部 API 响应对象，避免将过多内部细节暴露给前端。
 */
package com.agentserver.server.modules.agent.interfaces.http.dto;

import java.util.List;

/**
 * RunCreationResult —— 运行创建后的内部传递对象
 *
 * @param runId       新创建的运行唯一标识
 * @param task        用户提交的任务描述
 * @param directories 清洗后的输入目录列表
 * @param urls        清洗后的输入 URL 列表
 * @param model       用户指定的模型名（可能为 null，后续由 resolveModel 确定）
 */
public record RunCreationResult(
    String runId,
    String task,
    List<String> directories,
    List<String> urls,
    String model
) {
}
