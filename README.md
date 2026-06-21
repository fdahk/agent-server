# Agent Server

ChatGPT 式个人知识助手后端:用户上传资料 → 自动解析/切分/向量化/组织 → 基于自己的资料多轮对话。

## 本地启动
```bash
make dev          # 一键:建 env + 装依赖 + 起中间件 + 迁移 + 并发跑 server(HTTP :3101)/worker
```
其它:`make middleware`(只起中间件) · `make down`(停) · `make env` · `make migrate`。

编排在 `docker/`:
- `docker/docker-compose.dev.yml` — 本地开发,只起中间件(postgres/redis/etcd/minio/milvus),业务跑宿主机。
- `docker/docker-compose.yml` — 全栈(+ node-server HTTP / worker),集成验收/部署用:
  ```bash
  cd docker && cp .env.example .env && docker compose up -d --build
  ```
向量库 Milvus 为 standalone(etcd+minio+milvus);生产把 milvus 的 `MINIO_*` 指向腾讯 COS。
