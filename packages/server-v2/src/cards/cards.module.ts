import { Module } from '@nestjs/common';
import { CardsService } from './cards.service.js';
import { CardsController } from './cards.controller.js';
import { CommissionModule } from '../commission/commission.module.js';

@Module({
  imports: [CommissionModule],
  controllers: [CardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
