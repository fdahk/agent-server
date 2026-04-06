/**
 * 远程 Node AI 网关实现（infrastructure 层）
 *
 * 这是 AgentAiGateway 接口的具体实现类，负责通过 HTTP 请求与 Node AI Gateway 通信。
 *
 * 【混合架构中的定位】
 * Java Core 本身不包含 AI 编排逻辑，而是将 AI 相关的工作委托给独立的 Node.js 服务。
 * 本类是两者之间的"桥梁"——它将 Java 的请求参数封装为 JSON，发送 HTTP POST 请求到
 * Node AI Gateway 的 /api/internal/agent/execute 接口，然后将响应 JSON 反序列化为
 * Java 领域对象返回给上层使用。
 *
 * 【DDD 视角】
 * 在 DDD 分层架构中，infrastructure 层负责提供技术实现细节（如 HTTP 调用、数据库访问等）。
 * 本类实现了 domain 层定义的 AgentAiGateway 接口，体现了"依赖倒置原则"——
 * 上层（domain）定义接口，下层（infrastructure）提供实现。
 */
package com.agentserver.server.modules.agent.infrastructure.ai;

import com.agentserver.server.config.AiGatewayProperties;
import com.agentserver.server.modules.agent.domain.AgentExecutionGatewayResult;
import com.agentserver.server.modules.agent.domain.gateway.AgentAiGateway;
import com.agentserver.server.shared.http.HttpTextResponse;
import com.agentserver.server.shared.http.JavaHttpClient;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * RemoteNodeAgentAiGateway —— 远程 Node AI 网关的实现
 *
 * "implements AgentAiGateway" 表示本类实现了 AgentAiGateway 接口，
 * 必须提供接口中所有方法的具体实现。@Service 注解让 Spring 自动创建并管理此实例。
 * 当其他类通过构造方法依赖 AgentAiGateway 接口时，Spring 会自动将此实现类注入进去。
 */
@Service
public class RemoteNodeAgentAiGateway implements AgentAiGateway {

    /**
     * AI 网关的配置属性（如 baseUrl、apiKey、defaultModel、timeoutMs 等）。
     * 这些配置通常在 application.yml 中定义，Spring 通过 @ConfigurationProperties
     * 自动映射到这个 Properties 对象中。
     */
    private final AiGatewayProperties aiGatewayProperties;

    /** 封装好的 HTTP 客户端工具，用于发送 HTTP 请求 */
    private final JavaHttpClient httpClient;

    /** Jackson ObjectMapper：JSON 序列化与反序列化 */
    private final ObjectMapper objectMapper;

    /**
     * 构造方法 —— 通过 Spring 依赖注入获取配置和工具。
     */
    public RemoteNodeAgentAiGateway(
        AiGatewayProperties aiGatewayProperties,
        JavaHttpClient httpClient,
        ObjectMapper objectMapper
    ) {
        this.aiGatewayProperties = aiGatewayProperties;
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    /**
     * 解析用户请求的模型名称。
     *
     * @Override 注解表示这个方法是从接口/父类继承来的，必须与接口中的签名一致。
     * 如果方法签名写错了，编译器会报错，起到安全检查的作用。
     *
     * @param requestedModel 用户指定的模型名（可能为 null 或空）
     * @return 如果用户未指定，返回配置文件中的默认模型；否则返回清洗后的用户指定模型
     */
    @Override
    public String resolveModel(String requestedModel) {
        return requestedModel == null || requestedModel.isBlank()
            ? aiGatewayProperties.defaultModel()
            : requestedModel.trim();
    }

    /**
     * 调用 Node AI Gateway 执行 AI 任务。
     *
     * 将请求参数封装为 ExecuteRequest 对象，POST 到 Node 端的 /api/internal/agent/execute，
     * 然后将响应 JSON 反序列化为 AgentExecutionGatewayResult 返回。
     *
     * @param runId       运行 ID
     * @param task        任务描述
     * @param directories 输入目录列表
     * @param urls        输入 URL 列表
     * @param model       要使用的 AI 模型
     * @return AI 执行的完整结果
     */
    @Override
    public AgentExecutionGatewayResult executeTask(
        String runId,
        String task,
        List<String> directories,
        List<String> urls,
        String model
    ) {
        return post(
            "/api/internal/agent/execute",
            new ExecuteRequest(runId, task, directories, urls, model),
            new TypeReference<AgentExecutionGatewayResult>() {}
        );
    }

    /**
     * 通用的 HTTP POST 方法：发送 JSON 请求并解析 JSON 响应。
     *
     * TypeReference<T> 是 Jackson 的类，用于在运行时保留泛型类型信息，
     * 因为 Java 的泛型在编译后会被"擦除"（type erasure），TypeReference 能帮助 Jackson
     * 知道应该将 JSON 反序列化成什么具体类型。
     *
     * @param path          请求路径（会拼接在 baseUrl 后面）
     * @param body          请求体对象（会被序列化为 JSON）
     * @param typeReference 响应的目标类型引用
     * @return 反序列化后的响应对象
     */
    private <T> T post(String path, Object body, TypeReference<T> typeReference) {
        HttpTextResponse response = httpClient.postJson(
            aiGatewayProperties.baseUrl() + path,
            body,
            Duration.ofMillis(aiGatewayProperties.timeoutMs()),
            buildHeaders()
        );
        if (!response.ok()) {
            throw new IllegalStateException("Node AI Gateway 请求失败，状态码 " + response.status());
        }
        try {
            return objectMapper.readValue(response.body(), typeReference);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("无法解析 Node AI Gateway 响应", exception);
        }
    }

    /**
     * 构建 HTTP 请求头。
     * 设置 Content-Type 为 JSON，如果配置了 API Key 则添加内部认证头 X-Internal-Token。
     */
    private Map<String, String> buildHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        if (aiGatewayProperties.apiKey() != null && !aiGatewayProperties.apiKey().isBlank()) {
            headers.put("X-Internal-Token", aiGatewayProperties.apiKey());
        }
        return headers;
    }

    /**
     * 发送给 Node AI Gateway 的请求体数据结构。
     *
     * 这是一个嵌套在类内部的 private record。
     * "private" 表示只有 RemoteNodeAgentAiGateway 类内部可以使用它，外部不可见。
     * 它仅用于封装 HTTP 请求体的参数，是一种内聚的设计方式。
     */
    private record ExecuteRequest(
        String runId,
        String task,
        List<String> directories,
        List<String> urls,
        String model
    ) {
    }
}
