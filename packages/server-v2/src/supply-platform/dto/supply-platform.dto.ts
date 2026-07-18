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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SupplyPlatformPaginationDto {
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
}

export class QuerySupplySuppliersDto extends SupplyPlatformPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualificationStatus?: string;
}

export class CreateSupplySupplierDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

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
  serviceRegions?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  categories?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  settlementMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rebateRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  platformFeeRate?: number;
}

export class UpdateSupplySupplierDto extends PartialType(CreateSupplySupplierDto) {}

export class UpdateSupplySupplierStatusDto {
  @ApiProperty()
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qualificationStatus?: string;
}

export class CreateSupplierQualificationDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  supplierId: number;

  @ApiProperty()
  @IsString()
  type: string;

  @ApiProperty()
  @IsString()
  fileUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class QuerySupplySkusDto extends SupplyPlatformPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

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
  auditStatus?: string;
}

export class CreateSupplySkuDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  supplierId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  spec?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  images?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  shelfLife?: number;

  @ApiPropertyOptional()
  @IsOptional()
  qualificationFiles?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateSupplySkuDto extends PartialType(CreateSupplySkuDto) {}

export class AuditSupplySkuDto {
  @ApiProperty()
  @IsString()
  auditStatus: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectReason?: string;
}

export class QuerySupplyQuotesDto extends SupplyPlatformPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplySkuId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  auditStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  availableOnly?: string;
}

export class CreateSupplyQuoteDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  supplySkuId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  taxIncluded?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  moq?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  leadDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stockStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  availableStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  regionScope?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  storeScope?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class UpdateSupplyQuoteDto extends PartialType(CreateSupplyQuoteDto) {}

export class AuditSupplyQuoteDto {
  @ApiProperty()
  @IsString()
  auditStatus: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectReason?: string;
}

export class CreateSupplyCatalogMappingDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  supplySkuId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  standardProductTemplateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mappingStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;
}

export class QuerySupplyCatalogMappingsDto extends SupplyPlatformPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplySkuId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  standardProductTemplateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mappingStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purchasableStatus?: string;
}

export class UpdateSupplyCatalogMappingDto extends PartialType(CreateSupplyCatalogMappingDto) {}

export class QueryProcurementOrdersDto extends SupplyPlatformPaginationDto {
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

export class CreateProcurementOrderItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productId?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  supplySkuId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quoteId?: number;

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

export class CreateProcurementOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  storeId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  supplierId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedArrivalDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceNo?: string;

  @ApiProperty({ type: [CreateProcurementOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProcurementOrderItemDto)
  items: CreateProcurementOrderItemDto[];
}

export class CreateReplenishmentProcurementOrderItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  productId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mappingId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplySkuId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quoteId?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateProcurementOrdersFromReplenishmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  storeId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedArrivalDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceNo?: string;

  @ApiProperty({ type: [CreateReplenishmentProcurementOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReplenishmentProcurementOrderItemDto)
  items: CreateReplenishmentProcurementOrderItemDto[];
}

export class UpdateProcurementOrderStatusDto {
  @ApiProperty()
  @IsString()
  status: string;
}

export class CreateShipmentItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  orderItemId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  supplySkuId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shippedQty: number;

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

export class CreateShipmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logisticsCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedArrivalAt?: string;

  @ApiProperty({ type: [CreateShipmentItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items: CreateShipmentItemDto[];
}

export class ReceiveProcurementItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  shipmentItemId: number;

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
}

export class ReceiveProcurementOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;

  @ApiProperty({ type: [ReceiveProcurementItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveProcurementItemDto)
  items: ReceiveProcurementItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;
}

export class GenerateSupplySettlementDto {
  @ApiProperty()
  @IsString()
  settleMonth: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;
}
