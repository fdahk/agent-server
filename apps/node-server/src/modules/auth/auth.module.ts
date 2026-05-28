import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
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
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
