import { Global, Module } from '@nestjs/common';
import { RunEngineService } from './run-engine.service';

/** @Global() 让摄取、agent 等模块直接注入 RunEngineService */
@Global()
@Module({
  providers: [RunEngineService],
  exports: [RunEngineService],
})
export class RunEngineModule {}
