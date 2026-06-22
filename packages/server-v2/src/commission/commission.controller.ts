import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { CurrentDevice } from '../terminal/decorators/current-device.decorator.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { CommissionService } from './commission.service.js';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto.js';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto.js';
import {
  BatchConfirmCommissionRecordsDto,
  BeauticianCommissionSummaryDto,
  CloseCashierShiftDto,
  GenerateSettlementDto,
  GenerateDailySettlementDto,
  GenerateAmiBillDto,
  OpenCashierShiftDto,
  QueryAmiBillDto,
  QueryAmiPerformanceDto,
  QueryCashierShiftDto,
  QueryCommissionRecordsDto,
  QueryCommissionRulesDto,
  QueryCommissionSettlementsDto,
  QueryDailySettlementDto,
  QueryPlatformRevenueDto,
} from './dto/query-commission.dto.js';

@ApiTags('Commission')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('commission')
export class CommissionController {
  constructor(private commissionService: CommissionService) {}

  private storeIdFrom(queryStoreId?: number, storeHeader?: string) {
    return queryStoreId ?? (storeHeader ? Number(storeHeader) : undefined);
  }

  @Get('rules')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '提成规则列表' })
  getRules(@Query() query: QueryCommissionRulesDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getRules({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Get('rules/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '提成规则详情' })
  getRuleById(@Param('id', ParseIntPipe) id: number) {
    return this.commissionService.getRuleById(id);
  }

  @Post('rules')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '创建提成规则' })
  createRule(@Body() dto: CreateCommissionRuleDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.createRule(storeHeader, dto);
  }

  @Put('rules/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '更新提成规则' })
  updateRule(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCommissionRuleDto) {
    return this.commissionService.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '归档提成规则' })
  deleteRule(@Param('id', ParseIntPipe) id: number) {
    return this.commissionService.deleteRule(id);
  }

  @Post('rules/batch')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '提成规则模板导入已停用，规则需绑定具体员工' })
  batchCreateRules(@Body('template') template?: string, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.batchCreateFromTemplate(storeHeader, template);
  }

  @Get('records/paginated')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '提成明细分页' })
  getRecords(@Query() query: QueryCommissionRecordsDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getRecords({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Get('records/summary')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '提成汇总' })
  getRecordSummary(@Query() query: QueryCommissionRecordsDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getRecordSummary({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Put('records/:id/confirm')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '确认提成流水' })
  confirmRecord(@Param('id', ParseIntPipe) id: number) {
    return this.commissionService.confirmRecord(id);
  }

  @Put('records/batch-confirm')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '批量确认提成流水' })
  batchConfirmRecords(@Body() dto: BatchConfirmCommissionRecordsDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.batchConfirmRecords({ ...dto, storeId: this.storeIdFrom(dto.storeId, storeHeader) });
  }

  @Post('settlements/generate')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '生成月度提成结算单' })
  generateSettlement(@Body() dto: GenerateSettlementDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.generateSettlement(this.storeIdFrom(dto.storeId, storeHeader), dto.settleMonth);
  }

  @Get('settlements/paginated')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '提成结算单列表' })
  getSettlements(@Query() query: QueryCommissionSettlementsDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getSettlements({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Get('settlements/export')
  @Permissions('core:finance:export')
  @ApiOperation({ summary: '导出提成结算工资表' })
  async exportSettlements(@Query() query: QueryCommissionSettlementsDto, @Headers('x-store-id') storeHeader: string | undefined, @Res() res: Response) {
    const file = await this.commissionService.exportSettlements({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.send(file.content);
  }

  @Get('settlements/:id')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '提成结算单详情' })
  getSettlementById(@Param('id', ParseIntPipe) id: number) {
    return this.commissionService.getSettlementById(id);
  }

  @Put('settlements/:id/confirm')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '确认提成结算单' })
  confirmSettlement(@Param('id', ParseIntPipe) id: number) {
    return this.commissionService.confirmSettlement(id);
  }

  @Put('settlements/:id/mark-paid')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '标记提成结算单已发放' })
  markSettlementPaid(@Param('id', ParseIntPipe) id: number) {
    return this.commissionService.markSettlementPaid(id);
  }

  @Get('shifts/current')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '当前收银班次' })
  getCurrentShift(@Query() query: QueryCashierShiftDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getCurrentCashierShift({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Get('shifts/history')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '收银班次历史' })
  getShiftHistory(@Query() query: QueryCashierShiftDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getCashierShiftHistory({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Post('shifts/open')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '开班' })
  openShift(@Body() dto: OpenCashierShiftDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.openCashierShift({ ...dto, storeId: this.storeIdFrom(dto.storeId, storeHeader) });
  }

  @Post('shifts/close')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '关班' })
  closeShift(@Body() dto: CloseCashierShiftDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.closeCashierShift({ ...dto, storeId: this.storeIdFrom(dto.storeId, storeHeader) });
  }

  @Get('daily-settlements')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '日结列表' })
  getDailySettlements(@Query() query: QueryDailySettlementDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getDailySettlements({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Post('daily-settlements/generate')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '生成日结' })
  generateDailySettlement(@Body() dto: GenerateDailySettlementDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.generateDailySettlement(this.storeIdFrom(dto.storeId, storeHeader), dto.date);
  }

  @Put('daily-settlements/:id/confirm')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '确认日结' })
  confirmDailySettlement(@Param('id', ParseIntPipe) id: number) {
    return this.commissionService.confirmDailySettlement(id);
  }

  @Get('ami/performance')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: 'Ami 绩效记录列表' })
  getAmiPerformance(@Query() query: QueryAmiPerformanceDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getAmiPerformanceRecords({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Get('ami/bills')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: 'Ami 月度账单列表' })
  getAmiBills(@Query() query: QueryAmiBillDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getAmiMonthlyBills({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Get('ami/bills/:month')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: 'Ami 月度账单详情' })
  getAmiBillByMonth(@Param('month') month: string, @Query('storeId') storeId?: number, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getAmiMonthlyBillByMonth(this.storeIdFrom(storeId, storeHeader), month);
  }

  @Post('ami/bills/generate')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '生成 Ami 月度账单' })
  generateAmiBill(@Body() dto: GenerateAmiBillDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.generateAmiMonthlyBill(this.storeIdFrom(dto.storeId, storeHeader), dto.settleMonth);
  }

  @Get('ami/dashboard')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: 'Ami 贡献仪表盘' })
  getAmiDashboard(@Query() query: QueryAmiPerformanceDto, @Headers('x-store-id') storeHeader?: string) {
    return this.commissionService.getAmiDashboard({ ...query, storeId: this.storeIdFrom(query.storeId, storeHeader) });
  }

  @Get('platform/revenue')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '平台收入汇总报表' })
  getPlatformRevenue(@Query() query: QueryPlatformRevenueDto) {
    return this.commissionService.getPlatformRevenue(query);
  }
}

