# ========== 阶段一：构建 ==========
FROM node:22-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* pnpm-lock.yaml* ./

# prisma 的 postinstall 钩子(prisma generate)在 install 阶段就会跑,需要 schema 先就位。
# 故在 install 前先拷 prisma/(schema+migrations);否则 generate 找不到 schema,install 直接失败。
COPY prisma ./prisma

# 安装全部依赖（含 devDependencies，编译需要 TypeScript、NestJS CLI 等）
RUN corepack enable pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ========== 阶段二：运行 ==========
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# prisma 引擎在 alpine 上需要 openssl;wget 给容器健康检查用
RUN apk add --no-cache openssl wget

# 直接复用 builder 的全量 node_modules：含 prisma CLI/引擎 + postinstall 已生成的 client。
# (不在 runtime 再 `pnpm install --prod`：那样 prisma 是 devDependency 会缺失，无法在启动时跑迁移)
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/prisma ./prisma

RUN mkdir -p /app/storage/agent-runs

EXPOSE 3101

# node-server 启动先 apply migration(prisma migrate deploy,幂等/带库级锁)再起进程。
# worker 用同一镜像但在 compose 里覆盖 command 为 `node dist/main.worker`(不迁移)。
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main"]
