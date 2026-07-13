import { Controller, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { FinanceMetricsService } from './finance-metrics.service.js';
import { QueryFinanceDailyMetricsDto } from './dto.js';

@ApiTags('Finance Metrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('finance/metrics')
export class FinanceMetricsController {
  constructor(private readonly financeMetricsService: FinanceMetricsService) {}

  @Get('daily')
  @Permissions('core:finance:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '统一财务日指标' })
  getDailyMetrics(@Query() query: QueryFinanceDailyMetricsDto, @Headers('x-store-id') storeHeader?: string) {
    return this.financeMetricsService.getDailyMetrics(query, storeHeader);
  }
}
