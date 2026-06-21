import { Global, Module } from '@nestjs/common';
import { MilvusService } from './milvus.service';

/**
 * MilvusModule —— 全局向量库模块
 *
 * @Global() 让 MilvusService 在任意模块可注入,无需重复 imports。
 */
@Global()
@Module({
  providers: [MilvusService],
  exports: [MilvusService],
})
export class MilvusModule {}
