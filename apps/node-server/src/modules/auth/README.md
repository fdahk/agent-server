# auth 模块

负责**身份认证(Authentication)**:注册、登录、签发 JWT、保护其余所有接口。它是整个后端的"门禁",其余模块(documents/runs)都依赖它挂在 `req.user` 上的当前用户来做归属判断。

> DTO 层(请求/响应体的形状与校验)单独成文,见 [`dto/README.md`](./dto/README.md)。本文只讲模块整体职责与认证链路。

---

## 一、职责与文件分工

| 文件 | 角色 | 职责 |
|---|---|---|
| `auth.module.ts` | Module | 装配:注册 controller/service/strategy,配置 `JwtModule`(密钥+有效期),把 `JwtAuthGuard` 注册为 `APP_GUARD`(全局守卫) |
| `auth.controller.ts` | Controller | HTTP 入口:`POST /auth/register`、`POST /auth/login`、`GET /auth/me`。只解析请求、调 service |
| `auth.service.ts` | Service | 业务逻辑:bcrypt 哈希、查重、校验密码、签 JWT、查档案 |
| `jwt.strategy.ts` | Passport Strategy | 定义 "jwt" 策略:从哪取 token、用什么密钥验签、验过后把什么挂到 `req.user` |
| `jwt-auth.guard.ts` | Guard | 全局守卫:默认拦截所有路由,跑 jwt 策略;读 `@Public()` 标记放行公开端点 |
| `public.decorator.ts` | 装饰器 | `@Public()`:给 handler 打 `isPublic` 元数据,守卫据此放行 |
| `current-user.decorator.ts` | 参数装饰器 | `@CurrentUser()`:把 `req.user` 注入到 handler 参数,免去手写 `ctx.switchToHttp()` |

## 二、认证链路怎么跑

**注册/登录(公开端点)**

```
POST /auth/login { username, password }
  → @Public() 让全局守卫放行
  → ValidationPipe 校验 LoginDto
  → AuthService.login:查用户 → bcrypt.compare → 签 JWT
  → 返回 { token, user }
```

**访问受保护端点**

```
GET /auth/me  (Header: Authorization: Bearer <token>)
  → 全局 JwtAuthGuard 拦截 → 无 @Public() → 跑 jwt 策略
  → ExtractJwt 取 token → 用 JWT_SECRET 验签 + 查过期
  → JwtStrategy.validate() 返回 AuthedUser → 挂到 req.user
  → handler 用 @CurrentUser() 拿到 → 放行
```

关键点:**守卫默认拦截一切,公开端点靠 `@Public()` 显式开口子**。这是"默认安全"——新加的接口忘了加守卫也仍受保护,而不是忘了加守卫就裸奔。

## 三、注意事项

1. **`JWT_SECRET` 生产必须从环境变量注入。** 代码里 `'dev-secret-change-me-in-production'` 只是本地兜底默认值;生产用默认值 = 任何人都能伪造 token。`jwt.strategy.ts` 和 `auth.module.ts` 两处都读它,改的话要保证一致(否则签发用一个密钥、验签用另一个,所有 token 全废)。

2. **登录失败信息要统一,防账号枚举。** `auth.service.ts` 对"用户不存在"和"密码错误"返回**同一句** `用户名或密码错误`。若分开提示,攻击者能据此枚举出哪些用户名已注册。改这段错误文案时务必保持两者一致。

3. **`@Public()` 是"减法",别忘了它的存在。** 全局守卫是默认开启的。新增一个本该公开的端点(如 webhook、健康检查)若忘加 `@Public()`,会返回 401;反过来,给本该鉴权的端点误加了 `@Public()` 则会裸奔。health 模块整个控制器就是用 `@Public()` 放行的。

4. **SSE 鉴权走 query 参数是有意为之、但有代价。** `jwt.strategy.ts` 除 `Authorization` 头外还兜底从 `?access_token=` 取 token——因为浏览器原生 `EventSource` 无法设自定义头。代价是 token 可能进 access log,故仅作兜底,不要把它当首选传参方式。

5. **密码绝不存明文。** `register` 必经 `bcrypt.hash`(轮数常量 `BCRYPT_ROUNDS=10`)。轮数越高越安全但越慢,>12 在通用机器上耗时显著;改它会影响登录响应时间。

6. **JWT 是无状态的,签发后无法主动失效。** 当前没有黑名单/revoke 机制,token 在 `JWT_EXPIRE_SECONDS`(默认 7200s)内一直有效。若未来需要"登出即失效""改密后踢下线",得另加 Redis 黑名单或版本号校验。

7. **`AuthModule` 导出了 `AuthService` 和 `JwtModule`。** 其它模块若要复用认证能力(如手动验 token),从这里拿;不要在别处重复 `JwtModule.register`,否则密钥配置会分裂。
