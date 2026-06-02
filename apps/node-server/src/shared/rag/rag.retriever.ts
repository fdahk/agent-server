import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { QdrantService } from '../qdrant/qdrant.service';

/** 一条检索命中:回指 Postgres chunk 的原文 + Qdrant 相似度分 */
export interface RetrievedChunk {
  chunkId: number;
  documentId: number;
  chunkIndex: number;
  content: string;
  score: number;
}

const DEFAULT_TOP_K = 6;

/**
 * RAG 检索器 —— 全应用唯一的向量检索入口。
 *
 * 多租户隔离的纪律:检索只能走这里,且只经 qdrant.searchByUser(user_id 过滤写死
 * 在那一层)。禁止任何 controller/service 自己拼 Qdrant filter——从代码结构上杜绝
 * 漏过滤导致的越权泄露。
 */
@Injectable()
export class RagRetriever {
  constructor(
    private readonly llm: LlmService,
    private readonly qdrant: QdrantService,
    private readonly prisma: PrismaService,
  ) {}

  /** 把 query 向量化 → 按 user 检索 top-k → 回 Postgres 取原文,保持相似度降序 */
  async retrieve(
    userId: number,
    query: string,
    topK: number = DEFAULT_TOP_K,
  ): Promise<RetrievedChunk[]> {
    const [vector] = await this.llm.embed(query);
    const hits = await this.qdrant.searchByUser(vector, userId, topK);
    if (hits.length === 0) return [];

    const chunkIds = hits.map((h) => h.payload.chunk_id);
    const rows = await this.prisma.documentChunk.findMany({
      where: { id: { in: chunkIds } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // 按 Qdrant 命中顺序(相似度降序)输出;Postgres 已删的 chunk 跳过
    return hits.flatMap((h) => {
      const row = byId.get(h.payload.chunk_id);
      if (!row) return [];
      return [
        {
          chunkId: row.id,
          documentId: row.documentId,
          chunkIndex: row.chunkIndex,
          content: row.content,
          score: h.score,
        },
      ];
    });
  }
}
