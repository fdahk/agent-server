# conversations 模块

负责 **RAG 对话(和你上传的资料对话)**:管理会话/消息,并实现"检索增强生成"——把用户提问拿去检索其个人知识库,把命中的资料拼进 prompt,让 LLM **基于自己的资料**流式作答,并标注引用来源。

这是"上传资料 → 和资料对话"的 ChatGPT 式 MVP 的对话端。与 documents 模块的异步摄取不同,**RAG 对话全程在 web 进程同步完成**(检索快、生成边出边推),不走 worker。

---

## 一、职责与文件分工

| 文件 | 职责 |
|---|---|
| `conversations.module.ts` | 装配:imports `RagModule` 拿检索器;Llm/Prisma 来自 `@Global()` |
| `conversations.controller.ts` | HTTP 入口:会话 CRUD + `POST /conversations/:id/messages`(SSE 流式) |
| `conversations.service.ts` | 会话/消息**持久化**(纯 CRUD),所有读写按 userId 校验归属 |
| `chat.service.ts` | RAG **编排**:存提问 → 检索 → 拼 prompt → 流式生成 → 存回答+citations |
| `dto/` | `CreateConversationDto`(可选标题)、`SendMessageDto`(query + 可选 topK) |

> 向量检索本身不在本模块,而在 `shared/rag/rag.retriever.ts`——全应用唯一检索入口,user_id 过滤写死在那。

## 二、对话链路(发一条消息发生了什么)

```
POST /conversations/:id/messages { query }   (全程 web 进程)
  1. 预检会话归属(在切 SSE 头前,失败返回干净 404)
  2. 切到 SSE 响应头(text/event-stream,关代理 buffering)
  3. ChatService.streamAnswer:
     ① 取最近 N 条历史(写入本轮提问之前)
     ② 存 user message
     ③ RagRetriever.retrieve:embed(query) → milvus.searchByUser(★强制 user_id 过滤) → 回 Postgres 取原文
     ④ 拼 prompt:system(含资料 [1][2]…) + 历史 + 本轮提问
     ⑤ llm.chatStream 逐 token 生成 → 每 token 经 SSE `event: token` 推前端
     ⑥ 生成完:存 assistant message + citations
     ⑦ SSE `event: done` 带 messageId + 引用列表
```

SSE 事件类型:`token`(逐字)、`done`(messageId + citations)、`error`(出错收尾)。

## 三、注意事项

1. **检索必须走 `RagRetriever`,严禁自己拼 Milvus filter。** 多租户隔离的命门:`retrieve` 只经 `milvus.searchByUser`,user_id 过滤写死在那一层。任何 controller/service 若绕过它直接查 Milvus,就可能漏过滤、泄露他人资料。这是结构性约束,不是约定。

2. **归属校验做两道,且都不能省。** controller 预检 `ensureOwned`(为返回干净 404),`ChatService` 内部再校验一次(防御性,服务对任何调用方都安全)。会话/消息隔离不能只靠检索过滤——会话本身也按 userId 限定。

3. **用 `@Res()` 手写 SSE,不是 `@Sse()`。** `@Sse()` 只支持 GET,而提问要 POST 带 body。代价:`@Res()` 进入"手动响应模式",Nest 不再自动序列化返回值、拦截器不作用于响应体。**因此 SSE 头切换之前抛的异常**才能被异常过滤器转成正常 HTTP 错误;之后再出错只能写 `event: error` 帧。

4. **前端用 fetch + ReadableStream,不是原生 EventSource。** EventSource 只能 GET。POST SSE 要用 `fetch` 读 `response.body` 的流。鉴权同理:这条是 POST 带 Authorization 头,不依赖 jwt.strategy 里那条 `?access_token=` query 兜底。

5. **反向代理必须关 buffering。** 已设 `X-Accel-Buffering: no` + `Cache-Control: no-transform`。若 nginx 仍缓冲,token 会攒一批才到达,失去"逐字"体验。部署时确认代理配置。

6. **历史与 token 预算。** 目前取最近 `HISTORY_LIMIT=10` 条历史拼 prompt,无压缩。长对话会逼近模型上下文窗口——后续要做摘要式压缩。`topK` 也有上限(DTO 限 ≤20)防检索结果塞爆上下文。

7. **客户端断连的处理。** controller 监听 `req.on('close')`,断连即停止迭代生成器。**副作用**:生成中途断连时,user message 已存、但 assistant message 不会落库(生成器在 yield 处中断,后续存库代码不执行)。这是有意取舍——半截回答不入库。

8. **`citations` 存成 Json。** `Message.citations` 是 `[{ chunkId, documentId, score }]`,前端据此渲染"引用来源"。这是 RAG 的可信度卖点,别省。

9. **依赖真实 LLM 服务连通。** chat/embedding 都打 `LLM_BASE_URL`(默认本地 Ollama)。本地跑对话前要先 `ollama serve` 且拉好 chat/embed 两个模型;集合维度要与 embed 模型匹配(见 `milvus.service.ts`)。
