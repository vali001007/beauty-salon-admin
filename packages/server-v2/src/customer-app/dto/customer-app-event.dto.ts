import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class CustomerAppEventDto {
  @ApiProperty({ description: '事件类型' })
  @IsString()
  eventType: string;

  @ApiPropertyOptional({ description: '门店 ID' })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ description: '游客会话 ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: '渠道来源' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ description: '事件来源端，如 ami_glow、ami_glow_h5' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: '目标类型' })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiPropertyOptional({ description: '目标 ID' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({ description: '事件扩展信息' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
