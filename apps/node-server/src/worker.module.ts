import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { QdrantModule } from './shared/qdrant/qdrant.module';
import { LlmModule } from './shared/llm/llm.module';
import { RunEngineModule } from './shared/run-engine/run-engine.module';
import { QueueModule } from './shared/queue/queue.module';
import { RagModule } from './shared/rag/rag.module';
import { RunProcessor } from './modules/runs/run.processor';
import { IngestionService } from './modules/documents/ingestion.service';
import { AgentRunnerService } from './modules/agent/agent-runner.service';
import { ToolRegistry } from './modules/agent/tool.registry';

/**
 * worker 进程的根模块(无 HTTP)。
 *
 * 与 web 的 AppModule 共享同一批基础设施模块,但只装 @Processor 消费者与摄取逻辑、
 * 不装任何 controller——角色由启动入口区分。
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    QdrantModule,
    LlmModule,
    RunEngineModule,
    QueueModule,
    RagModule,
  ],
  providers: [RunProcessor, IngestionService, AgentRunnerService, ToolRegistry],
})
export class WorkerModule {}
