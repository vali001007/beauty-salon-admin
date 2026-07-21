import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

export const CUSTOMER_FEEDBACK_TYPES = ['complaint', 'satisfaction', 'suggestion', 'praise'] as const;
export const CUSTOMER_FEEDBACK_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const CUSTOMER_FEEDBACK_SEVERITIES = ['normal', 'warning', 'critical'] as const;

export class QueryCustomerFeedbackDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CUSTOMER_FEEDBACK_TYPES })
  @IsOptional()
  @IsIn(CUSTOMER_FEEDBACK_TYPES)
  feedbackType?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_FEEDBACK_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_FEEDBACK_STATUSES)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beauticianId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  ratingMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CustomerFeedbackAnalyticsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateCustomerFeedbackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  serviceTaskId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  reservationId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  orderId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  beauticianId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  projectId?: number;

  @ApiProperty({ enum: CUSTOMER_FEEDBACK_TYPES })
  @IsIn(CUSTOMER_FEEDBACK_TYPES)
  feedbackType!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_FEEDBACK_SEVERITIES })
  @IsOptional()
  @IsIn(CUSTOMER_FEEDBACK_SEVERITIES)
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceChannel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  assignedUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class UpdateCustomerFeedbackDto {
  @ApiPropertyOptional({ enum: CUSTOMER_FEEDBACK_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_FEEDBACK_STATUSES)
  status?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_FEEDBACK_SEVERITIES })
  @IsOptional()
  @IsIn(CUSTOMER_FEEDBACK_SEVERITIES)
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  assignedUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}
