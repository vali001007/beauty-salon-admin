import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CurrentDevice } from '../terminal/decorators/current-device.decorator.js';
import { DeviceAuthGuard } from '../terminal/guards/device-auth.guard.js';
import { CommissionService, type FinanceRequestContext } from './commission.service.js';
import { FinanceReconciliationService } from './finance-reconciliation.service.js';
import { CreateCommissionRuleAssignmentDto, CreateCommissionRuleDto } from './dto/create-commission-rule.dto.js';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto.js';
import { UpdateCommissionRuleAssignmentDto } from './dto/update-commission-rule-assignment.dto.js';
import {
  BatchConfirmCommissionRecordsDto,
  CancelDailySettlementAdjustmentDto,
  BeauticianCommissionSummaryDto,
  CloseCashierShiftDto,
  CreateCommissionAdjustmentDto,
  CreateDailySettlementAdjustmentDto,
  GenerateSettlementDto,
  GenerateDailySettlementDto,
  GenerateAmiBillDto,
  OpenCashierShiftDto,
  QueryAmiBillDto,
  QueryAmiPerformanceDto,
  QueryCashFlowRecordsDto,
  QueryCashierShiftDto,
  QueryCommissionRecordsDto,
  QueryCommissionRuleAssignmentsDto,
  QueryCommissionRulesDto,
  QueryCommissionSettlementsDto,
  QueryDailySettlementDto,
  QueryFinanceReconciliationIssuesDto,
  QueryFinanceReconciliationRunsDto,
  QueryPlatformRevenueDto,
  MarkCommissionSettlementPaidDto,
  TransitionAmiBillDto,
  RunFinanceReconciliationDto,
  UpdateCommissionRecordDto,
} from './dto/query-commission.dto.js';

@ApiTags('Commission')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('commission')
export class CommissionController {
  constructor(
    private commissionService: CommissionService,
    private financeReconciliationService?: FinanceReconciliationService,
  ) {}

  private storeIdFrom(queryStoreId?: number, storeHeader?: string) {
    return queryStoreId ?? (storeHeader ? Number(storeHeader) : undefined);
  }

  private financeContext(user: any, reason?: string): FinanceRequestContext {
    return {
      userId: Number(user?.id),
      storeIds: user?.storeIds ?? user?.stores ?? [],
      roles: user?.roles ?? [],
      permissions: user?.permissions ?? [],
      ...(reason === undefined ? {} : { reason }),
    };
  }

  private scopedStoreId(queryStoreId: number | undefined, storeHeader: string | undefined, user: any) {
    const requested = this.storeIdFrom(queryStoreId, storeHeader);
    const context = this.financeContext(user);
    const elevated = context.permissions.includes('*') || context.roles.includes('super_admin') || context.roles.includes('admin');
    if (elevated) return requested;
    if (requested && !context.storeIds.includes(requested)) throw new ForbiddenException('无权访问该门店财务数据');
    if (requested) return requested;
    if (context.storeIds.length === 1) return context.storeIds[0];
    throw new BadRequestException('请选择有权限的门店');
  }

