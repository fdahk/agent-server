/**
 * worker 进程启动入口(start:worker)。
 *
 * 用 createApplicationContext 起一个**无 HTTP 监听**的 Nest 上下文:不开端口,
 * 只初始化 DI 容器,@Processor 随之创建 BullMQ Worker 开始消费 runs 队列。
 * 与 web 进程 import 同一批 module、连同一个 Redis,可独立伸缩。
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); // 收到 SIGTERM 时优雅关闭 BullMQ Worker 与连接
  new Logger('Worker').log('worker 进程已启动,正在消费 runs 队列');
}

void bootstrap();
