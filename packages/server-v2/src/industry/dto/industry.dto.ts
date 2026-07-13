import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class IndustryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class QueryIndustryDataSourcesDto extends IndustryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confidenceLevel?: string;
}

export class CreateIndustryDataSourceDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  licenseType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confidenceLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  applicableScope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateIndustryDataSourceDto extends PartialType(CreateIndustryDataSourceDto) {}

export class QueryIndustryServiceTemplatesDto extends IndustryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subCategory?: string;
}

export class CreateIndustryServiceTemplateDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  aliases?: unknown;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  targetStoreTypes?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  recommendedDurationMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  recommendedDurationMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  careCycleWeeks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  treatmentCourseTimes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referencePriceMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referencePriceMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  targetCustomers?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  contraindications?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recommendedFrequency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  sellingPoints?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bomUnavailableReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sourceId?: number;
}

export class UpdateIndustryServiceTemplateDto extends PartialType(CreateIndustryServiceTemplateDto) {}

export class QueryIndustryProductTemplatesDto extends IndustryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  futureSupplyMappingStatus?: string;

  @ApiPropertyOptional({ description: '按门店采用状态筛选：unadopted/adopted/invalid/unmapped_supply/available' })
  @IsOptional()
  @IsString()
  adoptionStatus?: string;
}

export class CreateIndustryProductTemplateDto {
  @ApiProperty()
  @IsString()
  standardProductCode: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  aliases?: unknown;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subCategory?: string;

  @ApiProperty()
  @IsString()
  productType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recommendedSpec?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packageUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referenceCostMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referenceCostMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referenceRetailPriceMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  referenceRetailPriceMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  applicableServiceCategories?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplyCategoryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredSpecKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalMappingKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  futureSupplyMappingStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateIndustryProductTemplateDto extends PartialType(CreateIndustryProductTemplateDto) {}

export class IndustryBomItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  productTemplateId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemRole?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardQty: number;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lossRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  costIncluded?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceStep?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowSubstitute?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  substituteGroupCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  futureSupplyRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  futureSupplyMappingKey?: string;
}

export class SaveIndustryBomTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sourceId?: number;

  @ApiProperty({ type: [IndustryBomItemDto] })
  @IsArray()
  @Type(() => IndustryBomItemDto)
  items: IndustryBomItemDto[];
}

export class AdoptIndustryProductTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  adoptedByUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  specQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packageUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  costPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  retailPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  currentStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  safetyStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minPurchaseQty?: number;
}

export class BatchAdoptIndustryProductTemplatesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  adoptedByUserId?: number;

  @ApiProperty({ type: [Number] })
  @IsArray()
  @Type(() => Number)
  productTemplateIds: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryStrategy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultSafetyStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  defaultMinPurchaseQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultSupplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class LinkIndustryProductTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  adoptedByUserId?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  productId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class IndustryProductTemplateMappingDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  productTemplateId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  productId: number;
}

export class AdoptIndustryServiceTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  adoptedByUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  typeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  careCycleWeeks?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  treatmentCourseTimes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  adoptBom?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  createMissingProducts?: boolean;

  @ApiPropertyOptional({ type: [IndustryProductTemplateMappingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IndustryProductTemplateMappingDto)
  productMappings?: IndustryProductTemplateMappingDto[];
}

export class QueryIndustryKnowledgeDto extends IndustryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  domain?: string;
}

export class CreateIndustryKnowledgeItemDto {
  @ApiProperty()
  @IsString()
  domain: string;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  structuredPayload?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  tags?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  applicableServiceTemplateIds?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  applicableProductTemplateIds?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  applicableRoles?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sourceId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewStatus?: string;
}

export class UpdateIndustryKnowledgeItemDto extends PartialType(CreateIndustryKnowledgeItemDto) {}

export class QueryIndustrySalaryDto extends IndustryPaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roleCategory?: string;
}

export class CreateIndustrySalaryBenchmarkDto {
  @ApiProperty()
  @IsString()
  jobRole: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roleCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  targetStoreTypes?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cityTier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baseSalaryMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baseSalaryMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  commissionRateMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  commissionRateMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  serviceFeeMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  serviceFeeMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  performanceMetrics?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  responsibilities?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  capabilityRequirements?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateIndustrySalaryBenchmarkDto extends PartialType(CreateIndustrySalaryBenchmarkDto) {}

export class CreateIndustryAdoptionDto {
  @ApiProperty()
  @IsString()
  adoptionType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  adoptedByUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  serviceTemplateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productTemplateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  templateVersion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  localProjectId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  localProductId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  localBomItemIds?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  payload?: unknown;
}

export class CreateIndustrySupplyMappingRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  productTemplateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bomItemTemplateId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  requestedByStoreId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  requestedByUserId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  payload?: unknown;
}
