import { Module } from '@nestjs/common';
import { QueueModule } from '../../shared/queue/queue.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * documents 模块:上传入口 + 文档查询。
 *
 * 上传只负责存盘 + 入队,真正的摄取由 worker 进程的 IngestionService 消费 runs 队列完成。
 * Prisma/RunEngine 为 @Global();这里补 QueueModule 以拿到生产端句柄。
 */
@Module({
  imports: [QueueModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
