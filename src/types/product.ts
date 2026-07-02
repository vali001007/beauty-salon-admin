export interface Product {
  id: number;
  storeId?: number;
  storeName?: string;
  name: string;
  sku: string;
  brand: string;
  spec: string;
  specQuantity?: number | null;
  specUnit?: string | null;
  packageUnit?: '瓶' | '盒' | '支' | '个' | '套' | '包' | string | null;
  costPrice: number;
  retailPrice: number;
  shelfLife: number;
  categoryId: number;
  categoryName: string;
  supplier: string;
  minPurchaseQty: number;
  image?: string;
  status: '在售' | '停售';
  salePrice?: number | null;
  discountRate?: number | null;
  discountLabel?: string | null;
  salesDescription?: string | null;
  miniappStatus?: 'published' | 'unpublished' | '下架' | '上架';
  miniappPublishedAt?: string | null;
  industrySource?: {
    productTemplateId: number | null;
    standardProductCode: string | null;
    templateName: string | null;
    templateVersion: number | null;
    adoptionId: number;
    adoptedAt: string | null;
    adoptionStatus: 'active' | 'invalid' | 'template_missing' | 'store_mismatch' | string | null;
  } | null;
  supplyMapping?: {
    mappingId: number | null;
    mappingStatus: string | null;
    supplySkuId: number | null;
    supplierName: string | null;
    latestQuotePrice: number | null;
    moq: number | null;
    leadDays: number | null;
    stockStatus: string | null;
    availabilityStatus: 'not_mapped' | 'mapped_no_quote' | 'quote_unavailable' | 'available' | string;
  } | null;
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  description?: string;
  status?: '启用' | '停用';
  productCount?: number;
  children?: Category[];
}
