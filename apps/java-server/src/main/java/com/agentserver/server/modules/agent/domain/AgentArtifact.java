/**
 * Agent 输出产物（领域层值对象）
 *
 * 当 Agent 运行完成后，系统会将分析结果写入磁盘文件（如 Markdown 报告、JSON 数据等）。
 * 每个写出的文件被称为一个"产物"（Artifact）。本 record 记录了产物的元数据信息，
 * 包括文件名、路径、大小和类型，会通过 "file_written" 事件通知前端。
 */
package com.agentserver.server.modules.agent.domain;

/**
 * AgentArtifact —— 一个输出产物（文件）的元数据
 *
 * @param name 文件名（如 "report.md"）
 * @param path 文件的绝对路径（如 "/output/run-abc123/report.md"）
 * @param size 文件大小，单位为字节（byte）
 * @param kind 文件类型标识（如 "markdown"、"json"），用于前端判断如何展示
 */
public record AgentArtifact(
    String name,
    String path,
    long size,
    String kind
) {
}
