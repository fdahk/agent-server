/**
 * Agent 执行事件（领域层值对象）
 *
 * Node AI Gateway 在执行 AI 任务的过程中，会产生一系列事件（如"开始分析"、"资源发现"、
 * "步骤完成"等）。这些事件会被收集在执行结果中，Java Core 收到后会逐个"回放"到 SSE 流
 * 和数据库中，使前端能实时显示任务进度。
 */
package com.agentserver.server.modules.agent.domain;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * AgentExecutionEvent —— 单个执行事件
 *
 * @param type    事件类型标识（如 "resource_found"、"step_started" 等），
 *                用于前端区分不同类型的进度更新
 * @param payload 事件的详细数据，使用 JsonNode 表示任意结构的 JSON。
 *                JsonNode 是 Jackson 库中的类，代表一个通用的 JSON 节点，
 *                可以是对象、数组、字符串、数字等任意 JSON 类型，适合存储结构不固定的数据。
 */
public record AgentExecutionEvent(
    String type,
    JsonNode payload
) {
}
