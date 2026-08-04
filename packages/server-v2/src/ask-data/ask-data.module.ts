import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { AskDataController } from './ask-data.controller.js';
import { AskDataService } from './ask-data.service.js';

@Module({
  imports: [AiModule],
  controllers: [AskDataController],
  providers: [AskDataService],
  exports: [AskDataService],
})
export class AskDataModule {}
