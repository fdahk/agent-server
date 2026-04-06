/**
 * Agent 运行异步处理器（application 层）
 *
 * 本类的唯一职责是将 Agent 任务的执行放到异步线程中运行。
 *
 * 【为什么需要异步？】
 * 当用户通过 API 创建一个 Agent 运行时，HTTP 请求需要立即返回 runId 给前端。
 * 但 AI 任务的执行（调用 Node AI Gateway）可能需要数十秒甚至数分钟。
 * 如果在 HTTP 请求线程中同步执行，用户会一直等待，体验极差。
 * 因此，通过 @Async 注解将执行逻辑放到独立的线程中异步运行，
 * HTTP 请求可以立即返回，用户通过 SSE 流获取实时进度。
 */
package com.agentserver.server.modules.agent.application;

import com.agentserver.server.modules.agent.interfaces.http.dto.RunCreationResult;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * AgentRunAsyncProcessor —— 异步任务处理器
 *
 * 【设计思路】本类是一个薄薄的"异步代理"——它本身没有业务逻辑，
 * 只是在方法上加了 @Async 注解来实现异步调用，实际工作委托给 AgentExecutionApplicationService。
 * 之所以需要一个独立的类，是因为 Spring 的 @Async 通过代理机制实现，
 * 同一个类内部的方法互相调用不会触发异步代理。
 */
@Service
public class AgentRunAsyncProcessor {

    /** 实际执行任务的服务 */
    private final AgentExecutionApplicationService agentExecutionApplicationService;

    /**
     * 构造方法 —— 通过 Spring 依赖注入获取执行服务。
     */
    public AgentRunAsyncProcessor(AgentExecutionApplicationService agentExecutionApplicationService) {
        this.agentExecutionApplicationService = agentExecutionApplicationService;
    }

    /**
     * 异步执行 Agent 任务。
     *
     * @Async 是 Spring 提供的注解，标记在方法上后，
     * 当外部调用这个方法时，Spring 不会在当前线程中执行它，
     * 而是将它提交到一个线程池中异步运行。调用方会立即返回，不会阻塞等待。
     *
     * 要让 @Async 生效，需要在 Spring Boot 启动类上添加 @EnableAsync 注解。
     *
     * @param request 包含 runId、task 等信息的创建结果
     */
    @Async
    public void execute(RunCreationResult request) {
        agentExecutionApplicationService.execute(request);
    }
}
