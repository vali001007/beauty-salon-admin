import { Module } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { AiController } from './ai.controller.js';
import { IndustryModule } from '../industry/industry.module.js';
import { AiProviderHealthService } from './ai-provider-health.service.js';

@Module({
  imports: [IndustryModule],
  controllers: [AiController],
  providers: [AiService, AiProviderHealthService],
  exports: [AiService, AiProviderHealthService],
})
export class AiModule {}
