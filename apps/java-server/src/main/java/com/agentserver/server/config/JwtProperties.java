/*
 * JWT 安全配置属性类——管理 JSON Web Token 签发与验证所需的参数
 * JWT（JSON Web Token）是一种轻量级的身份认证方案：
 *   1. 用户登录成功后，服务器用密钥签发一个 Token 返回给前端
 *   2. 前端后续请求在 Header 中携带该 Token
 *   3. 服务器验证 Token 的签名和有效期，确认用户身份
 *
 * 本类从配置文件中读取签发 Token 所需的"密钥"和"过期时间"，
 * 供鉴权相关的服务类使用。
 *
 * 对应的 application.yml 配置示例：
 *   app:
 *     security:
 *       jwt-secret: my-super-secret-key
 *       jwt-expire-seconds: 86400
 */
package com.agentserver.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT（JSON Web Token）配置属性。
 *
 * 【注解说明】
 * @ConfigurationProperties(prefix = "app.security") ——
 *   绑定 application.yml 中 app.security.* 前缀下的属性。
 *   例如 app.security.jwt-secret → jwtSecret，app.security.jwt-expire-seconds → jwtExpireSeconds。
 */
@ConfigurationProperties(prefix = "app.security")
public record JwtProperties(
    /**
     * JWT 签名密钥。
     * 服务器使用这个密钥对 Token 进行签名和验证，保证 Token 不被篡改。
     * 生产环境中应使用足够长且随机的字符串，并通过环境变量注入。
     */
    String jwtSecret,

    long jwtExpireSeconds
) {
}
