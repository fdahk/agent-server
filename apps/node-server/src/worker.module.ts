import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { RunEngineModule } from './shared/run-engine/run-engine.module';
import { QueueModule } from './shared/queue/queue.module';
import { RunProcessor } from './modules/runs/run.processor';

/**
 * worker 进程的根模块(无 HTTP)。
 *
 * 与 web 的 AppModule 共享同一批基础设施模块,但只装 @Processor 消费者、
 * 不装任何 controller——角色由启动入口区分。
 * 刻意不引 Qdrant/LLM:当前消费者用不到,避免 worker 启动时做无谓连接,需要时再按需补。
 */
@Module({
  imports: [PrismaModule, RedisModule, RunEngineModule, QueueModule],
  providers: [RunProcessor],
})
export class WorkerModule {}
