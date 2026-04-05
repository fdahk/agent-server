# Agent Server

**Polyglot Monorepo · Hybrid Backend Architecture**

采用**多语言混合架构（Polyglot Architecture）** 的 AI Agent 后端系统——Java 承担核心平台能力，Node.js 承担 AI 编排能力，同 Monorepo 中协同工作。

---

## Architecture Overview

```
                          ┌──────────────────────────────────────────┐
                          │             Client (Frontend)            │
                          └────────────────┬───────────────────────┘
                                           │ HTTP / SSE
                          ┌────────────────▼───────────────────────┐
                          │           Java Core (Port 3000)         │
                          │        Spring Boot · Spring Security    │
                          │                                         │
                          │  ┌─────────┐ ┌──────────┐ ┌─────────┐ │
                          │  │  Auth   │ │  Agent   │ │  SSE    │ │
                          │  │  JWT    │ │  Run FSM │ │  Hub    │ │
                          │  └─────────┘ └────┬─────┘ └─────────┘ │
                          │                    │                    │
                          │  ┌─────────────────▼────────────────┐  │
                          │  │      AgentAiGateway (Port)       │  │
                          │  └─────────────────┬────────────────┘  │
                          └────────────────────┼───────────────────┘
                                               │ HTTP POST (Internal)
                                               │ X-Internal-Token
                          ┌────────────────────▼───────────────────┐
                          │        Node AI Gateway (Port 3101)      │
                          │           NestJS · TypeScript            │
                          │                                         │
                          │  ┌──────────┐ ┌──────────┐ ┌────────┐ │
                          │  │  Ollama  │ │ Resource │ │  AI    │ │
                          │  │ Provider │ │ Collect  │ │ Orch.  │ │
                          │  └──────────┘ └──────────┘ └────────┘ │
                          └────────────────────────────────────────┘
```

### 架构

项目架构模式：

|------|------|-----------------|
| **多语言架构** | Polyglot Architecture | Java + Node.js 两种语言各取所长 |
| **Monorepo** | Monorepo | 多个服务在同一个 Git 仓库中管理 |
| **BFF 变体 / 内部网关** | Backend for Frontend / Internal Gateway | Node 作为 Java 的内部 AI 能力网关 |
| **端口-适配器架构** | Port-Adapter / Hexagonal Architecture | Java 通过 `AgentAiGateway` 接口（Port）解耦 AI 实现（Adapter） |
| **DDD-lite 分层** | Domain-Driven Design (Lightweight) | Java 模块内部采用 `interfaces → application → domain → infrastructure` 分层 |
| **有限状态机** | Finite State Machine (FSM) | Agent Run 的 `PENDING → RUNNING → COMPLETED/FAILED` 状态流转 |
| **事件溯源（轻量）** | Event Sourcing (Lightweight) | 所有 Agent 执行事件逐条持久化，支持回放与审计 |
| **Strangler Fig（已完成）** | Strangler Fig Pattern | 从原 Node.js 单体逐步迁移至 Java 主导的混合架构 |

---

## Tech Stack

### Java Core

| 类别 | 技术 | 用途 |
|------|------|------|
| 语言 | Java 17 | LTS 版本，支持 record、sealed class 等现代语法 |
| 框架 | Spring Boot 3.5 | Web 服务、自动配置、Actuator 监控 |
| 安全 | Spring Security + JWT (jjwt) | 认证授权、Token 签发与验证 |
| ORM | MyBatis | SQL 映射、数据访问 |
| 数据库 | MySQL（生产）/ H2（本地/测试） | 关系型数据持久化 |
| 迁移 | Flyway | 数据库版本管理 |
| 缓存 | Redis（已集成） | 后续用于会话缓存、接口限流 |
| 消息 | RabbitMQ（已集成） | 后续用于异步任务分发 |
| 文档 | SpringDoc OpenAPI | Swagger UI 自动生成 |
| 监控 | Actuator + Micrometer | 健康检查、指标暴露 |
| 工具 | Lombok | 减少样板代码 |

### Node AI Gateway

| 类别 | 技术 | 用途 |
|------|------|------|
| 语言 | TypeScript | 类型安全 |
| 框架 | NestJS | 模块化、依赖注入、Guard |
| HTTP | Axios | 外部 HTTP 调用（网页采集） |
| HTML 解析 | Cheerio | 网页正文提取 |
| AI | Ollama Chat API | 本地大模型调用 |
| 测试 | Jest | 单元测试与 E2E 测试 |
| 代码质量 | ESLint + Prettier | 代码风格统一 |

---

## Quick Start

### Prerequisites

