import { Module } from '@nestjs/common';
import { FinanceMetricsModule } from '../finance-metrics/finance-metrics.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OperationCostsController } from './operation-costs.controller.js';
import { OperationCostsService } from './operation-costs.service.js';
import { OperationProfitController } from './operation-profit.controller.js';
import { OperationProfitService } from './operation-profit.service.js';

@Module({
  imports: [PrismaModule, FinanceMetricsModule],
  controllers: [OperationProfitController, OperationCostsController],
  providers: [OperationProfitService, OperationCostsService],
  exports: [OperationProfitService, OperationCostsService],
})
export class OperationProfitModule {}
