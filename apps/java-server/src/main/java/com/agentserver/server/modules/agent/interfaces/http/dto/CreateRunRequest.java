/**
 * 创建 Agent 运行的请求 DTO（interfaces 层）
 *
 * 当前端通过 POST /api/agent/runs 创建一次新运行时，请求体的 JSON 会被
 * Spring 自动反序列化为本 record 对象。
 *
 * 【什么是 DTO？】
 * DTO（Data Transfer Object，数据传输对象）是专门用于接口层的数据载体，
 * 定义了"前端能传什么字段"。它与领域层的 domain 对象是分离的，
 * 这样即使 API 格式变化也不会影响内部业务逻辑。
 */
package com.agentserver.server.modules.agent.interfaces.http.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

/**
 * CreateRunRequest —— 创建运行的请求体
 *
 * record 类型，自动生成所有字段的 getter 和构造方法。
 * Jackson 库会自动将请求体 JSON 反序列化为此 record（字段名与 JSON key 对应）。
 *
 * @param task        任务描述文本（必填）。
 *                    @NotBlank 是 Jakarta Bean Validation 的注解，
 *                    配合控制器方法上的 @Valid 使用。Spring 会在反序列化后自动验证：
 *                    如果 task 为 null 或空白字符串，会直接返回 400 错误，
 *                    错误信息为 message 属性中定义的"任务描述不能为空"。
 * @param directories 输入目录路径列表（选填，可以为 null）
 * @param urls        输入 URL 列表（选填，可以为 null）
 * @param model       指定使用的 AI 模型名称（选填，为 null 时使用默认模型）
 */
public record CreateRunRequest(
    @NotBlank(message = "任务描述不能为空")
    String task,
    List<String> directories,
    List<String> urls,
    String model
) {
}
