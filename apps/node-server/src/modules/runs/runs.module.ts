import { Module } from '@nestjs/common';
import { QueueModule } from '../../shared/queue/queue.module';
import { RunsController } from './runs.controller';

/**
 * runs 模块:运行的入队入口 + SSE 进度订阅。
 *
 * RunEngineService / RedisService 都是 @Global() 全局可注入,这里只需补充
 * QueueModule 以拿到 runs 队列的生产端句柄(@InjectQueue)。
 */
@Module({
  imports: [QueueModule],
  controllers: [RunsController],
})
export class RunsModule {}
