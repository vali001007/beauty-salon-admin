import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { DiscountAllocationService } from './discount-allocation.service.js';
import { CommissionModule } from '../commission/commission.module.js';
import { CardsModule } from '../cards/cards.module.js';

@Module({
  imports: [CommissionModule, CardsModule],
  controllers: [OrdersController],
  providers: [OrdersService, DiscountAllocationService],
  exports: [OrdersService, DiscountAllocationService],
})
export class OrdersModule {}
