import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { QdrantService } from '../../src/shared/qdrant/qdrant.service';

/**
 * QdrantService 集成测试(testcontainers 起真 qdrant)
 *
 * 验证:
 * - ensureCollection 幂等:多次调用不报错
 * - upsert 点 + payload(user_id, chunk_id)
 * - 多租户过滤检索:按 user_id 过滤的结果绝不混入其他用户
 */

let container: StartedTestContainer;
let qdrant: QdrantService;

beforeAll(async () => {
  container = await new GenericContainer('qdrant/qdrant:latest')
    .withExposedPorts(6333)
    .withWaitStrategy(Wait.forHttp('/readyz', 6333))
    .start();

  process.env.QDRANT_URL = `http://${container.getHost()}:${container.getMappedPort(6333)}`;
  // 用 4 维向量做轻量测试
  process.env.QDRANT_VECTOR_SIZE = '4';
  process.env.QDRANT_COLLECTION = 'test_chunks';

  qdrant = new QdrantService();
  await qdrant.onModuleInit();
}, 180_000);

afterAll(async () => {
  await container?.stop();
});

describe('QdrantService(集成)', () => {
  it('ensureCollection 幂等(重复调用不报错)', async () => {
    await qdrant.ensureCollection();
    await qdrant.ensureCollection();
    const { collections } = await qdrant.client.getCollections();
    expect(collections.some((c) => c.name === qdrant.collection)).toBe(true);
  });

  it('多租户过滤:按 user_id 检索只返回当前用户的点', async () => {
    // 两个用户各塞一个相似向量
    await qdrant.client.upsert(qdrant.collection, {
      wait: true,
      points: [
        {
          id: 1,
          vector: [1, 0, 0, 0],
          payload: { user_id: 1, chunk_id: 10 },
        },
        {
          id: 2,
          vector: [1, 0, 0, 0],
          payload: { user_id: 2, chunk_id: 20 },
        },
      ],
    });

    // user_id=1 的检索绝不能命中 user_id=2 的点
    const hits = await qdrant.client.query(qdrant.collection, {
      query: [1, 0, 0, 0],
      limit: 5,
      filter: { must: [{ key: 'user_id', match: { value: 1 } }] },
      with_payload: true,
    });

    expect(hits.points.length).toBeGreaterThan(0);
    for (const p of hits.points) {
      expect((p.payload as { user_id: number }).user_id).toBe(1);
    }
  });
});
