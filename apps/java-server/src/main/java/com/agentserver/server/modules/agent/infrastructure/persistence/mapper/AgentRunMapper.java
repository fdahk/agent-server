/**
 * Agent 运行记录的数据库 Mapper（infrastructure 层 - 持久化）
 *
 * 本接口定义了 agent_runs 数据表的增删改查操作。
 * 在项目中使用 MyBatis 作为 ORM（对象关系映射）框架，通过注解方式直接在接口方法上编写 SQL。
 *
 * 【MyBatis 工作原理】
 * 你只需定义接口和 SQL，MyBatis 会在运行时自动生成接口的实现类。
 * 当你调用 findByRunId("run-abc") 时，MyBatis 会执行对应的 SQL，
 * 将查询结果自动映射到 AgentRunRecord 对象的字段中（通过列名与字段名的驼峰匹配）。
 */
package com.agentserver.server.modules.agent.infrastructure.persistence.mapper;

import com.agentserver.server.modules.agent.infrastructure.persistence.model.AgentRunRecord;
import java.time.LocalDateTime;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * AgentRunMapper —— agent_runs 表的数据访问接口
 *
 * @Mapper 是 MyBatis 的注解，告诉 MyBatis 框架：
 * "请为这个接口自动生成实现类，并注册到 Spring 容器中"。
 * 这样你可以像普通 Spring Bean 一样通过依赖注入使用它，无需手动实现接口。
 *
 * 通常情况下你需要写一个类来 implements 这个接口，但 MyBatis 的 @Mapper 会帮你自动生成。
 */
@Mapper
public interface AgentRunMapper {

    /**
     * 插入一条新的运行记录到 agent_runs 表。
     *
     * @Insert 注解中写的是 SQL INSERT 语句。
     * #{runId} 是 MyBatis 的参数占位符，会自动从 record 对象中取出 runId 字段的值填入。
     * 三引号（"""..."""）是 Java 的文本块语法（Java 15+），方便编写多行字符串。
     *
     * @Options(useGeneratedKeys = true, keyProperty = "id") 表示：
     * 插入完成后，数据库自动生成的主键（id）会被自动回填到 record 对象的 id 字段中。
     *
     * @param record 要插入的运行记录对象
     * @return 受影响的行数（通常为 1）
     */
    @Insert("""
        INSERT INTO agent_runs (
            run_id,
            user_id,
            task,
            directories_json,
            urls_json,
            model_name,
            status,
            progress_message,
            created_at,
            updated_at
        ) VALUES (
            #{runId},
            #{userId},
            #{task},
            #{directoriesJson},
            #{urlsJson},
            #{modelName},
            #{status},
            #{progressMessage},
            #{createdAt},
            #{updatedAt}
        )
        """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(AgentRunRecord record);

    /**
     * 根据 runId 查询一条运行记录。
     *
     * @Select 注解中写的是 SQL SELECT 语句。
     * MyBatis 会将查询结果的每一列自动映射到 AgentRunRecord 对象的对应字段。
     * 例如数据库列 run_id 会映射到 Java 字段 runId（MyBatis 默认开启驼峰命名转换）。
     *
     * @param runId 运行的唯一标识
     * @return 找到的运行记录，如果不存在则返回 null
     */
    @Select("""
        SELECT id,
               run_id,
               user_id,
               task,
               directories_json,
               urls_json,
               model_name,
               status,
               progress_message,
               started_at,
               completed_at,
               created_at,
               updated_at
        FROM agent_runs
        WHERE run_id = #{runId}
        """)
    AgentRunRecord findByRunId(String runId);

    /**
     * 更新运行记录的状态和相关时间字段。
     *
     * @Update 注解中写的是 SQL UPDATE 语句。
     * @Param("runId") 注解用于给方法参数起一个名字，使 SQL 中可以用 #{runId} 引用它。
     * 当方法参数超过一个时，@Param 是必须的，否则 MyBatis 不知道 #{runId} 对应哪个参数。
     *
     * @param runId           运行的唯一标识（WHERE 条件）
     * @param status          新的状态值（如 "running"、"completed"、"failed"）
     * @param progressMessage 当前进度描述
     * @param startedAt       开始时间
     * @param completedAt     完成时间
     * @param updatedAt       最后更新时间
     * @return 受影响的行数
     */
    @Update("""
        UPDATE agent_runs
        SET status = #{status},
            progress_message = #{progressMessage},
            started_at = #{startedAt},
            completed_at = #{completedAt},
            updated_at = #{updatedAt}
        WHERE run_id = #{runId}
        """)
    int updateStatus(
        @Param("runId") String runId,
        @Param("status") String status,
        @Param("progressMessage") String progressMessage,
        @Param("startedAt") LocalDateTime startedAt,
        @Param("completedAt") LocalDateTime completedAt,
        @Param("updatedAt") LocalDateTime updatedAt
    );
}
