import { Global, Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';

/**
 * QdrantModule —— 全局向量库模块
 *
 * @Global() 让 QdrantService 在任意模块可注入,无需重复 imports。
 */
@Global()
@Module({
  providers: [QdrantService],
  exports: [QdrantService],
})
export class QdrantModule {}
