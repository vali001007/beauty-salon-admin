import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class QueryGapOpportunitiesDto {
  @ApiPropertyOptional({ example: '2026-06-29' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStart?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  storeId?: number;
}

export class GenerateGapCandidatesDto {
  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  projectIds?: number[];

  @ApiPropertyOptional({ example: 'phone' })
  @IsOptional()
  @IsString()
  channel?: string;
}

export class CreateGapFollowUpTasksDto {
  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  candidateIds?: number[];

  @ApiPropertyOptional({ enum: ['manager', 'consultant', 'reception'] })
  @IsOptional()
  @IsString()
  @IsIn(['manager', 'consultant', 'reception'])
  assigneeRole?: 'manager' | 'consultant' | 'reception';

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
  dueAt?: string;
}

export class CreateGapConfirmationDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  candidateId?: number;

  @ApiPropertyOptional({ example: 'sms' })
  @IsOptional()
  @IsString()
  channel?: string;
}

export class CreateGapBenefitDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  candidateId?: number;

  @ApiPropertyOptional({ example: 'sms' })
  @IsOptional()
  @IsString()
  channel?: string;
}
