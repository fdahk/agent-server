/**
 * Agent 运行管理应用服务（application 层）
 *
 * 这是 Agent 模块最核心的应用服务之一，负责 Agent 运行（Run）的完整生命周期管理：
 * - 创建运行记录（createRun）
 * - 查询运行快照（getRunSnapshot）
 * - 建立 SSE 实时推流（stream）
 * - 更新运行状态（markRunning / markCompleted / markFailed）
 * - 追加运行事件（appendEvent）
 *
 * 在 DDD 分层架构中，application 层（应用层）是"编排者"的角色——它不包含核心业务规则，
 * 而是协调领域对象、基础设施服务（数据库、SSE）来完成一个完整的业务用例。
 */
package com.agentserver.server.modules.agent.application;

import com.agentserver.server.modules.agent.infrastructure.persistence.mapper.AgentRunEventMapper;
import com.agentserver.server.modules.agent.infrastructure.persistence.mapper.AgentRunMapper;
import com.agentserver.server.modules.agent.infrastructure.persistence.model.AgentRunEventRecord;
import com.agentserver.server.modules.agent.infrastructure.persistence.model.AgentRunRecord;
import com.agentserver.server.modules.agent.domain.AgentRunStatus;
import com.agentserver.server.modules.agent.infrastructure.stream.SseEmitterHub;
import com.agentserver.server.modules.agent.interfaces.http.dto.CreateRunRequest;
import com.agentserver.server.modules.agent.interfaces.http.dto.RunCreationResult;
import com.agentserver.server.modules.agent.interfaces.http.dto.RunEventResponse;
import com.agentserver.server.modules.agent.interfaces.http.dto.RunSnapshotResponse;
import com.agentserver.server.modules.auth.infrastructure.persistence.mapper.AuthUserMapper;
import com.agentserver.server.modules.auth.infrastructure.persistence.model.AuthUser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * AgentRunApplicationService —— Agent 运行管理应用服务
 *
 * @Service 是 Spring 框架的注解，作用是告诉 Spring："这个类是一个服务组件，
 * 请帮我自动创建它的实例并纳入管理"。这样其他类就可以通过构造方法注入的方式自动获取它的实例，
 * 而不需要手动 new。这就是 Spring 的"依赖注入"（DI）机制。
 */
@Service
public class AgentRunApplicationService {

    /** MyBatis Mapper：负责 agent_runs 表的数据库操作（增删改查） */
    private final AgentRunMapper agentRunMapper;

    /** MyBatis Mapper：负责 agent_run_events 表的数据库操作 */
    private final AgentRunEventMapper agentRunEventMapper;

    /** MyBatis Mapper：负责查询用户信息（来自 auth 模块） */
    private final AuthUserMapper authUserMapper;

    /**
     * Jackson 的 ObjectMapper：JSON 序列化/反序列化的核心工具。
     * ObjectMapper 是 Jackson 库提供的类，可以将 Java 对象转为 JSON 字符串，
     * 也可以将 JSON 字符串转回 Java 对象。Spring Boot 会自动创建并配置一个全局的 ObjectMapper 实例。
     */
    private final ObjectMapper objectMapper;

    /** SSE 推送中心：负责向前端客户端实时推送事件 */
    private final SseEmitterHub sseEmitterHub;

    /**
     * 构造方法 —— 通过 Spring 的"构造方法注入"自动获取所有依赖。
     *
     * Spring 在启动时发现这个类标记了 @Service，就会自动创建它的实例。
     * 在创建时，Spring 会检查构造方法的参数类型，自动从容器中找到对应类型的 Bean（实例）并传入。
     * 这就是"依赖注入"——你不需要手动 new 这些依赖，Spring 帮你组装好了。
     */
    public AgentRunApplicationService(
        AgentRunMapper agentRunMapper,
        AgentRunEventMapper agentRunEventMapper,
        AuthUserMapper authUserMapper,
        ObjectMapper objectMapper,
        SseEmitterHub sseEmitterHub
    ) {
        this.agentRunMapper = agentRunMapper;
        this.agentRunEventMapper = agentRunEventMapper;
        this.authUserMapper = authUserMapper;
        this.objectMapper = objectMapper;
        this.sseEmitterHub = sseEmitterHub;
    }

