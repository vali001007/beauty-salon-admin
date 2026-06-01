import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'store_manager' })
  @IsString()
  key: string;

  @ApiProperty({ example: '店长' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  platformScopes?: Record<string, boolean>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  dataScopes?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  fieldScopes?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  approvalScopes?: Record<string, string>;
}
