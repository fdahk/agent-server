import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        // dev 默认值仅本地能跑;生产必须从环境变量注入真实密钥
        secret: process.env.JWT_SECRET ?? 'dev-secret-change-me-in-production',
        signOptions: {
          // expiresIn 接受数字(秒)或时间字符串;统一用数字避免类型分歧
          expiresIn: Number(process.env.JWT_EXPIRE_SECONDS ?? 7200),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // APP_GUARD 让 JwtAuthGuard 全局生效,默认保护所有路由
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
