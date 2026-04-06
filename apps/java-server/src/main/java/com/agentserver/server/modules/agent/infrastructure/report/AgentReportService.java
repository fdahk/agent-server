/**
 * Agent 报告生成服务（infrastructure 层）
 *
 * 当 Agent 任务执行完成后，本服务负责将分析结果落盘为文件（产物/Artifact），包括：
 * - report.md —— 人类可读的 Markdown 格式报告
 * - report.json —— 结构化的 JSON 格式报告（便于程序化消费）
 * - sources.json —— 资源摘要的独立 JSON 文件
 *
 * 所有文件会写入到配置指定的 outputRoot 目录下，以 runId 为子目录进行隔离。
 * 例如：/output/run-abc123/report.md
 */
package com.agentserver.server.modules.agent.infrastructure.report;

import com.agentserver.server.config.AgentRuntimeProperties;
import com.agentserver.server.modules.agent.domain.AgentArtifact;
import com.agentserver.server.modules.agent.domain.AgentMemory;
import com.agentserver.server.modules.agent.domain.AgentPlanStep;
import com.agentserver.server.modules.agent.domain.ResourceSummary;
import com.agentserver.server.modules.agent.interfaces.http.dto.RunCreationResult;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * AgentReportService —— 报告文件生成服务
 *
 * @Service 注解将此类注册为 Spring 容器管理的服务 Bean。
 */
@Service
public class AgentReportService {

    /**
     * Agent 运行时配置（如输出目录路径 outputRoot 等）。
     * 通过 Spring 的配置绑定机制从 application.yml 读取。
     */
    private final AgentRuntimeProperties agentRuntimeProperties;

    /** Jackson ObjectMapper：将 Java 对象序列化为 JSON 字符串 */
    private final ObjectMapper objectMapper;

    /**
     * 构造方法 —— 通过 Spring 依赖注入获取配置和工具。
     */
    public AgentReportService(
        AgentRuntimeProperties agentRuntimeProperties,
        ObjectMapper objectMapper
    ) {
        this.agentRuntimeProperties = agentRuntimeProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 将执行结果写成文件产物（Artifact）。
     *
     * 【业务流程】
     * 1. 根据配置的 outputRoot 和 runId 创建输出目录
     * 2. 生成 Markdown 报告并写入 report.md
     * 3. 生成 JSON 报告并写入 report.json
     * 4. 将资源摘要单独写入 sources.json
     * 5. 为每个文件创建 AgentArtifact 元数据对象返回
     *
     * @param request     运行创建参数（包含任务描述、输入来源等）
     * @param model       实际使用的 AI 模型名称
     * @param plan        AI 执行计划步骤列表
     * @param memory      AI 执行记忆
     * @param resources   资源摘要列表
     * @param finalAnswer AI 最终输出文本
     * @param startedAt   执行开始时间
     * @param completedAt 执行完成时间
     * @return 生成的文件产物列表（包含文件名、路径、大小、类型）
     */
    public List<AgentArtifact> writeArtifacts(
        RunCreationResult request,
        String model,
        List<AgentPlanStep> plan,
        AgentMemory memory,
        List<ResourceSummary> resources,
        String finalAnswer,
        String startedAt,
        String completedAt
    ) {
        Path outputRoot = Path.of(agentRuntimeProperties.outputRoot()).toAbsolutePath().normalize();
        Path runDirectory = outputRoot.resolve(request.runId());

        try {
            Files.createDirectories(runDirectory);

            Path markdownPath = runDirectory.resolve("report.md");
            Path reportJsonPath = runDirectory.resolve("report.json");
            Path sourcesJsonPath = runDirectory.resolve("sources.json");

            Files.writeString(markdownPath, buildMarkdown(request, model, plan, memory, resources, finalAnswer, startedAt, completedAt), StandardCharsets.UTF_8);
            Files.writeString(reportJsonPath, buildReportJson(request, model, plan, memory, resources, finalAnswer, startedAt, completedAt), StandardCharsets.UTF_8);
            Files.writeString(sourcesJsonPath, toJson(resources), StandardCharsets.UTF_8);

            List<AgentArtifact> artifacts = new ArrayList<>();
            artifacts.add(buildArtifact(markdownPath, "markdown"));
            artifacts.add(buildArtifact(reportJsonPath, "json"));
            artifacts.add(buildArtifact(sourcesJsonPath, "json"));
            return artifacts;
        } catch (IOException exception) {
            throw new IllegalStateException("报告文件写入失败", exception);
        }
    }

    /**
     * 根据文件路径构建 AgentArtifact 元数据。
     *
     * @param path 文件路径
     * @param kind 文件类型标识
     * @return 产物元数据对象
     */
    private AgentArtifact buildArtifact(Path path, String kind) throws IOException {
        return new AgentArtifact(
            path.getFileName().toString(),
            path.toAbsolutePath().normalize().toString(),
            Files.size(path),
            kind
        );
    }

    /**
     * 构建 JSON 格式的报告内容。
     * 使用 LinkedHashMap 保证 JSON 字段的输出顺序与插入顺序一致。
     */
    private String buildReportJson(
        RunCreationResult request,
        String model,
        List<AgentPlanStep> plan,
        AgentMemory memory,
        List<ResourceSummary> resources,
        String finalAnswer,
        String startedAt,
        String completedAt
    ) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("runId", request.runId());
        root.put("task", request.task());
        root.put("model", model);
        root.put("plan", plan);
        root.put("memory", memory);
        root.put("resources", resources);
        root.put("finalAnswer", finalAnswer);
        root.put("input", Map.of(
            "directories", request.directories(),
            "urls", request.urls()
        ));
        root.put("startedAt", startedAt);
        root.put("completedAt", completedAt);
        return toJson(root);
    }

