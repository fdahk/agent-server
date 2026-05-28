/**
 * 应用根模块(Root Module)
 *
 * 单 Node 服务的根模块。后续各功能模块(auth/documents/chat/agent)与基础设施
 * 模块(prisma/redis/qdrant/llm 等)将随里程碑逐步在此 imports 注册。
 * 目前仅保留根级 AppController(健康检查)与 AppService。
 */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
