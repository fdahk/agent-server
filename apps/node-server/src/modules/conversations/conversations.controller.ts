import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthedUser } from '../auth/jwt.strategy';
import { ConversationsService } from './conversations.service';
import { ChatService, type ChatStreamEvent } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly chat: ChatService,
  ) {}

  @Post()
  @ApiOperation({ summary: '新建会话' })
  create(@CurrentUser() user: AuthedUser, @Body() dto: CreateConversationDto) {
    return this.conversations.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '列出当前用户的会话' })
  list(@CurrentUser() user: AuthedUser) {
    return this.conversations.list(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '取会话(含全量消息)' })
  get(@CurrentUser() user: AuthedUser, @Param('id', ParseIntPipe) id: number) {
    return this.conversations.get(user.userId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删会话(消息走 Prisma 级联删)' })
  async delete(
    @CurrentUser() user: AuthedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.conversations.delete(user.userId, id);
  }

  /**
   * 发消息并流式接收回答(SSE)。
   *
   * 用 @Res() 手写 SSE 帧而非 @Sse():@Sse 只能 GET,而提问需要 POST 带 body。
   * 前端用 fetch + ReadableStream 读取(非原生 EventSource)。
   * 事件:token(逐字)、done(messageId + 引用列表)、error(出错收尾)。
   */
  @Post(':id/messages')
  @ApiOperation({ summary: '发消息,SSE 流式返回回答 + 引用' })
  async sendMessage(
    @CurrentUser() user: AuthedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // 预检归属:在切到 SSE 头之前抛,失败可返回干净的 404 JSON
    await this.conversations.ensureOwned(user.userId, id);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 反向代理(nginx)关 buffering,token 才能即时到达
    res.flushHeaders();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const send = (event: ChatStreamEvent): void => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.chat.streamAnswer(
        user.userId,
        id,
        dto.query,
        dto.topK,
      )) {
        if (closed) break;
        send(event);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!closed) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
      }
    } finally {
      if (!closed) res.end();
    }
  }
}
