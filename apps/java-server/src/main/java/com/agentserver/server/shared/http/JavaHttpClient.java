/**
 *
 * JavaHttpClient.java
 * 通用 HTTP 客户端——封装 Java 内置的 HttpClient，供业务层调用外部 API
 * 在本项目中，Java 后端需要向外部服务发起 HTTP 请求，典型场景包括：
 *   · 调用 AI 大模型的 REST API（发送 Prompt，接收生成结果）
 *   · 调用 Node.js Agent 执行节点
 *
 * 直接使用 Java 原生的 HttpClient 代码较为繁琐（要处理序列化、异常、请求头等），
 * 本类将这些通用逻辑封装为简洁的 getText() / postJson() 方法，
 * 业务层只需关心"请求什么 URL、传什么参数、拿到什么响应"。
 */
package com.agentserver.server.shared.http;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 通用 HTTP 客户端，封装了 GET 和 POST JSON 两种常用请求方式。
 *
 * 【注解说明】
 * @Component —— 告诉 Spring "请把这个类实例化并注册到 IoC 容器中"。
 *   注册后，其他类可以通过构造函数注入（或 @Autowired）来使用它。
 *   @Component 是最通用的注解，还有更具语义的变体：
 *   · @Service —— 标记业务逻辑层
 *   · @Repository —— 标记数据访问层
 *   · @Controller —— 标记控制器层
 *   它们本质上都是 @Component，只是名称不同方便分层辨认。
 */
@Component
public class JavaHttpClient {

    /**
     * Java 11 引入的内置 HTTP 客户端，用于发送 HTTP 请求。
     * 相比老旧的 HttpURLConnection，它支持异步、HTTP/2、更优雅的 API。
     */
    private final HttpClient httpClient;

    /**
     * Spring Boot 已自动配置了一个 ObjectMapper Bean，这里直接注入。
     */
    private final ObjectMapper objectMapper;

    /**
     * 构造函数——通过"构造函数注入"获取依赖。
     *
     * 【Spring 依赖注入说明】
     * 当一个类只有一个构造函数时，Spring 会自动将构造函数参数从 IoC 容器中查找并注入，
     * 不需要额外加 @Autowired 注解。这种方式叫做"构造函数注入"，
     * 是 Spring 官方推荐的最佳实践（比字段注入更安全、更便于测试）。
     *
     * @param objectMapper Spring 容器中自动配置的 JSON 处理器
     */
    public JavaHttpClient(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(30))
            .build();
    }

    /**
     * 发送 GET 请求并返回文本响应。
     *
     * @param url     请求的完整 URL
     * @param timeout 请求超时时间
     * @param headers 附加的 HTTP 请求头（如 Authorization）
     * @return 包含响应体、状态码、响应头等信息的 HttpTextResponse 对象
     */
    public HttpTextResponse getText(String url, Duration timeout, Map<String, String> headers) {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(timeout)
            .GET();
        applyHeaders(builder, headers);
        return send(builder.build(), url);
    }

    /**
     * 发送 POST 请求（JSON 格式的请求体）并返回文本响应。
     *
     * @param url     请求的完整 URL
     * @param body    请求体对象，会被 Jackson 自动序列化为 JSON 字符串
     * @param timeout 请求超时时间
     * @param headers 附加的 HTTP 请求头
     * @return 包含响应体、状态码、响应头等信息的 HttpTextResponse 对象
     */
    public HttpTextResponse postJson(String url, Object body, Duration timeout, Map<String, String> headers) {
        String rawJson = toJson(body);
        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(timeout)
            .POST(HttpRequest.BodyPublishers.ofString(rawJson));
        applyHeaders(builder, headers);
        return send(builder.build(), url);
    }

    /**
     * 实际发送 HTTP 请求并处理异常。
     *
     * 【异常处理说明】
     * · IOException：网络层异常（如连接超时、DNS 解析失败等）
     * · InterruptedException：线程被中断。按 Java 惯例，捕获后需重新设置中断标志
     *   （Thread.currentThread().interrupt()），以便调用方感知到中断事件。
     *
     * @param request 构建好的 HTTP 请求对象
     * @param url     请求 URL（仅用于封装到响应对象中，方便调试追踪）
     * @return HttpTextResponse 响应对象
     */
    private HttpTextResponse send(HttpRequest request, String url) {
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return new HttpTextResponse(response.body(), response.statusCode(), response.headers(), url);
        } catch (IOException exception) {
            throw new IllegalStateException("HTTP 请求失败: " + exception.getMessage(), exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("HTTP 请求被中断", exception);
        }
    }

    /**
     * 为请求添加通用 HTTP 头和自定义头。
     *
     * 每个请求都会自动附加：
     *   · Accept：告诉服务器可接受的响应格式
     *   · X-Request-Id：唯一请求标识，用于链路追踪和日志排查
     *
     * @param builder 请求构建器
     * @param headers 调用方传入的自定义请求头
     */
    private void applyHeaders(HttpRequest.Builder builder, Map<String, String> headers) {
        builder.header("Accept", "application/json, text/plain, */*");
        builder.header("X-Request-Id", UUID.randomUUID().toString());
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            builder.header(entry.getKey(), entry.getValue());
        }
    }

    /**
     * 将 Java 对象序列化为 JSON 字符串。
     *
     * 使用 Jackson 的 ObjectMapper 完成转换。
     * 如果对象结构无法被序列化（例如包含循环引用），会抛出 JsonProcessingException。
     *
     * @param value 要序列化的 Java 对象
     * @return JSON 字符串
     */
    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("JSON 序列化失败", exception);
        }
    }
}
