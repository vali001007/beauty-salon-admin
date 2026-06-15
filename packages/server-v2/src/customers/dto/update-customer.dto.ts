import { Type } from 'class-transformer';
import { IsString, IsOptional, IsArray, IsDateString, IsInt, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wechat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  landline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  birthday?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  age?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workplace?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hasAllergy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hasSurgery?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  skinCondition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  skinType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalSpent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastVisitDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memberLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
