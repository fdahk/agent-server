/**
 * 运行事件响应 DTO（interfaces 层）
 *
 * 本 record 是 SSE 推送和 API 查询中事件数据的统一格式。
 * 无论是通过 SSE 实时推送，还是通过 GET /api/agent/runs/{runId} 查询历史事件，
 * 每个事件都用这个格式返回给前端。
 */
package com.agentserver.server.modules.agent.interfaces.http.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * RunEventResponse —— 单个运行事件的响应格式
 *
 * @param type    事件类型（如 "run_queued"、"run_started"、"run_completed" 等），
 *                在 SSE 中还会作为 event name 发送，前端可通过 addEventListener(type, ...) 监听
 * @param runId   所属运行的唯一标识
 * @param payload 事件的详细数据（任意结构的 JSON）。
 *                使用 JsonNode 因为不同事件类型的 payload 结构不同，无法定义统一的强类型。
 */
public record RunEventResponse(
    String type,
    String runId,
    JsonNode payload
) {
}
