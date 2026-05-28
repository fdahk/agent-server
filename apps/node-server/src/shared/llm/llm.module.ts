import { Global, Module } from '@nestjs/common';
import OpenAI from 'openai';
import { LlmService } from './llm.service';

/**
 * LlmModule —— 全局模型层模块
 *
 * 用 useFactory 把环境变量 + OpenAI 客户端注入 LlmService:
 * - LLM_BASE_URL:默认指向本地 Ollama 的 OpenAI 兼容端点
 * - LLM_API_KEY:本地占位 'ollama',生产换厂商真 key
 * - LLM_CHAT_MODEL / LLM_EMBED_MODEL:可分别配置(有些厂商 chat 强但 embed 不全)
 */
@Global()
@Module({
  providers: [
    {
      provide: LlmService,
      useFactory: () => {
        const client = new OpenAI({
          baseURL: process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1',
          apiKey: process.env.LLM_API_KEY ?? 'ollama',
        });
        const chatModel = process.env.LLM_CHAT_MODEL ?? 'qwen2.5:7b';
        const embedModel = process.env.LLM_EMBED_MODEL ?? 'nomic-embed-text';
        return new LlmService(client, chatModel, embedModel);
      },
    },
  ],
  exports: [LlmService],
})
export class LlmModule {}
