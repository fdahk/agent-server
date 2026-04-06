/**
 * Agent 运行事件记录的数据库 Mapper（infrastructure 层 - 持久化）
 *
 * 本接口定义了 agent_run_events 数据表的操作。
 * 每次 Agent 运行过程中会产生多条事件（如 run_queued、run_started、resource_found、
 * run_completed 等），所有事件都通过本 Mapper 持久化到数据库中，
 * 便于后续查询历史事件、恢复 SSE 流、以及审计追踪。
 */
package com.agentserver.server.modules.agent.infrastructure.persistence.mapper;

import com.agentserver.server.modules.agent.infrastructure.persistence.model.AgentRunEventRecord;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;

/**
 * AgentRunEventMapper —— agent_run_events 表的数据访问接口
 *
 * @Mapper 是 MyBatis 注解，MyBatis 会自动为该接口生成实现类。
 */
@Mapper
public interface AgentRunEventMapper {

    /**
     * 插入一条新的事件记录到 agent_run_events 表。
     *
     * @Options(useGeneratedKeys = true, keyProperty = "id")
     * 让数据库自动生成的主键 id 回填到 record 对象中。
     *
     * @param record 要插入的事件记录对象
     * @return 受影响的行数（通常为 1）
     */
    @Insert("""
        INSERT INTO agent_run_events (
            run_id,
            sequence_no,
            event_type,
            payload_json,
            created_at
        ) VALUES (
            #{runId},
            #{sequenceNo},
            #{eventType},
            #{payloadJson},
            #{createdAt}
        )
        """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(AgentRunEventRecord record);

    /**
     * 查询指定运行的所有事件记录，按序号升序排列。
     *
     * 【业务含义】事件有先后顺序，sequence_no 字段保证了事件的排列顺序。
     * 前端重新连接 SSE 时，需要通过此方法获取历史事件进行补发。
     *
     * @param runId 运行的唯一标识
     * @return 按序号升序排列的事件列表
     */
    @Select("""
        SELECT id,
               run_id,
               sequence_no,
               event_type,
               payload_json,
               created_at
        FROM agent_run_events
        WHERE run_id = #{runId}
        ORDER BY sequence_no ASC
        """)
    List<AgentRunEventRecord> findByRunId(String runId);

    /**
     * 查询指定运行的最大事件序号。
     *
     * 【业务含义】每次追加新事件时，需要知道当前最大序号是多少，
     * 然后在此基础上 +1 作为新事件的序号，保证事件顺序唯一递增。
     *
     * 【SQL 语法】COALESCE(MAX(sequence_no), 0) 表示：如果表中没有记录（MAX 返回 NULL），
     * 则返回 0，这样第一条事件的序号就是 0+1=1。
     *
     * @param runId 运行的唯一标识
     * @return 当前最大序号，如果没有事件则返回 0
     */
    @Select("""
        SELECT COALESCE(MAX(sequence_no), 0)
        FROM agent_run_events
        WHERE run_id = #{runId}
        """)
    long findMaxSequence(String runId);
}
