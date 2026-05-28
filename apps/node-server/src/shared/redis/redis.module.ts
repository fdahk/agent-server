import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * RedisModule —— 全局 Redis 模块
 *
 * @Global() 让 RedisService 在任意模块可注入,无需重复 imports。
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
