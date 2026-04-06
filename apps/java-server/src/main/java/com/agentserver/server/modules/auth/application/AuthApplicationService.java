/*
 * 所属模块：auth（认证模块）
 * 架构层级：application（应用服务层）
 *
 * 这是认证模块的"应用服务"，是整个登录业务流程的编排者。
 * 在分层架构中，Controller（接口层）接收到 HTTP 请求后，会把具体的业务逻辑委托给这个 Service 来完成。它负责：
 *   1. 调用数据库查询用户信息
 *   2. 验证密码是否正确
 *   3. 生成 JWT 令牌并返回给前端
 *
 * 【登录流程概览】
 * 前端发送用户名+密码 → Controller 接收 → 本 Service 处理 →
 *   查数据库 → 校验密码 → 生成 JWT → 返回登录结果
 */
package com.agentserver.server.modules.auth.application;

import com.agentserver.server.modules.auth.infrastructure.persistence.mapper.AuthUserMapper;
import com.agentserver.server.modules.auth.infrastructure.persistence.model.AuthUser;
import com.agentserver.server.modules.auth.infrastructure.security.JwtTokenProvider;
import com.agentserver.server.modules.auth.interfaces.http.dto.LoginRequest;
import com.agentserver.server.modules.auth.interfaces.http.dto.LoginResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * 认证应用服务 —— 处理用户登录的核心业务逻辑。
 */
@Service
public class AuthApplicationService {

    /**
     * 用户数据访问层（Mapper），用于从数据库查询用户信息。
     * MyBatis 会自动生成这个接口的实现类，我们只需要定义 SQL 就行。
     */
    private final AuthUserMapper authUserMapper;

    /**
     * 密码编码器，由 Spring Security 提供。
     * 作用：安全地对比用户输入的明文密码和数据库中存储的加密密码。
     * 数据库里不会存明文密码（太危险），而是存一个经过 BCrypt 等算法加密后的"哈希值"。
     * PasswordEncoder.matches(原文, 哈希值) 可以判断密码是否匹配。
     */
    private final PasswordEncoder passwordEncoder;

    /**
     * JWT 令牌提供者，负责生成和解析 JWT Token。
     * 登录成功后，服务端会生成一个 JWT 给前端，前端后续每次请求都带上这个 Token，
     * 服务端就能识别"你是谁"，而不需要在服务端保存 Session。
     */
    private final JwtTokenProvider jwtTokenProvider;

    /**
     * 构造函数 —— Spring 的"构造器注入"方式。
     *
     * <p>【依赖注入（DI）原理】
     * 当 Spring 创建 AuthApplicationService 实例时，会自动查找容器中匹配的 Bean，
     * 把 AuthUserMapper、PasswordEncoder、JwtTokenProvider 的实例传进来。
     * 这就是所谓的"控制反转"（IoC）——你不需要自己 new 依赖对象，Spring 帮你管理。
     *
     * @param authUserMapper   用户数据查询 Mapper
     * @param passwordEncoder  密码编码器
     * @param jwtTokenProvider JWT 令牌提供者
     */
    public AuthApplicationService(
        AuthUserMapper authUserMapper,
        PasswordEncoder passwordEncoder,
        JwtTokenProvider jwtTokenProvider
    ) {
        this.authUserMapper = authUserMapper;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    /**
     * 处理用户登录请求。
     *
     * <p>【业务流程】
     * 1. 根据用户名查询数据库，找到对应的用户记录
     * 2. 如果用户不存在，或者密码不匹配，抛出 401 未授权异常
     * 3. 登录成功：调用 JwtTokenProvider 生成一个 JWT Token
     * 4. 把用户信息和 Token 封装成 LoginResponse 返回给前端
     *
     * <p>【关于 ResponseStatusException】
     * 这是 Spring 提供的便捷异常类，抛出后 Spring 会自动把它转换为对应的 HTTP 响应。
     * 比如这里传入 UNAUTHORIZED（401），前端就会收到 HTTP 401 状态码。
     *
     * @param request 登录请求，包含用户名和密码
     * @return 登录响应，包含用户信息和 JWT Token
     * @throws ResponseStatusException 当用户名或密码错误时抛出 401 异常
     */
    public LoginResponse login(LoginRequest request) {
        AuthUser user = authUserMapper.findByUsername(request.username());
        if (user == null || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ResponseStatusException(UNAUTHORIZED, "用户名或密码错误");
        }

        String token = jwtTokenProvider.generateToken(user.getId(), user.getUsername(), user.getRoleCode());
        return new LoginResponse(user.getId(), user.getUsername(), user.getDisplayName(), user.getRoleCode(), token);
    }
}
