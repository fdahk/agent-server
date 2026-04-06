/**
 * Agent 运行记录的数据模型（infrastructure 层 - 持久化）
 *
 * 本类是 agent_runs 数据库表的 Java 映射对象（也称为 PO / Persistence Object）。
 * 它的每个字段对应数据库表中的一个列。MyBatis 在执行查询时，会将数据库的列值
 * 自动填充到这个对象的字段中；在执行插入时，会从这个对象中读取字段值写入数据库。
 */
package com.agentserver.server.modules.agent.infrastructure.persistence.model;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * AgentRunRecord —— agent_runs 表的数据模型
 *
 * @Data 是 Lombok 库的注解，自动为所有字段生成 getter、setter、
 * toString()、equals()、hashCode() 方法，免去手写这些模板代码的麻烦。
 *
 * @NoArgsConstructor 自动生成无参构造方法 AgentRunRecord()，
 * MyBatis 反序列化查询结果时需要先用无参构造创建空对象，再逐个设置字段值。
 *
 * @AllArgsConstructor 自动生成包含所有字段的构造方法，
 * 方便在代码中一次性创建并初始化所有字段。
 *
 * 【与 record 的区别】record 是不可变的（没有 setter），适合做值对象 / DTO。
 * 而这里用普通 class + @Data，因为 MyBatis 需要通过 setter 设置字段值，
 * 同时某些字段（如 id）需要在插入后被回填。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AgentRunRecord {

    /** 数据库自增主键（由数据库自动生成） */
    private Long id;

    /** 运行的业务唯一标识（如 "run-abc123..."），对外暴露用这个而非自增 id */
    private String runId;

    /** 创建该运行的用户 ID（关联 auth_users 表） */
    private Long userId;

    /** 用户提交的任务描述文本 */
    private String task;

    /** 输入目录列表的 JSON 字符串（如 '["D:/data", "D:/docs"]'） */
    private String directoriesJson;

    /** 输入 URL 列表的 JSON 字符串（如 '["https://example.com"]'） */
    private String urlsJson;

    /** AI 模型名称（如 "gpt-4o"） */
    private String modelName;

    /** 当前运行状态（queued / running / completed / failed） */
    private String status;

    /** 当前进度描述信息（如"任务已创建，等待执行"、"任务执行完成"等） */
    private String progressMessage;

    /** 运行实际开始执行的时间（状态变为 RUNNING 时设置） */
    private LocalDateTime startedAt;

    /** 运行完成或失败的时间（状态变为 COMPLETED 或 FAILED 时设置） */
    private LocalDateTime completedAt;

    /** 记录创建时间（即运行被创建的时间） */
    private LocalDateTime createdAt;

    /** 记录最后更新时间（每次状态变更都会更新） */
    private LocalDateTime updatedAt;
}
