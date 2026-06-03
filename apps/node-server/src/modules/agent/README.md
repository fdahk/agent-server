# agent 模块

负责 **agent 工具编排**:用户给一个自然语言任务(如"把我上传的 X 类文档整理成综述"),由 LLM 自主决定调哪个工具(检索 / 列文档 / 概括文档 / 按关键词圈出文档),工具结果喂回模型继续推理,直到收敛出最终答案。整个过程作为 run 事件流落库 + 广播,前端经 SSE 实时看到 `tool_called` / `tool_result` / `final_answer` 轨迹。

自建循环(~80 行核心),不依赖 LangGraph/LangChain——OpenAI 函数调用 + run-engine 事件,够用且全程可审计可重放。

---

## 一、职责与文件分工

| 文件 | 职责 |
|---|---|
| `agent.module.ts` | web 侧装配:只放 controller。runner/registry 在 worker 进程加载(见 `worker.module.ts`) |
| `agent.controller.ts` | HTTP 入口 `POST /agent/tasks`:建 run + 入队 `agent` job,立即返回 runId |
| `agent-runner.service.ts` | **核心**:工具调用循环(最多 8 步);每步经 RunEngine.emit 产出 `tool_called` / `tool_result` / `final_answer` 事件 |
| `tool.registry.ts` | 4 个工具的 schema + 实现集中地:`retrieve_knowledge` / `list_documents` / `summarize_document` / `organize` |
| `tool.types.ts` | `AgentTool` 接口 + `ToolContext`(始终带 userId,做多租户隔离) |
| `dto/create-task.dto.ts` | 任务文本(1–2000 字符) |

> 进度订阅复用 runs 模块的 `GET /runs/:runId/stream` SSE,不另起一套。

## 二、对话链路(提交一个 agent 任务发生了什么)

```
POST /agent/tasks { task }                      (web 进程)
  1. createRun(kind='agent_task', task) → runId
  2. queue.add('agent', { runId, userId })
  3. 202 返回 { runId }

worker 进程(RunProcessor 按 job.name 分派到 AgentRunnerService):
  start(runId)
  loop(最多 MAX_ITERATIONS=8):
    ① llm.chatWithTools(messages, schemas)
    ② 若返回 tool_calls:
        for each call:
          emit('tool_called', { name, args })
          tool = registry.get(name); result = await tool.run(args, ctx)
          emit('tool_result', { name, result })
          messages.push({ role:'tool', tool_call_id, content: result })
        continue
    ③ 否则:emit('final_answer', { content }); break
  complete(runId, 'done')
```

事件类型:`tool_called`、`tool_result`、`final_answer` —— 加上 run-engine 自带的 `run_started` / `run_completed` / `run_failed`,前端按序拼出完整推理轨迹。

## 三、注意事项

1. **dispatch 按 `job.name` 而非 `run.kind`。** demo job 与真实 agent 任务都是 `kind=agent_task`,只能靠入队时的 job 名(`ingestion` / `agent` / `demo`)区分。改 RunProcessor 时别误把 switch 切回 `run.kind`,否则真实 agent 任务会走 demo 桩。

2. **`ToolContext.userId` 是多租户隔离命门,工具内部任何对用户数据的查询必须按它过滤。** `retrieve_knowledge` 经 `RagRetriever`(`user_id` 过滤在 qdrant.searchByUser 写死);`list_documents` / `summarize_document` / `organize` 直接查 Prisma 时必须 `where: { userId: ctx.userId }`。漏一处就跨租户。

3. **工具异常喂回模型,不让整个 run 崩。** `execTool` 把任何异常字符串化后返回给模型(`错误:工具执行失败:…`),模型可换路或纠偏。如果改成抛错,一次错误的 LLM 调度会断掉整个 run,体验差。

4. **`MAX_ITERATIONS=8` 是死循环兜底。** 模型可能反复调工具不收敛,达到上限即 emit 一个 `truncated: true` 的 `final_answer` 强制收尾,而不是悬挂。如果业务上 8 步真的不够,先看 prompt 是不是写得让模型陷入循环,再考虑加大。

5. **`ChatCompletionTool` 是判别联合。** OpenAI SDK v6 把 tool 拆成 `ChatCompletionFunctionTool | ChatCompletionCustomTool`,联合类型上没有 `.function`。本模块统一用 `ChatCompletionFunctionTool`(我们只用 function 工具),拿 `.function.name` 不必 narrow。

6. **`emit` 的 payload 是 `Prisma.InputJsonValue`,LLM 给的 `Record<string,unknown>` 不能直接传。** `tool_called` 的 `args` 字段需 `as Prisma.InputJsonValue` 显式断言——参数本就来自 `JSON.parse`,断言安全。

7. **DI 缺 provider 会触发 Nest `handleInitializationError` → `process.abort()`,vitest 报成 OOM / "Channel closed"。** RunProcessor 现在注入 `AgentRunnerService`,任何复刻 worker 模块图的集成测试都要补 `AgentRunnerService` 桩(`{ run: () => Promise.resolve() }`),否则启动即 abort。`run-queue` / `ingestion` 两个集成测试已补,新增类似测试别忘。

8. **工具结果喂回前先截断(`result.slice(0, 2000)` 给事件、`MAX_DOC_CHARS=6000` 给摘要)。** 防一次工具调用就把上下文窗口吃满。截到模型还能用、但绝不会把 chat 历史撑爆的量。

9. **AgentController 只入队,不等结果。** 200ms 内 202 返回 runId,所有进度走 SSE。前端拿 runId 后立刻 `GET /runs/:runId/stream`,断线重连复用 runs 模块的 Last-Event-ID 补缺机制。
