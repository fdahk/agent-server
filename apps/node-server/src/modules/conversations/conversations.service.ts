import { Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation, Message } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

/**
 * 会话与消息的持久化层(纯 CRUD,无 LLM/检索逻辑)。
 *
 * 所有读写都按 userId 做归属校验——多租户隔离不能只靠检索过滤,会话/消息本身
 * 也必须按 user 限定。RAG 编排(检索 + 生成)在 ChatService,不在这里。
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: number, dto: CreateConversationDto): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: { userId, title: dto.title ?? '新对话' },
    });
  }

  list(userId: number): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** 取会话 + 全量消息(按时间升序),含归属校验 */
  async get(
    userId: number,
    id: number,
  ): Promise<Conversation & { messages: Message[] }> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv || conv.userId !== userId) {
      throw new NotFoundException('会话不存在或无权访问');
    }
    return conv;
  }

  /** 仅校验归属并返回会话本身(不拉消息),供 ChatService 用 */
  async ensureOwned(userId: number, id: number): Promise<Conversation> {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv || conv.userId !== userId) {
      throw new NotFoundException('会话不存在或无权访问');
    }
    return conv;
  }

  /** 删会话:Message 走 Prisma 级联删,无外部资源要清 */
  async delete(userId: number, id: number): Promise<{ id: number }> {
    const conv = await this.ensureOwned(userId, id);
    await this.prisma.conversation.delete({ where: { id: conv.id } });
    return { id: conv.id };
  }
}
