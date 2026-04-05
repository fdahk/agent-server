# configuration

存放具体的配置映射文件。

## 职责

- 把原始环境变量转换为结构化配置对象。
- 按配置域拆分，如 `app`、`database`、`redis`、`auth` 等。

## 常见内容

- `app.config.ts`
- `database.config.ts`
- `redis.config.ts`
- `agent.config.ts`
