# decorators

存放基于 Nest 或 TypeScript 元数据能力封装的自定义装饰器。

## 职责

- 简化控制器和服务层的重复标注逻辑。
- 统一参数提取、权限标识、审计标识等声明式能力。

## 常见内容

- `@CurrentUser()`
- `@Public()`
- `@Roles()`
- 请求上下文注入装饰器
