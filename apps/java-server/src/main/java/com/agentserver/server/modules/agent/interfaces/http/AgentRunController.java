/**
 * Agent 运行 HTTP 控制器（interfaces 层）
 *
 * 这是 Agent 模块的 API 入口，负责接收前端发来的 HTTP 请求并返回响应。
 * 在 DDD 分层架构中，interfaces 层（接口层/适配层）是系统与外部世界交互的边界，
 * 它只负责"接收请求、调用应用服务、返回结果"，不包含业务逻辑。
 *
 * 本控制器提供三个 API：
 * - POST   /api/agent/runs          —— 创建一次新的 Agent 运行
 * - GET    /api/agent/runs/{runId}   —— 查询运行快照
 * - GET    /api/agent/runs/{runId}/stream —— 建立 SSE 实时推流连接
 */
package com.agentserver.server.modules.agent.interfaces.http;

import com.agentserver.server.modules.agent.application.AgentRunApplicationService;
import com.agentserver.server.modules.agent.application.AgentRunAsyncProcessor;
import com.agentserver.server.modules.agent.interfaces.http.dto.CreateRunRequest;
import com.agentserver.server.modules.agent.interfaces.http.dto.CreateRunResponse;
import com.agentserver.server.modules.agent.interfaces.http.dto.RunCreationResult;
import com.agentserver.server.modules.agent.interfaces.http.dto.RunSnapshotResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * AgentRunController —— Agent 运行的 REST API 控制器
 *
 * @RestController 是 Spring 的注解，等价于 @Controller + @ResponseBody。
 * 它告诉 Spring：这个类是一个 Web 控制器，其中每个方法的返回值会直接序列化为 JSON 返回给客户端
 * （而不是渲染为 HTML 页面）。
 *
 * @RequestMapping("/api/agent/runs") 为这个控制器设置统一的 URL 前缀，
 * 类中所有方法的路径都会在此基础上追加。例如 @GetMapping("/{runId}") 的完整路径
 * 就是 /api/agent/runs/{runId}。
 */
@RestController
@RequestMapping("/api/agent/runs")
public class AgentRunController {

    /** 运行管理应用服务：处理创建、查询、流式推送等操作 */
    private final AgentRunApplicationService agentRunApplicationService;

    /** 异步处理器：在后台线程中执行 AI 任务 */
    private final AgentRunAsyncProcessor agentRunAsyncProcessor;

    /**
     * 构造方法 —— 通过 Spring 依赖注入获取应用服务和异步处理器。
     */
    public AgentRunController(
        AgentRunApplicationService agentRunApplicationService,
        AgentRunAsyncProcessor agentRunAsyncProcessor
    ) {
        this.agentRunApplicationService = agentRunApplicationService;
        this.agentRunAsyncProcessor = agentRunAsyncProcessor;
    }

    /**
     * POST /api/agent/runs —— 创建一次新的 Agent 运行。
     *
     * 【业务流程】
     * 1. 从 Spring Security 的认证对象中提取当前用户名
     * 2. 调用应用服务创建运行记录（写入数据库，状态为 QUEUED）
     * 3. 触发异步处理器在后台线程执行 AI 任务
     * 4. 立即返回 runId 给前端（不等待 AI 执行完成）
     *
     * @PostMapping 表示这个方法处理 HTTP POST 请求。
     * @Valid 触发 Jakarta Bean Validation 验证，会检查 CreateRunRequest 中
     * @NotBlank 等注解定义的约束，如果验证不通过会自动返回 400 错误。
     * @RequestBody 表示请求体的 JSON 会被自动反序列化为 CreateRunRequest 对象。
     * Authentication 是 Spring Security 自动注入的当前认证信息。
     *
     * @param request        前端发送的请求体
     * @param authentication Spring Security 认证对象（包含当前登录用户信息）
     * @return 包含 runId 的响应
     */
    @PostMapping
    public CreateRunResponse createRun(
        @Valid @RequestBody CreateRunRequest request,
        Authentication authentication
    ) {
        String username = authentication == null ? null : authentication.getName();
        RunCreationResult result = agentRunApplicationService.createRun(username, request);
        agentRunAsyncProcessor.execute(result);
        return new CreateRunResponse(result.runId());
    }

    /**
     * GET /api/agent/runs/{runId} —— 查询指定运行的快照。
     *
     * 返回运行的当前状态、全部历史事件以及最终结果（如果已完成）。
     *
     * @GetMapping 表示处理 HTTP GET 请求。
     * @PathVariable 表示从 URL 路径中提取参数——例如请求 /api/agent/runs/run-abc123
     * 时，runId 的值就是 "run-abc123"。
     *
     * @param runId 运行唯一标识（从 URL 路径中提取）
     * @return 运行快照信息
     */
    @GetMapping("/{runId}")
    public RunSnapshotResponse getRunSnapshot(@PathVariable String runId) {
        return agentRunApplicationService.getRunSnapshot(runId);
    }

    /**
     * GET /api/agent/runs/{runId}/stream —— 建立 SSE 实时推流连接。
     *
     * 客户端连接后会先收到历史事件，之后新事件会实时推送。
     * 前端通常使用 EventSource API 来消费 SSE 流。
     *
     * 返回 SseEmitter 类型时，Spring 会自动将这个 HTTP 连接保持为长连接，
     * 以 SSE 协议格式持续向客户端发送数据，直到连接关闭。
     *
     * @param runId 运行唯一标识
     * @return SSE 推流连接实例
     * @throws IOException 如果建立连接或发送历史事件时出错
     */
    @GetMapping("/{runId}/stream")
    public SseEmitter stream(@PathVariable String runId) throws IOException {
        return agentRunApplicationService.stream(runId);
    }
}
