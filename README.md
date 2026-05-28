# Agent Server

**单 Node 服务 · AI 知识助手后端(重构演进中)**

ChatGPT 式个人知识助手后端:用户上传资料 → 自动解析/切分/向量化/组织 → 基于自己的资料多轮对话。

> ⚠️ 本项目正在从原 **Java + Node 双后端(polyglot)** 架构演进为 **单 Node 模块化单体**。
> 原 `apps/java-server` 已删除,其能力(auth / agent 运行编排 / 事件溯源 / SSE)正在迁移进 Node 服务。

## 当前架构方案

完整设计文档见 **[`docs/项目重构方案/`](docs/项目重构方案/)**:

| 文档 | 内容 |
|---|---|
| `00-现状评估与演进目标` | 现状 / 愿景 / 差距 |
| `01-技术选型决策` | NestJS / Prisma / Qdrant / Redis / BullMQ / OpenAI 兼容 LLM / 自研 agent 循环 |
| `02-目标架构与数据模型` | web 池 + worker 池 + SSE Redis backplane + 数据模型 |
| `03-核心流程设计` | 摄取 / RAG 对话 / agent 工具编排 |
| `04-迁移路线图` | M0–M6 里程碑 |
| `05-风险与踩坑` | 风险清单 |
| `06-前端接入与多端规划` | our-chat 系统助手 + Flutter 移动端 |
| `07-部署演进与扩容路径` | Compose 起步,k8s 当能力展示 |
| `08-测试策略与工程化` | Vitest + testcontainers + 分级覆盖 |

## 技术栈(目标)

- **运行时**:Node 22 + TypeScript
- **框架**:NestJS
- **关系库**:PostgreSQL + Prisma
- **向量库**:Qdrant
- **缓存/队列**:Redis(BullMQ + Pub/Sub)
- **LLM**:OpenAI 兼容协议(本地 Ollama / 第三方 API 可切换)
- **测试**:Vitest + testcontainers + supertest

## 本地启动(M0 阶段)

```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up -d
```

> 注:Postgres / Qdrant 将在 M0 后续 commit 接入,届时本节更新。
