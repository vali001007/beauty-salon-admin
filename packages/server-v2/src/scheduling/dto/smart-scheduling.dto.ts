import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

const SMART_SCHEDULING_MODES = ['blank', 'copy_last_week_optimize', 'optimize_current'] as const;
const SMART_SCHEDULING_OBJECTIVES = ['cover_reservations', 'cover_peak', 'fairness', 'reduce_staff'] as const;
const SMART_SCHEDULE_STATUSES = ['available', 'busy', 'leave', 'normal'] as const;

type SmartSchedulingMode = (typeof SMART_SCHEDULING_MODES)[number];
type SmartSchedulingObjective = (typeof SMART_SCHEDULING_OBJECTIVES)[number];

export class SmartSchedulingPeakMinStaffDto {
  @ApiProperty({ example: 6, description: '1=Monday, 7=Sunday' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @ApiProperty({ example: '14:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime: string;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minStaff: number;
}

export class SmartScheduleItemDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  beauticianId: number;

  @ApiProperty({ example: '2026-06-08' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiProperty({ example: '10:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime: string;

  @ApiProperty({ example: '11:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime: string;

  @ApiPropertyOptional({ enum: SMART_SCHEDULE_STATUSES, default: 'available' })
  @IsOptional()
  @IsString()
  @IsIn(SMART_SCHEDULE_STATUSES)
  status?: string;
}

export class PreviewSmartSchedulingDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  storeId?: number;

  @ApiProperty({ example: '2026-06-08' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStart: string;

  @ApiPropertyOptional({ enum: SMART_SCHEDULING_MODES, default: 'copy_last_week_optimize' })
  @IsOptional()
  @IsString()
  @IsIn(SMART_SCHEDULING_MODES)
  mode?: SmartSchedulingMode;

  @ApiPropertyOptional({ enum: SMART_SCHEDULING_OBJECTIVES, default: 'cover_reservations' })
  @IsOptional()
  @IsString()
  @IsIn(SMART_SCHEDULING_OBJECTIVES)
  objective?: SmartSchedulingObjective;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  keepConfirmedReservations?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowOverrideBusy?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowOverrideLeave?: boolean;

  @ApiPropertyOptional({ type: [SmartSchedulingPeakMinStaffDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SmartSchedulingPeakMinStaffDto)
  peakMinStaff?: SmartSchedulingPeakMinStaffDto[];
}

export class EvaluateSmartSchedulingDto extends PartialType(PreviewSmartSchedulingDto) {
  @ApiProperty({ example: '2026-06-08' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStart: string;

  @ApiPropertyOptional({ type: [SmartScheduleItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SmartScheduleItemDto)
  schedules?: SmartScheduleItemDto[];
}

export class PublishSmartSchedulingDto extends EvaluateSmartSchedulingDto {
  @ApiPropertyOptional({ example: 'smart_1_20260608_001' })
  @IsOptional()
  @IsString()
  runId?: string;
}
