import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Document } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RunEngineService } from '../../shared/run-engine/run-engine.service';
import { RUNS_QUEUE, type RunJobData } from '../../shared/queue/queue.types';
import type { AuthedUser } from '../auth/jwt.strategy';
import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_HINT,
  isSupported,
} from './document-parser';

/** @UploadedFile() 注入的对象只用到这几个字段(避免依赖未安装的 @types/multer) */
export interface UploadedDoc {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly storageRoot =
    process.env.DOCUMENT_STORAGE_DIR ??
    join(process.cwd(), 'storage/documents');

  constructor(
    private readonly prisma: PrismaService,
    private readonly runEngine: RunEngineService,
    @InjectQueue(RUNS_QUEUE) private readonly runsQueue: Queue<RunJobData>,
  ) {}

  /** 存盘 → 建 Document(queued)→ 起摄取 run 入队;不在请求线程里做解析 */
  async upload(
    user: AuthedUser,
    file: UploadedDoc | undefined,
  ): Promise<{ documentId: number; runId: string }> {
    if (!file) throw new BadRequestException('缺少上传文件 file');
    if (!isSupported(file.originalname)) {
      throw new BadRequestException(`不支持的文件类型(${SUPPORTED_HINT})`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`文件过大,上限 ${MAX_UPLOAD_BYTES} 字节`);
    }

    const dir = join(this.storageRoot, String(user.userId));
    await mkdir(dir, { recursive: true });
    const storagePath = join(
      dir,
      `${randomUUID()}-${basename(file.originalname)}`,
    );
    await writeFile(storagePath, file.buffer);

    const doc = await this.prisma.document.create({
      data: {
        userId: user.userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        status: 'queued',
      },
    });

    const run = await this.runEngine.createRun({
      userId: user.userId,
      kind: 'ingestion',
      task: `ingest:${file.originalname}`.slice(0, 255),
      refId: String(doc.id),
    });
    await this.runsQueue.add('ingestion', {
      runId: run.runId,
      userId: user.userId,
    });

    return { documentId: doc.id, runId: run.runId };
  }

  list(userId: number): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: number, id: number): Promise<Document> {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc || doc.userId !== userId) {
      throw new NotFoundException('文档不存在或无权访问');
    }
    return doc;
  }
}
