import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type Run, type RunEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RunKind, runChannel } from './run-engine.types';

/**
 * 运行引擎:异步作业(摄取/agent)的统一生命周期 + 事件溯源 + 实时广播。
 *
 * 事件既落库(可断线重连回放、可审计)又经 Redis pub/sub 广播(多副本下
 * 任一 worker 发的事件都能送到持有 SSE 连接的那个 web 副本)。
 */
@Injectable()
export class RunEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createRun(input: {
    userId: number;
    kind: RunKind;
    task: string;
    refId?: string;
  }): Promise<Run> {
    return this.prisma.run.create({
      data: {
        runId: `run-${randomUUID()}`,
        userId: input.userId,
        kind: input.kind,
        task: input.task,
        refId: input.refId ?? null,
        status: 'queued',
      },
    });
  }

  async start(runId: string, progressMsg?: string): Promise<void> {
    await this.prisma.run.update({
      where: { runId },
      data: { status: 'running', startedAt: new Date(), progressMsg },
    });
  }

  async complete(runId: string, progressMsg?: string): Promise<void> {
    await this.prisma.run.update({
      where: { runId },
      data: { status: 'completed', completedAt: new Date(), progressMsg },
    });
  }

  /** 失败:先发一条 run_failed 事件(让前端拿到原因),再落 failed 状态 */
  async fail(runId: string, errorMsg: string): Promise<void> {
    await this.emit(runId, 'run_failed', { error: errorMsg });
    await this.prisma.run.update({
      where: { runId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        progressMsg: errorMsg.slice(0, 255),
      },
    });
  }

  /**
   * 追加运行事件并广播。
   * sequenceNo = 当前该 run 最大序号 + 1。同一 run 的事件由单个 worker 串行发出;
   * (runId, sequenceNo) 唯一约束兜底,防止并发误用造成重号。
   */
  async emit(
    runId: string,
    eventType: string,
    payload: Prisma.InputJsonValue,
  ): Promise<RunEvent> {
    const last = await this.prisma.runEvent.findFirst({
      where: { runId },
      orderBy: { sequenceNo: 'desc' },
      select: { sequenceNo: true },
    });
    const sequenceNo = (last?.sequenceNo ?? 0) + 1;
    const event = await this.prisma.runEvent.create({
      data: { runId, sequenceNo, eventType, payload },
    });
    await this.redis.client.publish(runChannel(runId), JSON.stringify(event));
    return event;
  }

  /** 运行快照:断线重连时一次性拿全量状态 + 已发生事件 */
  async getSnapshot(
    runId: string,
  ): Promise<{ run: Run; events: RunEvent[] } | null> {
    const run = await this.prisma.run.findUnique({ where: { runId } });
    if (!run) return null;
    const events = await this.prisma.runEvent.findMany({
      where: { runId },
      orderBy: { sequenceNo: 'asc' },
    });
    return { run, events };
  }

  /** 取 sinceSeq 之后的事件:SSE 重连时只补缺失的那段 */
  async getEventsSince(runId: string, sinceSeq: number): Promise<RunEvent[]> {
    return this.prisma.runEvent.findMany({
      where: { runId, sequenceNo: { gt: sinceSeq } },
      orderBy: { sequenceNo: 'asc' },
    });
  }
}
