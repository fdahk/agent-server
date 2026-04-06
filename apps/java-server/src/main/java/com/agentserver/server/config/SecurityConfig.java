/*
 * Spring Security 安全配置——定义"谁能访问哪些接口"以及"如何验证身份"
 * 应用中，并非所有接口都应该对外公开。比如：
 *   · 登录接口 /api/auth/login 应该允许匿名访问（否则用户没法登录）
 *   · 业务接口则需要用户先登录拿到 Token 才能访问
 *
 * 本文件集中管理这些"安全规则"的地方。它做了以下几件事：
 *   1. 关闭不需要的安全机制（CSRF、表单登录、HTTP Basic）
 *   2. 配置哪些 URL 可以匿名访问，哪些需要认证
 *   3. 插入自定义的 JWT 过滤器来校验 Token
 *   4. 配置 CORS（跨域资源共享），允许前端跨域调用
 *   5. 提供密码编码器（用于注册/登录时的密码加密比对）
 */
package com.agentserver.server.config;

import com.agentserver.server.modules.auth.infrastructure.security.JwtAuthenticationFilter;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * 安全配置类——集中定义应用的认证与授权规则。
 *
 * 【注解说明】
 * @Configuration —— 告诉 Spring "这个类是一个配置类"。
 *   配置类的作用类似于传统 XML 配置文件，但用 Java 代码来定义 Bean。
 *   Spring 启动时会自动加载所有 @Configuration 类中用 @Bean 标注的方法。
 */
@Configuration
public class SecurityConfig {

    /**
     * 配置 HTTP 安全过滤链——这是 Spring Security 的核心配置。
     *
     * 【注解说明】
     * @Bean —— 告诉 Spring："请调用这个方法，并把返回值注册到 IoC 容器中作为一个 Bean。"
     *   其他组件需要 SecurityFilterChain 时，Spring 会自动注入这里返回的实例。
     *   你可以把 @Bean 理解为"工厂方法"——Spring 用它来生产对象。
     *
     * 【参数说明】
     * @param http Spring Security 提供的 HttpSecurity 构建器，用链式调用来配置各种安全规则
     * @param jwtAuthenticationFilter 自定义的 JWT 认证过滤器（由 Spring 自动注入）
     *
     * @return 构建好的安全过滤链
     */
    @Bean
    public SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        JwtAuthenticationFilter jwtAuthenticationFilter
    ) throws Exception {
        http
            // 禁用 CSRF（跨站请求伪造）保护。
            // 因为本项目是前后端分离的 REST API，使用 JWT Token 鉴权，不依赖 Cookie，所以不需要 CSRF 保护。
            .csrf(AbstractHttpConfigurer::disable)
            // 禁用 HTTP Basic 认证（弹出浏览器登录框的那种方式）
            .httpBasic(AbstractHttpConfigurer::disable)
            // 禁用 Spring Security 内置的表单登录页面
            .formLogin(AbstractHttpConfigurer::disable)
            // 设置会话策略为 STATELESS（无状态）。
            // 这意味着服务器不会创建 HttpSession，每次请求都通过 JWT Token 独立鉴权。
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // 配置 URL 级别的访问权限
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers(
                    "/api",                // 根路径健康检查
                    "/api/auth/login",     // 登录接口——匿名可访问
                    "/api/agent/**",       // Agent 相关接口——暂时全部放行
                    "/actuator/health",    // Spring Boot Actuator 健康检查端点
                    "/swagger-ui.html",    // Swagger API 文档页面
                    "/swagger-ui/**",      // Swagger 静态资源
                    "/v3/api-docs/**"      // OpenAPI 3.0 文档端点
                ).permitAll()              // 以上路径允许匿名访问，不需要 Token
                .anyRequest().authenticated() // 其他所有请求都需要通过认证
            )
            // 在 Spring Security 内置的 UsernamePasswordAuthenticationFilter 之前插入自定义的 JWT 过滤器。
            // 这样每个请求先经过 JWT 过滤器校验 Token，通过后才进入后续的授权逻辑。
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            // 启用 CORS（跨域资源共享），使用默认配置源（即下面定义的 corsConfigurationSource Bean）
            .cors(Customizer.withDefaults());

        return http.build();
    }

    /**
     * 创建密码编码器 Bean。
     *
     * PasswordEncoder 用于对用户密码进行加密和比对：
     *   · 注册时：把明文密码加密后存入数据库
     *   · 登录时：把用户输入的密码加密后与数据库中的密文比对
     *
     * createDelegatingPasswordEncoder() 会创建一个"委托编码器"，
     * 默认使用 bcrypt 算法，同时兼容其他算法（如 SHA-256），具有良好的兼容性。
     *
     * @return 密码编码器实例
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    /**
     * 提供一个空的 UserDetailsService Bean。
     *
     * Spring Security 默认需要一个 UserDetailsService 来加载用户信息。
     * 但本项目使用自定义的 JWT 鉴权流程（不走 Spring Security 内置的用户加载逻辑），
     * 所以这里提供一个"占位"实现，直接抛出异常表示不使用此路径。
     *
     * 【语法说明——Lambda 表达式】
     * username -> { ... } 是 Java 8 的 Lambda 表达式，相当于匿名内部类的简写。
     * 这里实现了 UserDetailsService 接口中唯一的 loadUserByUsername 方法。
     *
     * @return 一个永远抛出异常的 UserDetailsService 实现
     */
    @Bean
    public UserDetailsService userDetailsService() {
        return username -> {
            throw new UsernameNotFoundException("当前项目使用自定义 JWT 鉴权链路");
        };
    }

    /**
     * 配置 CORS（跨域资源共享）规则。
     *
     * 【什么是 CORS？】
     * 浏览器出于安全考虑，默认禁止网页向不同域名/端口的服务器发请求。
     * 比如前端运行在 localhost:3000，后端在 localhost:8080，浏览器就会阻止请求。
     * CORS 是一种机制，让服务器告诉浏览器："我允许某些来源的跨域请求"。
     *
     * 这里的配置：
     *   · 允许所有来源（"*"）——开发阶段方便调试，生产环境应限制为具体域名
     *   · 允许 GET/POST/PUT/DELETE/OPTIONS 方法
     *   · 允许所有请求头
     *   · 允许携带凭证（Cookie、Authorization 头等）
     *
     * @return CORS 配置源，Spring Security 会自动使用它
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of("*"));
        configuration.setAllowedMethods(List.of(
            HttpMethod.GET.name(),
            HttpMethod.POST.name(),
            HttpMethod.PUT.name(),
            HttpMethod.DELETE.name(),
            HttpMethod.OPTIONS.name()
        ));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
