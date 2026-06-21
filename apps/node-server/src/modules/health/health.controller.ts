import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { MilvusService } from '../../shared/milvus/milvus.service';
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
    milvus: ComponentHealth;
  };
}

/**
 * /api/health —— 基础设施联通性检查
 *
 * 并行(Promise.allSettled)探活 Postgres / Redis / Milvus,任一项 down
 * 整体 status = degraded,但仍 200 返回 details 供外部判断。
 * LLM 不纳入(外部服务、按需调用、健康检查里 ping 会浪费 token)。
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly milvus: MilvusService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    // showCollections 会发起一次 gRPC 调用,Milvus 不可达时 reject → 判 down
    const [pg, rd, mv] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
      this.milvus.client.showCollections(),
    ]);

    const toHealth = (r: PromiseSettledResult<unknown>): ComponentHealth =>
      r.status === 'fulfilled'
        ? { status: 'up' }
        : {
            status: 'down',
            error: String(r.reason),
          };

    const allUp = [pg, rd, mv].every((r) => r.status === 'fulfilled');

    return {
      status: allUp ? 'ok' : 'degraded',
      details: {
        postgres: toHealth(pg),
        redis: toHealth(rd),
        milvus: toHealth(mv),
      },
    };
  }
}
