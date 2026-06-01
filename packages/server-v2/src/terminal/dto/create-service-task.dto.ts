import { IsInt, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceTaskDto {
  @ApiProperty({ description: '客户ID' })
  @IsInt()
  customerId: number;

  @ApiProperty({ description: '项目ID' })
  @IsInt()
  projectId: number;

  @ApiPropertyOptional({ description: '美容师ID' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional({ description: '预约时间' })
  @IsOptional()
  @IsDateString()
  appointmentTime?: string;

  @ApiPropertyOptional({ description: '时长（分钟）', example: 60 })
  @IsOptional()
  @IsInt()
  duration?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
