import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentModule } from './modules/resource-organizer-agent/module';

// 根模块：负责把各个功能模块装配进同一个 Nest 应用
@Module({
  imports: [AgentModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
