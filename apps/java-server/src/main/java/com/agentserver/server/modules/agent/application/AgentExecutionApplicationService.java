/**
 * Agent 执行编排应用服务（application 层）
 *
 * 这个服务是 Agent 运行中"真正干活"的部分——它协调 AI 网关调用、事件回放、报告生成
 * 和状态更新，完成一次完整的 AI 任务执行流程。
 *
 * 【执行流程概览】
 * 1. 解析模型 → 2. 标记状态为 RUNNING → 3. 调用 Node AI Gateway 执行任务
 * → 4. 回放 AI 过程事件 → 5. 生成报告文件 → 6. 推送产物事件
 * → 7. 组装最终结果 → 8. 标记状态为 COMPLETED（或 FAILED）
 */
package com.agentserver.server.modules.agent.application;

import com.agentserver.server.modules.agent.domain.AgentArtifact;
import com.agentserver.server.modules.agent.domain.AgentExecutionEvent;
import com.agentserver.server.modules.agent.domain.AgentExecutionGatewayResult;
import com.agentserver.server.modules.agent.domain.AgentInputSource;
import com.agentserver.server.modules.agent.domain.AgentMemory;
import com.agentserver.server.modules.agent.domain.AgentPlanStep;
import com.agentserver.server.modules.agent.domain.AgentRunResult;
import com.agentserver.server.modules.agent.domain.ResourceSummary;
import com.agentserver.server.modules.agent.domain.gateway.AgentAiGateway;
import com.agentserver.server.modules.agent.infrastructure.report.AgentReportService;
import com.agentserver.server.modules.agent.interfaces.http.dto.RunCreationResult;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * AgentExecutionApplicationService —— Agent 任务执行编排服务
 *
 * @Service 注解将此类注册为 Spring 容器管理的服务 Bean。
 *
 * 【设计思路】本类将"任务执行"这一复杂流程从 AgentRunApplicationService 中独立出来，
 * 职责单一：只负责"执行"，不负责"创建/查询/流式推送"等运行管理操作。
 */
@Service
public class AgentExecutionApplicationService {

    /** 运行管理服务：用于更新状态和追加事件 */
    private final AgentRunApplicationService agentRunApplicationService;

    /** AI 网关接口：用于调用远程 Node AI Gateway 执行任务 */
    private final AgentAiGateway agentAiGateway;

    /** 报告生成服务：用于将执行结果写成文件（Markdown 报告 + JSON 数据） */
    private final AgentReportService agentReportService;

    /**
     * 构造方法 —— 通过 Spring 依赖注入获取所有协作对象。
     */
    public AgentExecutionApplicationService(
        AgentRunApplicationService agentRunApplicationService,
        AgentAiGateway agentAiGateway,
        AgentReportService agentReportService
    ) {
        this.agentRunApplicationService = agentRunApplicationService;
        this.agentAiGateway = agentAiGateway;
        this.agentReportService = agentReportService;
    }

    /**
     * 执行一次 Agent 任务。这是核心的业务编排方法。
     *
     * 【完整业务流程】
     * 1. 通过 AI 网关解析出要使用的模型名称
     * 2. 将运行状态更新为 RUNNING，追加 "run_started" 事件
     * 3. 调用 Node AI Gateway 执行任务（这是一个同步的 HTTP 调用，可能耗时较长）
     * 4. 将 AI 执行过程中产生的事件逐条回放（写入数据库 + 推送 SSE）
     * 5. 调用报告服务将结果写成文件（Markdown + JSON）
     * 6. 为每个生成的文件追加 "file_written" 事件
     * 7. 组装完整的运行结果对象
     * 8. 将运行状态更新为 COMPLETED，追加 "run_completed" 事件
     *
     * 如果执行过程中出现任何异常，会被 catch 捕获，状态更新为 FAILED，
     * 并追加 "run_failed" 事件。
     *
     * @param request 包含 runId、task、directories、urls、model 的创建结果
     */
    public void execute(RunCreationResult request) {
        String model = agentAiGateway.resolveModel(request.model());
        agentRunApplicationService.markRunning(request.runId(), "任务已开始执行");
        agentRunApplicationService.appendEvent(request.runId(), "run_started", Map.of(
            "task", request.task(),
            "model", model,
            "input", new AgentInputSource(request.directories(), request.urls())
        ));

        try {
            AgentExecutionGatewayResult executionResult = agentAiGateway.executeTask(
                request.runId(),
                request.task(),
                request.directories(),
                request.urls(),
                model
            );

            replayEvents(request.runId(), executionResult.events());

            List<AgentArtifact> artifacts = agentReportService.writeArtifacts(
                request,
                executionResult.model(),
                executionResult.plan(),
                executionResult.memory(),
                executionResult.resources(),
                executionResult.finalAnswer(),
                executionResult.startedAt(),
                executionResult.completedAt()
            );
            for (AgentArtifact artifact : artifacts) {
                agentRunApplicationService.appendEvent(request.runId(), "file_written", artifact);
            }

            AgentRunResult result = new AgentRunResult(
                request.runId(),
                request.task(),
                "completed",
                executionResult.model(),
                new AgentInputSource(request.directories(), request.urls()),
                executionResult.plan(),
                executionResult.resources(),
                executionResult.memory(),
                executionResult.finalAnswer(),
                artifacts,
                executionResult.startedAt(),
                executionResult.completedAt()
            );

            agentRunApplicationService.markCompleted(request.runId(), "任务执行完成");
            agentRunApplicationService.appendEvent(request.runId(), "run_completed", result);
        } catch (Exception exception) {
            agentRunApplicationService.markFailed(request.runId(), exception.getMessage());
            agentRunApplicationService.appendEvent(request.runId(), "run_failed", Map.of(
                "message", exception.getMessage() == null ? "Agent 运行失败" : exception.getMessage()
            ));
        }
    }

    /**
     * 将 AI 网关返回的过程事件逐条回放到系统中。
     *
     * 【业务含义】Node AI Gateway 在执行 AI 任务时会产生多个中间事件（如"发现资源"、
     * "步骤完成"等），这些事件被收集后随结果一起返回。本方法将它们逐条写入数据库并
     * 通过 SSE 推送给前端，让前端能看到 AI 执行的详细过程。
     *
     * @param runId  运行唯一标识
     * @param events AI 执行过程中产生的事件列表
     */
    private void replayEvents(String runId, List<AgentExecutionEvent> events) {
        for (AgentExecutionEvent event : events) {
            agentRunApplicationService.appendEvent(runId, event.type(), event.payload());
        }
    }
}
