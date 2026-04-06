-- ==========================================================================
-- V1__init_schema.sql — 数据库初始化脚本（Flyway 第一个版本）
-- ==========================================================================
--
-- 【Flyway 命名规则】
--     V{版本号}__{描述}.sql    （注意：两个下划线 __ 是必需的）
--     V1 = 第一个版本，V2 = 第二个版本 ... 依次递增
--     Flyway 会记录已执行过的版本号，不会重复执行。
--
-- 【执行时机】
--     Spring Boot 启动时，Flyway 会自动扫描 classpath:db/migration 下的 SQL 文件，
--     比较版本号，把尚未执行的脚本按顺序执行。
--
-- 【本文件作用】
--     创建项目初始的三张核心表：用户表、Agent 运行表、Agent 事件表。
-- ==========================================================================

-- ====================
-- 1. 用户表（users）
-- ====================
-- 存储系统所有注册用户的基本信息
-- 用户通过用户名 + 密码登录，登录成功后服务端签发 JWT Token
CREATE TABLE users (
    -- BIGINT：8 字节整数，可存储非常大的数字，适合做主键
    -- PRIMARY KEY：主键约束，值唯一且不允许为 NULL
    -- AUTO_INCREMENT：每次插入新行时自动递增（1, 2, 3, ...）
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    -- VARCHAR(64)：最多存储 64 个字符的可变长度字符串
    -- NOT NULL：不允许为空，插入时必须提供值
    username VARCHAR(64) NOT NULL,

    -- 存储的是密码的哈希值（不是明文！）
    -- 即使数据库泄露，攻击者也无法直接看到用户密码
    -- {noop} 前缀表示"无加密"，仅用于开发环境的种子数据
    password_hash VARCHAR(255) NOT NULL,

    -- 显示名称（用于页面展示，如 "Admin User"）
    display_name VARCHAR(128) NOT NULL,

    -- 角色代码（如 ADMIN、USER），用于权限控制
    -- Spring Security 中 hasRole('ADMIN') 就是检查这个字段
    role_code VARCHAR(32) NOT NULL,

    -- TIMESTAMP：日期时间类型，精确到秒
    -- DEFAULT CURRENT_TIMESTAMP：插入时如果不指定，自动填入当前时间
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- UNIQUE INDEX：唯一索引——保证 username 列在整张表中没有重复值
-- 同时也加速了 WHERE username = ? 的查询（因为索引就像一本书的目录）
CREATE UNIQUE INDEX uk_users_username ON users (username);


-- ====================
-- 2. Agent 运行表（agent_runs）
-- ====================
-- 每次用户发起一个 Agent 任务，就会在这张表里插入一条记录
-- 记录整个运行的生命周期：创建 → 执行中 → 完成/失败
CREATE TABLE agent_runs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    -- run_id：运行的唯一业务标识（UUID 格式），用于 API 传输和事件关联
    -- 区别于 id（数据库自增主键）：run_id 是业务层面的标识，可以安全地暴露给前端
    run_id VARCHAR(64) NOT NULL,

    -- 发起此次运行的用户 ID，关联到 users 表
    user_id BIGINT NOT NULL,

    -- 用户下达的任务描述，如 "整理这些文档并生成报告"
    task VARCHAR(255) NOT NULL,

    -- 用户指定的目录列表和 URL 列表
    -- TEXT 类型可存储最多约 65,000 个字符（比 VARCHAR 更大）
    -- 存储格式为 JSON 数组字符串，如 '["D:/docs", "D:/notes"]'
    directories_json TEXT NOT NULL,
    urls_json TEXT NOT NULL,

    -- 实际使用的 AI 模型名称（可能与用户请求不同，因为有默认值逻辑）
    model_name VARCHAR(128),

    -- 运行状态：PENDING（等待中）/ RUNNING（执行中）/ COMPLETED（完成）/ FAILED（失败）
    status VARCHAR(32) NOT NULL,

    -- 当前进度信息，用于前端展示（如 "正在采集资源..."）
    progress_message VARCHAR(255),

    -- NULL 表示尚未开始/完成，有值表示已到达该阶段
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- FOREIGN KEY（外键约束）：确保 user_id 必须是 users 表中已存在的 id
    -- 如果试图插入一个不存在的 user_id，数据库会报错——这就是"引用完整性"
    CONSTRAINT fk_agent_runs_user_id FOREIGN KEY (user_id) REFERENCES users (id)
);

-- run_id 唯一索引：保证同一个 run_id 不会被重复创建
CREATE UNIQUE INDEX uk_agent_runs_run_id ON agent_runs (run_id);
-- 联合索引 (user_id, created_at)：加速"查某个用户的运行记录并按时间排序"的查询
CREATE INDEX idx_agent_runs_user_id_created_at ON agent_runs (user_id, created_at);


-- ====================
-- 3. Agent 运行事件表（agent_run_events）
-- ====================
-- 每个 Agent 运行过程中会产生多个事件（如计划就绪、步骤开始、资源采集完成等）
-- 这些事件被逐条持久化到这张表，用于：
--   1. SSE 实时推送给前端（推送后丢弃内存数据，数据库保底）
--   2. 前端断线重连后可以从数据库回放历史事件
--   3. 运行结束后的审计追溯
CREATE TABLE agent_run_events (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    -- 关联到 agent_runs 表的 run_id（而不是自增 id）
    run_id VARCHAR(64) NOT NULL,

    -- 事件序号：同一个 run 中的事件按 1, 2, 3 ... 递增
    -- 前端可以告诉后端"我已经收到到序号 5 了"，后端就从 6 开始回放
    sequence_no BIGINT NOT NULL,

    -- 事件类型，如 plan_ready、step_started、resource_collected 等
    event_type VARCHAR(64) NOT NULL,

    -- 事件的 JSON 载荷数据，不同类型的事件有不同的字段
    payload_json TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 外键：保证 run_id 必须在 agent_runs 表中存在
    CONSTRAINT fk_agent_run_events_run_id FOREIGN KEY (run_id) REFERENCES agent_runs (run_id)
);

-- 联合唯一索引：同一个 run 中 sequence_no 不能重复
CREATE UNIQUE INDEX uk_agent_run_events_run_seq ON agent_run_events (run_id, sequence_no);
-- 普通索引：加速 WHERE run_id = ? 的查询
CREATE INDEX idx_agent_run_events_run_id ON agent_run_events (run_id);


-- ====================
-- 4. 种子数据（初始管理员账号）
-- ====================
-- 插入一个默认管理员用户，方便本地开发和测试
-- {noop} 是 Spring Security 的密码编码标记，表示"明文存储，不做哈希"
-- ⚠️ 生产环境绝对不能用 {noop}，必须用 bcrypt 等哈希算法！
INSERT INTO users (username, password_hash, display_name, role_code)
VALUES ('admin', '{noop}admin123456', 'Admin User', 'ADMIN');
