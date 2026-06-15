import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { CustomersController } from './customers.controller.js';
import { CustomerProfileService } from './customer-profile.service.js';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerProfileService],
  exports: [CustomersService, CustomerProfileService],
})
export class CustomersModule {}
