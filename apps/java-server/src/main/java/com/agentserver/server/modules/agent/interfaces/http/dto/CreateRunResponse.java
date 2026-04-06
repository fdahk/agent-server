/**
 * 创建 Agent 运行的响应 DTO（interfaces 层）
 *
 * 当 POST /api/agent/runs 请求成功后，服务端返回的 JSON 响应体。
 * 只包含一个 runId，前端拿到这个 ID 后可以：
 * - 通过 GET /api/agent/runs/{runId} 查询运行状态
 * - 通过 GET /api/agent/runs/{runId}/stream 建立 SSE 连接获取实时进度
 */
package com.agentserver.server.modules.agent.interfaces.http.dto;

/**
 * CreateRunResponse —— 创建运行的响应体
 *
 * record 类型。Jackson 在序列化时会自动将其转为 JSON，
 * 例如 new CreateRunResponse("run-abc123") 会被序列化为 {"runId": "run-abc123"}。
 *
 * @param runId 新创建的运行唯一标识
 */
public record CreateRunResponse(String runId) {
}