    /**
     * 创建一次新的 Agent 运行。
     *
     * 【业务流程】
     * 1. 校验和清洗用户输入（任务描述、目录、URL、模型名）
     * 2. 检查用户是否存在
     * 3. 生成唯一的 runId
     * 4. 将运行记录写入 agent_runs 表（状态为 QUEUED）
     * 5. 追加一条 "run_queued" 事件
     * 6. 返回创建结果，后续由异步处理器触发实际执行
     *
     * @param username 当前登录用户名（来自认证信息）
     * @param request  前端传来的创建请求 DTO
     * @return RunCreationResult 包含 runId 等信息，用于启动异步执行
     */
    public RunCreationResult createRun(String username, CreateRunRequest request) {
        String task = request.task().trim();
        List<String> directories = normalizeList(request.directories());
        List<String> urls = normalizeList(request.urls());
        String model = request.model() == null ? null : request.model().trim();
        String resolvedUsername = (username == null || username.isBlank()) ? "admin" : username;

        if (directories.isEmpty() && urls.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "至少需要提供一个目录或一个 URL");
        }

        AuthUser user = authUserMapper.findByUsername(resolvedUsername);
        if (user == null) {
            throw new ResponseStatusException(NOT_FOUND, "当前用户不存在");
        }

        String runId = "run-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        LocalDateTime now = LocalDateTime.now();
        AgentRunRecord record = new AgentRunRecord(
            null,
            runId,
            user.getId(),
            task,
            toJson(directories),
            toJson(urls),
            model,
            AgentRunStatus.QUEUED.value(),
            "任务已创建，等待执行",
            null,
            null,
            now,
            now
        );
        agentRunMapper.insert(record);
        appendEvent(runId, "run_queued", Map.of(
            "task", task,
            "directories", directories,
            "urls", urls,
            "model", model == null ? "default" : model
        ));

