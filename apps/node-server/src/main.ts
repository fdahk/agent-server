/**
 * Node AI Gateway 的启动入口文件
 *
 * 在整体架构中，本项目（node-server）是 AI 编排层，专门负责：
 *   - 接收来自 Java Core 的 HTTP 请求
 *   - 调用本地 Ollama 大模型完成资源整理、摘要、聚类等 AI 任务
 *   - 将执行结果返回给 Java Core
 *
 * 本文件是整个 NestJS 应用的"引导程序"（bootstrap），类似于前端项目的 index.ts。
 * 它做的事情很简单：创建应用实例 → 配置中间件 → 启动监听。
 */

/**
 * reflect-metadata 是一个 polyfill 库，用于给 TypeScript 添加"运行时元数据反射"能力。
 * NestJS 的装饰器（@Module、@Injectable 等）在底层依赖它来读取类型信息，
 * 所以必须在应用最顶部引入，且只需引入一次。
 */
import 'reflect-metadata';

/**
 * NestFactory 是 NestJS 框架提供的工厂类，用于创建应用实例。
 * 你可以把它类比为 Express 中的 express()，但 NestFactory 会自动
 * 帮你完成"依赖注入容器初始化"、"模块注册"等工作。
 */
import { NestFactory } from '@nestjs/core';

/** AppModule 是整个应用的根模块（Root Module），所有子模块都挂在它下面 */
import { AppModule } from './app.module';

/**
 * bootstrap 是 NestJS 约定俗成的启动函数名。
 * 它是一个 async 函数，因为 NestFactory.create() 返回的是 Promise。
 *
 * 【什么是 async/await？】
 * async 标记的函数内部可以使用 await 来"等待"异步操作完成，
 * 让异步代码看起来像同步代码，避免回调地狱。
 */
async function bootstrap() {
  /**
   * NestFactory.create(AppModule) 会：
   *  1. 递归解析 AppModule 及其 imports 中声明的所有子模块
   *  2. 实例化所有 providers（服务类）并建立依赖注入关系
   *  3. 注册所有 controllers（控制器）中定义的路由
   *  4. 返回一个 INestApplication 实例（即 app）
   */
  const app = await NestFactory.create(AppModule);

  /**
   * 启用 CORS（跨域资源共享）。
   * origin: true 表示允许任何来源的请求访问本服务。
   * 因为本服务仅对内部 Java Core 开放，安全由 InternalTokenGuard 保证，
   * 所以 CORS 策略可以宽松一些。
   */
  app.enableCors({ origin: true });

  /**
   * 设置全局路由前缀为 'api'。
   * 这意味着所有控制器中定义的路由都会自动加上 /api 前缀。
   * 例如：@Controller('internal/agent') 的 @Post('execute')
   *       实际访问路径为 /api/internal/agent/execute
   */
  app.setGlobalPrefix('api');

  /**
   * 启动 HTTP 监听。
   * process.env.PORT 从环境变量读取端口号，未设置时默认使用 3101。
   * ?? 是 "空值合并运算符"：左侧为 null 或 undefined 时才使用右侧的值。
   */
  await app.listen(process.env.PORT ?? 3101);
}

/**
 * void bootstrap() 用于调用 bootstrap 并明确丢弃其返回的 Promise。
 * 在顶层调用 async 函数时，TypeScript 会提示"未处理的 Promise"，
 * 加上 void 可以消除这个警告，同时表明我们不关心返回值。
 */
void bootstrap();
