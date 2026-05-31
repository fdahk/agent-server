import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthedUser } from '../auth/jwt.strategy';
import { MAX_UPLOAD_BYTES } from './document-parser';
import { DocumentsService, type UploadedDoc } from './documents.service';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '上传文档,异步摄取;返回 documentId 与 runId 供订阅进度',
  })
  upload(
    @CurrentUser() user: AuthedUser,
    @UploadedFile() file: UploadedDoc,
  ): Promise<{ documentId: number; runId: string }> {
    return this.documents.upload(user, file);
  }

  @Get()
  @ApiOperation({ summary: '列出当前用户的文档' })
  list(@CurrentUser() user: AuthedUser) {
    return this.documents.list(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '取单个文档(含摄取状态)' })
  get(@CurrentUser() user: AuthedUser, @Param('id', ParseIntPipe) id: number) {
    return this.documents.get(user.userId, id);
  }
}
