/**
 *
 * LoginResponse.java
 * 所属模块：auth（认证模块）
 * 架构层级：interfaces / http / dto（接口层 / HTTP / 数据传输对象）
 *
 * 这是登录成功后返回给前端的响应 DTO。
 * 包含用户基本信息和 JWT Token，前端拿到后通常会：
 *   1. 保存 accessToken（比如存到 localStorage）
 *   2. 之后每次请求都在 HTTP Header 中带上：Authorization: Bearer <accessToken>
 *   3. 用 displayName 等字段在页面上展示用户信息
 */
package com.agentserver.server.modules.auth.interfaces.http.dto;

/**
 * 登录响应 DTO —— 登录成功后返回给前端的数据结构。
 *
 * 这个 record 定义了 5 个字段，Spring 在返回响应时会自动把它序列化为 JSON：
 * {"userId":1,"username":"admin","displayName":"管理员","roleCode":"admin","accessToken":"eyJ..."}
 *
 * @param userId      用户 ID（数据库主键），前端可用于后续 API 调用
 * @param username    用户名（登录账号）
 * @param displayName 用户显示名称（昵称），用于前端界面展示
 * @param roleCode    角色编码（如 "admin"、"user"），前端可据此控制菜单和按钮的显示/隐藏
 * @param accessToken JWT 访问令牌，前端需要保存它，后续请求时放在 Authorization 头中
 */
public record LoginResponse(
    Long userId,
    String username,
    String displayName,
    String roleCode,
    String accessToken
) {
}
