# Agent Server

ChatGPT 式个人知识助手后端:用户上传资料 → 自动解析/切分/向量化/组织 → 基于自己的资料多轮对话。

## 本地启动
```bash
cp .env.docker.example .env.docker
docker compose --env-file .env.docker up -d
```
