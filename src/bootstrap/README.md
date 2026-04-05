# bootstrap

`bootstrap` 用于放置应用启动阶段的装配代码，目标是把 `main.ts` 保持得足够薄。

## 职责

- 注册全局前缀、CORS、中间件、守卫、拦截器、过滤器、管道等启动逻辑。
- 组装 Swagger、日志、监控、限流、安全策略等全局能力。
- 按环境区分开发、测试、生产的启动配置。

## 适合放什么

- `setup-app.ts`
- `setup-swagger.ts`
- `setup-security.ts`
- `setup-observability.ts`

## 不适合放什么

- 具体业务逻辑。
- 单个领域模块专属的服务实现。
