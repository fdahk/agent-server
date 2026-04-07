# ========== 阶段一：构建 ==========
FROM node:22-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* pnpm-lock.yaml* ./

# 安装全部依赖（含 devDependencies，编译需要 TypeScript、NestJS CLI 等）
RUN corepack enable pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ========== 阶段二：运行 ==========
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* pnpm-lock.yaml* ./

# 只安装生产依赖
RUN corepack enable pnpm && pnpm install --frozen-lockfile --prod

# 从构建阶段复制编译产物
COPY --from=builder /build/dist ./dist

RUN mkdir -p /app/storage/agent-runs

EXPOSE 3101

CMD ["node", "dist/main"]
