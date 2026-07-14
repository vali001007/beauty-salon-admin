import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import {
  GenerateMemberLiabilitySnapshotDto,
  GenerateMonthlyProfitCloseDto,
  QueryBeauticianPerformanceDto,
  QueryOperationProfitDto,
  QueryPrepaidLiabilitiesDto,
  QueryProductMarginsDto,
  QueryProjectMarginsDto,
  ReopenFinanceCloseDto,
} from './dto.js';
import { OperationProfitService } from './operation-profit.service.js';

@ApiTags('Operation Profit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('operation-profit')
export class OperationProfitController {
  constructor(private readonly operationProfitService: OperationProfitService) {}

  private financeContext(user: any) {
    return {
      userId: Number(user?.id),
      storeIds: user?.storeIds ?? user?.stores ?? [],
      roles: user?.roles ?? [],
      permissions: user?.permissions ?? [],
    };
  }

  private storeIdFrom(queryStoreId?: number, storeHeader?: string) {
    return queryStoreId ?? (storeHeader ? Number(storeHeader) : undefined);
  }

  private scopedStoreId(queryStoreId: number | undefined, storeHeader: string | undefined, user: any) {
    const requested = this.storeIdFrom(queryStoreId, storeHeader);
    if (!user) return requested;
    const context = this.financeContext(user);
    const elevated = context.permissions.includes('*') || context.roles.includes('super_admin') || context.roles.includes('admin');
    if (elevated) return requested;
    if (requested && !context.storeIds.includes(requested)) throw new ForbiddenException('无权访问该门店财务数据');
    if (requested) return requested;
    if (context.storeIds.length === 1) return context.storeIds[0];
    throw new BadRequestException('请选择有权限的门店');
  }

  @Get('overview')
  @Permissions('core:operation-profit:view')
  @ApiOperation({ summary: '经营利润总览' })
  getOverview(@Query() query: QueryOperationProfitDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.operationProfitService.getOverview({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Post('monthly-closes')
  @Permissions('core:operation-profit:manage')
  @ApiOperation({ summary: '生成月度利润结账草稿' })
  generateMonthlyClose(@Body() dto: GenerateMonthlyProfitCloseDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.operationProfitService.generateMonthlyClose(this.storeIdFrom(dto.storeId, storeHeader)!, dto.periodMonth, this.financeContext(user));
  }

  @Put('monthly-closes/:id/confirm')
  @Permissions('core:operation-profit:manage')
  @ApiOperation({ summary: '确认月度利润结账' })
  confirmMonthlyClose(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.operationProfitService.confirmMonthlyClose(id, this.financeContext(user));
  }

  @Post('monthly-closes/:id/reopen')
  @Permissions('core:operation-profit:manage')
  @ApiOperation({ summary: '平台管理员重开月度利润结账' })
  reopenMonthlyClose(@Param('id', ParseIntPipe) id: number, @Body() dto: ReopenFinanceCloseDto, @CurrentUser() user: any) {
    return this.operationProfitService.reopenMonthlyClose(id, dto.reason, this.financeContext(user));
  }

  @Get('monthly-closes/versions')
  @Permissions('core:operation-profit:view')
  @ApiOperation({ summary: '查询月度利润结账版本' })
  getMonthlyCloseVersions(@Query('periodMonth') periodMonth: string, @Query('storeId') storeId: number | undefined, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.operationProfitService.getMonthlyCloseVersions(this.storeIdFrom(storeId, storeHeader)!, periodMonth, this.financeContext(user));
  }

  @Get('project-margins')
  @Permissions('core:project-margin:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '项目毛利分析' })
  getProjectMargins(@Query() query: QueryProjectMarginsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.operationProfitService.getProjectMargins({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('product-margins')
  @Permissions('core:product-margin:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '商品毛利分析' })
  getProductMargins(@Query() query: QueryProductMarginsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.operationProfitService.getProductMargins({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('prepaid-liabilities')
  @Permissions('core:prepaid-liability:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '会员卡预收履约风险' })
  getPrepaidLiabilities(@Query() query: QueryPrepaidLiabilitiesDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.operationProfitService.getPrepaidLiabilities({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Post('liability-snapshots')
  @Permissions('core:operation-profit:manage')
  @ApiOperation({ summary: '生成会员负债月末快照草稿' })
  generateLiabilitySnapshot(@Body() dto: GenerateMemberLiabilitySnapshotDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.operationProfitService.generateMemberLiabilitySnapshot(this.storeIdFrom(dto.storeId, storeHeader)!, dto.snapshotDate, this.financeContext(user));
  }

  @Put('liability-snapshots/:id/confirm')
  @Permissions('core:operation-profit:manage')
  @ApiOperation({ summary: '确认会员负债月末快照' })
  confirmLiabilitySnapshot(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.operationProfitService.confirmMemberLiabilitySnapshot(id, this.financeContext(user));
  }

  @Get('beautician-performance')
  @Permissions('core:beautician-performance:view', 'core:operation-profit:view')
  @ApiOperation({ summary: '员工人效分析' })
  getBeauticianPerformance(@Query() query: QueryBeauticianPerformanceDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.operationProfitService.getBeauticianPerformance({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }
}
