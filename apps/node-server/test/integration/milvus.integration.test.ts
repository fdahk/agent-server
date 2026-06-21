import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StartedTestContainer } from 'testcontainers';
import { MilvusService } from '../../src/shared/milvus/milvus.service';
import { startMilvusContainer } from '../helpers/milvus-container';

/**
 * MilvusService 集成测试(testcontainers 起真 milvus 单容器)
 *
 * 用服务自身的公共方法验证契约(而非裸客户端),消费方依赖的就是这层:
 * - ensureCollection 幂等:多次调用不报错,集合已建并 load
 * - upsertChunks + searchByUser 多租户过滤:按 user_id 过滤绝不混入其他用户
 * - deleteByDocument:按文档清场后再检索为空
 */

let container: StartedTestContainer;
let milvus: MilvusService;

beforeAll(async () => {
  const started = await startMilvusContainer();
  container = started.container;

  process.env.MILVUS_ADDRESS = started.address;
  // 用 4 维向量做轻量测试
  process.env.MILVUS_VECTOR_SIZE = '4';
  process.env.MILVUS_COLLECTION = 'test_chunks';

  milvus = new MilvusService();
  await milvus.onModuleInit();
}, 240_000);

afterAll(async () => {
  await container?.stop();
});

describe('MilvusService(集成)', () => {
  it('ensureCollection 幂等(重复调用不报错)', async () => {
    await milvus.ensureCollection();
    await milvus.ensureCollection();
    const has = await milvus.client.hasCollection({
      collection_name: milvus.collection,
    });
    expect(has.value).toBe(true);
  });

  it('多租户过滤:按 user_id 检索只返回当前用户的点', async () => {
    // 两个用户各塞一个相同向量
    await milvus.upsertChunks([
      {
        id: 'pt-user1',
        vector: [1, 0, 0, 0],
        payload: { user_id: 1, document_id: 100, chunk_id: 10, chunk_index: 0 },
      },
      {
        id: 'pt-user2',
        vector: [1, 0, 0, 0],
        payload: { user_id: 2, document_id: 200, chunk_id: 20, chunk_index: 0 },
      },
    ]);

    // user_id=1 的检索绝不能命中 user_id=2 的点
    const hits = await milvus.searchByUser([1, 0, 0, 0], 1, 5);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.payload.user_id).toBe(1);
    }
  });

  it('deleteByDocument:清场后该文档的点不再被检索到', async () => {
    await milvus.upsertChunks([
      {
        id: 'pt-del',
        vector: [0, 1, 0, 0],
        payload: { user_id: 3, document_id: 300, chunk_id: 30, chunk_index: 0 },
      },
    ]);
    // 删前能查到
    const before = await milvus.searchByUser([0, 1, 0, 0], 3, 5);
    expect(before.some((h) => h.payload.document_id === 300)).toBe(true);

    await milvus.deleteByDocument(300);

    const after = await milvus.searchByUser([0, 1, 0, 0], 3, 5);
    expect(after.some((h) => h.payload.document_id === 300)).toBe(false);
  });
});
