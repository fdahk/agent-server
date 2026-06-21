# apps/node-server/ — NestJS AI 后端（先读根 CLAUDE.md）

栈：NestJS(`@nestjs/*`, swagger, passport-jwt) + Prisma + ioredis + BullMQ + Milvus(`@zilliz/milvus2-sdk-node`) + OpenAI；校验 class-validator/transformer；JWKS 验签 `jwks-rsa`。

## 命令
- HTTP 开发 `npm run start:dev`｜**Worker 开发 `npm run start:worker:dev`**（BullMQ 队列消费，独立进程）｜构建 `npm run build`
- 测试 `npm run test:unit` / `test:integration` / `test:e2e` / `test:cov`
- 校验 `npm run lint && npm run format`
- 迁移(Prisma) `npm run db:migrate` / `db:generate` / `db:studio` / `db:deploy`

## 要点
- NestJS 分层：module → controller → service → repository(Prisma)；DTO 用 class-validator 校验
- 鉴权：passport-jwt + `jwks-rsa` 验 our-chat 签发的 JWT（JWKS 公钥），不自签发
- 异步任务走 BullMQ worker；向量检索走 Milvus(standalone:etcd+minio+milvus)；LLM 走 OpenAI（注意限流/超时/降级）
- 完工门禁：`npm run lint && npm run test:unit`（改 schema 再迁移 + 相关集成测试）
