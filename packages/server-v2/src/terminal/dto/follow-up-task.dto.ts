import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const FOLLOW_UP_ASSIGNEE_ROLES = ['manager', 'consultant', 'reception'] as const;
export const FOLLOW_UP_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled', 'expired'] as const;
export const FOLLOW_UP_RESULT_TYPES = ['contacted', 'booked', 'not_reached', 'refused', 'converted'] as const;

export class CreateTerminalFollowUpTaskDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recommendationId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  recommendationInstanceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  adoptionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceRecommendationKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  triggerType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  promotionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  promotionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  offerJson?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attribution?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  priority?: string;

  @ApiPropertyOptional({ enum: FOLLOW_UP_ASSIGNEE_ROLES })
  @IsOptional()
  @IsIn(FOLLOW_UP_ASSIGNEE_ROLES)
  assigneeRole?: (typeof FOLLOW_UP_ASSIGNEE_ROLES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeBeauticianId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  taskId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reservationId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  channel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  script?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueAt?: string;
}

export class TerminalFollowUpTaskAssignmentDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId: number;

  @ApiPropertyOptional({ enum: FOLLOW_UP_ASSIGNEE_ROLES })
  @IsOptional()
  @IsIn(FOLLOW_UP_ASSIGNEE_ROLES)
  assigneeRole?: (typeof FOLLOW_UP_ASSIGNEE_ROLES)[number];

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeUserId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeBeauticianId?: number;
}

export class BatchCreateTerminalFollowUpTaskDto extends CreateTerminalFollowUpTaskDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  customerIds: number[];

  @ApiPropertyOptional({ type: [TerminalFollowUpTaskAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TerminalFollowUpTaskAssignmentDto)
  assignments?: TerminalFollowUpTaskAssignmentDto[];
}

export class QueryTerminalFollowUpTasksDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ enum: FOLLOW_UP_TASK_STATUSES })
  @IsOptional()
  @IsIn(FOLLOW_UP_TASK_STATUSES)
  status?: (typeof FOLLOW_UP_TASK_STATUSES)[number];

  @ApiPropertyOptional({ enum: FOLLOW_UP_ASSIGNEE_ROLES })
  @IsOptional()
  @IsIn(FOLLOW_UP_ASSIGNEE_ROLES)
  assigneeRole?: (typeof FOLLOW_UP_ASSIGNEE_ROLES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeUserId?: number;

  @ApiPropertyOptional({ description: '终端当前选择的操作账号，用于匹配该账号及其绑定美容师的跟进任务' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  operatorId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  customerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  recommendationId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  recommendationInstanceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;
}

export class AssignTerminalFollowUpTaskDto {
  @ApiProperty({ enum: FOLLOW_UP_ASSIGNEE_ROLES })
  @IsIn(FOLLOW_UP_ASSIGNEE_ROLES)
  assigneeRole: (typeof FOLLOW_UP_ASSIGNEE_ROLES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeBeauticianId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CompleteTerminalFollowUpTaskDto {
  @ApiPropertyOptional({ enum: FOLLOW_UP_RESULT_TYPES })
  @IsOptional()
  @IsIn(FOLLOW_UP_RESULT_TYPES)
  resultType?: (typeof FOLLOW_UP_RESULT_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  result?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reservationId?: number;
}

export class CancelTerminalFollowUpTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
