#!/usr/bin/env bash
# CI(ssh-action)在服务器执行的部署编排:生成 .env → 后台(脱离 SSH 会话)构建并 up → 轮询结果。
#
# 为何后台 + 轮询:runner(海外)→服务器(国内)的 SSH 在几分钟长构建期间易被 GFW 重置(此前实测部署在第 8s
#   就掉线、但 build 其实在服务器孤儿续跑)。这里把 build+up 用 setsid 脱离 SSH 会话(断连也跑完),
#   再轮询结果文件 deploy.rc;轮询期每 10s tail 一次 deploy.log,既给可见进度,也让 SSH 通道保持有流量、
#   降低空闲被重置的概率。会话即便仍被重置,build 也不丢(只是这步显示失败)。
#
# 机密由 ssh-action 经 envs 注入到本脚本环境(不硬编码)。须在 compose 所在的 docker/ 目录下执行。
set -euo pipefail
cd "$(dirname "$0")"

# 共享网络（与 our-chat 互通）：不存在则建（幂等）
docker network inspect oc-shared >/dev/null 2>&1 || docker network create oc-shared

# —— 生成 .env（仅机密/环境相关；通用默认在 compose）。空值的可选项不写入，留 compose 默认 ——
{
  echo "POSTGRES_USER=${POSTGRES_USER:-agent}"
  echo "POSTGRES_DB=${POSTGRES_DB:-agent_server}"
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  echo "JWT_SECRET=${JWT_SECRET}"
  echo "LLM_API_KEY=${LLM_API_KEY}"
  echo "OAUTH_ISSUER=${OAUTH_ISSUER}"
  echo "MILVUS_COS_ENDPOINT=${MILVUS_COS_ENDPOINT}"
  echo "MILVUS_COS_ACCESS_KEY=${MILVUS_COS_ACCESS_KEY}"
  echo "MILVUS_COS_SECRET_KEY=${MILVUS_COS_SECRET_KEY}"
  echo "MILVUS_COS_BUCKET=${MILVUS_COS_BUCKET}"
  [ -n "${MILVUS_COS_REGION:-}" ]  && echo "MILVUS_COS_REGION=${MILVUS_COS_REGION}"
  [ -n "${MILVUS_VECTOR_SIZE:-}" ] && echo "MILVUS_VECTOR_SIZE=${MILVUS_VECTOR_SIZE}"
  [ -n "${LLM_BASE_URL:-}" ]       && echo "LLM_BASE_URL=${LLM_BASE_URL}"
  [ -n "${LLM_CHAT_MODEL:-}" ]     && echo "LLM_CHAT_MODEL=${LLM_CHAT_MODEL}"
  [ -n "${LLM_EMBED_MODEL:-}" ]    && echo "LLM_EMBED_MODEL=${LLM_EMBED_MODEL}"
} > .env
chmod 600 .env

# —— 后台(脱离 SSH 会话)跑 build+up;结果码落 deploy.rc ——
rm -f deploy.rc deploy.log
setsid bash -c 'bash deploy-build.sh >deploy.log 2>&1; echo $? >deploy.rc' </dev/null >/dev/null 2>&1 &
echo "build+up 已后台启动(脱离 SSH 会话,断连也会跑完);轮询结果中…"

rc=""
# 180 * 10s = 30min 上限(基础镜像/依赖层已缓存时通常几分钟内完成;首跑拉 milvus 等基础镜像偏久)
for _ in $(seq 1 180); do
  if [ -f deploy.rc ]; then rc="$(cat deploy.rc)"; break; fi
  sleep 10
  tail -n 3 deploy.log 2>/dev/null || true
done

echo "===== 部署日志末尾 ====="
tail -n 60 deploy.log 2>/dev/null || true
docker compose -f docker-compose.prod.yml ps || true

if [ "${rc}" = "0" ]; then
  echo "✅ agent-server 部署完成"
else
  echo "::error::部署未成功(rc=${rc:-TIMEOUT});见上方日志"
  exit 1
fi
