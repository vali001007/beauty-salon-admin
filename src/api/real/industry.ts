import type {
  IndustryAdoptionRecord,
  IndustryAdoptProductPayload,
  IndustryAdoptProductResult,
  IndustryBatchAdoptProductPayload,
  IndustryBatchAdoptProductResult,
  IndustryAdoptProjectPayload,
  IndustryAdoptProjectResult,
  IndustryBomPayload,
  IndustryDataSource,
  IndustryDataSourcePayload,
  IndustryKnowledgeItem,
  IndustryKnowledgePayload,
  IndustryChainOperationalReport,
  IndustryProductTemplateChainDetail,
  IndustryProductTemplateChainItem,
  IndustryProductTemplateChainOverview,
  IndustryProductTemplateChainSummary,
  IndustryProductTemplate,
  IndustryProductTemplateCoverage,
  IndustryProductTemplatePayload,
  IndustryProjectBomItemTemplate,
  IndustryProjectBomTemplate,
  IndustrySalaryBenchmark,
  IndustrySalaryPayload,
  IndustryServiceTemplate,
  IndustryServiceTemplatePayload,
  IndustrySupplyMapping,
  IndustryLinkProductPayload,
  Project,
  PaginatedResponse,
  PaginationParams,
} from '@/types';
import apiClient from '../client';
import { normalizePaginatedResponse } from './response';

type ApiRecord = Record<string, any>;

type ApiProjectBomItem = ApiRecord & {
  product?: ApiRecord;
};

type ApiProject = ApiRecord & {
  store?: { name?: string };
  type?: string | { name?: string };
  bomItems?: ApiProjectBomItem[];
};

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNullableNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return toNumber(value);
}

