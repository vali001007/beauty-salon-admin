import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryCommissionRulesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  levelId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class QueryCommissionRuleAssignmentsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ruleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class QueryCommissionRecordsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  staffUserId?: number;

  @ApiPropertyOptional({ description: '历史兼容字段：美容师 ID。新提成主体使用 staffUserId。' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @IsString()
  settleMonth?: string;
}

export class GenerateSettlementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsString()
  settleMonth: string;
}

export class BatchConfirmCommissionRecordsDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @Type(() => Number)
  ids?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @IsString()
  settleMonth?: string;
}

export class UpdateCommissionRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  staffUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sourceAmount?: number;

  @ApiPropertyOptional({ description: '提成比例，传 0.08 表示 8%。' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class QueryCommissionSettlementsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @IsString()
  settleMonth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class BeauticianCommissionSummaryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  beauticianId: number;

  @ApiPropertyOptional({ enum: ['today', 'month'] })
  @IsOptional()
  @IsString()
  @IsIn(['today', 'month'])
  period?: string;

  @ApiPropertyOptional({ default: 5, description: '返回明细条数，默认最近 5 条' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  detailLimit?: number;
}

export class OpenCashierShiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deviceId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  operatorId?: number;

  @ApiPropertyOptional({ default: 'device' })
  @IsOptional()
  @IsString()
  operatorType?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingCash?: number;
}

export class CloseCashierShiftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shiftId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deviceId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  operatorId?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  closingCash: number;
}

export class QueryCashierShiftDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  deviceId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class QueryDailySettlementDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class QueryCashFlowRecordsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  method?: string;
}

export class GenerateDailySettlementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06-08' })
  @IsDateString()
  date: string;
}

export class RunFinanceReconciliationDto extends GenerateDailySettlementDto {}

export class QueryFinanceReconciliationRunsDto extends QueryDailySettlementDto {
  @ApiPropertyOptional({ enum: ['running', 'passed', 'warning', 'blocked', 'failed'] })
  @IsOptional()
  @IsString()
  @IsIn(['running', 'passed', 'warning', 'blocked', 'failed'])
  status?: string = undefined;
}

export class QueryFinanceReconciliationIssuesDto extends QueryDailySettlementDto {
  @ApiPropertyOptional({ enum: ['operating_exception', 'data_integrity', 'automation_failure'] })
  @IsOptional()
  @IsString()
  @IsIn(['operating_exception', 'data_integrity', 'automation_failure'])
  category?: string;

  @ApiPropertyOptional({ enum: ['high', 'medium', 'low'] })
  @IsOptional()
  @IsString()
  @IsIn(['high', 'medium', 'low'])
  severity?: string;
}

export class CreateDailySettlementAdjustmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  adjustmentType: string;

  @IsString()
  @IsIn(['totalRevenue', 'cashRevenue', 'wechatRevenue', 'alipayRevenue', 'cardRevenue', 'balanceRevenue', 'rechargeIncome', 'refundAmount', 'materialCost', 'commissionTotal'])
  effectField: string;

  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  voucherNo?: string;
}

export class CancelDailySettlementAdjustmentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class QueryAmiPerformanceDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @IsString()
  settleMonth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

export class QueryAmiBillDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @IsString()
  settleMonth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class GenerateAmiBillDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsString()
  settleMonth: string;
}

export class MarkCommissionSettlementPaidDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  paymentBatchNo: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  paymentMethod: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  paymentVoucherNo: string;
}

export class CreateCommissionAdjustmentDto {
  @IsString()
  @IsIn(['deduction', 'bonus', 'refund_recovery', 'correction'])
  type: string;

  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  commissionRecordId?: number;
}

export class TransitionAmiBillDto {
  @IsString()
  @IsIn(['confirmed', 'invoiced', 'paid', 'voided'])
  status: 'confirmed' | 'invoiced' | 'paid' | 'voided';

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason?: string;
}

export class QueryPlatformRevenueDto {
  @ApiPropertyOptional({ enum: ['month', 'quarter', 'year'], default: 'month' })
  @IsOptional()
  @IsString()
  @IsIn(['month', 'quarter', 'year'])
  period?: 'month' | 'quarter' | 'year' = 'month';

  @ApiPropertyOptional({ description: '月份 YYYY-MM、季度 YYYY-Qn 或年份 YYYY' })
  @IsOptional()
  @IsString()
  value?: string;
}
