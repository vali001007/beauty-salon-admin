import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const OPERATION_COST_CATEGORIES = [
  'rent',
  'salary',
  'commission',
  'marketing',
  'utilities',
  'depreciation',
  'supplies_adjustment',
  'other',
] as const;

export type OperationCostCategory = (typeof OPERATION_COST_CATEGORIES)[number];

export class QueryOperationCostsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 50;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  periodMonth?: string;

  @ApiPropertyOptional({ enum: OPERATION_COST_CATEGORIES })
  @IsOptional()
  @IsIn(OPERATION_COST_CATEGORIES)
  category?: OperationCostCategory;
}

export class CreateOperationCostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiProperty({ example: '2026-06' })
  @Matches(/^\d{4}-\d{2}$/)
  periodMonth: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  costDate: string;

  @ApiProperty({ enum: OPERATION_COST_CATEGORIES })
  @IsIn(OPERATION_COST_CATEGORIES)
  category: OperationCostCategory;

  @ApiProperty({ default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ default: 'store_month' })
  @IsOptional()
  @IsString()
  allocationType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  relatedCampaignId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  relatedEmployeeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateOperationCostDto {
  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  periodMonth?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  costDate?: string;

  @ApiPropertyOptional({ enum: OPERATION_COST_CATEGORIES })
  @IsOptional()
  @IsIn(OPERATION_COST_CATEGORIES)
  category?: OperationCostCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allocationType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  relatedCampaignId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  relatedEmployeeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CopyOperationCostsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiProperty({ example: '2026-05' })
  @Matches(/^\d{4}-\d{2}$/)
  fromPeriodMonth: string;

  @ApiProperty({ example: '2026-06' })
  @Matches(/^\d{4}-\d{2}$/)
  toPeriodMonth: string;
}

export class QueryOperationProfitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ enum: ['cash', 'operating'], default: 'operating' })
  @IsOptional()
  @IsIn(['cash', 'operating'])
  basis?: 'cash' | 'operating';
}

export class QueryProjectMarginsDto extends QueryOperationProfitDto {
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
  @IsString()
  status?: string;
}

export class QueryProductMarginsDto extends QueryOperationProfitDto {
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
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ enum: ['salesAmount', 'grossProfit', 'marginRate', 'quantity'] })
  @IsOptional()
  @IsIn(['salesAmount', 'grossProfit', 'marginRate', 'quantity'])
  sortBy?: 'salesAmount' | 'grossProfit' | 'marginRate' | 'quantity';
}

export class QueryPrepaidLiabilitiesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06-30', description: '历史时点；历史查询优先返回已确认月末快照' })
  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  riskOnly?: boolean;

  @ApiPropertyOptional({ enum: ['all', 'card', 'balance'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'card', 'balance'])
  type?: 'all' | 'card' | 'balance';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

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
}

export class QueryBeauticianPerformanceDto extends QueryOperationProfitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  beauticianId?: number;
}

export class GenerateMonthlyProfitCloseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiProperty({ example: '2026-06' })
  @Matches(/^\d{4}-\d{2}$/)
  periodMonth: string;
}

export class ReopenFinanceCloseDto {
  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}

export class GenerateMemberLiabilitySnapshotDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  snapshotDate: string;
}
