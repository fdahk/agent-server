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
    this.logger.log(
      `Qdrant collection "${this.collection}" created (dim=${this.vectorSize})`,
    );
  }

  private async collectionExists(): Promise<boolean> {
    const { collections } = await this.client.getCollections();
    return collections.some((c) => c.name === this.collection);
  }
}
