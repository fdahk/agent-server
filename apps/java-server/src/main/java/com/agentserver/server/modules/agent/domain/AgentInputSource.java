/**
 * Agent 输入来源（领域层值对象）
 *
 * 用户在创建一次 Agent 运行时，需要指定输入来源——即 AI 应该分析哪些内容。
 * 输入来源分为两类：本地目录（directories）和网络 URL（urls）。
 * 这个 record 将两类输入封装在一起，方便在系统中传递和序列化。
 */
package com.agentserver.server.modules.agent.domain;

import java.util.List;

/**
 * AgentInputSource —— Agent 任务的输入来源
 *
 * @param directories 本地目录路径列表（AI 会扫描这些目录中的文件进行分析）
 * @param urls        网络 URL 列表（AI 会抓取这些网页的内容进行分析）
 */
public record AgentInputSource(
    List<String> directories,
    List<String> urls
) {
}
