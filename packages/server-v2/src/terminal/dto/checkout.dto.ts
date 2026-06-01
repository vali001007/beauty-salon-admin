import { IsInt, IsString, IsOptional, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CheckoutItemDto {
  @ApiProperty({ description: '项目/产品ID' })
  @IsInt()
  itemId: number;

  @ApiProperty({ description: '类型: project | product' })
  @IsString()
  itemType: string;

  @ApiPropertyOptional({ description: '项目/商品名称' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '数量' })
  @IsInt()
  quantity: number;

  @ApiProperty({ description: '单价' })
  @IsNumber()
  unitPrice: number;

  @ApiPropertyOptional({ description: '小计金额' })
  @IsOptional()
  @IsNumber()
  subtotal?: number;
}

export class CheckoutDto {
  @ApiPropertyOptional({ description: '客户ID' })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiProperty({ description: '支付方式', example: 'wechat' })
  @IsString()
  payMethod: string;

  @ApiPropertyOptional({ description: '优惠金额' })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiProperty({ description: '结算项目', type: [CheckoutItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
