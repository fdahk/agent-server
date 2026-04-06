/**
 * Agent 运行事件记录的数据模型（infrastructure 层 - 持久化）
 *
 * 本类是 agent_run_events 数据库表的 Java 映射对象。
 * 每条记录代表 Agent 运行过程中的一个事件（如任务入队、开始执行、发现资源、执行完成等）。
 * 事件按 sequence_no（序号）排列，保证了时序正确性。
 */
package com.agentserver.server.modules.agent.infrastructure.persistence.model;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * AgentRunEventRecord —— agent_run_events 表的数据模型
 *
 * 与 AgentRunRecord 一样，使用 Lombok 注解自动生成样板代码。
 * @Data = getter + setter + toString + equals + hashCode
 * @NoArgsConstructor = 无参构造方法（MyBatis 需要）
 * @AllArgsConstructor = 全参构造方法（方便代码中创建对象）
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AgentRunEventRecord {

    /** 数据库自增主键 */
    private Long id;

    /** 关联的运行 ID（对应 agent_runs 表的 run_id 列） */
    private String runId;

    /** 事件序号，同一个 runId 下从 1 开始递增，保证事件的先后顺序 */
    private Long sequenceNo;

    /**
     * 事件类型标识，如：
     * - "run_queued"：任务入队
     * - "run_started"：任务开始执行
     * - "resource_found"：发现一个资源
     * - "step_started"：某个计划步骤开始
     * - "file_written"：报告文件已写入
     * - "run_completed"：任务执行完成
     * - "run_failed"：任务执行失败
     */
    private String eventType;

    /**
     * 事件的详细数据，以 JSON 字符串形式存储。
     * 不同 eventType 对应不同的 JSON 结构。
     * 例如 "run_started" 的 payload 包含 task、model、input 等信息。
     */
    private String payloadJson;

    /** 事件创建时间 */
    private LocalDateTime createdAt;
}
