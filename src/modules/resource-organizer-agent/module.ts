import { Module } from '@nestjs/common';
import { AgentController } from './controller';
import { AxiosHttpClient } from '../../shared/clients/axios-http.client';
import { AgentReportService } from './services/report.service';
import { AgentRunStoreService } from './services/run-store.service';
import { AgentService } from './service';
import { OllamaProvider } from './providers/ollama.provider';
import { ResourceCollectionService } from './services/resource-collection.service';

// Agent 功能模块：注册该领域的控制器与所有可注入服务
// 作用：将控制器和提供者组合成一个模块，方便在其他模块中使用
@Module({
  controllers: [AgentController],
  providers: [
    AxiosHttpClient,
    AgentService,
    AgentRunStoreService,
    OllamaProvider,
    ResourceCollectionService,
    AgentReportService,
  ],
})
export class AgentModule {}
