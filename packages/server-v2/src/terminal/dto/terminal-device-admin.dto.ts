import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

const TERMINAL_DEVICE_STATUSES = ['online', 'offline', 'disabled', 'pending_unbind'] as const;

export class QueryTerminalDevicesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ enum: TERMINAL_DEVICE_STATUSES })
  @IsOptional()
  @IsIn(TERMINAL_DEVICE_STATUSES)
  status?: (typeof TERMINAL_DEVICE_STATUSES)[number];
}

export class ProvisionTerminalDeviceDto {
  @ApiPropertyOptional({ description: 'Store id. Falls back to X-Store-Id when omitted.' })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ example: 'AURA-LITE-001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceCode?: string;

  @ApiPropertyOptional({ example: 'AURA-2026' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  activationCode?: string;

  @ApiPropertyOptional({ example: 'Front Desk Ami Aura Lite' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: 'Ami Aura Lite' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  firmwareVersion?: string;
}

export class UpdateTerminalDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  activationCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional({ enum: TERMINAL_DEVICE_STATUSES })
  @IsOptional()
  @IsIn(TERMINAL_DEVICE_STATUSES)
  status?: (typeof TERMINAL_DEVICE_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  firmwareVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  networkStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  printerStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  scannerStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  cameraStatus?: string;
}
