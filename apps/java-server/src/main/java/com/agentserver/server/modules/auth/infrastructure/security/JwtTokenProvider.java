/*
 * auth（认证模块）
 * 架构层级：infrastructure / security（基础设施层 / 安全子层）
 *
 * 【文件在整体架构中的角色】
 * 这是 JWT（JSON Web Token）的核心工具类，负责两件事：
 *   1. 生成 Token —— 用户登录成功后，把用户信息编码成一个加密字符串（Token）
 *   2. 解析 Token —— 后续请求到来时，把 Token 解码回用户信息
 *
 * 【什么是 JWT？】
 * JWT 是一种无状态的身份认证方案。传统方式是服务端保存 Session，而 JWT 方案
 * 把用户信息加密后直接给前端保存（通常放在 localStorage 或 Cookie 里）。
 * 前端每次请求都在 HTTP Header 里带上这个 Token，服务端验签后就知道"你是谁"。
 *
 * JWT 由三部分组成（用 . 分隔）：
 *   Header.Payload.Signature
 *   - Header：声明算法类型（如 HS256）
 *   - Payload：存放用户信息（如用户名、角色、过期时间）—— 也叫 Claims
 *   - Signature：用密钥对前两部分签名，防止被篡改
 * ====================================================================
 */
package com.agentserver.server.modules.auth.infrastructure.security;

import com.agentserver.server.config.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Component;

/**
 * JWT 令牌提供者 —— 负责 JWT Token 的生成与解析。
 *
 * <p>【@Component 注解说明】
 * @Component 是 Spring 的通用注解，告诉 Spring："把这个类注册为容器中的一个 Bean。"
 * 注册后，其他类就可以通过依赖注入（构造函数参数）来使用它。
 * @Component、@Service、@Repository 本质上功能一样，只是语义不同，
 * @Component 最通用，@Service 表示业务服务，@Repository 表示数据层。
 */
@Component
public class JwtTokenProvider {

    /**
     * HMAC 签名密钥。
     * 这是一个对称密钥——生成 Token 和验证 Token 用的是同一把密钥。
     * 它由配置文件中的字符串密钥（jwtSecret）转换而来。
     * 如果这个密钥泄露，别人就能伪造任意用户的 Token，所以一定要保密。
     */
    private final SecretKey secretKey;

    /**
     * JWT 配置属性，包含密钥字符串和过期时间等配置。
     * 这些值通常从 application.properties 或 application.yml 配置文件中读取。
     */
    private final JwtProperties jwtProperties;

    /**
     * 构造函数 —— 初始化密钥。
     *
     * <p>【密钥初始化过程】
     * 从配置中拿到原始密钥字符串（如 "my-super-secret-key-12345"），
     * 用 Keys.hmacShaKeyFor() 方法将其转换为 HMAC-SHA 算法所需的 SecretKey 对象。
     * StandardCharsets.UTF_8 确保字符串按 UTF-8 编码转换为字节数组。
     *
     * @param jwtProperties JWT 相关配置（密钥、过期时间等）
     */
    public JwtTokenProvider(JwtProperties jwtProperties) {
        this.jwtProperties = jwtProperties;
        this.secretKey = Keys.hmacShaKeyFor(jwtProperties.jwtSecret().getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 生成 JWT Token。
     *
     * <p>【Token 内容说明】
     * 生成的 Token 里包含以下信息（称为 Claims）：
     * - subject（主题）：设为 username，标识这个 Token 属于哪个用户
     * - uid（自定义字段）：用户 ID
     * - role（自定义字段）：角色编码，如 "admin"、"user"
     * - issuedAt（签发时间）：Token 什么时候签发的
     * - expiration（过期时间）：Token 什么时候失效
     *
     * <p>最后用 signWith(secretKey) 对整个 Token 签名，确保内容不可被篡改。
     * compact() 把 Token 序列化为一个紧凑的字符串（形如 xxxxx.yyyyy.zzzzz）。
     *
     * @param userId   用户 ID
     * @param username 用户名
     * @param roleCode 角色编码
     * @return 生成的 JWT Token 字符串
     */
    public String generateToken(Long userId, String username, String roleCode) {
        Instant now = Instant.now();
        Instant expireAt = now.plusSeconds(jwtProperties.jwtExpireSeconds());

        return Jwts.builder()
            .subject(username)
            .claim("uid", userId)
            .claim("role", roleCode)
            .issuedAt(Date.from(now))
            .expiration(Date.from(expireAt))
            .signWith(secretKey)
            .compact();
    }

    /**
     * 解析 JWT Token，提取其中的 Claims（载荷信息）。
     *
     * <p>【解析过程】
     * 1. 用同一把密钥（secretKey）验证 Token 的签名是否有效
     * 2. 如果签名正确且未过期，返回 Claims 对象，里面包含 username、uid、role 等信息
     * 3. 如果 Token 被篡改、已过期或签名不匹配，会抛出异常（如 ExpiredJwtException）
     *
     * @param token 前端传来的 JWT Token 字符串
     * @return Claims 对象，可以从中获取用户信息，如 claims.getSubject() 获取用户名
     * @throws io.jsonwebtoken.JwtException 当 Token 无效、过期或签名不匹配时抛出
     */
    public Claims parseClaims(String token) {
        return Jwts.parser()
            .verifyWith(secretKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
