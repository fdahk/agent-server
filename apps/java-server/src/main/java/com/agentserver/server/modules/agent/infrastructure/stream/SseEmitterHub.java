/**
 * SSE 推送中心（infrastructure 层）
 *
 * SSE（Server-Sent Events）是一种 HTTP 长连接技术，允许服务端持续向客户端推送数据。
 * 本类是 SSE 连接的管理中心，负责：
 * - 创建新的 SSE 连接并补发历史事件
 * - 向某个 runId 的所有 SSE 连接广播新事件
 * - 自动清理断开的连接
 *
 * 【使用场景】
 * 前端通过 GET /api/agent/runs/{runId}/stream 建立 SSE 连接后，
 * 后端每产生一个新事件（如资源发现、步骤完成等），都会通过本类实时推送给前端，
 * 使用户能看到 Agent 任务的实时执行进度。
 */
package com.agentserver.server.modules.agent.infrastructure.stream;

import com.agentserver.server.modules.agent.interfaces.http.dto.RunEventResponse;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * SseEmitterHub —— SSE 连接管理中心
 *
 * @Component 是 Spring 的注解，与 @Service 类似，
 * 都是将类注册为 Spring 容器管理的 Bean。区别是语义上 @Component 更通用，
 * @Service 表示"业务服务"。本类是基础设施组件，用 @Component 更合适。
 */
@Component
public class SseEmitterHub {

    /**
     * 存储所有活跃的 SSE 连接：key 是 runId，value 是该 runId 的所有连接列表。
     *
     * ConcurrentHashMap 是线程安全的 HashMap。因为多个线程可能同时
     * 创建连接、发送事件、清理连接，普通 HashMap 在多线程环境下不安全会导致数据错乱。
     *
     * CopyOnWriteArrayList 是线程安全的 ArrayList。每次修改（添加/删除）时
     * 会复制整个数组，读取时不加锁。适合"读多写少"的场景——SSE 连接不会频繁创建/销毁，
     * 但事件推送（读取列表并发送）会非常频繁。
     */
    private final Map<String, CopyOnWriteArrayList<SseEmitter>> emittersByRunId = new ConcurrentHashMap<>();

    /**
     * 为指定的 runId 创建一个新的 SSE 连接，并补发历史事件。
     *
     * 【业务流程】
     * 1. 创建 SseEmitter 实例（超时时间设为 0，表示永不超时）
     * 2. 将该连接注册到 runId 对应的连接列表中
     * 3. 设置连接关闭/超时/错误时的自动清理回调
     * 4. 将历史事件逐条发送给这个新连接（确保客户端不会遗漏之前的事件）
     *
     * SseEmitter 是 Spring 提供的 SSE 实现类。
     * new SseEmitter(0L) 中的 0L 表示超时时间为 0（即不超时，连接会一直保持直到显式关闭）。
     *
     * @param runId   运行唯一标识
     * @param history 该运行已有的历史事件列表
     * @return 新创建的 SseEmitter 实例
     * @throws IOException 如果发送历史事件时出错
     */
    public SseEmitter create(String runId, List<RunEventResponse> history) throws IOException {
        SseEmitter emitter = new SseEmitter(0L);
        emittersByRunId.computeIfAbsent(runId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);

        emitter.onCompletion(() -> remove(runId, emitter));
        emitter.onTimeout(() -> remove(runId, emitter));
        emitter.onError(ignored -> remove(runId, emitter));

        for (RunEventResponse event : history) {
            emitter.send(SseEmitter.event().name(event.type()).data(event));
        }

        return emitter;
    }

    /**
     * 向指定 runId 的所有 SSE 连接广播一个新事件。
     *
     * 【业务含义】每当有新事件产生（如 AI 发现了一个资源、完成了一个步骤），
     * 调用此方法将事件实时推送给所有正在监听这个 runId 的前端客户端。
     *
     * 如果某个连接发送失败（客户端已断开），会自动将其从列表中移除。
     *
     * @param runId 运行唯一标识
     * @param event 要推送的事件
     */
    public void publish(String runId, RunEventResponse event) {
        List<SseEmitter> emitters = emittersByRunId.get(runId);
        if (emitters == null) {
            return;
        }

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name(event.type()).data(event));
            } catch (IOException exception) {
                remove(runId, emitter);
            }
        }
    }

    /**
     * 从连接列表中移除指定的 SSE 连接。
     * 如果移除后该 runId 已没有任何连接，则从 Map 中彻底删除该 key，释放内存。
     *
     * @param runId   运行唯一标识
     * @param emitter 要移除的 SSE 连接实例
     */
    private void remove(String runId, SseEmitter emitter) {
        List<SseEmitter> emitters = emittersByRunId.get(runId);
        if (emitters == null) {
            return;
        }
        emitters.remove(emitter);
        if (emitters.isEmpty()) {
            emittersByRunId.remove(runId);
        }
    }
}
