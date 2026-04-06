/**
 * 运行快照响应 DTO（interfaces 层）
 *
 * 当前端通过 GET /api/agent/runs/{runId} 查询某次运行时，返回此对象。
 * 它包含了运行的当前状态、全部历史事件和最终结果（如果已完成），
 * 相当于这次运行的"完整截面/快照"。
 *
 * 【使用场景】
 * 前端在 SSE 连接中断后可以通过此接口重新获取完整状态，
 * 不会遗漏任何事件或结果。
 */
package com.agentserver.server.modules.agent.interfaces.http.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;

/**
 * RunSnapshotResponse —— 运行快照响应
 *
 * @param id        运行的唯一标识（runId）
 * @param status    当前状态（"queued" / "running" / "completed" / "failed"）
 * @param createdAt 运行创建时间。
 *                  LocalDateTime 是 Java 8 引入的日期时间类，
 *                  表示不带时区的日期和时间（如 2026-04-05T14:30:00）。
 *                  Jackson 会自动将其序列化为 ISO 8601 格式的字符串。
 * @param events    该运行的全部历史事件列表（按时间顺序排列）
 * @param result    运行的最终结果（从 "run_completed" 事件的 payload 中提取）。
 *                  如果运行尚未完成，此字段为 null。
 */
public record RunSnapshotResponse(
    String id,
    String status,
    LocalDateTime createdAt,
    List<RunEventResponse> events,
    JsonNode result
) {
}
