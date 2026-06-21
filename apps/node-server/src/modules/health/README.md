# health 模块

负责**基础设施联通性检查(liveness/readiness)**:暴露一个公开端点 `GET /api/health`,并行探活 Postgres / Redis / Milvus,供负载均衡、K8s 探针、监控告警判断本实例是否健康。

这是最小的一个模块——只有一个 controller、没有 service,因为它要做的事只是"分别 ping 一下依赖,汇总结果"。

---

## 一、职责与文件分工

| 文件 | 职责 |
|---|---|
| `health.module.ts` | 只注册 controller;依赖的三个 service 都来自 `@Global()` 模块,无需 imports |
| `health.controller.ts` | `GET /health`:`Promise.allSettled` 并行探活三个组件,汇总 `ok` / `degraded` |

## 二、设计要点

```
GET /api/health  (无需鉴权)
  → Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,   // Postgres
      redis.client.ping(),          // Redis
      milvus.client.showCollections() // Milvus
    ])
  → 任一 down → status='degraded'(但仍 HTTP 200)
  → 返回 { status, details: { postgres, redis, milvus } }
```

- **用 `allSettled` 而非 `all`:** 一个组件挂掉不能让检查本身抛错,要让其余组件的结果照常返回。`all` 会在第一个 reject 时短路,拿不到完整 details。
- **`degraded` 仍返回 200:** body 里给出每个组件的 up/down 细节,由调用方(监控/探针)自己决定如何处置。

## 三、注意事项

1. **必须 `@Public()`,否则探针会 401。** 全局 `JwtAuthGuard` 默认拦截一切,健康检查给监控系统/LB 用,不可能带 token。controller 上的 `@Public()` 不能删——删了所有探针立刻全红。

2. **LLM 故意不纳入探活。** 它是外部按需调用的服务,且健康检查会被高频轮询;每次 ping LLM 既浪费 token 又把"外部依赖抖动"算进自身健康度,不合适。判断 LLM 可用性应另走业务侧的熔断/重试,而非健康检查。

3. **当前是"liveness + 浅 readiness"混合,语义要拎清。** 它探的是"依赖连得上",不代表"依赖能正常服务"(比如 Postgres 连得上但磁盘满了)。若要区分 K8s 的 liveness(进程活着就行)和 readiness(能否接流量),需要拆成两个端点——当前合一,部署时注意别把它直接当 liveness 探针(依赖抖动会导致 Pod 被误杀重启)。

4. **`degraded` 不等于 HTTP 失败。** 想让 LB 据此摘流量的话,调用方要解析 body 的 `status` 字段,而不是只看 HTTP 状态码(永远是 200)。若希望 LB 直接按状态码摘流,需要改成 down 时返回 503——这是个有意的取舍,改前想清楚谁在消费这个端点。

5. **依赖来自 `@Global()`,本模块不 imports 它们。** Prisma/Redis/Milvus 三个 service 是全局可注入的,所以 `health.module.ts` 干净得只有 controllers。若哪天某个 service 不再 `@Global()`,这里要补 imports,否则启动期 DI 解析失败。
