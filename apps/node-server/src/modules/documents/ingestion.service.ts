import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Run } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LlmService } from '../../shared/llm/llm.service';
// QdrantService 提供 upsertChunks() 方法,能把切分好的文本块和它们的向量一起写到 Qdrant 里
import {
  QdrantService,
  type ChunkPoint,
} from '../../shared/qdrant/qdrant.service';
import { RunEngineService } from '../../shared/run-engine/run-engine.service';
import { parseToText } from './document-parser';
// 文本切分和 token 估算函数
import { splitText, estimateTokens } from './text-splitter';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH = 16;

/**
 * 文档摄取:解析 → 切分 → 批量 embedding → 双写(Postgres chunk + Qdrant 向量)。
 *
 * 在 worker 进程内由 RunProcessor 调度,逐步经 run-engine 广播进度。
 * 双写顺序:先写 Postgres DocumentChunk(拿 chunkId)→ upsert Qdrant(payload 带 chunk_id),
 * Qdrant 失败则整个 job 失败重试。重试幂等靠开写前按 document_id 清场两边旧数据。
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly qdrant: QdrantService,
    private readonly runEngine: RunEngineService,
  ) {}

  async ingest(run: Run): Promise<void> {
    const documentId = Number(run.refId);
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.userId !== run.userId) {
      throw new Error(`摄取目标文档不存在或归属不符: ${run.refId}`);
    }

    try {
      // 开始摄取:先把文档状态改成 processing,这样用户查文档状态时就能知道正在摄取了
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'processing', errorMsg: null },
      });

      await this.runEngine.emit(run.runId, 'step', { step: 'parsing' });
      const raw = await readFile(doc.storagePath);
      const text = await parseToText(raw, doc.filename);

      const chunks = splitText(text, {
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
      });
      await this.runEngine.emit(run.runId, 'step', {
        step: 'chunking',
        chunks: chunks.length,
      });

      // 重试幂等:开写前清掉本文档可能残留的两边旧数据
      await this.qdrant.deleteByDocument(documentId);
      // prisma.documentChunk.deleteMany() 没有 where { documentId }
      // 这样的批量删除接口,只能先查 chunkId 列表再逐条删;但性能还行,每次摄取的 chunk 数量级在几百以下
      await this.prisma.documentChunk.deleteMany({ where: { documentId } });

      let written = 0;
      for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
        const batch = chunks.slice(start, start + EMBED_BATCH);
        const vectors = await this.llm.embed(batch);
        // points 是要写到 Qdrant 的数据结构:每个 chunk 对应一个 point,
        // 包含 id/vector/payload 三部分;payload 里带上 documentId 和 chunkId 以便后续搜索时能知道这个向量对应哪个文档的哪个 chunk
        const points: ChunkPoint[] = [];

        for (let j = 0; j < batch.length; j++) {
          const chunkIndex = start + j;
          const content = batch[j];
          const pointId = randomUUID();
          // 把这个 chunk 写到 Postgres 里,拿到 chunkId 后再写 Qdrant;
          // 如果写 Qdrant 失败了,这个 chunk 就算没写成功,下次重试时还会再写一次
          const chunk = await this.prisma.documentChunk.create({
            data: {
              documentId,
              userId: doc.userId,
              chunkIndex,
              content,
              tokenCount: estimateTokens(content),
              qdrantPointId: pointId,
            },
          });
          // points.push() 用于把这个 chunk 对应的向量和它的 metadata 一起收集到 points 数组里
          // 等这个 batch 的所有 chunk 都处理完了再批量写到 Qdrant
          points.push({
            id: pointId,
            vector: vectors[j],
            payload: {
              user_id: doc.userId,
              document_id: documentId,
              chunk_id: chunk.id,
              chunk_index: chunkIndex,
            },
          });
        }

        await this.qdrant.upsertChunks(points);
        written += batch.length;
        await this.runEngine.emit(run.runId, 'step', {
          step: 'embedding',
          done: written,
          total: chunks.length,
        });
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'ready', chunkCount: chunks.length },
      });
      this.logger.log(
        `摄取完成 document=${documentId} chunks=${chunks.length}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed', errorMsg: msg.slice(0, 1000) },
      });
      throw err;
    }
  }
}
