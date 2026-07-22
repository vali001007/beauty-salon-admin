import { Module } from '@nestjs/common';
import { FinanceMetricsModule } from '../finance-metrics/finance-metrics.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StoreMetricsController } from './store-metrics.controller.js';
import { StoreMetricsService } from './store-metrics.service.js';

@Module({
  imports: [PrismaModule, FinanceMetricsModule],
  controllers: [StoreMetricsController],
  providers: [StoreMetricsService],
  exports: [StoreMetricsService],
})
export class StoreMetricsModule {}