- **Java 17+**（[Adoptium](https://adoptium.net/) 推荐）
- **Node.js 18+**（推荐通过 [nvm](https://github.com/nvm-sh/nvm) 管理）
- **pnpm**（`npm install -g pnpm`）
- **Ollama**（本地 AI 模型运行，[ollama.com](https://ollama.com/)）

### 1. 启动 Node AI Gateway

```bash
cd apps/node-server
cp .env.example .env          # 按需修改 OLLAMA_BASE_URL、INTERNAL_TOKEN 等
pnpm install
pnpm run start:dev            # 开发模式热重载，默认监听 http://localhost:3101
```

### 2. 启动 Java Core

```bash
cd apps/java-server

# 本地开发模式（H2 内嵌数据库，无需安装 MySQL）
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
# Windows: mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=local

# 默认监听 http://localhost:3000
# API 文档：http://localhost:3000/swagger-ui.html
```

### 3. 验证联通

```bash
# 健康检查
curl http://localhost:3000/api
curl http://localhost:3101/api

# 登录获取 Token（默认管理员 admin / admin123456）
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123456"}'
```

---

## Service Boundary

### Java Core — 核心平台（稳定性优先）

负责所有需要**高一致性、可审计、可治理**的能力：

- **认证授权**：用户登录、JWT 签发与验证、角色权限控制
- **对外 API**：统一 REST 接口、参数校验、统一异常处理
- **状态管理**：Agent Run 的完整生命周期（FSM 状态流转）
- **事件持久化**：执行过程中的所有事件逐条入库（轻量事件溯源）
- **SSE 推送**：实时事件流推送 + 历史事件回放（断线恢复）
- **产物管理**：执行报告文件落盘（Markdown + JSON）
- **可观测性**：Actuator 健康检查、Prometheus 指标暴露

### Node AI Gateway — AI 编排（灵活性优先）

负责所有**高变化、高 IO、高实验性**的 AI 能力：

- **模型调用**：Ollama / OpenAI 等多模型接入与路由
- **AI 编排**：计划生成 → 资源采集 → 逐条摘要 → 记忆聚合 → 最终报告
- **资源采集**：本地文件扫描 + 网页正文抓取
- **Prompt 管理**：各阶段的 Prompt 模板与 JSON 提取策略

### 内部通信协议

```
Java Core ──── HTTP POST ────► Node AI Gateway
            /api/internal/agent/execute
            Header: X-Internal-Token
```

- Java 是唯一的调用方，Node 不主动调用 Java
- Node 不持有任何运行状态，只做纯函数式的 AI 计算
- 通信使用 `X-Internal-Token` 头进行内部鉴权
- 后续可平滑演进为 RabbitMQ 异步调用或 gRPC

---

## Architectural Decisions

### 多语言混合架构

| 考量角度 | Java 的优势 | Node.js 的优势 |
|------|------------|---------------|
| 平台稳定性 | 强类型、成熟的安全框架、事务管理 | — |
| AI 生态适配 | — | 异步 IO 天然适合模型调用、Prompt 模板灵活 |
| 工程治理 | Spring Security、Flyway、Actuator 等开箱即用 | — |
| 快速迭代 | — | AI Prompt 和编排逻辑变化快，TS 迭代更轻量 |

### Java 模块内部用 DDD-lite 分层

```
interfaces/      ← 接口层：Controller、DTO（接收请求、返回响应）
application/     ← 应用层：Service（业务编排，不含领域规则）
domain/          ← 领域层：实体、Gateway Port（核心业务规则）
infrastructure/  ← 基础设施层：Mapper、远程调用、SSE（技术实现细节）
```

- 依赖方向严格单向：`interfaces → application → domain ← infrastructure`
- `domain` 层不依赖任何框架，是纯 Java POJO，可独立测试
- `infrastructure` 通过实现 `domain` 定义的 Port 接口来反转依赖（依赖倒置原则）
- 当 AI 网关的实现方式变化时（从本地 Ollama 切换到远程 Node），只需替换 Adapter，无需修改业务逻辑

---

## Development

### 常用命令

| 操作 | Java Core | Node AI Gateway |
|------|-----------|-----------------|
| 安装依赖 | `./mvnw dependency:resolve` | `pnpm install` |
| 开发启动 | `./mvnw spring-boot:run -Dspring-boot.run.profiles=local` | `pnpm run start:dev` |
| 编译 | `./mvnw compile` | `pnpm run build` |
| 运行测试 | `./mvnw test` | `pnpm test` |
| 代码格式化 | IDE 内置 | `pnpm run format` |
| Lint 检查 | `./mvnw compile`（编译期检查） | `pnpm run lint` |
| 打包 | `./mvnw package` | `pnpm run build` |
| API 文档 | http://localhost:3000/swagger-ui.html | — |
| 健康检查 | http://localhost:3000/actuator/health | http://localhost:3101/api |

### Spring Profiles

| Profile | 数据库 | 用途 |
|---------|--------|------|
| `local` | H2 文件模式（`.localdb/`） | 本地开发，无需安装 MySQL |
| `test` | H2 内存模式 | 单元/集成测试，每次清空 |
| 默认 | MySQL | 生产/预发布环境 |

---

## Roadmap

- [ ] **Redis 缓存集成**：Run 状态缓存、接口限流
- [ ] **RabbitMQ 异步化**：Agent 执行从同步 HTTP 调用切换为消息队列
- [ ] **结构化日志**：统一 JSON 格式日志、runId 链路追踪
- [ ] **Docker Compose 编排**：一键启动 Java + Node + MySQL + Redis + RabbitMQ
- [ ] **多模型支持**：OpenAI、Claude 等模型接入与路由策略
- [ ] **Agent 工具调用**：Tool Use / Function Calling 能力
- [ ] **流式 AI 响应**：模型逐 token 流式输出 + SSE 实时推送

---