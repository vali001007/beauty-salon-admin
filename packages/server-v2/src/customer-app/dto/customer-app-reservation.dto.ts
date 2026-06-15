import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CustomerAppAvailabilityQueryDto {
  @ApiProperty({ description: '门店 ID' })
  @IsInt()
  storeId: number;

  @ApiProperty({ description: '项目 ID' })
  @IsInt()
  projectId: number;

  @ApiPropertyOptional({ description: '美容师 ID' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiProperty({ description: '日期，YYYY-MM-DD' })
  @IsString()
  date: string;
}

export class CustomerAppCreateReservationDto {
  @ApiProperty({ description: '门店 ID' })
  @IsInt()
  storeId: number;

  @ApiProperty({ description: '项目 ID' })
  @IsInt()
  projectId: number;

  @ApiPropertyOptional({ description: '美容师 ID，不传表示到店分配' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiProperty({ description: '预约日期，YYYY-MM-DD' })
  @IsString()
  date: string;

  @ApiProperty({ description: '开始时间，HH:mm' })
  @IsString()
  startTime: string;

  @ApiPropertyOptional({ description: '结束时间，HH:mm；不传则按项目时长计算' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: '客户姓名' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: '客户手机号' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ description: '渠道来源' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ description: '活动 ID' })
  @IsOptional()
  @IsInt()
  promotionId?: number;

  @ApiPropertyOptional({ description: '幂等键' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CustomerAppCancelReservationDto {
  @ApiPropertyOptional({ description: '取消原因' })
  @IsOptional()
  @IsString()
  reason?: string;
}
