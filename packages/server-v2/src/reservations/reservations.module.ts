import { Module } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
import { ReservationsController } from './reservations.controller.js';
import { CustomerWaitingController } from './customer-waiting.controller.js';
import { CustomerWaitingService } from './customer-waiting.service.js';

@Module({
  controllers: [ReservationsController, CustomerWaitingController],
  providers: [ReservationsService, CustomerWaitingService],
  exports: [ReservationsService, CustomerWaitingService],
})
export class ReservationsModule {}
