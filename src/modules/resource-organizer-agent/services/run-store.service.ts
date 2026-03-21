import { Injectable, NotFoundException } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import type {
  AgentRunEvent,
  AgentRunResult,
  AgentRunStatus,
} from '../types/types';

type StoredRun = {
  id: string;
  status: AgentRunStatus;
  createdAt: string;
  /** 已发生事件（用于 SSE 晚连接时重放 + getRun 返回） */
  events: AgentRunEvent[];
  /** 广播实时事件给当前所有订阅该 run 的 SSE 连接 */
  subject: Subject<AgentRunEvent>;
  result?: AgentRunResult;
};

@Injectable()
export class AgentRunStoreService {
  // 单进程内存态运行仓库：按 runId 保存状态、历史事件和实时广播通道
  private readonly runs = new Map<string, StoredRun>();

  /** 在内存中登记一次运行；executeRun 随后 publish 的事件会进 events 并经由 subject 推送 */
  create(runId: string): void {
    this.runs.set(runId, {
      id: runId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      events: [],
      subject: new Subject<AgentRunEvent>(),
    });
  }

  setStatus(runId: string, status: AgentRunStatus): void {
    const run = this.getStoredRun(runId);
    run.status = status;
  }

  /** 追加历史并推给所有已连接的 SSE；终态事件后 complete subject，Observable 随之结束 */
  publish(event: AgentRunEvent): void {
    const run = this.getStoredRun(event.runId);
    run.events.push(event);
    run.subject.next(event);

    if (event.type === 'run_completed') {
      run.status = 'completed';
      run.result = event.payload;
      run.subject.complete();
    }

    if (event.type === 'run_failed') {
      run.status = 'failed';
      run.subject.complete();
    }
  }

  /**
   * 转为 Nest @Sse 用的 Observable：先同步重放 run.events（晚连客户端不丢已发生进度），
   * Observable 是 RxJS 中的一个类，用于创建一个可观察对象，可以订阅、取消订阅、发送值、错误和完成。
   * 若未结束再订阅 subject；连接断开时 unsubscribe。
   */
  stream(runId: string): Observable<MessageEvent> {
    const run = this.getStoredRun(runId);

    return new Observable<MessageEvent>((subscriber) => {
      for (const event of run.events) {
        // MessageEvent.type → SSE `event:`；data 序列化后为前端 JSON.parse 的字符串
        subscriber.next({
          type: event.type,
          data: event,
        });
      }

      if (run.status === 'completed' || run.status === 'failed') {
        subscriber.complete();
        return;
      }

      const subscription = run.subject.subscribe({
        next: (event) =>
          subscriber.next({
            type: event.type,
            data: event,
          }),
        error: (error: unknown) => subscriber.error(error),
        complete: () => subscriber.complete(),
      });

      return () => subscription.unsubscribe();
    });
  }

  // 返回裁剪后的快照，而不是把内部 subject 等实现细节暴露给控制器，避免泄露敏感信息
  getRunSnapshot(
    runId: string,
  ): Pick<StoredRun, 'id' | 'status' | 'createdAt' | 'events' | 'result'> {
    // 返回裁剪后的快照，而不是把内部 subject 等实现细节暴露给控制器
    const run = this.getStoredRun(runId);
    return {
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      events: run.events,
      result: run.result,
    };
  }

  // 获取存储的运行，如果运行不存在，则抛出异常
  private getStoredRun(runId: string): StoredRun {
    const run = this.runs.get(runId);

    if (!run) {
      // Nest 会把这个异常自动转换成 404 HTTP 响应
      throw new NotFoundException(`运行 ${runId} 不存在`);
    }

    return run;
  }
}
