/**
 * auth 模块的装配中心(NestJS Module)。
 *
 * NestJS 用"模块"把一组相关的 controller / service / provider 打包,并声明它
 * 依赖谁、对外导出谁。容器(DI)据此在启动时把这些类实例化、互相注入。本文件
 * 不写业务逻辑,只负责"把 auth 的零件接到一起 + 配置 JWT"。
 *
 * - @nestjs/common —— NestJS 核心装饰器/工具集(@Module、异常、管道等都在这)。
 * - @nestjs/core   —— 框架运行时内核,提供 APP_GUARD 这类"全局组件"注入令牌。
 * - @nestjs/jwt    —— NestJS 对 jsonwebtoken 的封装,负责签发/校验 JWT。
 * - @nestjs/passport —— NestJS 对 Passport(Node 最主流的鉴权中间件)的封装。
 */
// @Module:把下面的元数据(imports/controllers/providers/exports)登记成一个模块
import { Module } from '@nestjs/common';
// APP_GUARD:一个特殊的注入令牌,用它 provide 一个 Guard 就会"全局生效"
import { APP_GUARD } from '@nestjs/core';
// JwtModule:提供 JwtService(签发/校验 token),这里用 registerAsync 注入密钥与有效期
import { JwtModule } from '@nestjs/jwt';
// PassportModule:接入 Passport 策略体系,JwtStrategy 注册后才能被 AuthGuard('jwt') 找到
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  // imports:引入其他模块(如 JwtModule)提供的 provider;
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        // dev 默认值仅本地能跑;生产必须从环境变量注入真实密钥
        secret: process.env.JWT_SECRET ?? 'dev-secret',
        signOptions: {
          // expiresIn 接受数字(秒)或时间字符串;统一用数字避免类型分歧
          expiresIn: Number(process.env.JWT_EXPIRE_SECONDS ?? 7200),
        },
      }),
    }),
  ],
  // controllers:声明这个模块有哪些 controller;
  controllers: [AuthController],
  // provider:一个可注入的类,可以是 service/guard/strategy 等;
  // 全局 provider 让它在整个应用都能被注入(如 JwtAuthGuard);
  providers: [
    AuthService,
    JwtStrategy,
    // APP_GUARD 让 JwtAuthGuard 全局生效,默认保护所有路由
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  // exports:导出 provider 供其他模块 import;如 AuthService 供其他模块调 auth 功能,JwtModule 供其他模块签发/校验 JWT
  // 没 export 的 provider 是模块私有的——这就是封装边界。
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
