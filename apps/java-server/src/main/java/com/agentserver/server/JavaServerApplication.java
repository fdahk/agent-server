/**
 *
 * JavaServerApplication.java
 * 整个 Agent Server 后端服务的"启动入口"
 * 在 Spring Boot 项目中，有且仅有一个带 main 方法的类充当应用程序入口。
 * 本文件就是这个入口——运行 main 方法后，Spring Boot 会：
 *   1. 自动扫描并加载所有被注解标记的组件（Controller、Service 等）
 *   2. 读取 application.yml / application.properties 配置文件
 *   3. 启动内嵌的 Tomcat Web 服务器，开始监听 HTTP 请求
 *
 * 可以理解为"整个服务器的电源开关"。
 */
package com.agentserver.server;

import com.agentserver.server.config.JwtProperties;
import com.agentserver.server.config.AgentRuntimeProperties;
import com.agentserver.server.config.AiGatewayProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * 应用程序主启动类。
 * @SpringBootApplication —— 这是一个"组合注解"，相当于同时启用了以下三个功能：
 *   · @SpringBootConfiguration：标记当前类是一个配置类（可以定义 Bean）
 *   · @EnableAutoConfiguration：让 Spring Boot 根据依赖自动配置各种功能（如内嵌 Tomcat、JSON 序列化等）
 *   · @ComponentScan：自动扫描当前包及子包下所有带 @Component/@Service/@Controller 等注解的类，
 *                     并把它们注册到 Spring 容器中（这样你才能在别的地方用 @Autowired 注入它们）
 *
 * @EnableAsync —— 开启 Spring 的异步任务支持。加了这个注解后，
 *   在方法上标 @Async 就能让该方法在一个独立线程中异步执行，不阻塞调用方。
 *
 * @EnableConfigurationProperties —— 告诉 Spring Boot："请把以下这些配置类激活，
 *   让它们从配置文件（application.yml）中读取对应的属性值并创建为 Bean。"
 *   这里激活了三个配置类：JwtProperties、AgentRuntimeProperties、AiGatewayProperties。
 *
 * @MapperScan —— 这是 MyBatis 框架提供的注解。它告诉 MyBatis："请扫描指定包路径下的
 *   所有 Mapper 接口，并自动为它们生成实现类注册到 Spring 容器中。"
 *   这样你就不用在每个 Mapper 接口上单独加 @Mapper 注解了。
 */
@SpringBootApplication
@EnableAsync
@EnableConfigurationProperties({
    JwtProperties.class,
    AgentRuntimeProperties.class,
    AiGatewayProperties.class
})
@MapperScan("com.agentserver.server.modules")
public class JavaServerApplication {

	/**
	 * Java 程序的入口方法。JVM（Java 虚拟机）启动时会找到并执行这个 main 方法。
	 *
	 * SpringApplication.run() 的作用：
	 *   1. 创建 Spring 应用上下文（即 IoC 容器）
	 *   2. 执行所有自动配置
	 *   3. 启动内嵌的 Web 服务器（默认是 Tomcat）
	 *   4. 开始监听 HTTP 端口，准备接受请求
	 *
	 * @param args 命令行参数，可以通过 --server.port=8081 等方式传递配置
	 */
	public static void main(String[] args) {
		SpringApplication.run(JavaServerApplication.class, args);
	}

}
