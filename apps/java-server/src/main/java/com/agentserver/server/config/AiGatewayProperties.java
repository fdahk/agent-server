/*
 * AI 网关的配置属性类——集中管理与外部 AI 服务通信所需的参数
 * 本项目的核心功能是"Agent 执行"，而 Agent 需要调用外部 AI 大模型（如 GPT）。
 * 调用 AI 时需要知道：用哪个模型？API 地址是什么？超时多久？密钥是什么？
 *
 * 这些参数不应该硬编码在代码中，而是放在配置文件 application.yml 里，
 * 本类的职责就是把配置文件中 app.ai.* 前缀的值自动映射成一个 Java 对象，
 * 供其他服务类注入使用。
 *
 * 对应的 application.yml 配置示例：
 *   app:
 *     ai:
 *       default-model: gpt-4
 *       base-url: https://api.openai.com
 *       timeout-ms: 30000
 *       api-key: sk-xxxx
 */
package com.agentserver.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * AI 网关配置属性。
 * record 是 Java 16 引入的一种特殊类，专门用来做"只读数据载体"。
 * 你在圆括号里声明的每个参数，Java 编译器会自动帮你生成：
 *   · 一个 private final 字段
 *   · 一个同名的 getter 方法（如 defaultModel()）
 *   · 构造函数、equals()、hashCode()、toString()
 *
 * 【注解说明】
 * @ConfigurationProperties(prefix = "app.ai") ——
 *   告诉 Spring Boot："请从配置文件中找到以 app.ai 开头的属性，
 *   按名称匹配自动绑定到这个 record 的各个字段上。"
 *   例如 app.ai.default-model 会绑定到 defaultModel 字段（Spring 自动处理 kebab-case 到 camelCase 的转换）。
 *
 *   注意：要让这个注解生效，还需要在启动类上加 @EnableConfigurationProperties 来激活它，
 *   或者在这个类上加 @Component（本项目采用前者）。
 */
@ConfigurationProperties(prefix = "app.ai")
public record AiGatewayProperties(
    /** 默认使用的 AI 模型名称 */
    String defaultModel,

    /** AI 服务的基础 URL（API 根地址） */
    String baseUrl,

    /** 请求超时时间，单位为毫秒。超过该时间未收到响应则视为超时失败 */
    int timeoutMs,

    /** 调用 AI 服务所需的 API 密钥 */
    String apiKey
) {
}
