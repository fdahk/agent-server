import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * HealthModule —— 仅注册 controller;依赖的 PrismaService/RedisService/QdrantService
 * 均来自 @Global() 模块,无需 imports
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
