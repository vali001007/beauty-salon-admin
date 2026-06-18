import { IsInt, IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSkinTestDto {
  @ApiProperty({ description: '客户ID' })
  @IsInt()
  customerId: number;

  @ApiPropertyOptional({ description: '关联服务任务ID' })
  @IsOptional()
  @IsInt()
  taskId?: number;

  @ApiPropertyOptional({ description: '检测图片URL列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiProperty({ description: '检测指标数据（JSON）', example: { moisture: 65, oil: 30, elasticity: 70 } })
  @IsOptional()
  metrics: Record<string, any> | Array<Record<string, any>>;

  @ApiProperty({ description: '肤质类型', example: '混合性' })
  @IsString()
  skinType: string;

  @ApiPropertyOptional({ description: '皮肤状态' })
  @IsOptional()
  @IsString()
  skinStatus?: string;

  @ApiPropertyOptional({ description: '主要问题' })
  @IsOptional()
  @IsString()
  mainProblems?: string;

  @ApiPropertyOptional({ description: '护理建议' })
  @IsOptional()
  @IsString()
  recommendationText?: string;
}
