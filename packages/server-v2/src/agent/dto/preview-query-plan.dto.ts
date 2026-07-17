import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import type { AgentRole } from '../agent.types.js';

export class PreviewQueryPlanDto {
  @ApiProperty({ description: '用户自然语言经营问题', example: '最近七天收银趋势' })
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional({ description: '仅用于客户端展示，授权角色以服务端认证 principal 为准', enum: ['manager', 'reception', 'beautician'] })
  @IsOptional()
  @IsIn(['manager', 'reception', 'beautician'])
  role?: AgentRole;

  @ApiPropertyOptional({ description: '仅用于兼容旧客户端，不参与授权或本人范围判断' })
  @IsOptional()
  @IsInt()
  @Min(1)
  operatorId?: number;

  @ApiPropertyOptional({ description: '多轮上下文' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
