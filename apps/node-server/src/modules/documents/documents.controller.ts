import {
  Controller,
  Delete,
  Get,
  HttpCode,
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
  @ApiConsumes('multipart/form-data') // 告诉 Swagger 这个接口需要上传文件,参数里才会出现 "Choose File" 的按钮
  @ApiOperation({
    summary: '上传文档,异步摄取;返回 documentId 与 runId 供订阅进度',
  })
  upload(
    @CurrentUser() user: AuthedUser,
    // UploadedFile() 是 Nest 提供的参数装饰器,配合 FileInterceptor 使用,能把上传的文件注入到参数里
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

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删文档(同步清 Milvus 向量 + 磁盘文件)' })
  async delete(
    @CurrentUser() user: AuthedUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.documents.delete(user.userId, id);
  }
}
