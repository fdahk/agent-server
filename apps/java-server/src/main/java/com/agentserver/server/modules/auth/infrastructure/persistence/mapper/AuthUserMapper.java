/*
 * 文件：AuthUserMapper.java
 * 所属模块：auth（认证模块）
 * 架构层级：infrastructure / persistence（基础设施层 / 持久化子层）
 *
 * 这是用户数据的"数据访问层"（DAO / Mapper），负责与数据库交互。
 * 在登录流程中，AuthApplicationService 需要根据用户名查询数据库中的用户信息，
 * 查询操作就是通过这个 Mapper 接口完成的。
 *
 * 【MyBatis Mapper 是什么？】
 * MyBatis 是一个流行的 Java ORM（对象关系映射）框架。传统做法是手写 JDBC 代码
 * 来操作数据库，非常繁琐。MyBatis 让你只需要定义接口 + 写 SQL，框架会自动
 * 帮你执行 SQL 并把结果映射成 Java 对象。
 *
 * 你只需要：
 *   1. 定义一个接口（就是这个文件）
 *   2. 用注解写 SQL（如 @Select）
 *   3. MyBatis 在运行时会自动生成这个接口的实现类（代理对象）
 */
package com.agentserver.server.modules.auth.infrastructure.persistence.mapper;

import com.agentserver.server.modules.auth.infrastructure.persistence.model.AuthUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 用户数据访问接口 —— 提供用户相关的数据库查询方法。
 *
 * <p>【@Mapper 注解说明】
 * @Mapper 是 MyBatis 提供的注解，告诉 MyBatis："这是一个 Mapper 接口，
 * 请在运行时为它自动生成实现类。"
 * 生成的实现类会被注册为 Spring Bean，所以你可以在 Service 中直接注入使用。
 *
 * <p>【为什么是接口而不是类？】
 * 这是 MyBatis 的设计模式：你只定义"做什么"（接口方法 + SQL），
 * MyBatis 通过 Java 动态代理技术自动生成"怎么做"（实现类）。
 * 这样开发者就不需要写重复的 JDBC 模板代码了。
 */
@Mapper
public interface AuthUserMapper {

    /**
     * 根据用户名查询用户信息。
     *
     * <p>【@Select 注解说明】
     * @Select 是 MyBatis 的注解，里面写的是原生 SQL 语句。
     * #{username} 是 MyBatis 的参数占位符，MyBatis 会安全地将方法参数的值
     * 替换进去（使用 PreparedStatement，自动防止 SQL 注入攻击）。
     *
     * <p>【SQL 解读】
     * 从 users 表中查询所有字段，WHERE 条件是 username 等于传入的参数。
     * MyBatis 会自动把查询结果的列名映射到 AuthUser 对象的字段名上。
     * 比如数据库列 password_hash 会映射到 Java 字段 passwordHash
     * （MyBatis 默认支持下划线转驼峰的映射，需要在配置中开启）。
     *
     * <p>【返回值说明】
     * - 如果找到了匹配的用户，返回 AuthUser 对象
     * - 如果没有匹配的记录，返回 null
     *
     * @param username 要查询的用户名
     * @return 匹配的用户对象，不存在时返回 null
     */
    @Select("""
        SELECT id,
               username,
               password_hash,
               display_name,
               role_code,
               created_at,
               updated_at
        FROM users
        WHERE username = #{username}
        """)
    AuthUser findByUsername(String username);
}
