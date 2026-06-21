import { Module } from '@nestjs/common';
import { RagModule } from '../../shared/rag/rag.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { ChatService } from './chat.service';

/**
 * conversations 模块:会话/消息 CRUD + RAG 流式对话。
 *
 * imports RagModule 拿检索器;Llm/Prisma 来自 @Global()。
 */
@Module({
  imports: [RagModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ChatService],
})
export class ConversationsModule {}
