import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
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
@Injectable() // NestJS 生命周期钩子：承诺会实现相应方法，但实际上从技术角度可以不写，因为ts编译后会消失
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  //多数情况下不需要显式调用 $connect()，因为 PrismaClient 会在第一次请求 API 时自动连接；
  // 但如果希望第一次请求不用等待连接建立，可以显式调用 $connect()
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
