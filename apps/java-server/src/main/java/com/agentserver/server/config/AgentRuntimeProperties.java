/*
 * Agent 运行时配置属性类——定义 Agent 执行过程中的运行时参数
 * Agent 在执行任务时可能需要把生成的产物（如代码文件、日志等）写到磁盘上。
 * 本类定义了这类运行时参数，目前主要是 outputRoot（产物输出根目录）。
 *
 * 对应的 application.yml 配置示例：
 *   app:
 *     agent:
 *       output-root: /data/agent-output
 */
package com.agentserver.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Agent 运行时配置属性。
 *
 * record 是 Java 16+ 提供的"不可变数据类"语法糖。
 * 编译器会根据圆括号中声明的参数自动生成字段、getter、构造函数、equals/hashCode/toString。
 * 这里只有一个参数 outputRoot，所以这个 record 本质上就是一个只包含一个字段的只读对象。
 *
 * 【注解说明】
 * @ConfigurationProperties(prefix = "app.agent") ——
 *   将配置文件中 app.agent.* 前缀下的属性自动绑定到本 record 的字段上。
 *   例如 app.agent.output-root → outputRoot。
 */
@ConfigurationProperties(prefix = "app.agent")
public record AgentRuntimeProperties(
    /**
     * Agent 产物输出的根目录路径。
     * Agent 执行过程中生成的文件（代码、日志等）会保存到这个目录下。
     */
    String outputRoot
) {
}
