import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRechargeOrderDto {
  @ApiPropertyOptional({ description: '客户 ID' })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({ description: '美容师ID，用于充值提成归属' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiProperty({ description: '客户姓名' })
  @IsString()
  customerName: string;

  @ApiPropertyOptional({ description: '客户手机号' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({ description: '充值金额' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: '优惠/赠送金额' })
  @IsOptional()
  @IsNumber()
  giftAmount?: number;

  @ApiPropertyOptional({ description: '优惠金额，兼容终端表单字段' })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ description: '赠送项目' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  giftProjects?: string[];

  @ApiPropertyOptional({ description: '支付方式' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: '第三方交易号' })
  @IsOptional()
  @IsString()
  transactionNo?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
