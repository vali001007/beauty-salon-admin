import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuerySuppliersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateSupplierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rebateRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

export class LinkProductSupplierDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  productId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  supplyPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  moq?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  leadDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class QuerySupplierOrdersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;
}

export class CreateSupplierOrderItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  productId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreateSupplierOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  supplierId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rebateAmount?: number;

  @ApiProperty({ type: [CreateSupplierOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierOrderItemDto)
  items: CreateSupplierOrderItemDto[];
}

export class UpdateSupplierOrderStatusDto {
  @ApiProperty()
  @IsString()
  status: string;
}

export class ReceiveSupplierOrderItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  orderItemId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  receivedQty: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  productionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class ReceiveSupplierOrderDto {
  @ApiProperty({ type: [ReceiveSupplierOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveSupplierOrderItemDto)
  items: ReceiveSupplierOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class QuerySupplierSettlementsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @ApiPropertyOptional({ description: 'YYYY-MM' })
  @IsOptional()
  @IsString()
  settleMonth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class GenerateSupplierSettlementDto {
  @ApiProperty({ description: 'YYYY-MM' })
  @IsString()
  settleMonth: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;
}
