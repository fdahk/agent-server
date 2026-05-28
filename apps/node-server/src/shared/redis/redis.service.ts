import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';

/**
 * RedisService —— 统一的 Redis 连接入口
 *
 * 三处用途共用它:
 * - BullMQ 任务队列(需要 maxRetriesPerRequest: null)
 * - Pub/Sub 扇出(订阅态连接不能再发普通命令,故提供 duplicate())
 * - 缓存(embedding 结果等)
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.client = new Redis(url, {
      // BullMQ 要求阻塞命令不限重试次数
      maxRetriesPerRequest: null,
      // 延迟连接,connect 时机交给 onModuleInit / 测试显式控制
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('Redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /** Pub/Sub 必须用独立连接:进入订阅态后该连接不能再发普通命令 */
  duplicate(): Redis {
    return this.client.duplicate();
  }
}
