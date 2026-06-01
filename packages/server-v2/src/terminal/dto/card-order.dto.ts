import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCardOrderDto {
  @ApiPropertyOptional({ description: '客户 ID' })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiProperty({ description: '客户姓名' })
  @IsString()
  customerName: string;

  @ApiPropertyOptional({ description: '客户手机号' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({ description: '卡项 ID' })
  @IsInt()
  cardId: number;

  @ApiProperty({ description: '卡项名称' })
  @IsString()
  cardName: string;

  @ApiProperty({ description: '实收金额' })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: '总次数' })
  @IsInt()
  totalTimes: number;

  @ApiPropertyOptional({ description: '优惠金额' })
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
