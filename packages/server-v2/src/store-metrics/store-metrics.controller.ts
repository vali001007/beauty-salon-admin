import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { CreateStoreMetricTargetDto, StoreMetricDrilldownDto, StoreMetricScopeDto, StoreMetricTrendDto, UpdateStoreMetricTargetDto } from './dto.js';
import { StoreMetricsService } from './store-metrics.service.js';

@ApiTags('Store Metrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('store-metrics')
export class StoreMetricsController {
  constructor(private readonly service: StoreMetricsService) {}

  @Get('overview')
  @Permissions('core:store-metrics:view')
  @ApiOperation({ summary: '门店十二项核心指标总览' })
  overview(@Query() query: StoreMetricScopeDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.service.getOverview(this.storeId(query.storeId, storeHeader, user), query.date);
  }

  @Get('trends')
  @Permissions('core:store-metrics:view')
  @ApiOperation({ summary: '门店核心指标趋势' })
  trends(@Query() query: StoreMetricTrendDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.service.getTrends({ ...query, storeId: this.storeId(query.storeId, storeHeader, user) });
  }

  @Get('definitions')
  @Permissions('core:store-metrics:view')
  @ApiOperation({ summary: '门店核心指标定义' })
  definitions() {
    return { items: this.service.listDefinitions(), total: this.service.listDefinitions().length };
  }

  @Get('quality')
  @Permissions('core:store-metrics:quality:view')
  @ApiOperation({ summary: '门店核心指标数据质量' })
  quality(@Query() query: StoreMetricScopeDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.service.getQuality(this.storeId(query.storeId, storeHeader, user), query.date);
  }

  @Get('targets')
  @Permissions('core:store-metrics:target:view')
  @ApiOperation({ summary: '门店指标目标列表' })
  targets(@Query('storeId') storeId: string | undefined, @Query('period') period: string | undefined, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.service.listTargets(this.storeId(storeId ? Number(storeId) : undefined, storeHeader, user), period);
  }

  @Post('targets')
  @Permissions('core:store-metrics:target:edit')
  @ApiOperation({ summary: '创建门店指标目标' })
  createTarget(@Body() dto: CreateStoreMetricTargetDto, @CurrentUser() user: any) {
    this.storeId(dto.storeId, undefined, user);
    return this.service.createTarget(dto, user?.id);
  }

  @Put('targets/:id')
  @Permissions('core:store-metrics:target:edit')
  @ApiOperation({ summary: '更新门店指标目标' })
  async updateTarget(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStoreMetricTargetDto, @CurrentUser() user: any) {
    return this.service.updateTargetForStores(id, dto, this.allowedStores(user));
  }

  @Get(':metricKey/drilldown')
  @Permissions('core:store-metrics:drilldown')
  @ApiOperation({ summary: '门店核心指标下钻' })
  drilldown(@Param('metricKey') metricKey: string, @Query() query: StoreMetricDrilldownDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.service.getDrilldown(metricKey, { ...query, storeId: this.storeId(query.storeId, storeHeader, user) });
  }

  private storeId(queryStoreId?: number, storeHeader?: string, user?: any) {
    const id = Number(queryStoreId ?? storeHeader ?? 0);
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException('请选择门店');
    const allowed = this.allowedStores(user);
    if (allowed !== '*' && !allowed.includes(id)) throw new ForbiddenException('无权访问该门店指标');
    return id;
  }

  private allowedStores(user?: any): number[] | '*' {
    if (user?.permissions?.includes('*')) return '*';
    return (user?.stores ?? user?.storeIds ?? []).map(Number).filter((id: number) => Number.isInteger(id) && id > 0);
  }
}