    /**
     * 构建 Markdown 格式的报告内容。
     * 包含任务说明、输入信息、执行计划、核心洞察、聚类视角、资源摘要、最终结果和运行时间。
     */
    private String buildMarkdown(
        RunCreationResult request,
        String model,
        List<AgentPlanStep> plan,
        AgentMemory memory,
        List<ResourceSummary> resources,
        String finalAnswer,
        String startedAt,
        String completedAt
    ) {
        String planLines = plan.stream()
            .map(step -> (plan.indexOf(step) + 1) + ". " + step.title() + " - " + step.detail())
            .reduce((left, right) -> left + "\n" + right)
            .orElse("无");

        String insightLines = memory.keyInsights().isEmpty()
            ? "- 无"
            : String.join("\n", memory.keyInsights().stream().map(item -> "- " + item).toList());

        String clusterLines = memory.clusters().isEmpty()
            ? "- 无"
            : String.join(
                "\n",
                memory.clusters().stream()
                    .map(cluster -> "- " + cluster.name() + ": " + cluster.takeaway() + "（来源：" + String.join("、", cluster.sourceIds()) + "）")
                    .toList()
            );

        String resourceLines = resources.isEmpty()
            ? "无"
            : String.join(
                "\n\n",
                resources.stream()
                    .map(resource -> "### " + resource.title() + "\n"
                        + "- 来源：" + resource.source() + "\n"
                        + "- 分类：" + resource.category() + "\n"
                        + "- 标签：" + String.join("、", resource.tags()) + "\n"
                        + "- 摘要：" + resource.summary() + "\n"
                        + "- 相关性：" + resource.relevance())
                    .toList()
            );

        return String.join(
            "\n",
            "# 资源整理报告",
            "",
            "## 任务",
            request.task(),
            "",
            "## 输入",
            "- 目录：" + (request.directories().isEmpty() ? "无" : String.join("、", request.directories())),
            "- URL：" + (request.urls().isEmpty() ? "无" : String.join("、", request.urls())),
            "- 模型：" + model,
            "",
            "## 执行计划",
            planLines,
            "",
            "## 核心洞察",
            insightLines,
            "",
            "## 聚类视角",
            clusterLines,
            "",
            "## 资源摘要",
            resourceLines,
            "",
            "## 最终整理结果",
            finalAnswer,
            "",
            "## 运行时间",
            "- 开始：" + startedAt,
            "- 结束：" + completedAt,
            ""
        );
    }

    /**
     * 将 Java 对象序列化为格式化的（pretty-printed）JSON 字符串。
     */
    private String toJson(Object value) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("JSON 序列化失败", exception);
        }
    }
}
