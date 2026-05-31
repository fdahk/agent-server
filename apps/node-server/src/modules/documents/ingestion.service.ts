import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Run } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LlmService } from '../../shared/llm/llm.service';
import {
  QdrantService,
  type ChunkPoint,
} from '../../shared/qdrant/qdrant.service';
import { RunEngineService } from '../../shared/run-engine/run-engine.service';
import { parseToText } from './document-parser';
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
      await this.prisma.documentChunk.deleteMany({ where: { documentId } });

      let written = 0;
      for (let start = 0; start < chunks.length; start += EMBED_BATCH) {
        const batch = chunks.slice(start, start + EMBED_BATCH);
        const vectors = await this.llm.embed(batch);
        const points: ChunkPoint[] = [];

        for (let j = 0; j < batch.length; j++) {
          const chunkIndex = start + j;
          const content = batch[j];
          const pointId = randomUUID();
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
