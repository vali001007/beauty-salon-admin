import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CustomerAppH5GuestDto {
  @ApiProperty({ description: 'H5 游客会话 ID' })
  @IsString()
  sessionId: string;

  @ApiPropertyOptional({ description: '当前门店 ID' })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ description: 'H5 客户昵称' })
  @IsOptional()
  @IsString()
  nickname?: string;
}

export class CustomerAppWechatLoginDto {
  @ApiProperty({ description: '微信登录 code；开发期可传任意稳定字符串' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ description: '当前门店 ID' })
  @IsOptional()
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional({ description: '微信昵称' })
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional({ description: '微信头像' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class CustomerAppBindPhoneDto {
  @ApiProperty({ description: '手机号' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ description: '客户姓名' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '当前门店 ID' })
  @IsOptional()
  @IsInt()
  storeId?: number;
}
