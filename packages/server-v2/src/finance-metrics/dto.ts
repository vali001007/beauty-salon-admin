import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryFinanceDailyMetricsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: ['live', 'confirmed'], default: 'live' })
  @IsOptional()
  @IsIn(['live', 'confirmed'])
  mode?: 'live' | 'confirmed';
}