@ApiTags('Terminal - Commission')
@ApiBearerAuth()
@UseGuards(DeviceAuthGuard)
@Controller('terminal/commission')
export class TerminalCommissionController {
  constructor(private commissionService: CommissionService) {}

  @Get('records/beautician-summary')
  @ApiOperation({ summary: '美容师个人提成汇总' })
  getBeauticianSummary(@CurrentDevice('storeId') storeId: number, @Query() query: BeauticianCommissionSummaryDto) {
    return this.commissionService.getBeauticianSummary({ ...query, storeId });
  }

  @Get('shifts/current')
  @ApiOperation({ summary: '当前收银班次' })
  getCurrentShift(@CurrentDevice() device: any) {
    return this.commissionService.getCurrentCashierShift({
      storeId: device.storeId,
      deviceId: device.id,
      operatorId: device.userId,
    });
  }

  @Get('shifts/history')
  @ApiOperation({ summary: '收银班次历史' })
  getShiftHistory(@CurrentDevice() device: any, @Query() query: QueryCashierShiftDto) {
    return this.commissionService.getCashierShiftHistory({
      ...query,
      storeId: device.storeId,
      deviceId: device.id || query.deviceId,
    });
  }

  @Post('shifts/open')
  @ApiOperation({ summary: '开班' })
  openShift(@CurrentDevice() device: any, @Body() dto: OpenCashierShiftDto) {
    return this.commissionService.openCashierShift({
      ...dto,
      storeId: device.storeId,
      deviceId: device.id,
      operatorId: device.userId,
      operatorType: device.userId ? 'user' : 'device',
    });
  }

  @Post('shifts/close')
  @ApiOperation({ summary: '关班' })
  closeShift(@CurrentDevice() device: any, @Body() dto: CloseCashierShiftDto) {
    return this.commissionService.closeCashierShift({
      ...dto,
      storeId: device.storeId,
      deviceId: device.id,
      operatorId: device.userId,
    });
  }
}
