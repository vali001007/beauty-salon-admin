import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DeviceHeartbeatDto {
  @ApiPropertyOptional({ description: '应用版本' })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({ description: '固件版本' })
  @IsOptional()
  @IsString()
  firmwareVersion?: string;

  @ApiPropertyOptional({ description: '电池电量 (0-100)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional({ description: '网络状态', example: 'wifi' })
  @IsOptional()
  @IsString()
  networkStatus?: string;

  @ApiPropertyOptional({ description: '打印机状态', example: 'online' })
  @IsOptional()
  @IsString()
  printerStatus?: string;

  @ApiPropertyOptional({ description: '扫码器状态', example: 'online' })
  @IsOptional()
  @IsString()
  scannerStatus?: string;

  @ApiPropertyOptional({ description: '摄像头状态', example: 'online' })
  @IsOptional()
  @IsString()
  cameraStatus?: string;
}
