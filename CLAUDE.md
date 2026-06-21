# agent-server — AI 工作入口

> 全局约束见 `~/.claude/CLAUDE.md`。本文件只给：定位 + 文档地图 + 跨服务约束 + 入口。
> 架构与计划在 `docs/` —— 开工前按需读，本文件不重复。

## 这是什么
AI 助手后端（与 our-chat IM 融合）。NestJS + Prisma + Redis + BullMQ(worker) + Milvus(向量库,standalone:etcd+minio+milvus) + OpenAI；含 pdf/docx/html 解析做 RAG 摄入。
代码在 `apps/node-server/`（见其 CLAUDE.md），分支 `dev`。

## 文档地图（权威，勿在 CLAUDE.md 重复）
- 总体重构计划：`docs/项目重构方案/`（00 现状 → 01 选型 → 02 架构 → … → 17 开发计划与阶段落地 → 18 Go连接网关；深度篇 11–16 消息可靠/时序/多端一致）
- 跨服务鉴权：`docs/跨服务鉴权方案/`（方案 A–H；当前选 **方案D-非对称密钥JWKS**）
- 架构综述 `docs/architecture.md`｜部署 `docs/docker.md`

## 跨服务约束
- **鉴权用 JWKS 验签**（`jwks-rsa`）：our-chat 是 IdP 签发 JWT，本服务用其公钥验签，**不自签发**。
- 重构分阶段推进（见 doc17），不砍既有功能。
