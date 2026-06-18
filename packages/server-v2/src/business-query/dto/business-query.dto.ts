import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class BusinessQueryAskDto {
  @ApiProperty({ description: '自然语言问数问题', example: '近期销量增长的商品' })
  @IsString()
  @MaxLength(500)
  question!: string;

  @ApiPropertyOptional({ description: '当前终端角色', enum: ['manager', 'reception', 'beautician'] })
  @IsOptional()
  @IsIn(['manager', 'reception', 'beautician'])
  role?: 'manager' | 'reception' | 'beautician';

  @ApiPropertyOptional({ description: '当前终端选择的操作账号 ID' })
  @IsOptional()
  @IsInt()
  operatorId?: number | null;

  @ApiPropertyOptional({ description: '上一轮问数上下文，仅包含受控查询结果摘要' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
