import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import type { AgentRole } from '../agent.types.js';

export class CompileBusinessTaskDto {
  @ApiProperty({ description: '用户自然语言经营问题', example: '今天最值得跟进的10个客户' })
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional({ description: '当前角色', enum: ['manager', 'reception', 'beautician'], default: 'manager' })
  @IsOptional()
  @IsIn(['manager', 'reception', 'beautician'])
  role?: AgentRole;

  @ApiPropertyOptional({ description: '多轮上下文' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
