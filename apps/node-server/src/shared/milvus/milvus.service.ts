import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MilvusClient,
  DataType,
  MetricType,
  IndexType,
  ConsistencyLevelEnum,
  LoadState,
} from '@zilliz/milvus2-sdk-node';

/**
 * MilvusService —— 向量库统一入口
 *
 * 关键职责:
 * - 启动时 ensureCollection(幂等):建集合 + 向量索引 + load 进内存
 *   (Milvus 检索/删除前集合必须处于 Loaded 态,故 load 是必经步骤)
 * - 集合维度必须与 embedding 模型一致(nomic-embed-text=768);换模型要重建集合,
 *   故集合名建议带维度标识
 * - searchByUser 把 user_id 过滤写死在这一层,是多租户检索的唯一出口
 *
 * 存储后端:Milvus 的向量/索引/日志落在对象存储(dev=MinIO,prod=腾讯 COS),
 * 由 milvus 容器侧配置;本服务只经 gRPC(默认 19530)读写,不直接碰对象存储。
 */
@Injectable()
export class MilvusService implements OnModuleInit {
  private readonly logger = new Logger(MilvusService.name);
  readonly client: MilvusClient;
  readonly collection: string;
  readonly vectorSize: number;

  constructor() {
    this.client = new MilvusClient({
      // 注意:Milvus 地址是 host:port(gRPC),不带 http scheme
      address: process.env.MILVUS_ADDRESS ?? 'localhost:19530',
      // 用户名:密码;留空则免鉴权(本地)
      token: process.env.MILVUS_TOKEN || undefined,
    });
    this.vectorSize = Number(process.env.MILVUS_VECTOR_SIZE ?? 768);
    this.collection = process.env.MILVUS_COLLECTION ?? 'knowledge_chunks';
  }

  async onModuleInit(): Promise<void> {
    await this.ensureCollection();
  }

  /** 幂等:不存在则建集合 + 向量索引;无论新建与否都确保已 load(检索前置条件) */
  async ensureCollection(): Promise<void> {
    const has = await this.client.hasCollection({
      collection_name: this.collection,
    });
    if (!has.value) {
      await this.client.createCollection({
        collection_name: this.collection,
        // Strong:摄取双写(Postgres chunk + Milvus 向量)后需立即可被检索到
        // (createCollection 这里只收字符串形态,与 search 处的 enum 形态等价)
        consistency_level: 'Strong',
        fields: [
          // 主键用 VarChar 存摄取生成的 UUID(与 Postgres DocumentChunk.vectorId 对应)
          {
            name: 'id',
            data_type: DataType.VarChar,
            is_primary_key: true,
            max_length: 64,
          },
          {
            name: 'vector',
            data_type: DataType.FloatVector,
            dim: this.vectorSize,
          },
          // 标量字段:多租户过滤(user_id)与按文档删除(document_id)走表达式过滤
          { name: 'user_id', data_type: DataType.Int64 },
          { name: 'document_id', data_type: DataType.Int64 },
          { name: 'chunk_id', data_type: DataType.Int64 },
          { name: 'chunk_index', data_type: DataType.Int64 },
        ],
      });
      await this.client.createIndex({
        collection_name: this.collection,
        field_name: 'vector',
        index_type: IndexType.AUTOINDEX,
        metric_type: MetricType.COSINE,
      });
      this.logger.log(
        `Milvus collection "${this.collection}" created (dim=${this.vectorSize})`,
      );
    }
    await this.loadCollection();
  }

  /** load 进内存并轮询到 Loaded 再返回(load 是异步过程,检索前必须就绪) */
  private async loadCollection(): Promise<void> {
    await this.client.loadCollection({ collection_name: this.collection });
    for (let i = 0; i < 60; i++) {
      const { state } = await this.client.getLoadState({
        collection_name: this.collection,
      });
      if (state === LoadState.LoadStateLoaded) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Milvus collection "${this.collection}" 载入超时`);
  }

  /** 批量写入向量点;upsert 按主键幂等,集合 Strong 一致,返回后即可被检索 */
  async upsertChunks(points: ChunkPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.client.upsert({
      collection_name: this.collection,
      data: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        user_id: p.payload.user_id,
        document_id: p.payload.document_id,
        chunk_id: p.payload.chunk_id,
        chunk_index: p.payload.chunk_index,
      })),
    });
  }

  /** 向量检索,强制按 user_id 过滤——多租户隔离的唯一出口 */
  async searchByUser(
    vector: number[],
    userId: number,
    topK: number,
  ): Promise<{ payload: ChunkPayload; score: number }[]> {
    const res = await this.client.search({
      collection_name: this.collection,
      data: vector,
      limit: topK,
      filter: `user_id == ${userId}`,
      output_fields: ['user_id', 'document_id', 'chunk_id', 'chunk_index'],
      metric_type: MetricType.COSINE,
      consistency_level: ConsistencyLevelEnum.Strong,
    });
    // Milvus 的 Int64 在 JS 侧以 string 回传(防精度丢失),这里的 id 量级小,Number() 安全
    return res.results.map((r) => ({
      payload: {
        user_id: Number(r.user_id),
        document_id: Number(r.document_id),
        chunk_id: Number(r.chunk_id),
        chunk_index: Number(r.chunk_index),
      },
      score: r.score,
    }));
  }

  /** 按文档删除其全部向量点;摄取重试前清场(幂等)与删文档都用它 */
  async deleteByDocument(documentId: number): Promise<void> {
    await this.client.delete({
      collection_name: this.collection,
      filter: `document_id == ${documentId}`,
    });
  }
}

/** 写入 Milvus 的负载:回指 Postgres 行,检索命中后据此取原文 */
export interface ChunkPayload {
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
