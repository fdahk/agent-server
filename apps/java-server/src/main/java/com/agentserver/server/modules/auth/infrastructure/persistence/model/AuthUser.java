/**
 * AuthUser.java
 * 所属模块：auth（认证模块）
 * 架构层级：infrastructure / persistence / model（基础设施层 / 持久化 / 数据模型）
 * 这是用户表（users）对应的 Java 实体类（也叫 PO，Persistent Object）。
 * 它的每个字段都对应数据库表中的一列。当 MyBatis 执行 SELECT 查询后，
 * 会把查询结果自动映射到这个类的实例上。
 *
 * 简单说：数据库表 users → Java 对象 AuthUser
 */
package com.agentserver.server.modules.auth.infrastructure.persistence.model;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 用户实体类 —— 对应数据库中的 users 表。
 *
 * <p>【Lombok 注解说明】
 * Lombok 是一个 Java 工具库，可以通过注解自动生成大量样板代码，
 * 避免手写繁琐的 getter/setter/toString/构造函数等。
 *
 * <p>@Data —— 这是 Lombok 最常用的注解，它等价于同时使用了：
 * - @Getter：为每个字段自动生成 getXxx() 方法
 * - @Setter：为每个字段自动生成 setXxx() 方法
 * - @ToString：自动生成 toString() 方法
 * - @EqualsAndHashCode：自动生成 equals() 和 hashCode() 方法
 * - @RequiredArgsConstructor：为 final 字段生成构造函数
 *
 * <p>@NoArgsConstructor —— 自动生成一个无参构造函数：public AuthUser() {}
 * MyBatis 在映射查询结果时需要这个无参构造函数来创建对象。
 *
 * <p>@AllArgsConstructor —— 自动生成一个包含所有字段的构造函数：
 * public AuthUser(Long id, String username, String passwordHash, ...)
 * 方便在代码中快速创建一个完整的对象。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthUser {

    /** 用户唯一标识，数据库自增主键 */
    private Long id;

    /** 用户名（登录账号），用于登录验证，在 users 表中具有唯一性 */
    private String username;

    /**
     * 密码哈希值。
     * 数据库中不存储明文密码，而是存储经过 BCrypt 等算法加密后的哈希值。
     * 登录时通过 PasswordEncoder.matches() 来比对，而不是直接比较字符串。
     */
    private String passwordHash;

    /** 用户显示名称，用于前端展示（比如页面右上角显示的昵称） */
    private String displayName;

    /**
     * 角色编码，如 "admin"、"user" 等。
     * 用于权限控制——不同角色可以访问不同的接口和功能。
     */
    private String roleCode;

    /** 记录创建时间，由数据库自动生成 */
    private LocalDateTime createdAt;

    /** 记录最后更新时间，由数据库自动维护 */
    private LocalDateTime updatedAt;
}
