import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CUSTOMER_WAIT_LEAVE_REASONS = [
  'wait_too_long',
  'schedule_conflict',
  'personal_reason',
  'service_unavailable',
  'other',
] as const;

export class StartCustomerWaitingDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(480)
  expectedWaitMinutes?: number;
}

export class EndCustomerWaitingDto {
  @ApiProperty({ enum: CUSTOMER_WAIT_LEAVE_REASONS })
  @IsIn(CUSTOMER_WAIT_LEAVE_REASONS)
  reasonCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonNote?: string;
}

export class CustomerWaitingAnalyticsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
