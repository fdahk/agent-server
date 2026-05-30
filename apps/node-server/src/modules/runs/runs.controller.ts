import {
  Controller,
  Get,
  HttpCode,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Req,
  Sse,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { RunEvent } from '@prisma/client';
import { RunEngineService } from '../../shared/run-engine/run-engine.service';
import { runChannel } from '../../shared/run-engine/run-engine.types';
import { RedisService } from '../../shared/redis/redis.service';
import { RUNS_QUEUE, type RunJobData } from '../../shared/queue/queue.types';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthedUser } from '../auth/jwt.strategy';

/** 终态事件:收到即可结束 SSE 流,不必再等后续消息 */
const TERMINAL_EVENTS = new Set(['run_completed', 'run_failed']);

@ApiTags('runs')
@Controller('runs')
export class RunsController {
  constructor(
    @InjectQueue(RUNS_QUEUE) private readonly runsQueue: Queue<RunJobData>,
    private readonly runEngine: RunEngineService,
    private readonly redis: RedisService,
  ) {}

  /** 造一个假 job 入队,worker 异步消费;立即返回 runId 供前端订阅进度(M2 验收用) */
  @Post('demo')
  @HttpCode(202)
  @ApiOperation({ summary: '入队一个演示作业,返回 runId' })
  async demo(@CurrentUser() user: AuthedUser): Promise<{ runId: string }> {
    const run = await this.runEngine.createRun({
      userId: user.userId,
      kind: 'agent_task',
      task: 'demo job',
    });
    await this.runsQueue.add('demo', { runId: run.runId, userId: user.userId });
    return { runId: run.runId };
  }

  /**
   * 订阅某个 run 的实时事件流(SSE)。
   *
   * 多副本可用的关键:事件并非由本进程直接产生,而是 worker 经 Redis pub/sub
   * 广播,持有本 SSE 连接的 web 副本订阅 run:{runId} 频道转发给前端。
   *
   * 断线重连:浏览器 EventSource 重连会带 Last-Event-ID 头(上次收到的 sequenceNo),
   * 这里据此只回放缺失的事件段,再转入实时,避免漏事件/重复。
   *
   * 防漏序:先 subscribe 再查 getEventsSince——订阅与补缺之间到达的实时事件先入
   * buffer,补缺完成后按 watermark 去重 flush,保证"补缺→实时"无缝且不重号。
   */
  @Sse(':runId/stream')
  @ApiOperation({ summary: '订阅 run 事件流(SSE,支持 Last-Event-ID 重连回放)' })
  stream(
    @Param('runId') runId: string,
    @CurrentUser() user: AuthedUser,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    const channel = runChannel(runId);
    const headerId = req.headers['last-event-id'];
    const queryId = req.query.lastEventId;
    const sinceSeq =
      Number(
        (Array.isArray(headerId) ? headerId[0] : headerId) ?? queryId ?? 0,
      ) || 0;

    return new Observable<MessageEvent>((subscriber) => {
      const sub = this.redis.duplicate();
      let watermark = sinceSeq;
      let caughtUp = false;
      const liveBuffer: RunEvent[] = [];

      const emit = (ev: RunEvent): void => {
        if (ev.sequenceNo <= watermark) return; // 去重:已发过的序号不再发
        watermark = ev.sequenceNo;
        subscriber.next({
          id: String(ev.sequenceNo),
          type: ev.eventType,
          data: ev as unknown as Record<string, unknown>,
        });
        if (TERMINAL_EVENTS.has(ev.eventType)) subscriber.complete();
      };

      sub.on('message', (_ch: string, raw: string) => {
        const ev = JSON.parse(raw) as RunEvent;
        if (caughtUp) emit(ev);
        else liveBuffer.push(ev);
      });

      void (async () => {
        const run = await this.runEngine.getRun(runId);
        if (!run || run.userId !== user.userId) {
          subscriber.error(new NotFoundException('运行不存在或无权访问'));
          return;
        }
        await sub.subscribe(channel); // 先订阅,后补缺,防止中间漏事件
        const missed = await this.runEngine.getEventsSince(runId, sinceSeq);
        for (const ev of missed) emit(ev);
        caughtUp = true;
        for (const ev of liveBuffer.splice(0)) emit(ev);
        // 接入时 run 已是终态且事件已补齐:不会再有新消息,主动收尾
        if (run.status === 'completed' || run.status === 'failed') {
          subscriber.complete();
        }
      })().catch((err: unknown) => subscriber.error(err));

      return () => {
        sub.removeAllListeners('message');
        void sub.unsubscribe(channel).finally(() => void sub.quit());
      };
    });
  }

  /** 运行快照:非流式地一次性拿状态 + 全量事件(调试/前端首屏可用) */
  @Get(':runId')
  @ApiOperation({ summary: '取 run 快照(状态 + 全量事件)' })
  async snapshot(
    @Param('runId') runId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    const snap = await this.runEngine.getSnapshot(runId);
    if (!snap || snap.run.userId !== user.userId) {
      throw new NotFoundException('运行不存在或无权访问');
    }
    return snap;
  }
}
