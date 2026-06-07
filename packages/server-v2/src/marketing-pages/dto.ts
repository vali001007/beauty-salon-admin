import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const SOURCE_TYPES = ['product', 'project', 'activity', 'card', 'package', 'recommendation', 'store_topic'] as const;
const RUNTIME_TYPES = ['h5', 'miniapp', 'both'] as const;
const EVENT_TYPES = ['view', 'share', 'click_cta', 'lead_submit', 'book', 'coupon_claim'] as const;
const LEAD_INTENT_TYPES = ['consult', 'book', 'product', 'project'] as const;

export class CreateMarketingPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  activityId?: number;

  @ApiProperty({ enum: SOURCE_TYPES })
  @IsIn(SOURCE_TYPES)
  sourceType: (typeof SOURCE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  sourceId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  slug?: string;

  @ApiPropertyOptional({ enum: RUNTIME_TYPES })
  @IsOptional()
  @IsIn(RUNTIME_TYPES)
  runtimeType?: (typeof RUNTIME_TYPES)[number];

  @ApiProperty()
  @IsObject()
  pageSchema: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  snapshotJson?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  themeJson?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  shareTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shareDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shareImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiGenerationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promptVersion?: string;
}

export class UpdateMarketingPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ enum: RUNTIME_TYPES })
  @IsOptional()
  @IsIn(RUNTIME_TYPES)
  runtimeType?: (typeof RUNTIME_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  pageSchema?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  snapshotJson?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  themeJson?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  shareTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shareDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shareImage?: string;
}

export class RecordMarketingPageEventDto {
  @ApiProperty({ enum: EVENT_TYPES })
  @IsIn(EVENT_TYPES)
  eventType: (typeof EVENT_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  openId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referrer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  staffId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  occurredAt?: string;
}

export class SubmitMarketingPageLeadDto {
  @ApiProperty()
  @Matches(/^1\d{10}$|^\+?\d{6,20}$/)
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({ enum: LEAD_INTENT_TYPES })
  @IsOptional()
  @IsIn(LEAD_INTENT_TYPES)
  intentType?: (typeof LEAD_INTENT_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  customerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  openId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referrer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  staffId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, unknown>;
}