  @Get('rules')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '提成规则列表' })
  getRules(@Query() query: QueryCommissionRulesDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getRules({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('rules/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '提成规则详情' })
  getRuleById(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.commissionService.getRuleById(id, this.financeContext(user));
  }

  @Post('rules')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '创建提成规则' })
  createRule(@Body() dto: CreateCommissionRuleDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.createRule(this.scopedStoreId(undefined, storeHeader, user), dto);
  }

  @Put('rules/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '更新提成规则' })
  updateRule(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCommissionRuleDto, @CurrentUser() user: any) {
    return this.commissionService.updateRule(id, dto, this.financeContext(user));
  }

  @Delete('rules/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '归档提成规则' })
  deleteRule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.commissionService.deleteRule(id, this.financeContext(user));
  }

  @Post('rules/batch')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '提成规则模板导入已停用，规则需绑定具体员工' })
  batchCreateRules(@Body('template') template: string | undefined, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.batchCreateFromTemplate(this.scopedStoreId(undefined, storeHeader, user), template);
  }

  @Get('rule-assignments')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '提成规则配置列表' })
  getRuleAssignments(@Query() query: QueryCommissionRuleAssignmentsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getAssignments({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Post('rule-assignments')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '创建提成规则配置' })
  createRuleAssignment(@Body() dto: CreateCommissionRuleAssignmentDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.createAssignment(this.scopedStoreId(undefined, storeHeader, user), dto);
  }

  @Put('rule-assignments/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '更新提成规则配置' })
  updateRuleAssignment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCommissionRuleAssignmentDto, @CurrentUser() user: any) {
    return this.commissionService.updateAssignment(id, dto, this.financeContext(user));
  }

  @Delete('rule-assignments/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '归档提成规则配置' })
  deleteRuleAssignment(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.commissionService.deleteAssignment(id, this.financeContext(user));
  }

  @Get('records/paginated')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '提成明细分页' })
  getRecords(@Query() query: QueryCommissionRecordsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getRecords({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('records/summary')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '提成汇总' })
  getRecordSummary(@Query() query: QueryCommissionRecordsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getRecordSummary({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Put('records/:id/confirm')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '确认提成流水' })
  confirmRecord(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.commissionService.confirmRecord(id, this.financeContext(user));
  }

  @Put('records/:id')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '修改提成流水' })
  updateRecord(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCommissionRecordDto, @CurrentUser() user: any) {
    return this.commissionService.updateRecord(id, dto, this.financeContext(user));
  }

  @Put('records/batch-confirm')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '批量确认提成流水' })
  batchConfirmRecords(@Body() dto: BatchConfirmCommissionRecordsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.batchConfirmRecords({ ...dto, storeId: this.scopedStoreId(dto.storeId, storeHeader, user) });
  }

  @Post('settlements/generate')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '生成月度提成结算单' })
  generateSettlement(@Body() dto: GenerateSettlementDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.generateSettlement(this.scopedStoreId(dto.storeId, storeHeader, user), dto.settleMonth);
  }

  @Get('settlements/paginated')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '提成结算单列表' })
  getSettlements(@Query() query: QueryCommissionSettlementsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getSettlements({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('settlements/export')
  @Permissions('core:finance:export')
  @ApiOperation({ summary: '导出提成结算工资表' })
  async exportSettlements(@Query() query: QueryCommissionSettlementsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any, @Res() res: Response) {
    const file = await this.commissionService.exportSettlements({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.send(file.content);
  }

  @Get('settlements/:id')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '提成结算单详情' })
  getSettlementById(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.commissionService.getSettlementById(id, this.financeContext(user));
  }

  @Put('settlements/:id/confirm')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '确认提成结算单' })
  confirmSettlement(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.commissionService.confirmSettlement(id, Number(user?.id), this.financeContext(user));
  }

  @Put('settlements/:id/mark-paid')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '标记提成结算单已发放' })
  markSettlementPaid(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkCommissionSettlementPaidDto,
    @CurrentUser() user: any,
  ) {
    return this.commissionService.markSettlementPaid(id, { ...this.financeContext(user), ...dto });
  }

  @Post('settlements/:id/adjustments')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '创建提成扣款、补款或退款追缴调整' })
  createCommissionAdjustment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCommissionAdjustmentDto,
    @CurrentUser() user: any,
  ) {
    return this.commissionService.createCommissionAdjustment(id, dto, this.financeContext(user));
  }

  @Get('shifts/current')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '当前收银班次' })
  getCurrentShift(@Query() query: QueryCashierShiftDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getCurrentCashierShift({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('shifts/history')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '收银班次历史' })
  getShiftHistory(@Query() query: QueryCashierShiftDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getCashierShiftHistory({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Post('shifts/open')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '开班' })
  openShift(@Body() dto: OpenCashierShiftDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.openCashierShift({ ...dto, storeId: this.scopedStoreId(dto.storeId, storeHeader, user) });
  }

  @Post('shifts/close')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '关班' })
  closeShift(@Body() dto: CloseCashierShiftDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.closeCashierShift({ ...dto, storeId: this.scopedStoreId(dto.storeId, storeHeader, user) });
  }

  @Get('payment-records')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '支付流水列表' })
  getPaymentRecords(@Query() query: QueryCashFlowRecordsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getPaymentRecords({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('refund-records')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '退款记录列表' })
  getRefundRecords(@Query() query: QueryCashFlowRecordsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getRefundRecords({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('reconciliation-exceptions')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '收银对账异常列表' })
  getReconciliationExceptions(@Query() query: QueryCashFlowRecordsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    const scopedQuery = { ...query, status: query.status ?? 'unresolved', storeId: this.scopedStoreId(query.storeId, storeHeader, user) };
    return this.financeReconciliationService
      ? this.financeReconciliationService.getCompatibilityExceptions(scopedQuery, this.financeContext(user))
      : this.commissionService.getReconciliationExceptions(scopedQuery);
  }

  @Post('reconciliation-runs')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '手动运行指定经营日对账与日结判断' })
  runReconciliation(@Body() dto: RunFinanceReconciliationDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    const storeId = this.scopedStoreId(dto.storeId, storeHeader, user);
    if (!storeId) throw new BadRequestException('请选择经营日所属门店');
    if (!this.financeReconciliationService) throw new BadRequestException('自动对账服务未启用');
    return this.financeReconciliationService.runDailyClose(storeId, dto.date, { triggerType: 'manual', autoConfirm: true });
  }

  @Get('reconciliation-runs')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '查询自动对账运行历史' })
  getReconciliationRuns(@Query() query: QueryFinanceReconciliationRunsDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    const scopedQuery = { ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) };
    if (!this.financeReconciliationService) throw new BadRequestException('自动对账服务未启用');
    return this.financeReconciliationService.getRuns(scopedQuery, this.financeContext(user));
  }

  @Get('reconciliation-issues')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '查询持久化对账异常' })
  getReconciliationIssues(@Query() query: QueryFinanceReconciliationIssuesDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    const scopedQuery = { ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) };
    if (!this.financeReconciliationService) throw new BadRequestException('自动对账服务未启用');
    return this.financeReconciliationService.getIssues(scopedQuery, this.financeContext(user));
  }

  @Put('reconciliation-issues/:id/acknowledge')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '标记对账异常已查看' })
  acknowledgeReconciliationIssue(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    if (!this.financeReconciliationService) throw new BadRequestException('自动对账服务未启用');
    return this.financeReconciliationService.acknowledgeIssue(id, this.financeContext(user));
  }

  @Get('daily-settlements')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '日结列表' })
  getDailySettlements(@Query() query: QueryDailySettlementDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getDailySettlements({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Post('daily-settlements/generate')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '生成日结' })
  generateDailySettlement(@Body() dto: GenerateDailySettlementDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.generateDailySettlement(this.scopedStoreId(dto.storeId, storeHeader, user), dto.date);
  }

  @Put('daily-settlements/:id/confirm')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '确认日结' })
  confirmDailySettlement(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Headers('x-store-id') storeHeader?: string,
  ) {
    const storeId = this.scopedStoreId(undefined, storeHeader, user);
    return this.financeReconciliationService
      ? this.financeReconciliationService.confirmDailySettlementManually(id, this.financeContext(user), storeId)
      : this.commissionService.confirmDailySettlement(id, Number(user?.id), storeId);
  }

  @Post('daily-settlements/:id/adjustments')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '创建日结人工调整' })
  createDailySettlementAdjustment(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateDailySettlementAdjustmentDto, @CurrentUser() user: any) {
    if (!this.financeReconciliationService) throw new BadRequestException('自动对账服务未启用');
    return this.financeReconciliationService.createAdjustment(id, dto, this.financeContext(user));
  }

  @Get('daily-settlements/:id/adjustments')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '查询日结人工调整' })
  getDailySettlementAdjustments(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    if (!this.financeReconciliationService) throw new BadRequestException('自动对账服务未启用');
    return this.financeReconciliationService.getAdjustments(id, this.financeContext(user));
  }

  @Put('daily-settlements/:id/adjustments/:adjustmentId/cancel')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '取消草稿日结人工调整' })
  cancelDailySettlementAdjustment(
    @Param('id', ParseIntPipe) id: number,
    @Param('adjustmentId', ParseIntPipe) adjustmentId: number,
    @Body() dto: CancelDailySettlementAdjustmentDto,
    @CurrentUser() user: any,
  ) {
    if (!this.financeReconciliationService) throw new BadRequestException('自动对账服务未启用');
    return this.financeReconciliationService.cancelAdjustment(id, adjustmentId, dto.reason, this.financeContext(user));
  }

  @Post('daily-settlements/:id/reopen')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '平台管理员重开已确认日结' })
  reopenDailySettlement(@Param('id', ParseIntPipe) id: number, @Body() body: { reason: string }, @CurrentUser() user: any) {
    return this.commissionService.reopenDailySettlement(id, this.financeContext(user, body.reason));
  }

  @Get('daily-settlements/:id/versions')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: '日结确认版本列表' })
  getDailySettlementVersions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.commissionService.getDailySettlementVersions(id, this.financeContext(user));
  }

  @Get('ami/performance')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: 'Ami 绩效记录列表' })
  getAmiPerformance(@Query() query: QueryAmiPerformanceDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getAmiPerformanceRecords({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('ami/bills')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: 'Ami 月度账单列表' })
  getAmiBills(@Query() query: QueryAmiBillDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getAmiMonthlyBills({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('ami/bills/:month')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: 'Ami 月度账单详情' })
  getAmiBillByMonth(@Param('month') month: string, @Query('storeId') storeId: number | undefined, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getAmiMonthlyBillByMonth(this.scopedStoreId(storeId, storeHeader, user), month);
  }

  @Post('ami/bills/generate')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '生成 Ami 月度账单' })
  generateAmiBill(@Body() dto: GenerateAmiBillDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.generateAmiMonthlyBill(this.scopedStoreId(dto.storeId, storeHeader, user), dto.settleMonth);
  }

  @Put('ami/bills/:id/status')
  @Permissions('core:finance:manage')
  @ApiOperation({ summary: '推进或作废 Ami 月度账单' })
  transitionAmiBill(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionAmiBillDto,
    @CurrentUser() user: any,
  ) {
    return this.commissionService.transitionAmiMonthlyBill(id, dto.status, this.financeContext(user), dto.reason);
  }

  @Get('ami/dashboard')
  @Permissions('core:finance:view')
  @ApiOperation({ summary: 'Ami 贡献仪表盘' })
  getAmiDashboard(@Query() query: QueryAmiPerformanceDto, @Headers('x-store-id') storeHeader: string | undefined, @CurrentUser() user: any) {
    return this.commissionService.getAmiDashboard({ ...query, storeId: this.scopedStoreId(query.storeId, storeHeader, user) });
  }

  @Get('platform/revenue')
  @Permissions('core:platform-revenue:view')
  @ApiOperation({ summary: '平台收入汇总报表' })
  getPlatformRevenue(@Query() query: QueryPlatformRevenueDto, @CurrentUser() user?: any) {
    const context = this.financeContext(user);
    if (!context.permissions.includes('*') && !context.roles.includes('super_admin') && !context.roles.includes('admin')) {
      throw new ForbiddenException('仅平台管理员可以查看平台收入');
    }
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
