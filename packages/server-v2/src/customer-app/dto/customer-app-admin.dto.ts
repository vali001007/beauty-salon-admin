import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const AMI_GLOW_OBJECT_TYPES = ['project', 'product', 'card', 'promotion', 'marketing_page'] as const;
export const AMI_GLOW_PUBLISH_STATUSES = ['draft', 'published', 'offline'] as const;

export class CustomerAppAdminDisplayConfigQueryDto {
  @ApiPropertyOptional({ description: '页码' })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页数量' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ description: '对象类型', enum: AMI_GLOW_OBJECT_TYPES })
  @IsOptional()
  @IsIn(AMI_GLOW_OBJECT_TYPES)
  objectType?: string;

  @ApiPropertyOptional({ description: '发布状态', enum: AMI_GLOW_PUBLISH_STATUSES })
  @IsOptional()
  @IsIn(AMI_GLOW_PUBLISH_STATUSES)
  publishStatus?: string;

  @ApiPropertyOptional({ description: '搜索关键词' })
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class CustomerAppAdminDisplayConfigDto {
  @ApiProperty({ description: '门店 ID' })
  @IsInt()
  storeId: number;

  @ApiProperty({ description: '对象类型', enum: AMI_GLOW_OBJECT_TYPES })
  @IsIn(AMI_GLOW_OBJECT_TYPES)
  objectType: string;

  @ApiProperty({ description: '对象 ID' })
  @IsInt()
  objectId: number;

  @ApiPropertyOptional({ description: '是否在 Ami Glow 展示' })
  @IsOptional()
  @IsBoolean()
  showInAmiGlow?: boolean;

  @ApiPropertyOptional({ description: '排序，越小越靠前' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '展示标签' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '展示主图' })
  @IsOptional()
  @IsString()
  bannerImage?: string | null;

  @ApiPropertyOptional({ description: '展示摘要' })
  @IsOptional()
  @IsString()
  summary?: string | null;

  @ApiPropertyOptional({ description: '小程序 CTA 类型' })
  @IsOptional()
  @IsString()
  ctaType?: string | null;

  @ApiPropertyOptional({ description: '发布状态', enum: AMI_GLOW_PUBLISH_STATUSES })
  @IsOptional()
  @IsIn(AMI_GLOW_PUBLISH_STATUSES)
  publishStatus?: string;

  @ApiPropertyOptional({ description: '开始展示时间' })
  @IsOptional()
  @IsDateString()
  startAt?: string | null;

  @ApiPropertyOptional({ description: '结束展示时间' })
  @IsOptional()
  @IsDateString()
  endAt?: string | null;

  @ApiPropertyOptional({ description: '扩展配置' })
  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, unknown> | null;
}

export class CustomerAppAdminUpdateDisplayConfigDto extends PartialType(CustomerAppAdminDisplayConfigDto) {}

export class CustomerAppAdminEventQueryDto {
  @ApiPropertyOptional({ description: '页码' })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页数量' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ description: '客户 ID' })
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional({ description: '事件类型' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ description: '渠道' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ description: '目标类型' })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({ description: '目标 ID' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({ description: '事件来源' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: '搜索客户、openid、会话或目标 ID' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '开始时间' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束时间' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
