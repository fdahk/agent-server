/**
 * AI 网关接口（领域层网关）
 *
 * 在整体架构中，Java Core 不直接调用大语言模型（LLM），而是通过一个远程的 Node AI Gateway
 * 服务来完成 AI 编排。本接口定义了 Java Core 与 AI 执行层之间的通信契约。
 *
 * 在 DDD（领域驱动设计）中，"Gateway" 属于领域层定义的端口（Port），具体实现放在
 * infrastructure 层。这样做的好处是：领域层只关心"需要什么能力"，不关心"怎么实现"，
 * 使得将来可以轻松切换底层实现（比如从 HTTP 调用换成 gRPC）。
 */
package com.agentserver.server.modules.agent.domain.gateway;

import com.agentserver.server.modules.agent.domain.AgentExecutionGatewayResult;
import java.util.List;

/**
 * AgentAiGateway —— AI 执行网关接口
 *
 * interface（接口）定义了一组方法签名，但不包含具体实现。
 * 任何类只要用 "implements AgentAiGateway" 就必须实现这里声明的所有方法。
 * 接口是 Java 中实现"面向抽象编程"的核心机制。
 *
 * 【业务含义】该接口描述了 Java Core 对 AI 执行能力的需求：
 * - 解析/确定使用哪个 AI 模型
 * - 向 AI Gateway 发送任务并获取执行结果
 */
public interface AgentAiGateway {

    /**
     * 解析用户请求的模型名称，返回最终要使用的模型标识。
     * 如果用户未指定模型（传入 null 或空字符串），则返回系统默认模型。
     *
     * @param requestedModel 用户请求的模型名称（可能为 null）
     * @return 最终确定要使用的模型名称
     */
    String resolveModel(String requestedModel);

    /**
     * 向远程 Node AI Gateway 发送执行任务的请求，并等待返回完整的执行结果。
     *
     * 【业务流程】Java Core 把用户的任务描述、输入目录/URL 等信息打包发送给
     * Node AI Gateway，后者调用大语言模型完成分析和编排，最终将计划、资源摘要、
     * 记忆、最终回答等信息一并返回。
     *
     * @param runId       本次运行的唯一标识，格式如 "run-abc123..."
     * @param task        用户提交的任务描述文本
     * @param directories 用户指定的输入目录列表（本地文件路径）
     * @param urls        用户指定的输入 URL 列表（网络资源地址）
     * @param model       经 resolveModel 确定后的 AI 模型名称
     * @return AgentExecutionGatewayResult 包含 AI 执行的完整结果
     */
    AgentExecutionGatewayResult executeTask(
        String runId,
        String task,
        List<String> directories,
        List<String> urls,
        String model
    );
}
