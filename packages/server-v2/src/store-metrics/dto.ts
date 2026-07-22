import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class StoreMetricScopeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  storeId?: number;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class StoreMetricTrendDto extends StoreMetricScopeDto {
  @IsString()
  metricKeys: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity?: string;
}

export class StoreMetricDrilldownDto extends StoreMetricScopeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class CreateStoreMetricTargetDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  storeId: number;

  @IsString()
  metricKey: string;

  @IsIn(['day', 'week', 'month', 'quarter', 'year'])
  periodType: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @Type(() => Number)
  @IsNumber()
  targetValue: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  warningValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  criticalValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;
}

export class UpdateStoreMetricTargetDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  targetValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  warningValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  criticalValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}
