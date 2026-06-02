# runs 模块

负责**异步运行(Run)的入队入口与实时进度订阅**。一个 "run" 是一次后台任务(文档摄取、agent 任务等)的生命周期记录。本模块是这套**事件溯源 + SSE 推送**机制面向 HTTP 的两端:

- **生产端**:把作业入队(`POST /runs/demo`),立即返回 `runId`。
- **订阅端**:前端用 `runId` 订阅事件流(`GET /runs/:runId/stream`,SSE),实时看进度。

真正的"干活"在 worker 进程(`run.processor.ts`),进度事件经 Redis pub/sub 广播——这是整个设计的核心,也是它能多副本部署的原因。

---

## 一、职责与文件分工

| 文件 | 进程 | 职责 |
|---|---|---|
| `runs.module.ts` | web | 装配:imports `QueueModule` 拿入队句柄;RunEngine/Redis 来自 `@Global()` |
| `runs.controller.ts` | web | `POST /runs/demo` 入队;`GET /runs/:runId/stream` SSE 订阅;`GET /runs/:runId` 快照 |
| `run.processor.ts` | **worker** | BullMQ 消费者:按 `Run.kind` 分派(ingestion→IngestionService,其余→demo),包住 start→complete/fail 生命周期 |

> Run 的状态机、事件落库、Redis 广播逻辑在 `shared/run-engine`,不在本模块。本模块是它的 HTTP 门面 + worker 调度入口。

## 二、为什么这么设计:web 和 worker 是分开的进程

```
   web 副本(可多个)              worker 副本(可多个)
   ┌──────────────┐              ┌──────────────────┐
   │ POST /runs   │── 入队 ──────▶│ RunProcessor      │
   │ (生产端)      │   BullMQ      │ 消费 → 干活        │
   │              │              │ RunEngine.emit:   │
   │ GET /stream  │◀── Redis ─────│  ① 落库 RunEvent   │
   │ (SSE 订阅)    │   pub/sub     │  ② 广播 run:{id}   │
   └──────────────┘              └──────────────────┘
```

关键:**SSE 连接所在的 web 副本,和实际产生事件的 worker,通常不是同一个进程。** 所以事件不能靠进程内回调传递,而是 worker 发布到 Redis 频道 `run:{runId}`,持有 SSE 连接的 web 副本订阅该频道转发给前端。这让 web 和 worker 都能水平扩容。

## 三、SSE 断线重连的正确性(重点,容易写错)

`runs.controller.ts` 的 `stream()` 处理了三个微妙问题,改它前务必理解:

1. **断线重连不丢、不重。** 浏览器 `EventSource` 重连会带 `Last-Event-ID`(上次收到的 `sequenceNo`)。服务端据此用 `getEventsSince(sinceSeq)` 只回放缺失段,再转实时。每条事件带 `id: sequenceNo`,前端据此续上。
2. **先订阅、后补缺,防中间漏事件。** 必须先 `sub.subscribe(channel)` 再去查历史事件——否则"查历史"和"开始监听"之间到达的实时事件会丢。订阅后到的实时事件先进 `liveBuffer`,补缺完成后再 flush。
3. **用 watermark 去重。** `emit()` 里 `if (ev.sequenceNo <= watermark) return`——补缺段和 buffer 段可能有重叠序号,靠水位线保证每个序号只发一次。

## 四、注意事项

1. **`complete()` 故意"先发事件、再落终态"。** run-engine 的 `complete` 先广播 `run_completed` 事件,之后才把 `status` 翻成 `completed`。目的:晚连入的 SSE 也能回放到终态事件。**副作用**:收到 `run_completed` 广播的瞬间,DB 里 `status` 可能还没提交。集成测试里 `waitForStatus` 轮询等待就是为此(见 `test/integration/run-queue.integration.test.ts`)。

2. **`RunProcessor` 的构造依赖必须在 worker 模块图里全部 provide。** 它注入了 `RunEngineService` 和 `IngestionService`。若某个测试/模块复刻 worker 图却漏 provide `IngestionService`,`createApplicationContext` 会 DI 解析失败——而 Nest 的 `handleInitializationError` 会调 `process.abort()`,**报错形似 OOM、极易误诊**。集成测试用桩 `{ provide: IngestionService, useValue: { ingest: () => Promise.resolve() } }` 正是为此。

3. **`run.processor.ts` 跑在 worker,改它要重启 worker。** controller 在 web 进程,processor 在 worker 进程(`main.worker.ts`)。两者改动各自重启对应进程才生效。

4. **新增 run 类型 = 在 `process()` 的 switch 里加 case。** 目前 `kind` 有 `ingestion` 和 `agent_task`(走 demo)。加新类型时记得对应处理 + 调 `complete(runId, <finalStatus>)`,否则 run 永远不会终结、SSE 永远不收尾。

5. **SSE 订阅必须清理。** Observable 的 teardown 里 `removeAllListeners` + `unsubscribe` + `quit`,否则每个断开的连接都会泄漏一个 Redis 订阅连接。改 stream 逻辑时别动掉这段 return 清理函数。

6. **归属校验后才订阅有效数据。** `stream`/`snapshot` 都校验 `run.userId === user.userId`,防止越权订阅他人 run 的进度。
