import { Module } from '@nestjs/common';
import { FinanceRecognitionService } from './finance-recognition.service.js';

@Module({
  providers: [FinanceRecognitionService],
  exports: [FinanceRecognitionService],
})
export class FinanceRecognitionModule {}
