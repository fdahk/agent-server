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

  // CORS:env CORS_ORIGINS 是逗号分隔白名单;留空时仅在 NODE_ENV !== 'production'
  // 下回退到反射任意 origin(开发友好)。生产强制白名单,空白名单 = 直接拒所有跨源。
  app.enableCors({
    origin: buildCorsOrigin(),
    credentials: true,
    exposedHeaders: ['Last-Event-ID'],
  });

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

/**
 * 解析 CORS origin 配置。
 *
 * 输入来源:env CORS_ORIGINS,值为逗号分隔的精确 origin 列表
 *   例: "http://localhost:5173,https://app.your-domain.com"
 *
 * 返回:
 *   - 列表非空 → 字符串数组,Nest/Express 严格匹配
 *   - 列表为空 + NODE_ENV !== 'production' → true(反射任意 origin,dev 方便)
 *   - 列表为空 + 生产 → false(直接禁所有跨源,强制配 env)
 *
 * 该函数被 e2e 测试直接调用,故 export。
 */
export function buildCorsOrigin(): string[] | boolean {
  const raw = process.env.CORS_ORIGINS?.trim();
  const list = raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  if (list.length > 0) return list;
  return process.env.NODE_ENV !== 'production';
}

void bootstrap();
