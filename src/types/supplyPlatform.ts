import type { PaginatedResponse, PaginationParams } from './pagination';

export type ProcurementOrderStatus =
  | 'pending_supplier_confirm'
  | 'accepted'
  | 'rejected'
  | 'shipped'
  | 'partial_received'
  | 'received'
  | 'settlement_pending'
  | 'settled'
  | 'cancelled';

export interface SupplySupplier {
  id: number;
  name: string;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  rebateRate?: number;
  platformFeeRate?: number;
  qualificationStatus: string;
  status: string;
}

export interface SupplySku {
  id: number;
  supplierId: number;
  supplier?: SupplySupplier;
  name: string;
  brand?: string | null;
  spec?: string | null;
  unit?: string | null;
  barcode?: string | null;
  images?: unknown;
  qualificationFiles?: unknown;
  status: string;
  auditStatus: string;
  description?: string | null;
  rejectReason?: string | null;
}

export interface SupplyQuote {
  id: number;
  supplySkuId: number;
  supplierId: number;
  sku?: SupplySku;
  supplier?: SupplySupplier;
  price: number;
  taxIncluded: boolean;
  moq: number;
  leadDays?: number | null;
  stockStatus: string;
  availableStock?: number | null;
  status: string;
  auditStatus: string;
  rejectReason?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export type SupplyCatalogPurchasableStatus =
  | 'not_mapped'
  | 'mapped_no_quote'
  | 'quote_unavailable'
  | 'available'
  | string;

export interface SupplyCatalogMapping {
  id: number;
  supplySkuId: number;
  productId?: number | null;
  storeId?: number | null;
  standardProductTemplateId?: number | null;
  mappingStatus: string;
  isPreferred: boolean;
  product?: {
    id: number;
    sku: string;
    name: string;
    storeId: number;
    store?: { id: number; name: string };
  } | null;
  industryProductTemplate?: {
    id: number;
    standardProductCode: string;
    name: string;
    category?: string | null;
  } | null;
  supplySku?: SupplySku;
  latestQuote?: SupplyQuote | null;
  quoteCount?: number;
  purchasableStatus: SupplyCatalogPurchasableStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierShipmentItem {
  id: number;
  shipmentId: number;
  orderItemId: number;
  supplySkuId: number;
  shippedQty: number;
  receivedQty: number;
  batchNo?: string | null;
  productionDate?: string | null;
  expiryDate?: string | null;
}

export interface SupplierShipment {
  id: number;
  orderId: number;
  supplierId: number;
  shipmentNo: string;
  logisticsCompany?: string | null;
  trackingNo?: string | null;
  status: string;
  shippedAt?: string | null;
  expectedArrivalAt?: string | null;
  items: SupplierShipmentItem[];
}

export interface ProcurementOrderItem {
  id: number;
  productId?: number | null;
  supplySkuId: number;
  quoteId?: number | null;
  supplySku?: SupplySku;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  receivedQty: number;
}

export interface ProcurementOrder {
  id: number;
  orderNo: string;
  storeId: number;
  supplierId: number;
  supplier?: SupplySupplier;
  status: ProcurementOrderStatus;
  totalAmount: number;
  platformFee: number;
  rebateAmount: number;
  netAmount: number;
  expectedArrivalDate?: string | null;
  sourceType: string;
  sourceNo?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items: ProcurementOrderItem[];
  shipments?: SupplierShipment[];
}

export interface SupplySettlement {
  id: number;
  supplierId: number;
  supplier?: SupplySupplier;
  settleMonth: string;
  orderCount: number;
  totalAmount: number;
  rebateAmount: number;
  platformFee: number;
  adjustmentAmount: number;
  netPayable: number;
  status: string;
  confirmedAt?: string | null;
  supplierConfirmedAt?: string | null;
  paidAt?: string | null;
}

export interface CreateSupplySupplierPayload {
  name: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  settlementMode?: string;
  paymentTerms?: string;
  rebateRate?: number;
  platformFeeRate?: number;
}

export interface CreateSupplySkuPayload {
  supplierId: number;
  name: string;
  brand?: string;
  spec?: string;
  unit?: string;
  barcode?: string;
  images?: string[];
  qualificationFiles?: string[];
  description?: string;
}

export interface CreateSupplierQualificationPayload {
  supplierId: number;
  type: string;
  fileUrl: string;
  fileName?: string;
  expiresAt?: string;
}

export interface CreateSupplyQuotePayload {
  supplySkuId: number;
  supplierId?: number;
  price: number;
  taxIncluded?: boolean;
  moq?: number;
  leadDays?: number;
  stockStatus?: string;
  availableStock?: number;
  validFrom?: string;
  validTo?: string;
}

export interface CreateSupplyCatalogMappingPayload {
  supplySkuId: number;
  productId?: number;
  storeId?: number;
  standardProductTemplateId?: number;
  mappingStatus?: string;
  isPreferred?: boolean;
}

export type UpdateSupplyCatalogMappingPayload = Partial<CreateSupplyCatalogMappingPayload>;

export interface CreateProcurementOrderPayload {
  idempotencyKey?: string;
  storeId: number;
  supplierId: number;
  expectedArrivalDate?: string;
  sourceType?: string;
  sourceNo?: string;
  items: Array<{
    productId?: number;
    supplySkuId: number;
    quoteId?: number;
    quantity: number;
    unitPrice?: number;
  }>;
}

export interface CreateProcurementOrdersFromReplenishmentPayload {
  idempotencyKey?: string;
  storeId: number;
  expectedArrivalDate?: string;
  sourceNo?: string;
  items: Array<{
    productId: number;
    mappingId?: number;
    supplySkuId?: number;
    quoteId?: number;
    quantity: number;
  }>;
}

export interface CreateSupplierShipmentPayload {
  logisticsCompany?: string;
  trackingNo?: string;
  shippedAt?: string;
  expectedArrivalAt?: string;
  items: Array<{
    orderItemId: number;
    supplySkuId: number;
    shippedQty: number;
    batchNo?: string;
    productionDate?: string;
    expiryDate?: string;
  }>;
}

export interface ReceiveProcurementOrderPayload {
  idempotencyKey?: string;
  items: Array<{
    shipmentItemId: number;
    productId?: number;
    receivedQty: number;
  }>;
  remark?: string;
}

export type GetProcurementOrders = (
  params: PaginationParams & {
    storeId?: number;
    supplierId?: number;
    status?: ProcurementOrderStatus | string;
    keyword?: string;
  },
) => Promise<PaginatedResponse<ProcurementOrder>>;
