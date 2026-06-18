import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import type { AgentRole } from '../agent.types.js';

export class PreviewQueryPlanDto {
  @ApiProperty({ description: '用户自然语言经营问题', example: '最近七天收银趋势' })
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional({ description: '当前角色', enum: ['manager', 'reception', 'beautician'], default: 'manager' })
  @IsOptional()
  @IsIn(['manager', 'reception', 'beautician'])
  role?: AgentRole;

  @ApiPropertyOptional({ description: '当前操作账号 ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  operatorId?: number;

  @ApiPropertyOptional({ description: '多轮上下文' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
