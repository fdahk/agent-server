import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { RedisService } from '../../src/shared/redis/redis.service';

/**
 * RedisService 集成测试(testcontainers 起真 redis)
 *
 * 验证:
 * - RedisService 连接 + 基本 set/get
 * - Pub/Sub 扇出(SSE backplane 的底层机制):
 *   一个连接 publish,duplicate 出的订阅连接能收到
 */

let container: StartedRedisContainer;
let redis: RedisService;

beforeAll(async () => {
  container = await new RedisContainer('redis:7-alpine').start();
  process.env.REDIS_URL = container.getConnectionUrl();
  redis = new RedisService();
  await redis.onModuleInit();
}, 180_000);

afterAll(async () => {
  await redis?.onModuleDestroy();
  await container?.stop();
});

describe('RedisService(集成)', () => {
  it('set/get 往返', async () => {
    await redis.client.set('greeting', 'hello');
    expect(await redis.client.get('greeting')).toBe('hello');
  });

  it('Pub/Sub 扇出(SSE backplane 机制)', async () => {
    const sub = redis.duplicate();
    const received = new Promise<string>((resolve) => {
      sub.on('message', (_channel, message) => resolve(message));
    });
    await sub.subscribe('run:1');
    // 给订阅一点建立时间
    await new Promise((r) => setTimeout(r, 50));
    await redis.client.publish('run:1', 'event-payload');

    expect(await received).toBe('event-payload');
    await sub.quit();
  });
});