        return new RunCreationResult(runId, task, directories, urls, model);
    }

    /**
     * 获取某次运行的快照信息（当前状态 + 全部事件 + 最终结果）。
     *
     * 【业务含义】前端通过 GET /api/agent/runs/{runId} 调用此方法，
     * 获取运行的完整信息——即使 SSE 连接中断，也可以通过此接口恢复状态。
     *
     * @param runId 运行唯一标识
     * @return 运行快照，包含状态、事件列表和完成结果
     */
    public RunSnapshotResponse getRunSnapshot(String runId) {
        AgentRunRecord runRecord = requireRun(runId);
        List<RunEventResponse> events = getRunEvents(runId);
        return new RunSnapshotResponse(
            runRecord.getRunId(),
            runRecord.getStatus(),
            runRecord.getCreatedAt(),
            events,
            extractCompletedResult(events)
        );
    }

    /**
     * 创建 SSE（Server-Sent Events）实时推流连接。
     *
     * 【业务含义】前端通过 GET /api/agent/runs/{runId}/stream 建立 SSE 连接。
     * 连接建立后，会先收到之前的历史事件（补发），之后新事件会实时推送。
     *
     * SseEmitter 是 Spring 提供的 SSE 实现类。SSE 是一种 HTTP 长连接技术，
     *
     * @param runId 运行唯一标识
     * @return SseEmitter 实例，Spring 会自动管理这个长连接
     * @throws IOException 如果发送历史事件时出错
     */
    public SseEmitter stream(String runId) throws IOException {
        requireRun(runId);
        return sseEmitterHub.create(runId, getRunEvents(runId));
    }

    /**
     * 将运行状态更新为 RUNNING（执行中）
     *
     * @param runId           运行唯一标识
     * @param progressMessage 当前进度描述（如"任务已开始执行"）
     */
    public void markRunning(String runId, String progressMessage) {
        LocalDateTime now = LocalDateTime.now();
        updateStatus(runId, AgentRunStatus.RUNNING, progressMessage, now, null, now);
    }

    /**
     * 将运行状态更新为 COMPLETED（已完成）。
     *
     * @param runId           运行唯一标识
     * @param progressMessage 完成时的描述（如"任务执行完成"）
     */
    public void markCompleted(String runId, String progressMessage) {
        LocalDateTime now = LocalDateTime.now();
        updateStatus(runId, AgentRunStatus.COMPLETED, progressMessage, null, now, now);
    }

    /**
     * 将运行状态更新为 FAILED（已失败）。
     *
     * @param runId           运行唯一标识
     * @param progressMessage 失败原因描述
     */
    public void markFailed(String runId, String progressMessage) {
        LocalDateTime now = LocalDateTime.now();
        updateStatus(runId, AgentRunStatus.FAILED, progressMessage, null, now, now);
    }

    /**
     * 追加一条事件到指定的运行中。
     *
     * 【业务流程】
     * 1. 确认运行存在
     * 2. 计算下一个事件序号（sequence）
     * 3. 将事件记录写入 agent_run_events 表
     * 4. 通过 SSE 实时推送给前端
     *
     * @param runId     运行唯一标识
     * @param eventType 事件类型（如 "run_queued"、"run_started"、"run_completed"、"file_written" 等）
     * @param payload   事件的数据内容（会被序列化为 JSON）
     * @return 构建好的事件响应对象
     */
    public RunEventResponse appendEvent(String runId, String eventType, Object payload) {
        requireRun(runId);
        long sequence = agentRunEventMapper.findMaxSequence(runId) + 1;
        AgentRunEventRecord record = new AgentRunEventRecord(
            null,
            runId,
            sequence,
            eventType,
            toJson(payload),
            LocalDateTime.now()
        );
        agentRunEventMapper.insert(record);
        RunEventResponse response = new RunEventResponse(
            record.getEventType(),
            runId,
            toJsonNode(payload)
        );
        sseEmitterHub.publish(runId, response);
        return response;
    }

    /**
     * 内部方法：更新运行状态到数据库。
     * 如果传入的 startedAt/completedAt 为 null，则保留数据库中原有的值。
     */
    private void updateStatus(
        String runId,
        AgentRunStatus status,
        String progressMessage,
        LocalDateTime startedAt,
        LocalDateTime completedAt,
        LocalDateTime updatedAt
    ) {
        AgentRunRecord current = requireRun(runId);
        agentRunMapper.updateStatus(
            runId,
            status.value(),
            progressMessage,
            startedAt == null ? current.getStartedAt() : startedAt,
            completedAt == null ? current.getCompletedAt() : completedAt,
            updatedAt
        );
    }

    /**
     * 内部方法：根据 runId 查找运行记录，如果不存在则抛出 404 异常。
     * "require" 前缀表示"必须存在"，找不到就直接报错。
     */
    private AgentRunRecord requireRun(String runId) {
        AgentRunRecord runRecord = agentRunMapper.findByRunId(runId);
        if (runRecord == null) {
            throw new ResponseStatusException(NOT_FOUND, "任务不存在");
        }
        return runRecord;
    }

    /**
     * 内部方法：从数据库加载指定运行的所有事件，并转换为 DTO 列表。
     */
    private List<RunEventResponse> getRunEvents(String runId) {
        return agentRunEventMapper.findByRunId(runId)
            .stream()
            .map(event -> new RunEventResponse(
                event.getEventType(),
                event.getRunId(),
                readJsonNode(event.getPayloadJson())
            ))
            .toList();
    }

    /**
     * 内部方法：从事件列表中倒序查找 "run_completed" 事件，提取其 payload 作为最终结果。
     * 如果运行尚未完成，返回 null。
     */
    private JsonNode extractCompletedResult(List<RunEventResponse> events) {
        for (int index = events.size() - 1; index >= 0; index--) {
            RunEventResponse event = events.get(index);
            if ("run_completed".equals(event.type())) {
                return event.payload();
            }
        }
        return null;
    }

    /**
     * 内部方法：清洗字符串列表——过滤掉 null 和空白值，并去除首尾空格。
     */
    private List<String> normalizeList(List<String> values) {
        if (values == null) {
            return Collections.emptyList();
        }
        return values.stream()
            .filter(value -> value != null && !value.isBlank())
            .map(String::trim)
            .toList();
    }

    /**
     * 内部方法：将任意 Java 对象序列化为 JSON 字符串。
     */
    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("JSON 序列化失败", exception);
        }
    }

    /**
     * 内部方法：将任意 Java 对象转换为 Jackson 的 JsonNode 树形结构。
     */
    private JsonNode toJsonNode(Object value) {
        return objectMapper.valueToTree(value);
    }

    /**
     * 内部方法：将 JSON 字符串解析为 JsonNode 对象。
     */
    private JsonNode readJsonNode(String rawJson) {
        try {
            return objectMapper.readTree(rawJson);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("JSON 反序列化失败", exception);
        }
    }
}
