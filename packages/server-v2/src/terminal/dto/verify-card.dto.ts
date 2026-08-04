import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyCardDto {
  @ApiPropertyOptional({ description: '客户ID' })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiProperty({ description: '客户卡ID' })
  @IsInt()
  customerCardId: number;

  @ApiPropertyOptional({ description: '项目ID（验证是否可用于该项目）' })
  @IsOptional()
  @IsInt()
  projectId?: number;
}

export class ConsumeCardDto {
  @ApiPropertyOptional({ description: '核销幂等键；也可通过 Idempotency-Key 请求头传递' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: '客户ID' })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiProperty({ description: '客户卡ID' })
  @IsInt()
  customerCardId: number;

  @ApiProperty({ description: '项目ID' })
  @IsInt()
  projectId: number;

  @ApiPropertyOptional({ description: '美容师ID' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional({ description: '操作人ID（管理端账号或终端当前用户）' })
  @IsOptional()
  @IsInt()
  operatorId?: number;

  @ApiPropertyOptional({ description: '消耗次数', example: 1 })
  @IsOptional()
  @IsInt()
  times?: number;
}
