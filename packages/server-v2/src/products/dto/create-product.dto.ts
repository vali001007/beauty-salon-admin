import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  categoryId: number;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  spec?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retailPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shelfLife?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPurchaseQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  discountLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salesDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  miniappStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  miniappPublishedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  safetyStock?: number;
}
