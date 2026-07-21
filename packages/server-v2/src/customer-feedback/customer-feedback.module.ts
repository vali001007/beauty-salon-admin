import { Module } from '@nestjs/common';
import { CustomerFeedbackController } from './customer-feedback.controller.js';
import { CustomerFeedbackService } from './customer-feedback.service.js';

@Module({
  controllers: [CustomerFeedbackController],
  providers: [CustomerFeedbackService],
  exports: [CustomerFeedbackService],
})
export class CustomerFeedbackModule {}
