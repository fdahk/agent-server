/**
 * 应用根模块(Root Module)
 *
 * 接入基础设施模块(全部 @Global())+ 健康检查 controller。
 * 各功能模块(auth/documents/chat/agent)就绪后在 imports 追加。
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/prisma/prisma.module';
import { RedisModule } from './shared/redis/redis.module';
import { QdrantModule } from './shared/qdrant/qdrant.module';
import { LlmModule } from './shared/llm/llm.module';
import { RunEngineModule } from './shared/run-engine/run-engine.module';
import { QueueModule } from './shared/queue/queue.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { RunsModule } from './modules/runs/runs.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AgentModule } from './modules/agent/agent.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    QdrantModule,
    LlmModule,
    RunEngineModule,
    QueueModule,
    AuthModule,
    HealthModule,
    RunsModule,
    DocumentsModule,
    ConversationsModule,
    AgentModule,
  ],
})
export class AppModule {}
