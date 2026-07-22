import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { StoreMetricsModule } from '../store-metrics/store-metrics.module.js';

@Module({
  imports: [StoreMetricsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
