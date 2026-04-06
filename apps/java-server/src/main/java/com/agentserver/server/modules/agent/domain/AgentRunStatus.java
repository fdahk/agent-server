/**
 * Agent 运行状态枚举（领域层值对象）
 *
 * 定义了一次 Agent 运行（Run）在整个生命周期中可能经历的状态。
 * 状态流转顺序为：QUEUED（排队中）→ RUNNING（执行中）→ COMPLETED（已完成）或 FAILED（已失败）。
 * 这个枚举在整个系统中被广泛使用，用于数据库持久化、API 响应以及 SSE 事件推送。
 */
package com.agentserver.server.modules.agent.domain;

/**
 * AgentRunStatus —— Agent 运行状态枚举
 *
 * enum（枚举）是一种特殊的类，用于定义一组固定的常量值。
 * 与普通字符串相比，枚举类型是类型安全的——编译器会帮你检查是否使用了合法的值，
 * 避免拼写错误导致的 bug。
 *
 * 每个枚举值后面括号里的字符串（如 "queued"）是存入数据库和返回给前端的实际值，
 * 通过 value() 方法获取。
 */
public enum AgentRunStatus {

    /** 排队中：任务已创建，等待被执行 */
    QUEUED("queued"),

    /** 执行中：任务正在被 AI Gateway 处理 */
    RUNNING("running"),

    /** 已完成：任务执行成功 */
    COMPLETED("completed"),

    /** 已失败：任务执行过程中出现错误 */
    FAILED("failed");

    /**
     * 存储枚举对应的字符串值（小写形式），用于数据库存储和 API 输出。
     * final 表示这个字段一旦赋值后不能再修改。
     */
    private final String value;

    /**
     * 枚举的构造方法。
     * 枚举的构造方法是 private 的（即使不写 private 也是），
     * 只能在枚举内部使用，外部无法通过 new 创建枚举实例。
     *
     * @param value 枚举对应的字符串值
     */
    AgentRunStatus(String value) {
        this.value = value;
    }

    /**
     * 获取枚举对应的字符串值。
     * 例如 AgentRunStatus.QUEUED.value() 返回 "queued"。
     *
     * @return 枚举的字符串表示
     */
    public String value() {
        return value;
    }
}
