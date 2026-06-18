import { Module } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { AiController } from './ai.controller.js';
import { LegacyMessagesController } from './legacy-messages.controller.js';

@Module({
  controllers: [AiController, LegacyMessagesController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
