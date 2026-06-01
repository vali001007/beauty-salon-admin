import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeviceLoginDto {
  @ApiProperty({ description: '设备编码', example: 'AURA-LITE-001' })
  @IsString()
  @IsNotEmpty()
  deviceCode: string;

  @ApiProperty({ description: '激活码', example: 'ACT-2024-XXXX' })
  @IsString()
  @IsNotEmpty()
  activationCode: string;
}
