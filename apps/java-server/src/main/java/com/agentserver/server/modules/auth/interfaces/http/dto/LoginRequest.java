/*
 * ====================================================================
 * 文件：LoginRequest.java
 * 所属模块：auth（认证模块）
 * 架构层级：interfaces / http / dto（接口层 / HTTP / 数据传输对象）
 *
 * 【文件在整体架构中的角色】
 * 这是登录请求的 DTO（Data Transfer Object，数据传输对象）。
 * 当前端发送登录请求时，HTTP 请求体中的 JSON 数据会被自动映射到这个对象。
 *
 * 【什么是 DTO？】
 * DTO 是专门用于"层与层之间传输数据"的对象。它和数据库实体（如 AuthUser）不同：
 * - AuthUser 对应数据库表结构，包含密码哈希等敏感字段
 * - LoginRequest 只包含前端提交的字段（用户名和密码），是"接口层"的数据结构
 * 分开定义可以避免把数据库结构直接暴露给前端，更安全、更灵活。
 * ====================================================================
 */
package com.agentserver.server.modules.auth.interfaces.http.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 登录请求 DTO —— 封装前端提交的登录表单数据。
 *
 * record 的所有字段都是 final 的（不可修改），非常适合用作 DTO。
 * 相比传统的 class + Lombok，record 更加简洁。
 *
 * <p>【参数校验注解】
 * @NotBlank：Jakarta Validation 提供的校验注解，表示这个字段不能为 null、
 * 空字符串 "" 或纯空白字符串 "   "。
 * 配合 Controller 方法参数上的 @Valid 使用，Spring 会在参数绑定时自动校验。
 * 如果校验失败，会返回 400 Bad Request，message 就是注解中指定的提示信息。
 *
 * @param username 用户名，不能为空
 * @param password 密码（明文），不能为空。前端提交明文密码，服务端会和数据库中的哈希值对比
 */
public record LoginRequest(
    @NotBlank(message = "用户名不能为空")
    String username,
    @NotBlank(message = "密码不能为空")
    String password
) {
}
