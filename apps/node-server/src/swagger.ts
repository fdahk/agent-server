import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * 接入 Swagger:启用后浏览器访问 /docs 看 UI,/docs-json 拿 OpenAPI JSON
 *
 * 前端用 openapi-typescript 之类的工具消费 /docs-json,即可在前端代码里
 * 拿到完全对齐后端的接口类型,避免手工同步。
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Agent Server API')
    .setDescription('AI 知识助手后端接口文档')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
  });
}
