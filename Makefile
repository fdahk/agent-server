# agent-server 本地开发编排
#
# 一键启动:  make dev
#   首次自动:建 env(apps/node-server/.env)+ 装依赖 + 生成 Prisma Client + 起中间件,
#   应用迁移,随后并发跑 server(HTTP :3101)/ worker,合并输出,Ctrl-C 一起停。
# 其它:      make middleware(只起中间件) · make down(停中间件) · make env · make migrate
#
# 中间件(postgres/redis/etcd/minio/milvus)跑 docker;业务跑宿主机热重载。
# 端口偏移见 docker/docker-compose.dev.yml(5433/6380/19530,避开 our-chat)。

DEV_COMPOSE := docker/docker-compose.dev.yml
APP_DIR     := apps/node-server
APP_ENV     := apps/node-server/.env

.PHONY: dev middleware down env deps migrate

# 一键起全部:env/依赖就绪 → 起中间件 → 等 PG → 迁移 → 并发跑 server + worker(Ctrl-C 一起退出)
dev: env deps middleware
	@printf '⏳ 等待 PostgreSQL'; \
	until docker compose -f $(DEV_COMPOSE) exec -T postgres pg_isready -U agent >/dev/null 2>&1; do printf '.'; sleep 1; done; echo ' ✓'
	@echo '⏩ 应用数据库迁移'; cd $(APP_DIR) && pnpm prisma migrate deploy
	@echo '▶ server(HTTP):3101 · worker(Ctrl-C 全部停止)'
	@trap 'kill 0' INT TERM EXIT; \
	( cd $(APP_DIR) && pnpm start:server:dev ) & \
	( cd $(APP_DIR) && pnpm start:worker:dev ) & \
	wait

# 只起中间件(postgres + redis + etcd + minio + milvus)
middleware:
	docker compose -f $(DEV_COMPOSE) up -d

# 停中间件
down:
	docker compose -f $(DEV_COMPOSE) down

# 生成本地 env(幂等;不存在才建)
env:
	@test -f $(APP_ENV) || { cp $(APP_DIR)/.env.example $(APP_ENV); echo "✓ 已生成 $(APP_ENV)(按需改 JWT_SECRET / LLM_*)"; }

# 首次装依赖(postinstall 会生成 Prisma Client;已就绪则跳过)
deps:
	@test -d $(APP_DIR)/node_modules || (cd $(APP_DIR) && pnpm install)

# 应用迁移(改 schema 后)
migrate:
	cd $(APP_DIR) && pnpm db:migrate
