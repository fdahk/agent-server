import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectQueue } from '@nestjs/bullmq'; // InjectQueue 是个参数装饰器,用它能在构造函数里拿到 BullMQ 的 Queue 实例
import { Queue } from 'bullmq'; // Queue 是 BullMQ 里表示一个队列的类,它有 add() 方法能往队列里添加任务
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Document } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { MilvusService } from '../../shared/milvus/milvus.service';
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
    private readonly milvus: MilvusService,
    private readonly runEngine: RunEngineService,
    @InjectQueue(RUNS_QUEUE) private readonly runsQueue: Queue<RunJobData>,
  ) {}

  /** 存盘 → 建 Document(queued)→ 起摄取 run 入队;不在请求线程里做解析 */
  async upload(
    user: AuthedUser,
    file: UploadedDoc | undefined,
  ): Promise<{ documentId: number; runId: string }> {
    if (!file) throw new BadRequestException('缺少上传文件 file');

    // multer/busboy 按 latin1 解析 multipart 文件名;浏览器以 UTF-8 字节发送中文名,
    // 不重解码会乱码入库(如「简历」→「ç®€å†」)。ASCII 名重解码是 no-op,安全。
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

    if (!isSupported(originalName)) {
      throw new BadRequestException(`不支持的文件类型(${SUPPORTED_HINT})`);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`文件过大,上限 ${MAX_UPLOAD_BYTES} 字节`);
    }

    const dir = join(this.storageRoot, String(user.userId));
    await mkdir(dir, { recursive: true });
    const storagePath = join(
      dir,
      `${randomUUID()}-${basename(originalName)}`,
    );
    await writeFile(storagePath, file.buffer);

    // 入库时状态先标 queued,等 worker 进程摄取完成后改成 processed/failed;这样用户查文档状态时就能知道是否摄取完成了
    const doc = await this.prisma.document.create({
      data: {
        userId: user.userId,
        filename: originalName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        status: 'queued',
      },
    });

    const run = await this.runEngine.createRun({
      userId: user.userId,
      kind: 'ingestion',
      task: `ingest:${originalName}`.slice(0, 255),
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

  /**
   * 删文档:Milvus 向量先清 → Postgres Document 行删(DocumentChunk 级联删)→
   * 磁盘文件尽力删。顺序:外存在前、强一致存储在后,失败可手动重试不留孤儿。
   */
  async delete(userId: number, id: number): Promise<{ id: number }> {
    const doc = await this.get(userId, id);
    await this.milvus.deleteByDocument(doc.id);
    await this.prisma.document.delete({ where: { id: doc.id } });
    try {
      await unlink(doc.storagePath);
    } catch (err: unknown) {
      // 文件可能本就不存在(测试数据 / 已被清理),忽略 ENOENT,其他错误也仅日志不抛
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(`删除文档 ${id} 的磁盘文件失败:${String(err)}`);
      }
    }
    return { id: doc.id };
  }
}
