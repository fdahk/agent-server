import { Module } from '@nestjs/common';
import { RagRetriever } from './rag.retriever';

/**
 * RagModule —— 导出唯一检索入口 RagRetriever。
 *
 * 依赖的 Llm/Milvus/Prisma 都来自 @Global() 模块,这里无需 imports。
 * 需要检索的功能模块(conversations、未来的 agent)imports 本模块即可。
 */
@Module({
  providers: [RagRetriever],
  exports: [RagRetriever],
})
export class RagModule {}
