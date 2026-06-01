import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

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
