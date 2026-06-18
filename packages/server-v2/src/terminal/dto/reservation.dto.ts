import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateReservationDto {
  @ApiPropertyOptional({ description: '客户 ID' })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({ description: '客户姓名，无客户 ID 时用于快速建档' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: '客户手机号' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: '项目 ID' })
  @IsOptional()
  @IsInt()
  projectId?: number;

  @ApiPropertyOptional({ description: '项目名称，无项目 ID 时用于模糊匹配' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ description: '美容师 ID' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional({ description: '美容师姓名，无美容师 ID 时用于模糊匹配' })
  @IsOptional()
  @IsString()
  beauticianName?: string;

  @ApiProperty({ description: '预约开始时间，ISO 8601 字符串' })
  @IsDateString()
  appointmentTime: string;

  @ApiPropertyOptional({ description: '服务时长，单位分钟' })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class UpdateReservationDto {
  @ApiPropertyOptional({ description: '预约开始时间，ISO 8601 字符串' })
  @IsOptional()
  @IsDateString()
  appointmentTime?: string;

  @ApiPropertyOptional({ description: '项目 ID' })
  @IsOptional()
  @IsInt()
  projectId?: number;

  @ApiPropertyOptional({ description: '项目名称' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ description: '美容师 ID' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional({ description: '美容师姓名' })
  @IsOptional()
  @IsString()
  beauticianName?: string;

  @ApiPropertyOptional({ description: '服务时长，单位分钟' })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: '预约状态' })
  @IsOptional()
  @IsIn(['pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'])
  status?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class RescheduleReservationDto {
  @ApiProperty({ description: '新的预约开始时间，ISO 8601 字符串' })
  @IsDateString()
  appointmentTime: string;

  @ApiPropertyOptional({ description: '新的服务时长，单位分钟' })
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: '新的美容师 ID' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional({ description: '改期原因' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReservationAvailabilityQueryDto {
  @ApiPropertyOptional({ description: '查询日期，YYYY-MM-DD 或 ISO 日期' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ description: '项目 ID，用于推断时长' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @ApiPropertyOptional({ description: '美容师 ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional({ description: '服务时长，单位分钟' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;
}
