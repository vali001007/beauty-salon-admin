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

  @ApiPropertyOptional({ description: 'Customer name from terminal context' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ description: 'Customer phone from terminal context' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: '美容师ID，用于提成归属' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiProperty({ description: '支付方式', example: 'wechat' })
  @IsString()
  payMethod: string;

  @ApiPropertyOptional({ description: '优惠金额' })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ description: '是否指定美容师' })
  @IsOptional()
  isDesignated?: boolean;

  @ApiPropertyOptional({ description: 'Recommendation id that led to this checkout' })
  @IsOptional()
  @IsInt()
  recommendationId?: number;

  @ApiPropertyOptional({ description: 'Matched recommendation id, kept for client compatibility' })
  @IsOptional()
  @IsInt()
  matchedRecommendationId?: number;
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
