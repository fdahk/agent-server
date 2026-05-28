import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule —— 全局可用的数据库访问模块
 *
 * @Global() 让 PrismaService 在任意模块可注入,无需重复 imports。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
