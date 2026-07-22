import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrdersController } from './orders.controller.js';
import { DiscountAllocationService } from './discount-allocation.service.js';
import { OrderRefundService } from './refund/order-refund.service.js';
import { RefundInventoryReversalService } from './refund/refund-inventory-reversal.service.js';
import { CommissionModule } from '../commission/commission.module.js';
import { CardsModule } from '../cards/cards.module.js';

@Module({
  imports: [CommissionModule, CardsModule],
  controllers: [OrdersController],
  providers: [OrdersService, DiscountAllocationService, OrderRefundService, RefundInventoryReversalService],
  exports: [OrdersService, DiscountAllocationService, OrderRefundService, RefundInventoryReversalService],
})
export class OrdersModule {}
