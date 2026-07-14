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

  @ApiPropertyOptional({ description: '明细原价小计' })
  @IsOptional()
  @IsNumber()
  listAmount?: number;

  @ApiPropertyOptional({ description: '明细级优惠金额' })
  @IsOptional()
  @IsNumber()
  itemDiscountAmount?: number;

  @ApiPropertyOptional({ description: '是否赠品，赠品收入按 0 处理' })
  @IsOptional()
  isGift?: boolean;

  @ApiPropertyOptional({ description: '是否参与整单优惠分摊' })
  @IsOptional()
  eligibleForOrderDiscount?: boolean;

  @ApiPropertyOptional({ description: '服务员工/美容师ID，用于明细级提成归属' })
  @IsOptional()
  @IsInt()
  beauticianId?: number;

  @ApiPropertyOptional({ description: '服务员工/美容师名称，兼容终端展示字段；真实归属优先使用 beauticianId' })
  @IsOptional()
  @IsString()
  beauticianName?: string;
}

export class CheckoutPaymentDto {
  @ApiProperty({ description: '支付方式', example: 'member_balance' })
  @IsString()
  paymentMethod: string;

  @ApiProperty({ description: '本支付方式金额' })
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ description: '第三方交易号' })
  @IsOptional()
  @IsString()
  transactionNo?: string;
}

export class CheckoutDto {
  @ApiPropertyOptional({ description: '由已完成服务任务转收银时的任务 ID' })
  @IsOptional()
  @IsInt()
  taskId?: number;

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

  @ApiPropertyOptional({ description: '组合支付明细', type: [CheckoutPaymentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentDto)
  payments?: CheckoutPaymentDto[];

  @ApiPropertyOptional({ description: '优惠金额' })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ description: '优惠模式: none | amount | rate | package_price | manual' })
  @IsOptional()
  @IsString()
  discountMode?: 'none' | 'amount' | 'rate' | 'package_price' | 'manual';

  @ApiPropertyOptional({ description: '折扣比例，如 85 表示 8.5 折' })
  @IsOptional()
  @IsNumber()
  discountRate?: number;

  @ApiPropertyOptional({ description: '套餐价，系统会反算整单优惠' })
  @IsOptional()
  @IsNumber()
  packagePrice?: number;

  @ApiPropertyOptional({ description: '分摊方式: price_ratio | manual' })
  @IsOptional()
  @IsString()
  allocationMethod?: 'price_ratio' | 'manual';

  @ApiPropertyOptional({ description: '优惠来源: order | package | promotion | coupon | manual' })
  @IsOptional()
  @IsString()
  discountSource?: 'order' | 'package' | 'promotion' | 'coupon' | 'manual';

  @ApiPropertyOptional({ description: '关联优惠活动 ID' })
  @IsOptional()
  @IsInt()
  promotionId?: number;

  @ApiPropertyOptional({ description: '关联优惠券 ID' })
  @IsOptional()
  @IsInt()
  couponId?: number;

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
