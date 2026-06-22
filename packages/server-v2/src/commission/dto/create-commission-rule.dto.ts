import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const COMMISSION_TYPES = ['project', 'product', 'card_sale', 'recharge', 'new_customer'] as const;
export const COMMISSION_TARGET_TYPES = ['all', 'category', 'specific'] as const;
export const COMMISSION_CALC_BASES = ['total', 'service_fee', 'profit'] as const;
export const COMMISSION_STATUSES = ['active', 'disabled', 'archived'] as const;

export class CreateCommissionRuleDto {
  @ApiProperty({ example: '项目通用提成' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ enum: COMMISSION_TYPES })
  @IsString()
  @IsIn(COMMISSION_TYPES)
  type: string;

  @ApiPropertyOptional({ enum: COMMISSION_TARGET_TYPES, default: 'all' })
  @IsOptional()
  @IsString()
  @IsIn(COMMISSION_TARGET_TYPES)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  targetId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  levelId?: number;

  @ApiProperty({ description: '适用员工，必须来自系统管理-用户管理' })
  @Type(() => Number)
  @IsInt()
  userId!: number;

  @ApiProperty({ description: '比例。0.08 表示 8%' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate: number;

  @ApiPropertyOptional({ description: '固定提成金额，填写后优先于比例' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number;

  @ApiPropertyOptional({ enum: COMMISSION_CALC_BASES, default: 'total' })
  @IsOptional()
  @IsString()
  @IsIn(COMMISSION_CALC_BASES)
  calcBase?: string;

  @ApiPropertyOptional({ description: '是否启用指定员工加成' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDesignated?: boolean;

  @ApiPropertyOptional({ description: '指定加成比例。0.2 表示额外加 20%' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  designatedBonus?: number;

  @ApiPropertyOptional({ description: '低于该提成金额则不生成流水' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minThreshold?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ enum: COMMISSION_STATUSES, default: 'active' })
  @IsOptional()
  @IsString()
  @IsIn(COMMISSION_STATUSES)
  status?: string;
}
