import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateTerminalCustomerHealthProfileDto {
  @ApiPropertyOptional({ description: '肤质' })
  @IsOptional()
  @IsString()
  skinType?: string;

  @ApiPropertyOptional({ description: '皮肤状态' })
  @IsOptional()
  @IsString()
  skinStatus?: string;

  @ApiPropertyOptional({ description: '主要问题' })
  @IsOptional()
  @IsString()
  mainProblems?: string;

  @ApiPropertyOptional({ description: '过敏史' })
  @IsOptional()
  @IsString()
  allergyHistory?: string;

  @ApiPropertyOptional({ description: '护理目标' })
  @IsOptional()
  @IsString()
  goals?: string;

  @ApiPropertyOptional({ description: '推荐护理' })
  @IsOptional()
  @IsString()
  recommendedCare?: string;

  @ApiPropertyOptional({ description: '检测设备' })
  @IsOptional()
  @IsString()
  instrument?: string;
}
