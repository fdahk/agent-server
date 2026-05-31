import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * QdrantService —— 向量库统一入口
 *
 * 关键职责:
 * - 启动时 ensureCollection(幂等):建集合 + 给 user_id 建 payload 索引
 *   (多租户检索过滤的前提)
 * - 集合维度必须与 embedding 模型一致(nomic-embed-text=768);换模型要重建集合,
 *   故集合名建议带维度标识
 */
@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  readonly client: QdrantClient;
  readonly collection: string;
  readonly vectorSize: number;

  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL ?? 'http://localhost:6333',
    });
    this.vectorSize = Number(process.env.QDRANT_VECTOR_SIZE ?? 768);
    this.collection = process.env.QDRANT_COLLECTION ?? `knowledge_chunks`;
  }

  async onModuleInit(): Promise<void> {
    await this.ensureCollection();
  }

  /** 幂等:不存在则建集合 + user_id payload 索引 */
  async ensureCollection(): Promise<void> {
    if (await this.collectionExists()) {
      return;
    }
    await this.client.createCollection(this.collection, {
      vectors: { size: this.vectorSize, distance: 'Cosine' },
    });
    // user_id 建 payload 索引,多租户过滤检索才高效
    await this.client.createPayloadIndex(this.collection, {
      field_name: 'user_id',
      field_schema: 'integer',
    });
    // document_id 建索引:按文档删/重试清场要按它过滤
    await this.client.createPayloadIndex(this.collection, {
      field_name: 'document_id',
      field_schema: 'integer',
    });
    this.logger.log(
      `Qdrant collection "${this.collection}" created (dim=${this.vectorSize})`,
    );
  }

  private async collectionExists(): Promise<boolean> {
    const { collections } = await this.client.getCollections();
    return collections.some((c) => c.name === this.collection);
  }

  /** 批量写入向量点;wait=true 确保返回时已可被检索到(摄取双写需要强一致) */
  async upsertChunks(points: ChunkPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.client.upsert(this.collection, { wait: true, points });
  }

  /** 向量检索,强制按 user_id 过滤——多租户隔离的唯一出口 */
  async searchByUser(
    vector: number[],
    userId: number,
    topK: number,
  ): Promise<{ payload: ChunkPayload; score: number }[]> {
    const hits = await this.client.search(this.collection, {
      vector,
      limit: topK,
      with_payload: true,
      filter: { must: [{ key: 'user_id', match: { value: userId } }] },
    });
    return hits.map((h) => ({
      payload: h.payload as unknown as ChunkPayload,
      score: h.score,
    }));
  }

  /** 按文档删除其全部向量点;摄取重试前清场(幂等)与删文档都用它 */
  async deleteByDocument(documentId: number): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
    });
  }
}

/** 写入 Qdrant 的负载:回指 Postgres 行,检索命中后据此取原文 */
export interface ChunkPayload {
  [key: string]: number;
  user_id: number;
  document_id: number;
  chunk_id: number;
  chunk_index: number;
}

export interface ChunkPoint {
  id: string;
  vector: number[];
  payload: ChunkPayload;
}
