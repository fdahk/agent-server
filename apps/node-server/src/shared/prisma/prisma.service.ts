import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService —— 应用层访问数据库的唯一入口
 *
 * 继承 PrismaClient,挂上 NestJS 生命周期钩子:
 * - onModuleInit:启动时显式 $connect(尽早暴露连接问题)
 * - onModuleDestroy:停机时干净断开,避免连接挂起
 *
 * 通过 PrismaModule(@Global)在全应用注入,业务模块用 constructor 拿来用即可。
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