function toArray<T = string>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeDataSource(item: ApiRecord): IndustryDataSource {
  return {
    id: toNumber(item.id),
    name: item.name ?? '',
    sourceType: item.sourceType ?? 'manual',
    licenseType: item.licenseType ?? null,
    confidenceLevel: item.confidenceLevel ?? 'medium',
    applicableScope: item.applicableScope ?? null,
    ownerName: item.ownerName ?? null,
    sourceUrl: item.sourceUrl ?? null,
    notes: item.notes ?? null,
    status: item.status ?? 'draft',
    lastVerifiedAt: item.lastVerifiedAt ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function normalizeProductTemplate(item: ApiRecord): IndustryProductTemplate {
  return {
    id: toNumber(item.id),
    standardProductCode: item.standardProductCode ?? '',
    name: item.name ?? '',
    aliases: toArray(item.aliases),
    category: item.category ?? '',
    subCategory: item.subCategory ?? null,
    productType: item.productType ?? '',
    recommendedSpec: item.recommendedSpec ?? null,
    unit: item.unit ?? null,
    packageUnit: item.packageUnit ?? null,
    referenceCostMin: toNullableNumber(item.referenceCostMin),
    referenceCostMax: toNullableNumber(item.referenceCostMax),
    referenceRetailPriceMin: toNullableNumber(item.referenceRetailPriceMin),
    referenceRetailPriceMax: toNullableNumber(item.referenceRetailPriceMax),
    applicableServiceCategories: toArray(item.applicableServiceCategories),
    supplyCategoryCode: item.supplyCategoryCode ?? null,
    preferredSpecKey: item.preferredSpecKey ?? null,
    externalMappingKey: item.externalMappingKey ?? null,
    futureSupplyMappingStatus: item.futureSupplyMappingStatus ?? 'not_connected',
    status: item.status ?? 'draft',
    version: toNumber(item.version, 1),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    adoptionSummary: item.adoptionSummary,
    supplySummary: item.supplySummary,
  };
}

function normalizeCoverage(item: ApiRecord): IndustryProductTemplateCoverage {
  return {
    total: toNumber(item.total),
    published: toNumber(item.published),
    adopted: toNumber(item.adopted),
    invalid: toNumber(item.invalid),
    unadopted: toNumber(item.unadopted),
    mappedSupply: toNumber(item.mappedSupply),
    available: toNumber(item.available),
    adoptionRate: toNumber(item.adoptionRate),
    supplyAvailableRate: toNumber(item.supplyAvailableRate),
  };
}

function normalizeChainSummary(item: ApiRecord = {}): IndustryProductTemplateChainSummary {
  return {
    total: toNumber(item.total),
    published: toNumber(item.published),
    adopted: toNumber(item.adopted),
    adoptionBroken: toNumber(item.adoptionBroken),
    bomLinked: toNumber(item.bomLinked),
    inventoryReady: toNumber(item.inventoryReady),
    supplyMapped: toNumber(item.supplyMapped),
    supplyAvailable: toNumber(item.supplyAvailable),
    procurementOrdered: toNumber(item.procurementOrdered),
    procurementReceived: toNumber(item.procurementReceived),
    salesOrServiceTouched: toNumber(item.salesOrServiceTouched),
  };
}

function normalizeChainItem(item: ApiRecord): IndustryProductTemplateChainItem {
  return {
    productTemplateId: toNumber(item.productTemplateId),
    standardProductCode: item.standardProductCode ?? '',
    name: item.name ?? '',
    category: item.category ?? null,
    productType: item.productType ?? null,
    status: item.status ?? 'draft',
    adoption: {
      status: item.adoption?.status ?? 'missing',
      adoptionId: item.adoption?.adoptionId ?? null,
      adoptionType: item.adoption?.adoptionType ?? null,
      localProductId: item.adoption?.localProductId ?? null,
      localProductName: item.adoption?.localProductName ?? null,
      localProductSku: item.adoption?.localProductSku ?? null,
    },
    localProduct: item.localProduct
      ? {
          id: toNumber(item.localProduct.id),
          storeId: toNumber(item.localProduct.storeId),
          name: item.localProduct.name ?? '',
          sku: item.localProduct.sku ?? '',
          currentStock: toNumber(item.localProduct.currentStock),
          safetyStock: toNumber(item.localProduct.safetyStock),
          packageUnit: item.localProduct.packageUnit ?? null,
          specUnit: item.localProduct.specUnit ?? null,
        }
      : null,
    counters: {
      industryBomItemCount: toNumber(item.counters?.industryBomItemCount),
      localBomItemCount: toNumber(item.counters?.localBomItemCount),
      stockMovementCount: toNumber(item.counters?.stockMovementCount),
      inboundMovementCount: toNumber(item.counters?.inboundMovementCount),
      serviceConsumptionCount: toNumber(item.counters?.serviceConsumptionCount),
      saleMovementCount: toNumber(item.counters?.saleMovementCount),
      supplyMappingCount: toNumber(item.counters?.supplyMappingCount),
      availableQuoteCount: toNumber(item.counters?.availableQuoteCount),
      procurementOrderCount: toNumber(item.counters?.procurementOrderCount),
      orderedQty: toNumber(item.counters?.orderedQty),
      receivedQty: toNumber(item.counters?.receivedQty),
      productOrderItemCount: toNumber(item.counters?.productOrderItemCount),
    },
    statuses: {
      adoption: item.statuses?.adoption ?? 'missing',
      bom: item.statuses?.bom ?? 'missing',
      inventory: item.statuses?.inventory ?? 'blocked',
      supply: item.statuses?.supply ?? 'missing',
      procurement: item.statuses?.procurement ?? 'blocked',
      salesService: item.statuses?.salesService ?? 'missing',
    },
    blockers: Array.isArray(item.blockers) ? item.blockers : [],
    nextAction: item.nextAction ?? '',
    latestActivityAt: item.latestActivityAt ?? null,
  };
}

function normalizeOperationalReport(response: ApiRecord): IndustryChainOperationalReport {
  return {
    storeId: toNumber(response.storeId),
    generatedAt: response.generatedAt ?? '',
    summary: {
      publishedTemplates: toNumber(response.summary?.publishedTemplates),
      validAdoptions: toNumber(response.summary?.validAdoptions),
      missingLocalSku: toNumber(response.summary?.missingLocalSku),
      activeProducts: toNumber(response.summary?.activeProducts),
      productsMissingSupplyMapping: toNumber(response.summary?.productsMissingSupplyMapping),
      bomProductsWithoutStock: toNumber(response.summary?.bomProductsWithoutStock),
      lowStockProducts: toNumber(response.summary?.lowStockProducts),
      lowStockPlatformPurchasable: toNumber(response.summary?.lowStockPlatformPurchasable),
      lowStockManualOnly: toNumber(response.summary?.lowStockManualOnly),
    },
    missingLocalSku: Array.isArray(response.missingLocalSku) ? response.missingLocalSku : [],
    productsMissingSupplyMapping: Array.isArray(response.productsMissingSupplyMapping) ? response.productsMissingSupplyMapping : [],
    bomProductsWithoutStock: Array.isArray(response.bomProductsWithoutStock) ? response.bomProductsWithoutStock : [],
    lowStockPlatformPurchasable: Array.isArray(response.lowStockPlatformPurchasable) ? response.lowStockPlatformPurchasable : [],
    lowStockManualOnly: Array.isArray(response.lowStockManualOnly) ? response.lowStockManualOnly : [],
  };
}

function normalizeBomItem(item: ApiRecord): IndustryProjectBomItemTemplate {
  return {
    id: toNumber(item.id),
    bomTemplateId: toNumber(item.bomTemplateId),
    productTemplateId: toNumber(item.productTemplateId),
    itemRole: item.itemRole ?? 'main_material',
    standardQty: toNumber(item.standardQty),
    unit: item.unit ?? '',
    lossRate: toNumber(item.lossRate),
    required: item.required !== false,
    costIncluded: item.costIncluded !== false,
    serviceStep: item.serviceStep ?? null,
    allowSubstitute: Boolean(item.allowSubstitute),
    substituteGroupCode: item.substituteGroupCode ?? null,
    futureSupplyRequired: Boolean(item.futureSupplyRequired),
    futureSupplyMappingKey: item.futureSupplyMappingKey ?? null,
    productTemplate: item.productTemplate ? normalizeProductTemplate(item.productTemplate) : undefined,
  };
}

function normalizeBomTemplate(item: ApiRecord): IndustryProjectBomTemplate {
  return {
    id: toNumber(item.id),
    serviceTemplateId: toNumber(item.serviceTemplateId),
    version: toNumber(item.version, 1),
    totalCostMin: toNullableNumber(item.totalCostMin),
    totalCostMax: toNullableNumber(item.totalCostMax),
    status: item.status ?? 'draft',
    sourceId: item.sourceId ?? null,
    publishedAt: item.publishedAt ?? null,
    items: Array.isArray(item.items) ? item.items.map(normalizeBomItem) : [],
  };
}

function normalizeServiceTemplate(item: ApiRecord): IndustryServiceTemplate {
  return {
    id: toNumber(item.id),
    code: item.code ?? '',
    name: item.name ?? '',
    aliases: toArray(item.aliases),
    category: item.category ?? '',
    subCategory: item.subCategory ?? null,
    targetStoreTypes: toArray(item.targetStoreTypes),
    recommendedDurationMin: toNullableNumber(item.recommendedDurationMin),
    recommendedDurationMax: toNullableNumber(item.recommendedDurationMax),
    careCycleWeeks: toNullableNumber(item.careCycleWeeks),
    treatmentCourseTimes: toNullableNumber(item.treatmentCourseTimes),
    referencePriceMin: toNullableNumber(item.referencePriceMin),
    referencePriceMax: toNullableNumber(item.referencePriceMax),
    targetCustomers: toArray(item.targetCustomers),
    contraindications: toArray(item.contraindications),
    recommendedFrequency: item.recommendedFrequency ?? null,
    sellingPoints: toArray(item.sellingPoints),
    bomUnavailableReason: item.bomUnavailableReason ?? null,
    status: item.status ?? 'draft',
    version: toNumber(item.version, 1),
    publishedAt: item.publishedAt ?? null,
    bomTemplates: Array.isArray(item.bomTemplates) ? item.bomTemplates.map(normalizeBomTemplate) : [],
  };
}

function normalizeKnowledgeItem(item: ApiRecord): IndustryKnowledgeItem {
  return {
    id: toNumber(item.id),
    domain: item.domain ?? '',
    title: item.title ?? '',
    content: item.content ?? '',
    structuredPayload: item.structuredPayload,
    tags: toArray(item.tags),
    applicableServiceTemplateIds: toArray<number>(item.applicableServiceTemplateIds),
    applicableProductTemplateIds: toArray<number>(item.applicableProductTemplateIds),
    applicableRoles: toArray(item.applicableRoles),
    sourceId: item.sourceId ?? null,
    reviewStatus: item.reviewStatus ?? 'draft',
    version: toNumber(item.version, 1),
    effectiveFrom: item.effectiveFrom ?? null,
    effectiveTo: item.effectiveTo ?? null,
    publishedAt: item.publishedAt ?? null,
  };
}

function normalizeSalaryBenchmark(item: ApiRecord): IndustrySalaryBenchmark {
  return {
    id: toNumber(item.id),
    jobRole: item.jobRole ?? '',
    roleCategory: item.roleCategory ?? null,
    employeeLevel: item.employeeLevel ?? null,
    targetStoreTypes: toArray(item.targetStoreTypes),
    cityTier: item.cityTier ?? null,
    baseSalaryMin: toNullableNumber(item.baseSalaryMin),
    baseSalaryMax: toNullableNumber(item.baseSalaryMax),
    commissionRateMin: toNullableNumber(item.commissionRateMin),
    commissionRateMax: toNullableNumber(item.commissionRateMax),
    serviceFeeMin: toNullableNumber(item.serviceFeeMin),
    serviceFeeMax: toNullableNumber(item.serviceFeeMax),
    performanceMetrics: item.performanceMetrics,
    responsibilities: toArray(item.responsibilities),
    capabilityRequirements: toArray(item.capabilityRequirements),
    status: item.status ?? 'draft',
    version: toNumber(item.version, 1),
  };
}

function normalizeAdoptionRecord(item: ApiRecord): IndustryAdoptionRecord {
  return {
    id: toNumber(item.id),
    storeId: item.storeId ?? null,
    adoptedByUserId: item.adoptedByUserId ?? null,
    adoptionType: item.adoptionType ?? '',
    serviceTemplateId: item.serviceTemplateId ?? null,
    productTemplateId: item.productTemplateId ?? null,
    templateVersion: item.templateVersion ?? null,
    localProjectId: item.localProjectId ?? null,
    localProductId: item.localProductId ?? null,
    localBomItemIds: toArray<number>(item.localBomItemIds),
    payload: item.payload,
    createdAt: item.createdAt,
    serviceTemplate: item.serviceTemplate ? normalizeServiceTemplate(item.serviceTemplate) : undefined,
  };
}

function normalizeSupplyMapping(item: ApiRecord): IndustrySupplyMapping {
  return {
    productTemplateId: item.productTemplateId,
    bomItemTemplateId: item.bomItemTemplateId,
    standardProductCode: item.standardProductCode,
    status: item.status ?? 'not_connected',
    supplyCategoryCode: item.supplyCategoryCode ?? null,
    preferredSpecKey: item.preferredSpecKey ?? null,
    candidates: Array.isArray(item.candidates) ? item.candidates : [],
    message: item.message,
  };
}

function normalizeProjectBomItem(item: ApiProjectBomItem): NonNullable<Project['bom']>[number] {
  return {
    id: item.id === undefined ? undefined : Number(item.id),
    productId: item.productId === undefined ? item.product?.id : Number(item.productId),
    productName: item.productName ?? item.product?.name ?? '',
    sku: item.sku ?? item.product?.sku ?? '',
    standardQty: toNumber(item.standardQty),
    unit: item.unit ?? item.product?.specUnit ?? item.product?.unit ?? '',
    costPrice: toNumber(item.costPrice ?? item.product?.costPrice),
  };
}

function normalizeProject(item: ApiProject): Project {
  return {
    id: toNumber(item.id),
    name: item.name ?? '',
    description: item.description ?? '',
    type: typeof item.type === 'string' ? item.type : item.type?.name ?? '护理项目',
    duration: toNumber(item.duration),
    price: toNumber(item.price),
    storeName: item.storeName ?? item.store?.name ?? '',
    recommend: Boolean(item.recommend ?? false),
    online: Boolean(item.online ?? true),
    home: Boolean(item.home ?? false),
    status: typeof item.status === 'boolean' ? item.status : item.status === undefined || item.status === 'active',
    sort: toNumber(item.sort ?? item.id),
    image: item.image,
    bom: Array.isArray(item.bomItems)
      ? item.bomItems.map(normalizeProjectBomItem)
      : Array.isArray(item.bom)
        ? item.bom.map(normalizeProjectBomItem)
        : undefined,
  };
}

export async function realGetIndustryDataSources(params?: PaginationParams & { keyword?: string; status?: string; sourceType?: string }) {
  const response = await apiClient.get<unknown, unknown>('/industry/data-sources', { params });
  return normalizePaginatedResponse<ApiRecord, IndustryDataSource>(response, normalizeDataSource);
}

export async function realCreateIndustryDataSource(data: IndustryDataSourcePayload) {
  const response = await apiClient.post<unknown, ApiRecord>('/industry/data-sources', data);
  return normalizeDataSource(response);
}

export async function realUpdateIndustryDataSource(id: number, data: IndustryDataSourcePayload) {
  const response = await apiClient.patch<unknown, ApiRecord>(`/industry/data-sources/${id}`, data);
  return normalizeDataSource(response);
}

export async function realGetIndustryServiceTemplates(params?: { keyword?: string; category?: string; status?: string }) {
  const response = await apiClient.get<unknown, ApiRecord[]>('/industry/service-templates', { params });
  return Array.isArray(response) ? response.map(normalizeServiceTemplate) : [];
}

export async function realGetIndustryServiceTemplatesPaginated(
  params?: PaginationParams & { keyword?: string; category?: string; status?: string },
): Promise<PaginatedResponse<IndustryServiceTemplate>> {
  const response = await apiClient.get<unknown, unknown>('/industry/service-templates/paginated', { params });
  return normalizePaginatedResponse<ApiRecord, IndustryServiceTemplate>(response, normalizeServiceTemplate);
}

export async function realGetIndustryServiceTemplate(id: number) {
  const response = await apiClient.get<unknown, ApiRecord>(`/industry/service-templates/${id}`);
  return normalizeServiceTemplate(response);
}

export async function realCreateIndustryServiceTemplate(data: IndustryServiceTemplatePayload) {
  const response = await apiClient.post<unknown, ApiRecord>('/industry/service-templates', data);
  return normalizeServiceTemplate(response);
}

export async function realUpdateIndustryServiceTemplate(id: number, data: IndustryServiceTemplatePayload) {
  const response = await apiClient.patch<unknown, ApiRecord>(`/industry/service-templates/${id}`, data);
  return normalizeServiceTemplate(response);
}

export async function realPublishIndustryServiceTemplate(id: number) {
  const response = await apiClient.post<unknown, ApiRecord>(`/industry/service-templates/${id}/publish`);
  return normalizeServiceTemplate(response);
}

export async function realAdoptIndustryServiceTemplateAsProject(
  id: number,
  data: IndustryAdoptProjectPayload,
): Promise<IndustryAdoptProjectResult> {
  const response = await apiClient.post<unknown, ApiRecord>(`/industry/service-templates/${id}/adopt-project`, data);
  return {
    project: normalizeProject(response.project ?? {}),
    adoption: normalizeAdoptionRecord(response.adoption ?? {}),
    adoptedProducts: Array.isArray(response.adoptedProducts) ? response.adoptedProducts : [],
  };
}

export async function realGetIndustryServiceTemplateBom(serviceTemplateId: number) {
  const response = await apiClient.get<unknown, ApiRecord>(`/industry/service-templates/${serviceTemplateId}/bom`);
  return normalizeBomTemplate(response);
}

export async function realGetIndustryBomTemplate(serviceTemplateId: number) {
  const response = await apiClient.get<unknown, ApiRecord>(`/industry/bom-templates/${serviceTemplateId}`);
  return normalizeBomTemplate(response);
}

export async function realSaveIndustryBomTemplate(serviceTemplateId: number, data: IndustryBomPayload) {
  const response = await apiClient.put<unknown, ApiRecord>(`/industry/bom-templates/${serviceTemplateId}`, data);
  return normalizeBomTemplate(response);
}

export async function realPublishIndustryBomTemplate(serviceTemplateId: number) {
  const response = await apiClient.post<unknown, ApiRecord>(`/industry/bom-templates/${serviceTemplateId}/publish`);
  return normalizeBomTemplate(response);
}

export async function realGetIndustryProductTemplates(params?: { keyword?: string; category?: string; productType?: string; status?: string }) {
  const response = await apiClient.get<unknown, ApiRecord[]>('/industry/product-templates', { params });
  return Array.isArray(response) ? response.map(normalizeProductTemplate) : [];
}

export async function realGetIndustryProductTemplatesPaginated(
  params?: PaginationParams & { keyword?: string; category?: string; productType?: string; status?: string; adoptionStatus?: string },
): Promise<PaginatedResponse<IndustryProductTemplate>> {
  const response = await apiClient.get<unknown, unknown>('/industry/product-templates/paginated', { params });
  return normalizePaginatedResponse<ApiRecord, IndustryProductTemplate>(response, normalizeProductTemplate);
}

export async function realGetIndustryProductTemplateCoverage(
  params?: { keyword?: string; category?: string; productType?: string; status?: string; adoptionStatus?: string },
): Promise<{ coverage: IndustryProductTemplateCoverage; items: IndustryProductTemplate[] }> {
  const response = await apiClient.get<unknown, ApiRecord>('/industry/product-templates/adoption-coverage', { params });
  return {
    coverage: normalizeCoverage(response.coverage ?? {}),
    items: Array.isArray(response.items) ? response.items.map(normalizeProductTemplate) : [],
  };
}

export async function realGetIndustryProductTemplateChainOverview(
  params?: PaginationParams & { keyword?: string; category?: string; productType?: string; status?: string },
): Promise<IndustryProductTemplateChainOverview> {
  const response = await apiClient.get<unknown, ApiRecord>('/industry/product-template-chain/overview', { params });
  return {
    storeId: toNumber(response.storeId),
    summary: normalizeChainSummary(response.summary ?? {}),
    items: Array.isArray(response.items) ? response.items.map(normalizeChainItem) : [],
    total: toNumber(response.total),
    page: toNumber(response.page, 1),
    pageSize: toNumber(response.pageSize, 20),
  };
}

export async function realGetIndustryProductTemplateChainOperationalReport(
  params?: { keyword?: string; category?: string; productType?: string; status?: string },
): Promise<IndustryChainOperationalReport> {
  const response = await apiClient.get<unknown, ApiRecord>('/industry/product-template-chain/operational-report', { params });
  return normalizeOperationalReport(response);
}

export async function realGetIndustryProductTemplateChain(id: number): Promise<IndustryProductTemplateChainDetail> {
  const response = await apiClient.get<unknown, ApiRecord>(`/industry/product-templates/${id}/chain`);
  return {
    storeId: toNumber(response.storeId),
    item: normalizeChainItem(response.item ?? {}),
    template: normalizeProductTemplate(response.template ?? {}),
    adoption: response.adoption ? normalizeAdoptionRecord(response.adoption) : null,
    localProduct: response.localProduct ?? null,
    industryBomItems: Array.isArray(response.industryBomItems) ? response.industryBomItems : [],
    localBomItems: Array.isArray(response.localBomItems) ? response.localBomItems : [],
    stockMovements: Array.isArray(response.stockMovements) ? response.stockMovements : [],
    supplyMappings: Array.isArray(response.supplyMappings) ? response.supplyMappings : [],
    procurementItems: Array.isArray(response.procurementItems) ? response.procurementItems : [],
    orderItems: Array.isArray(response.orderItems) ? response.orderItems : [],
  };
}

export async function realCreateIndustryProductTemplate(data: IndustryProductTemplatePayload) {
  const response = await apiClient.post<unknown, ApiRecord>('/industry/product-templates', data);
  return normalizeProductTemplate(response);
}

export async function realUpdateIndustryProductTemplate(id: number, data: IndustryProductTemplatePayload) {
  const response = await apiClient.patch<unknown, ApiRecord>(`/industry/product-templates/${id}`, data);
  return normalizeProductTemplate(response);
}

export async function realPublishIndustryProductTemplate(id: number) {
  const response = await apiClient.post<unknown, ApiRecord>(`/industry/product-templates/${id}/publish`);
  return normalizeProductTemplate(response);
}

export async function realAdoptIndustryProductTemplateAsProduct(
  id: number,
  data: IndustryAdoptProductPayload,
): Promise<IndustryAdoptProductResult> {
  const response = await apiClient.post<unknown, ApiRecord>(`/industry/product-templates/${id}/adopt-product`, data);
  return {
    product: response.product,
    adoption: normalizeAdoptionRecord(response.adoption ?? {}),
    reused: Boolean(response.reused),
  };
}

export async function realBatchAdoptIndustryProductTemplates(
  data: IndustryBatchAdoptProductPayload,
): Promise<IndustryBatchAdoptProductResult> {
  return apiClient.post<unknown, IndustryBatchAdoptProductResult>('/industry/product-templates/batch-adopt-products', data);
}

export async function realLinkIndustryProductTemplateToProduct(
  id: number,
  data: IndustryLinkProductPayload,
): Promise<IndustryAdoptProductResult> {
  const response = await apiClient.post<unknown, ApiRecord>(`/industry/product-templates/${id}/link-product`, data);
  return {
    product: response.product,
    adoption: normalizeAdoptionRecord(response.adoption ?? {}),
    reused: Boolean(response.reused),
  };
}

export async function realGetIndustryKnowledgeItems(params?: PaginationParams & { keyword?: string; domain?: string; status?: string }) {
  const response = await apiClient.get<unknown, unknown>('/industry/knowledge/items/paginated', { params });
  return normalizePaginatedResponse<ApiRecord, IndustryKnowledgeItem>(response, normalizeKnowledgeItem);
}

export async function realCreateIndustryKnowledgeItem(data: IndustryKnowledgePayload) {
  const response = await apiClient.post<unknown, ApiRecord>('/industry/knowledge/items', data);
  return normalizeKnowledgeItem(response);
}

export async function realUpdateIndustryKnowledgeItem(id: number, data: IndustryKnowledgePayload) {
  const response = await apiClient.patch<unknown, ApiRecord>(`/industry/knowledge/items/${id}`, data);
  return normalizeKnowledgeItem(response);
}

export async function realGetIndustrySalaryBenchmarks(params?: PaginationParams & { keyword?: string; jobRole?: string; status?: string }) {
  const response = await apiClient.get<unknown, unknown>('/industry/salary-benchmarks/paginated', { params });
  return normalizePaginatedResponse<ApiRecord, IndustrySalaryBenchmark>(response, normalizeSalaryBenchmark);
}

export async function realCreateIndustrySalaryBenchmark(data: IndustrySalaryPayload) {
  const response = await apiClient.post<unknown, ApiRecord>('/industry/salary-benchmarks', data);
  return normalizeSalaryBenchmark(response);
}

export async function realUpdateIndustrySalaryBenchmark(id: number, data: IndustrySalaryPayload) {
  const response = await apiClient.patch<unknown, ApiRecord>(`/industry/salary-benchmarks/${id}`, data);
  return normalizeSalaryBenchmark(response);
}

export async function realGetIndustryAdoptions(params?: PaginationParams & { storeId?: number; adoptionType?: string }) {
  const response = await apiClient.get<unknown, unknown>('/industry/adoptions', { params });
  return normalizePaginatedResponse<ApiRecord, IndustryAdoptionRecord>(response, normalizeAdoptionRecord);
}

export async function realCreateIndustryAdoption(data: Partial<IndustryAdoptionRecord>) {
  const response = await apiClient.post<unknown, ApiRecord>('/industry/adoptions', data);
  return normalizeAdoptionRecord(response);
}

export async function realGetIndustryProductSupplyMappings(id: number) {
  const response = await apiClient.get<unknown, ApiRecord>(`/industry/product-templates/${id}/supply-mappings`);
  return normalizeSupplyMapping(response);
}

export async function realGetIndustryBomSupplyCandidates(id: number) {
  const response = await apiClient.get<unknown, ApiRecord>(`/industry/bom-items/${id}/supply-candidates`);
  return normalizeSupplyMapping(response);
}
