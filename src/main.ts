import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // 根模块启动入口：Nest 会从 AppModule 开始扫描模块、控制器和可注入服务
  const app = await NestFactory.create(AppModule);
  // 允许前端不同端口访问当前后端；开发阶段方便联调
  app.enableCors({
    origin: true,
  });
  // 给所有控制器路由统一加上 /api 前缀
  app.setGlobalPrefix('api');

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
