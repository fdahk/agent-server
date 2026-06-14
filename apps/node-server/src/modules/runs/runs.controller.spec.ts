import { describe, it, expect, vi } from 'vitest';
import { firstValueFrom, toArray } from 'rxjs';
import type { RunEvent } from '@prisma/client';
import { RunsController } from './runs.controller';
import type { RunEngineService } from '../../shared/run-engine/run-engine.service';
import type { RedisService } from '../../shared/redis/redis.service';
import type { AuthedUser } from '../auth/jwt.strategy';

type MessageHandler = (channel: string, message: string) => void;

/** 可手动投递消息的假 Redis 订阅连接 */
function makeFakeRedis() {
  let handler: MessageHandler | undefined;
  return {
    on: vi.fn((_event: string, h: MessageHandler) => {
      handler = h;
    }),
    subscribe: vi.fn(() => Promise.resolve(undefined)),
    unsubscribe: vi.fn(() => Promise.resolve(undefined)),
    quit: vi.fn(() => Promise.resolve(undefined)),
    removeAllListeners: vi.fn(),
    deliver: (channel: string, ev: object) =>
      handler?.(channel, JSON.stringify(ev)),
  };
}

function ev(sequenceNo: number, eventType: string): RunEvent {
  return {
    id: sequenceNo,
    runId: 'run-x',
    sequenceNo,
    eventType,
    payload: { i: sequenceNo },
    createdAt: new Date(),
  } as unknown as RunEvent;
}

function makeController(opts: {
  run: { userId: number; status: string } | null;
  since: RunEvent[];
  fakeRedis: ReturnType<typeof makeFakeRedis>;
}) {
  const engine = {
    getRun: vi.fn(() => Promise.resolve(opts.run)),
    getEventsSince: vi.fn(() => Promise.resolve(opts.since)),
    getSnapshot: vi.fn(),
  } as unknown as RunEngineService;
  const redis = {
    duplicate: () => opts.fakeRedis,
  } as unknown as RedisService;
  const queue = {} as never;
  return new RunsController(queue, engine, redis);
}

const user: AuthedUser = { userId: 7, username: 'u', role: 'USER', scope: [] };

describe('RunsController.stream(SSE)', () => {
  it('按 Last-Event-ID 只回放缺失事件,带 id/type,遇终态事件结束流', async () => {
    const fakeRedis = makeFakeRedis();
    const controller = makeController({
      run: { userId: 7, status: 'running' },
      // sinceSeq=1 时只补 2、3,且 3 是终态
      since: [ev(2, 'step'), ev(3, 'run_completed')],
      fakeRedis,
    });
    const req = { headers: { 'last-event-id': '1' }, query: {} } as never;

    const events = await firstValueFrom(
      controller.stream('run-x', user, req).pipe(toArray()),
    );

    expect(events.map((e) => e.id)).toEqual(['2', '3']);
    expect(events.map((e) => e.type)).toEqual(['step', 'run_completed']);
    expect(fakeRedis.subscribe).toHaveBeenCalledWith('run:run-x');
  });

  it('补缺期间到达的实时事件先入 buffer,补缺后按 watermark 去重 flush(无缝且不重号)', async () => {
    const fakeRedis = makeFakeRedis();
    const controller = makeController({
      run: { userId: 7, status: 'running' }, // 非终态,补缺后仍等实时
      // sinceSeq=1 → 补缺 2、3(均非终态)
      since: [ev(2, 'step'), ev(3, 'step')],
      fakeRedis,
    });
    const req = { headers: { 'last-event-id': '1' }, query: {} } as never;

    const got: { id?: string; type?: string }[] = [];
    const completion = new Promise<void>((resolve, reject) => {
      controller.stream('run-x', user, req).subscribe({
        next: (e) => got.push({ id: e.id as string, type: e.type as string }),
        complete: resolve,
        error: reject,
      });
    });

    // 此刻订阅已注册(sub.on 同步执行),补缺仍挂在 microtask 队列上未完成。
    // 同步投递的实时事件会先进 liveBuffer:seq=3 与补缺重号应被去重,seq=4 终态收尾。
    fakeRedis.deliver('run:run-x', ev(3, 'step')); // 与补缺 3 重号
    fakeRedis.deliver('run:run-x', ev(4, 'run_completed')); // 实时新事件 + 终态

    await completion;

    expect(got.map((e) => e.id)).toEqual(['2', '3', '4']); // 3 只出现一次
    expect(got.at(-1)?.type).toBe('run_completed');
  });

  it('非本人/不存在的 run:流以错误结束(不泄露事件)', async () => {
    const fakeRedis = makeFakeRedis();
    const controller = makeController({
      run: { userId: 999, status: 'running' }, // 归属不符
      since: [],
      fakeRedis,
    });
    const req = { headers: {}, query: {} } as never;

    await expect(
      firstValueFrom(controller.stream('run-x', user, req).pipe(toArray())),
    ).rejects.toThrow('运行不存在或无权访问');
  });
});
