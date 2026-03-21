import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AgentService } from './service';
import type { AgentRunRequest } from './types/types';

@Controller('agent')
export class AgentController {
  // constructor 参数由 Nest 依赖注入容器自动提供，不需要手动 new AgentService()
  constructor(private readonly agentService: AgentService) {}

  /** 创建运行：立即返回 runId，Agent 在后台执行；进度由 GET .../stream 的 SSE 推送 */
  @Post('runs')
  createRun(@Body() body: Record<string, unknown>) {
    const request = this.normalizeRequest(body);
    return this.agentService.createRun(request);
  }

  /** 运行快照：status、历史 events、终态时的 result；供前端 SSE 断线后兜底 */
  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.agentService.getRunSnapshot(runId);
  }

  /**
   * SSE（text/event-stream）：单向推送该 runId 的 AgentRunEvent。
   * Nest 将 Observable 每项映射为 SSE 帧；`type` 对应浏览器 EventSource 的事件名，`data` 为 JSON。
   */
  @Sse('runs/:runId/stream')
  streamRun(@Param('runId') runId: string): Observable<MessageEvent> {
    return this.agentService.streamRun(runId);
  }

  private normalizeRequest(body: Record<string, unknown>): AgentRunRequest {
    // 外部请求体先按 unknown 处理，再通过 typeof / Array.isArray 逐步收窄
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    const directories = Array.isArray(body.directories)
      ? body.directories
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const urls = Array.isArray(body.urls)
      ? body.urls
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const model =
      typeof body.model === 'string' ? body.model.trim() : undefined;

    if (!task) {
      throw new BadRequestException('任务不能为空');
    }

    if (directories.length === 0 && urls.length === 0) {
      throw new BadRequestException('至少需要提供一个目录或一个 URL');
    }

    return {
      task,
      directories,
      urls,
      model,
    };
  }
}
