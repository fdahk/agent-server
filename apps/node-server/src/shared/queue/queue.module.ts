import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RUNS_QUEUE } from './queue.types';

/** 把 REDIS_URL 解析成 ioredis 连接选项(用普通对象而非实例,规避 bullmq 自带 ioredis 版本的类型冲突) */
function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    // BullMQ 要求阻塞命令不限重试次数
    maxRetriesPerRequest: null,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/**
 * 队列层:BullMQ 共享连接 + runs 队列。
 *
 * - forRoot 提供全进程共享的连接配置;BullMQ 内部按需 duplicate 出阻塞连接。
 *   不复用 RedisService.client:订阅/阻塞会独占连接,队列必须用独立连接。
 * - registerQueue 注册 runs 队列;@Global + 导出 BullModule,
 *   让生产端(controller)直接 @InjectQueue(RUNS_QUEUE),消费端(@Processor)共用同一连接。
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({ connection: redisConnection() }),
    }),
    BullModule.registerQueue({ name: RUNS_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
