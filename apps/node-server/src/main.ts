/**
 * 单 Node 服务启动入口(bootstrap)
 *
 * 创建 NestJS 应用实例 → 配置中间件 → 启动监听。
 * reflect-metadata 必须最先引入:NestJS 装饰器在运行时靠它读取类型元数据。
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 允许跨域访问,生产应收敛 origin 白名单
  app.enableCors({ origin: true });

  // 全局校验管道:DTO 装饰器(class-validator)生效;whitelist 丢弃未声明字段
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // 全局路由前缀 'api',所有控制器路由自动加 /api
  app.setGlobalPrefix('api');

  // 接口文档:/docs(UI),/docs-json(OpenAPI JSON)
  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3101);
}

void bootstrap();
