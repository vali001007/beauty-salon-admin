import { BadRequestException, Controller, ForbiddenException, Get, Headers, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { FinanceMetricsService } from './finance-metrics.service.js';
import { QueryFinanceDailyMetricsDto } from './dto.js';

@ApiTags('Finance Metrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('finance/metrics')
export class FinanceMetricsController {
  constructor(private readonly financeMetricsService: FinanceMetricsService) {}

  private scopedStoreId(queryStoreId: number | undefined, storeHeader: string | undefined, user: any) {
    const requested = queryStoreId ?? (storeHeader ? Number(storeHeader) : undefined);
    if (!user) return requested;
    const storeIds: number[] = user?.storeIds ?? user?.stores ?? [];
    const roles: string[] = user?.roles ?? [];
    const permissions: string[] = user?.permissions ?? [];
    const elevated = permissions.includes('*') || roles.includes('super_admin') || roles.includes('admin');
    if (elevated) return requested;
    if (requested && !storeIds.includes(requested)) throw new ForbiddenException('无权访问该门店财务数据');
    if (requested) return requested;
    if (storeIds.length === 1) return storeIds[0];
    throw new BadRequestException('请选择有权限的门店');
  }

  @Get('daily')
  @Permissions('core:finance:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '统一财务日指标' })
  getDailyMetrics(@Query() query: QueryFinanceDailyMetricsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.financeMetricsService.getDailyMetrics({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }
}
