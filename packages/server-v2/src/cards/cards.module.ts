import { Module } from '@nestjs/common';
import { CardsService } from './cards.service.js';
import { CardsController } from './cards.controller.js';

@Module({
  controllers: [CardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
