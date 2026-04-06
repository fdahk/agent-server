/**
 *
 * JwtAuthenticationFilter.java
 * 所属模块：auth（认证模块）
 * 架构层级：infrastructure / security（基础设施层 / 安全子层）
 *
 * 这是 JWT 认证的"过滤器"（Filter），是整个鉴权流程的核心入口。
 *
 * 【Filter 是什么？】
 * 在 Java Web 应用中，每个 HTTP 请求到达 Controller 之前，都会经过一系列
 * "过滤器"（Filter Chain，过滤器链）。你可以把它想象成一道道安检关卡：
 *
 *   HTTP 请求 → Filter1 → Filter2 → ... → Controller → 返回响应
 *
 * 本文件就是其中一道关卡：它检查请求中有没有合法的 JWT Token，如果有，
 * 就从 Token 中提取用户信息，放进 Spring Security 的"安全上下文"里，
 * 后续的代码就能知道"当前请求是谁发的"。
 *
 * 【工作流程】
 * 1. 从请求的 Authorization 头中提取 Token（格式：Bearer xxxxx）
 * 2. 用 JwtTokenProvider 解析 Token，获取用户名和角色
 * 3. 构造一个认证对象（Authentication），放进 SecurityContextHolder
 * 4. 放行请求，继续走后续的 Filter 和 Controller
 * 5. 如果 Token 无效或不存在，不设置认证信息，请求以"匿名用户"身份继续
 */
package com.agentserver.server.modules.auth.infrastructure.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * JWT 认证过滤器 —— 拦截每个 HTTP 请求，验证 JWT Token 并设置用户身份。
 *
 * <p>【OncePerRequestFilter 说明】
 * 这个类继承自 OncePerRequestFilter，它是 Spring 提供的一个基类，
 * 保证每个请求只经过这个 Filter 一次（在某些情况下，比如请求转发，
 * 普通 Filter 可能被调用多次，而 OncePerRequestFilter 避免了这个问题）。
 *
 * <p>【@Component 说明】
 * 加了 @Component 后，Spring 会自动创建这个 Filter 的实例并注册为 Bean。
 * 然后在 SecurityConfig 中，我们会把它添加到 Spring Security 的过滤器链中。
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    /**
     * JWT 令牌提供者，用于解析 Token 中的用户信息。
     */
    private final JwtTokenProvider jwtTokenProvider;

    /**
     * 构造函数，通过依赖注入获取 JwtTokenProvider。
     *
     * @param jwtTokenProvider JWT 令牌提供者
     */
    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    /**
     * 过滤器核心方法 —— 每个 HTTP 请求都会调用此方法。
     *
     * <p>【方法参数说明】
     * - request：HTTP 请求对象，可以从中获取请求头、请求体、URL 等信息
     * - response：HTTP 响应对象，可以设置响应状态码、响应头等
     * - filterChain：过滤器链，调用 filterChain.doFilter() 表示"放行，交给下一个过滤器处理"
     *
     * <p>【处理逻辑详解】
     * 1. 从 HTTP 请求头中获取 "Authorization" 字段
     * 2. 检查它是否以 "Bearer " 开头（这是 JWT 的标准传输格式）
     * 3. 截取 "Bearer " 后面的部分，就是真正的 JWT Token
     * 4. 调用 jwtTokenProvider.parseClaims() 解析 Token
     * 5. 从解析结果中取出 username 和 role
     * 6. 构建 Spring Security 的认证对象，放入安全上下文
     * 7. 无论成功与否，最后都要调用 filterChain.doFilter() 放行请求
     *
     * @param request     HTTP 请求
     * @param response    HTTP 响应
     * @param filterChain 过滤器链
     * @throws ServletException Servlet 异常
     * @throws IOException      IO 异常
     */
    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        // 第一步：从请求头中获取 Authorization 字段
        // 标准格式为："Bearer eyJhbGciOiJIUzI1NiIs..."
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);

        // 第二步：检查 Header 是否存在且以 "Bearer " 开头
        if (StringUtils.hasText(header) && header.startsWith("Bearer ")) {
            // 第三步：截取 "Bearer " 后面的 Token 字符串（"Bearer " 有 7 个字符）
            String token = header.substring(7);
            try {
                // 第四步：解析 Token，得到 Claims（载荷信息）
                // 如果 Token 无效或过期，parseClaims 会抛出异常，进入 catch 块
                Claims claims = jwtTokenProvider.parseClaims(token);

                // 第五步：从 Claims 中提取用户名和角色
                String username = claims.getSubject();
                String roleCode = claims.get("role", String.class);

                // 第六步：如果用户名有效，且当前安全上下文中还没有认证信息
                // （避免重复设置）
                if (StringUtils.hasText(username) && SecurityContextHolder.getContext().getAuthentication() == null) {
                    /*
                     * 构建 Spring Security 的认证令牌对象。
                     *
                     * UsernamePasswordAuthenticationToken 的三个参数：
                     * - principal（主体）：这里传入 username，代表"当前用户是谁"
                     * - credentials（凭证）：传 null，因为我们已经通过 JWT 验证了身份，
                     *   不需要再传密码
                     * - authorities（权限列表）：用户拥有的角色/权限，Spring Security
                     *   会用它来做接口级别的权限控制（比如"只有 admin 才能访问某接口"）
                     *   "ROLE_" 前缀是 Spring Security 的约定
                     */
                    UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                        username,
                        null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + roleCode))
                    );

                    // 把请求的详细信息（如 IP 地址、Session ID）附加到认证对象上
                    authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                    // 把认证信息放入 SecurityContextHolder（安全上下文）
                    // 之后在 Controller 或 Service 中，就可以通过
                    // SecurityContextHolder.getContext().getAuthentication() 获取当前用户信息
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            } catch (Exception ignored) {
                // Token 解析失败（过期、被篡改、格式错误等），清除安全上下文
                // 请求会以"未认证"的身份继续，如果目标接口需要认证，Spring Security
                // 会返回 401 或 403 状态码
                SecurityContextHolder.clearContext();
            }
        }

        // 第七步：无论 Token 是否有效，都必须调用此方法，把请求传递给下一个过滤器
        // 如果不调用，请求就会被"卡住"，前端永远收不到响应
        filterChain.doFilter(request, response);
    }
}
