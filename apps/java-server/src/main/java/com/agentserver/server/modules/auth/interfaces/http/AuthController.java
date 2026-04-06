/**
 *
 * AuthController.java
 * 所属模块：auth（认证模块）
 * 架构层级：interfaces / http（接口层 / HTTP 接口）
 *
 * 这是认证模块的 HTTP 接口入口（Controller），直接面向前端。
 * 前端发送 HTTP 请求到这里，Controller 解析请求参数后，把具体业务
 * 委托给 AuthApplicationService 来处理，最后把结果封装成统一格式返回。
 *
 * 在分层架构中的位置：
 *   前端 HTTP 请求 → Controller（本文件）→ Service（业务逻辑）→ Mapper（数据库）
 *
 * Controller 的职责是"薄"的——它不应该包含复杂的业务逻辑，
 * 只负责：接收请求 → 调用 Service → 返回响应。
 */
package com.agentserver.server.modules.auth.interfaces.http;

import com.agentserver.server.common.api.ApiResponse;
import com.agentserver.server.modules.auth.application.AuthApplicationService;
import com.agentserver.server.modules.auth.interfaces.http.dto.LoginRequest;
import com.agentserver.server.modules.auth.interfaces.http.dto.LoginResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 认证接口控制器 —— 提供用户登录等认证相关的 HTTP API。
 *
 * <p>【@RestController 注解说明】
 * @RestController = @Controller + @ResponseBody
 * - @Controller：告诉 Spring 这是一个控制器类，可以处理 HTTP 请求
 * - @ResponseBody：表示方法的返回值会直接作为 HTTP 响应体返回（通常是 JSON 格式），
 *   而不是跳转到一个 HTML 页面
 * 所以 @RestController 就是"专门返回 JSON 数据的控制器"，非常适合写 REST API。
 *
 * <p>【@RequestMapping("/api/auth") 说明】
 * 设置这个 Controller 下所有接口的统一 URL 前缀。
 * 比如类上写 "/api/auth"，方法上写 "/login"，
 * 那么最终的完整 URL 就是：POST /api/auth/login
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /**
     * 认证应用服务，处理具体的登录业务逻辑。
     * Controller 不直接操作数据库或处理复杂逻辑，而是委托给 Service 层。
     */
    private final AuthApplicationService authApplicationService;

    /**
     * 构造函数 —— 通过 Spring 依赖注入获取 AuthApplicationService 实例。
     *
     * @param authApplicationService 认证应用服务
     */
    public AuthController(AuthApplicationService authApplicationService) {
        this.authApplicationService = authApplicationService;
    }

    /**
     * 用户登录接口。
     *
     * <p>【完整 URL】POST /api/auth/login
     *
     * <p>【注解说明】
     * - @PostMapping("/login")：表示这个方法处理 HTTP POST 请求，路径为 /login。
     *   POST 方法通常用于"提交数据"（如登录、注册），GET 用于"查询数据"。
     *
     * - @Valid：开启参数校验。配合 LoginRequest 中的校验注解（如 @NotBlank）使用。
     *   如果前端传的参数不满足校验规则，Spring 会自动返回 400 错误，
     *   不会进入这个方法体。
     *
     * - @RequestBody：告诉 Spring 把 HTTP 请求体中的 JSON 数据
     *   自动反序列化（转换）为 LoginRequest 对象。
     *   比如前端发送 {"username":"admin","password":"123456"}，
     *   Spring 会自动创建一个 LoginRequest(username="admin", password="123456")。
     *
     * <p>【返回值说明】
     * 返回统一的 ApiResponse 包装格式，包含 code、message、data 等字段。
     * data 中是 LoginResponse，包含用户信息和 JWT Token。
     *
     * @param request 登录请求体（包含用户名和密码）
     * @return 统一响应格式，包含登录结果
     */
    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.success(authApplicationService.login(request), "登录成功");
    }
}
