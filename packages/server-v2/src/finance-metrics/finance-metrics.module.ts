import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FinanceMetricsController } from './finance-metrics.controller.js';
import { FinanceMetricsService } from './finance-metrics.service.js';
import { FinanceRecognitionModule } from '../finance-recognition/finance-recognition.module.js';

@Module({
  imports: [PrismaModule, FinanceRecognitionModule],
  controllers: [FinanceMetricsController],
  providers: [FinanceMetricsService],
  exports: [FinanceMetricsService],
})
export class FinanceMetricsModule {}
