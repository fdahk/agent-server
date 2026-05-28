import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { QdrantService } from '../../shared/qdrant/qdrant.service';
import { Public } from '../auth/public.decorator';

interface ComponentHealth {
  status: 'up' | 'down';
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded';
  details: {
    postgres: ComponentHealth;
    redis: ComponentHealth;
    qdrant: ComponentHealth;
  };
}

/**
 * /api/health —— 基础设施联通性检查
 *
 * 并行(Promise.allSettled)探活 Postgres / Redis / Qdrant,任一项 down
 * 整体 status = degraded,但仍 200 返回 details 供外部判断。
 * LLM 不纳入(外部服务、按需调用、健康检查里 ping 会浪费 token)。
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly qdrant: QdrantService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [pg, rd, qd] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
      this.qdrant.client.getCollections(),
    ]);

    const toHealth = (r: PromiseSettledResult<unknown>): ComponentHealth =>
      r.status === 'fulfilled'
        ? { status: 'up' }
        : {
            status: 'down',
            error: String(r.reason),
          };

    const allUp = [pg, rd, qd].every((r) => r.status === 'fulfilled');

    return {
      status: allUp ? 'ok' : 'degraded',
      details: {
        postgres: toHealth(pg),
        redis: toHealth(rd),
        qdrant: toHealth(qd),
      },
    };
  }
}
