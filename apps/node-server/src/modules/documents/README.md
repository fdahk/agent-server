# documents 模块

负责**文档的上传与摄取(ingestion)**:接收用户上传的文件 → 存盘 → 异步把文件解析、切分、向量化,**双写**到 Postgres(原文 chunk)和 Milvus(向量),供后续 RAG 检索使用。

这是典型的"**HTTP 快返回 + 后台慢处理**"模式:上传请求只做存盘和入队就立即返回,真正耗时的解析/embedding 在 worker 进程异步跑,进度经 run-engine 广播。

---

## 一、职责与文件分工

| 文件 | 进程 | 职责 |
|---|---|---|
| `documents.module.ts` | web | 装配:imports `QueueModule` 拿到入队句柄 |
| `documents.controller.ts` | web | HTTP 入口:`POST /documents`(上传)、`GET /documents`(列表)、`GET /documents/:id`(详情含状态) |
| `documents.service.ts` | web | 存盘 → 建 `Document(status=queued)` → 起 ingestion run → 入队;**不在请求线程里解析** |
| `ingestion.service.ts` | **worker** | 摄取核心:解析→切分→批量 embedding→双写 Postgres+Milvus;由 `RunProcessor` 调度 |
| `document-parser.ts` | 两端 | 纯函数:扩展名白名单、大小上限、把 pdf/docx/txt 字节解析成纯文本 |
| `text-splitter.ts` | worker | 纯函数:递归字符切分(对齐 LangChain 语义),无第三方依赖 |

## 二、摄取链路(上传一篇文档发生了什么)

```
POST /documents (multipart, file)
  ── web 进程 ──
  1. FileInterceptor 接住文件(multer,限 MAX_UPLOAD_BYTES)
  2. DocumentsService.upload:校验类型/大小 → 存盘到 storage/documents/{userId}/{uuid}-{name}
  3. 建 Document(status=queued) → createRun(kind='ingestion', refId=docId) → 入队
  4. 立即返回 { documentId, runId }   ← 前端拿 runId 去订阅进度(见 runs 模块 SSE)

  ── worker 进程(异步)──
  RunProcessor 消费 → IngestionService.ingest(run):
  5. status=processing → emit step:parsing → 读文件 → parseToText
  6. splitText(CHUNK_SIZE=800, CHUNK_OVERLAP=100) → emit step:chunking
  7. 清场(按 document_id 删 Milvus + Postgres 旧 chunk)← 重试幂等
  8. 分批(EMBED_BATCH=16):embed → 每 chunk 先写 Postgres(拿 chunkId)→ 收集点 → upsert Milvus → emit step:embedding{done,total}
  9. status=ready, chunkCount=N
  失败任一步 → status=failed + errorMsg,异常上抛交 BullMQ 重试
```

## 三、双写一致性设计(重点)

向量库 Milvus 和关系库 Postgres 是两个独立存储,没有跨库事务。本模块的取舍:

- **写入顺序:先 Postgres 后 Milvus。** 每个 chunk 先在 Postgres 落行(生成 `chunk.id`),再把带 `chunk_id` 的点 upsert 进 Milvus。这样 Milvus 里的每个向量都能反查回一条真实的 Postgres 记录。
- **失败即整 job 失败重试。** 任一步抛错,`Document.status=failed`,异常上抛交 BullMQ 走重试。
- **重试幂等靠"先清场"。** 重试时在开写前按 `document_id` 把 Milvus 和 Postgres 的旧 chunk 都删干净,再重新写,避免重复累积。这是幂等的关键——see `ingestion.service.ts` 第 65-67 行。

## 四、注意事项

1. **解析/embedding 绝不能放进 HTTP 请求线程。** 这些是秒级甚至更久的耗时操作。`documents.service.ts` 只做存盘+入队就返回,真正的活在 worker 跑。如果有人想"图省事"在 controller 里直接解析,会堵死请求、拖垮 web 副本。

2. **`refId` 是 string,用时要 `Number()` 还原。** Run 的 `refId` 字段存的是 `String(doc.id)`,`ingestion.service.ts` 里用 `Number(run.refId)` 转回。两边一旦不一致就会"摄取目标文档不存在"。

3. **归属校验在两端都做。** 上传/列表/详情按 `userId` 过滤;摄取时也校验 `doc.userId === run.userId`。这是多租户隔离,别图省事跳过——否则用户 A 能摄取/读取用户 B 的文档。

4. **大小上限有两道闸,且共用同一常量。** `MAX_UPLOAD_BYTES`(默认 10MB,可由 `DOCUMENT_MAX_BYTES` 覆盖)既配给 multer 的 `limits.fileSize`(传输层拦截),也在 service 里兜底校验(防绕过)。改上限改这一处即可。

5. **支持类型是扩展名白名单,不是 MIME 嗅探。** `SUPPORTED_EXTENSIONS`(pdf/docx/md/markdown/txt)按文件名后缀判断。这意味着改名绕过是可能的——解析器对非预期内容会报错而非崩溃,但若要更严格需加内容嗅探。

6. **`text-splitter` 的 `estimateTokens` 只是粗估。** 按 `字符数/3` 估算,仅用于元数据展示,**不可**用它做计费或严格的上下文窗口裁剪。要精确得接真正的 tokenizer。

7. **存盘路径含 UUID 前缀防重名覆盖。** 文件名为 `{uuid}-{原名}`,所以同名文件不会互相覆盖;但也意味着磁盘上的文件不会随 Document 删除自动清理,删文档时需另行清盘(当前未实现级联删盘)。

8. **`ingestion.service.ts` 跑在 worker,改它要重启 worker 进程。** web 和 worker 是两个入口(`main.ts` / `main.worker.ts`),controller 改动重启 web 即可,但摄取逻辑改动必须重启 worker 才生效。
