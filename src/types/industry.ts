import type { Project } from './project';

export type IndustryTemplateStatus = 'draft' | 'pending_review' | 'published' | 'offline' | string;
export type IndustryKnowledgeStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'offline' | string;
export type IndustrySupplyMappingStatus = 'not_connected' | 'not_mapped' | 'mapping_requested' | 'mapped' | 'mapping_error' | string;

export interface IndustryDataSource {
  id: number;
  name: string;
  sourceType: string;
  licenseType?: string | null;
  confidenceLevel: string;
  applicableScope?: string | null;
  ownerName?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  status: string;
  lastVerifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface IndustryProductTemplate {
  id: number;
  standardProductCode: string;
  name: string;
  aliases?: string[];
  category: string;
  subCategory?: string | null;
  productType: string;
  recommendedSpec?: string | null;
  unit?: string | null;
  packageUnit?: string | null;
  referenceCostMin?: number | null;
  referenceCostMax?: number | null;
  referenceRetailPriceMin?: number | null;
  referenceRetailPriceMax?: number | null;
  applicableServiceCategories?: string[];
  supplyCategoryCode?: string | null;
  preferredSpecKey?: string | null;
  externalMappingKey?: string | null;
  futureSupplyMappingStatus: IndustrySupplyMappingStatus;
  status: IndustryTemplateStatus;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  adoptionSummary?: {
    status: 'unadopted' | 'adopted' | 'invalid' | string;
    adoptionId?: number | null;
    adoptedAt?: string | null;
    localProductId?: number | null;
    localProductName?: string | null;
    localProductSku?: string | null;
  };
  supplySummary?: {
    status: 'not_mapped' | 'mapped_no_quote' | 'available' | string;
    mappingCount: number;
    availableQuoteCount: number;
    preferredSupplierName?: string | null;
  };
}

export interface IndustryProjectBomItemTemplate {
  id: number;
  bomTemplateId: number;
  productTemplateId: number;
  itemRole: string;
  standardQty: number;
  unit: string;
  lossRate: number;
  required: boolean;
  costIncluded: boolean;
  serviceStep?: string | null;
  allowSubstitute: boolean;
  substituteGroupCode?: string | null;
  futureSupplyRequired: boolean;
  futureSupplyMappingKey?: string | null;
  productTemplate?: IndustryProductTemplate;
}

export interface IndustryProjectBomTemplate {
  id: number;
  serviceTemplateId: number;
  version: number;
  totalCostMin?: number | null;
  totalCostMax?: number | null;
  status: IndustryTemplateStatus;
  sourceId?: number | null;
  publishedAt?: string | null;
  items?: IndustryProjectBomItemTemplate[];
}

export interface IndustryServiceTemplate {
  id: number;
  code: string;
  name: string;
  aliases?: string[];
  category: string;
  subCategory?: string | null;
  targetStoreTypes?: string[];
  recommendedDurationMin?: number | null;
  recommendedDurationMax?: number | null;
  careCycleWeeks?: number | null;
  treatmentCourseTimes?: number | null;
  referencePriceMin?: number | null;
  referencePriceMax?: number | null;
  targetCustomers?: string[];
  contraindications?: string[];
  recommendedFrequency?: string | null;
  sellingPoints?: string[];
  bomUnavailableReason?: string | null;
  status: IndustryTemplateStatus;
  sourceId?: number | null;
  version: number;
  publishedAt?: string | null;
  bomTemplates?: IndustryProjectBomTemplate[];
}

export interface IndustryKnowledgeItem {
  id: number;
  domain: string;
  title: string;
  content: string;
  structuredPayload?: unknown;
  tags?: string[];
  applicableServiceTemplateIds?: number[];
  applicableProductTemplateIds?: number[];
  applicableRoles?: string[];
  sourceId?: number | null;
  reviewStatus: IndustryKnowledgeStatus;
  version: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  publishedAt?: string | null;
}

export interface IndustrySalaryBenchmark {
  id: number;
  jobRole: string;
  roleCategory?: string | null;
  employeeLevel?: string | null;
  targetStoreTypes?: string[];
  cityTier?: string | null;
  baseSalaryMin?: number | null;
  baseSalaryMax?: number | null;
  commissionRateMin?: number | null;
  commissionRateMax?: number | null;
  serviceFeeMin?: number | null;
  serviceFeeMax?: number | null;
  performanceMetrics?: unknown;
  responsibilities?: string[];
  capabilityRequirements?: string[];
  status: IndustryTemplateStatus;
  version: number;
}

export interface IndustryAdoptionRecord {
  id: number;
  storeId?: number | null;
  adoptedByUserId?: number | null;
  adoptionType: string;
  serviceTemplateId?: number | null;
  productTemplateId?: number | null;
  templateVersion?: number | null;
  localProjectId?: number | null;
  localProductId?: number | null;
  localBomItemIds?: number[];
  payload?: unknown;
  createdAt?: string;
  serviceTemplate?: IndustryServiceTemplate;
}

export interface IndustrySupplyMapping {
  productTemplateId?: number;
  bomItemTemplateId?: number;
  standardProductCode?: string;
  status: IndustrySupplyMappingStatus;
  supplyCategoryCode?: string | null;
  preferredSpecKey?: string | null;
  candidates: unknown[];
  message?: string;
}

export type IndustryDataSourcePayload = Partial<Omit<IndustryDataSource, 'id' | 'createdAt' | 'updatedAt'>>;
export type IndustryServiceTemplatePayload = Partial<Omit<IndustryServiceTemplate, 'id' | 'bomTemplates'>>;
export type IndustryProductTemplatePayload = Partial<Omit<IndustryProductTemplate, 'id'>>;
export type IndustryKnowledgePayload = Partial<Omit<IndustryKnowledgeItem, 'id'>>;
export type IndustrySalaryPayload = Partial<Omit<IndustrySalaryBenchmark, 'id'>>;

export interface IndustryBomItemPayload {
  productTemplateId: number;
  itemRole?: string;
  standardQty: number;
  unit: string;
  lossRate?: number;
  required?: boolean;
  costIncluded?: boolean;
  serviceStep?: string;
  allowSubstitute?: boolean;
  substituteGroupCode?: string;
  futureSupplyRequired?: boolean;
  futureSupplyMappingKey?: string;
}

export interface IndustryBomPayload {
  status?: string;
  sourceId?: number;
  items: IndustryBomItemPayload[];
}

export interface IndustryAdoptProjectPayload {
  storeId?: number;
  adoptedByUserId?: number;
  projectName?: string;
  typeName?: string;
  price?: number;
  duration?: number;
  careCycleWeeks?: number;
  treatmentCourseTimes?: number;
  status?: string;
  adoptBom?: boolean;
  createMissingProducts?: boolean;
  productMappings?: Array<{
    productTemplateId: number;
    productId: number;
  }>;
}

export interface IndustryAdoptProductPayload {
  storeId?: number;
  adoptedByUserId?: number;
  name?: string;
  categoryName?: string;
  sku?: string;
  costPrice?: number;
  retailPrice?: number;
  currentStock?: number;
  safetyStock?: number;
  supplier?: string;
  minPurchaseQty?: number;
}

export interface IndustryProductTemplateCoverage {
  total: number;
  published: number;
  adopted: number;
  invalid: number;
  unadopted: number;
  mappedSupply: number;
  available: number;
  adoptionRate: number;
  supplyAvailableRate: number;
}

export interface IndustryProductTemplateChainSummary {
  total: number;
  published: number;
  adopted: number;
  adoptionBroken: number;
  bomLinked: number;
  inventoryReady: number;
  supplyMapped: number;
  supplyAvailable: number;
  procurementOrdered: number;
  procurementReceived: number;
  salesOrServiceTouched: number;
}

export interface IndustryProductTemplateChainItem {
  productTemplateId: number;
  standardProductCode: string;
  name: string;
  category?: string | null;
  productType?: string | null;
  status: string;
  adoption: {
    status: 'missing' | 'ready' | 'broken' | string;
    adoptionId?: number | null;
    adoptionType?: string | null;
    localProductId?: number | null;
    localProductName?: string | null;
    localProductSku?: string | null;
  };
  localProduct?: {
    id: number;
    storeId: number;
    name: string;
    sku: string;
    currentStock: number;
    safetyStock: number;
    packageUnit?: string | null;
    specUnit?: string | null;
  } | null;
  counters: {
    industryBomItemCount: number;
    localBomItemCount: number;
    stockMovementCount: number;
    inboundMovementCount: number;
    serviceConsumptionCount: number;
    saleMovementCount: number;
    supplyMappingCount: number;
    availableQuoteCount: number;
    procurementOrderCount: number;
    orderedQty: number;
    receivedQty: number;
    productOrderItemCount: number;
  };
  statuses: {
    adoption: string;
    bom: string;
    inventory: string;
    supply: string;
    procurement: string;
    salesService: string;
  };
  blockers: string[];
  nextAction: string;
  latestActivityAt?: string | null;
}

export interface IndustryProductTemplateChainOverview {
  storeId: number;
  summary: IndustryProductTemplateChainSummary;
  items: IndustryProductTemplateChainItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IndustryProductTemplateChainDetail {
  storeId: number;
  item: IndustryProductTemplateChainItem;
  template: IndustryProductTemplate;
  adoption?: IndustryAdoptionRecord | null;
  localProduct?: IndustryProductTemplateChainItem['localProduct'];
  industryBomItems: Array<Record<string, unknown>>;
  localBomItems: Array<Record<string, unknown>>;
  stockMovements: Array<Record<string, unknown>>;
  supplyMappings: Array<Record<string, unknown>>;
  procurementItems: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
}

export interface IndustryChainOperationalReport {
  storeId: number;
  generatedAt: string;
  summary: {
    publishedTemplates: number;
    validAdoptions: number;
    missingLocalSku: number;
    activeProducts: number;
    productsMissingSupplyMapping: number;
    bomProductsWithoutStock: number;
    lowStockProducts: number;
    lowStockPlatformPurchasable: number;
    lowStockManualOnly: number;
  };
  missingLocalSku: Array<{
    productTemplateId: number;
    standardProductCode: string;
    name: string;
    category?: string | null;
    status?: string | null;
    nextAction: string;
  }>;
  productsMissingSupplyMapping: Array<{
    productId: number;
    sku: string;
    name: string;
    currentStock: number;
    safetyStock: number;
    nextAction: string;
  }>;
  bomProductsWithoutStock: Array<{
    bomItemId: number;
    projectId: number;
    projectName: string;
    productId: number;
    productName: string;
    sku: string;
    currentStock: number;
    standardQty: number;
    unit: string;
    nextAction: string;
  }>;
  lowStockPlatformPurchasable: Array<{
    productId: number;
    sku: string;
    name: string;
    currentStock: number;
    safetyStock: number;
    mappingId: number;
    supplySkuId: number;
    supplierName: string;
    quoteId: number;
    price: number;
    moq: number;
    leadDays?: number | null;
    nextAction: string;
  }>;
  lowStockManualOnly: Array<{
    productId: number;
    sku: string;
    name: string;
    currentStock: number;
    safetyStock: number;
    supplier?: string | null;
    nextAction: string;
  }>;
}

export interface IndustryBatchAdoptProductPayload {
  storeId?: number;
  adoptedByUserId?: number;
  productTemplateIds: number[];
  categoryStrategy?: string;
  defaultSafetyStock?: number;
  defaultMinPurchaseQty?: number;
  defaultSupplier?: string;
  overwriteExisting?: boolean;
  dryRun?: boolean;
}

export interface IndustryBatchAdoptProductResult {
  mode: 'dry-run' | 'apply' | string;
  storeId: number;
  total: number;
  createCount: number;
  skipCount: number;
  conflictCount: number;
  items: Array<Record<string, unknown>>;
}

export interface IndustryLinkProductPayload {
  storeId?: number;
  adoptedByUserId?: number;
  productId: number;
  reason?: string;
}

export interface IndustryAdoptProjectResult {
  project: Project;
  adoption: IndustryAdoptionRecord;
  adoptedProducts?: unknown[];
}

export interface IndustryAdoptProductResult {
  product: unknown;
  adoption: IndustryAdoptionRecord;
  reused?: boolean;
}
