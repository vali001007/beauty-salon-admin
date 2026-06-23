import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const TERMINAL_CUSTOMER_SELECT_SCENES = [
  'appointment',
  'cashier',
  'card_opening',
  'recharge',
  'verification',
  'follow_up',
  'service_record',
] as const;

export type TerminalCustomerSelectScene = (typeof TERMINAL_CUSTOMER_SELECT_SCENES)[number];

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return Boolean(value);
}

export class TerminalCustomerSelectQueryDto {
  @ApiPropertyOptional({ enum: TERMINAL_CUSTOMER_SELECT_SCENES, default: 'appointment' })
  @IsOptional()
  @IsIn(TERMINAL_CUSTOMER_SELECT_SCENES)
  scene?: TerminalCustomerSelectScene = 'appointment';

  @ApiPropertyOptional({ description: '姓名、手机号或会员关键词' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  keyword?: string;

  @ApiPropertyOptional({ description: '返回数量，默认 50，最大 100', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: '指定客户 ID，英文逗号分隔，用于编辑回显' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerIds?: string;

  @ApiPropertyOptional({ description: '当前终端操作账号 ID，用于账号切换后的权限过滤' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  operatorId?: number;

  @ApiPropertyOptional({ description: '仅查询当前账号相关客户' })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  onlyMyCustomers?: boolean;

  @ApiPropertyOptional({ description: '是否包含非活跃客户，默认 false' })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  includeInactive?: boolean;
}
