import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class ConsumeBalanceDto {
  @ApiProperty({ description: '客户 ID' })
  @IsInt()
  customerId: number;

  @ApiProperty({ description: '消费现金余额金额' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: '消费赠送余额金额' })
  @IsOptional()
  @IsNumber()
  giftAmount?: number;

  @ApiPropertyOptional({ description: '关联订单 ID' })
  @IsOptional()
  @IsInt()
  orderId?: number;

  @ApiPropertyOptional({ description: '支付方式' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class RefundBalanceDto {
  @ApiProperty({ description: '客户 ID' })
  @IsInt()
  customerId: number;

  @ApiProperty({ description: '退回现金余额金额' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: '退回赠送余额金额' })
  @IsOptional()
  @IsNumber()
  giftAmount?: number;

  @ApiPropertyOptional({ description: '关联订单 ID' })
  @IsOptional()
  @IsInt()
  orderId?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class AdjustBalanceDto {
  @ApiProperty({ description: '客户 ID' })
  @IsInt()
  customerId: number;

  @ApiPropertyOptional({ description: '现金余额调整值，可正可负' })
  @IsOptional()
  @IsNumber()
  cashDelta?: number;

  @ApiPropertyOptional({ description: '赠送余额调整值，可正可负' })
  @IsOptional()
  @IsNumber()
  giftDelta?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
