import type {
  CreateSupplierShipmentPayload,
  CreateSupplierQualificationPayload,
  CreateSupplyQuotePayload,
  CreateSupplySkuPayload,
  CreateSupplySupplierPayload,
  CreateProcurementOrderPayload,
  GetProcurementOrders,
  ProcurementOrder,
  ProcurementOrderItem,
  ReceiveProcurementOrderPayload,
  SupplierShipment,
  SupplierShipmentItem,
  SupplySettlement,
  SupplyQuote,
  SupplySku,
  SupplySupplier,
} from '@/types/supplyPlatform';
import apiClient from '../client';
import { normalizePaginatedResponse } from './response';

type ApiSupplySupplier = Partial<SupplySupplier> & { id: number };
type ApiSupplySku = Partial<SupplySku> & { id: number; supplierId: number; supplier?: ApiSupplySupplier };
type ApiSupplyQuote = Partial<SupplyQuote> & {
  id: number;
  supplySkuId: number;
  supplierId: number;
  price?: number | string | null;
  moq?: number | string | null;
  leadDays?: number | string | null;
  sku?: ApiSupplySku;
  supplier?: ApiSupplySupplier;
};
type ApiProcurementOrderItem = Partial<ProcurementOrderItem> & {
  id: number;
  supplySkuId: number;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  subtotal?: number | string | null;
  receivedQty?: number | string | null;
  supplySku?: ApiSupplySku;
};
type ApiSupplierShipmentItem = Partial<SupplierShipmentItem> & {
  id: number;
  shipmentId: number;
  orderItemId: number;
  supplySkuId: number;
  shippedQty?: number | string | null;
  receivedQty?: number | string | null;
};
type ApiSupplierShipment = Partial<SupplierShipment> & {
  id: number;
  orderId: number;
  supplierId: number;
  items?: ApiSupplierShipmentItem[];
};
type ApiProcurementOrder = Partial<Omit<ProcurementOrder, 'items'>> & {
  id: number;
  storeId: number;
  supplierId: number;
  totalAmount?: number | string | null;
  platformFee?: number | string | null;
  rebateAmount?: number | string | null;
  netAmount?: number | string | null;
  supplier?: ApiSupplySupplier;
  items?: ApiProcurementOrderItem[];
  shipments?: ApiSupplierShipment[];
};
type ApiSupplySettlement = Partial<SupplySettlement> & {
  id: number;
  supplierId: number;
  orderCount?: number | string | null;
  totalAmount?: number | string | null;
  rebateAmount?: number | string | null;
  platformFee?: number | string | null;
  adjustmentAmount?: number | string | null;
  netPayable?: number | string | null;
  supplier?: ApiSupplySupplier;
};

function normalizeSupplier(item?: ApiSupplySupplier): SupplySupplier | undefined {
  if (!item) return undefined;
  return {
    id: Number(item.id),
    name: item.name ?? '',
    companyName: item.companyName ?? null,
    contactName: item.contactName ?? null,
    phone: item.phone ?? null,
    email: item.email ?? null,
    address: item.address ?? null,
    paymentTerms: item.paymentTerms ?? null,
    rebateRate: Number(item.rebateRate ?? 0),
    platformFeeRate: Number(item.platformFeeRate ?? 0),
    qualificationStatus: item.qualificationStatus ?? '',
    status: item.status ?? '',
  };
}

function normalizeSku(item: ApiSupplySku): SupplySku {
  return {
    id: Number(item.id),
    supplierId: Number(item.supplierId),
    supplier: normalizeSupplier(item.supplier),
    name: item.name ?? '',
    brand: item.brand ?? null,
    spec: item.spec ?? null,
    unit: item.unit ?? null,
    barcode: item.barcode ?? null,
    images: item.images,
    qualificationFiles: item.qualificationFiles,
    status: item.status ?? '',
    auditStatus: item.auditStatus ?? '',
    description: item.description ?? null,
    rejectReason: item.rejectReason ?? null,
  };
}

function normalizeQuote(item: ApiSupplyQuote): SupplyQuote {
  return {
    id: Number(item.id),
    supplySkuId: Number(item.supplySkuId),
    supplierId: Number(item.supplierId),
    sku: item.sku ? normalizeSku(item.sku) : undefined,
    supplier: normalizeSupplier(item.supplier),
    price: Number(item.price ?? 0),
    taxIncluded: item.taxIncluded ?? true,
    moq: Number(item.moq ?? 1),
    leadDays: item.leadDays === null || item.leadDays === undefined ? null : Number(item.leadDays),
    stockStatus: item.stockStatus ?? '',
    availableStock: item.availableStock ?? null,
    status: item.status ?? '',
    auditStatus: item.auditStatus ?? '',
    rejectReason: item.rejectReason ?? null,
    validFrom: item.validFrom ?? null,
    validTo: item.validTo ?? null,
  };
}

function normalizeOrderItem(item: ApiProcurementOrderItem): ProcurementOrderItem {
  return {
    id: Number(item.id),
    productId: item.productId ?? null,
    supplySkuId: Number(item.supplySkuId),
    quoteId: item.quoteId ?? null,
    supplySku: item.supplySku ? normalizeSku(item.supplySku) : undefined,
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unitPrice ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    receivedQty: Number(item.receivedQty ?? 0),
  };
}

function normalizeShipmentItem(item: ApiSupplierShipmentItem): SupplierShipmentItem {
  return {
    id: Number(item.id),
    shipmentId: Number(item.shipmentId),
    orderItemId: Number(item.orderItemId),
    supplySkuId: Number(item.supplySkuId),
    shippedQty: Number(item.shippedQty ?? 0),
    receivedQty: Number(item.receivedQty ?? 0),
    batchNo: item.batchNo ?? null,
    productionDate: item.productionDate ?? null,
    expiryDate: item.expiryDate ?? null,
  };
}

function normalizeShipment(item: ApiSupplierShipment): SupplierShipment {
  return {
    id: Number(item.id),
    orderId: Number(item.orderId),
    supplierId: Number(item.supplierId),
    shipmentNo: item.shipmentNo ?? '',
    logisticsCompany: item.logisticsCompany ?? null,
    trackingNo: item.trackingNo ?? null,
    status: item.status ?? '',
    shippedAt: item.shippedAt ?? null,
    expectedArrivalAt: item.expectedArrivalAt ?? null,
    items: Array.isArray(item.items) ? item.items.map(normalizeShipmentItem) : [],
  };
}

function normalizeOrder(item: ApiProcurementOrder): ProcurementOrder {
  const items = Array.isArray(item.items) ? item.items.map(normalizeOrderItem) : [];
  return {
    id: Number(item.id),
    orderNo: item.orderNo ?? '',
    storeId: Number(item.storeId),
    supplierId: Number(item.supplierId),
    supplier: normalizeSupplier(item.supplier),
    status: (item.status ?? 'pending_supplier_confirm') as ProcurementOrder['status'],
    totalAmount: Number(item.totalAmount ?? 0),
    platformFee: Number(item.platformFee ?? 0),
    rebateAmount: Number(item.rebateAmount ?? 0),
    netAmount: Number(item.netAmount ?? 0),
    expectedArrivalDate: item.expectedArrivalDate ?? null,
    sourceType: item.sourceType ?? '',
    sourceNo: item.sourceNo ?? null,
    createdAt: item.createdAt ?? '',
    updatedAt: item.updatedAt ?? '',
    items,
    shipments: Array.isArray(item.shipments) ? item.shipments.map(normalizeShipment) : [],
  };
}

function normalizeSettlement(item: ApiSupplySettlement): SupplySettlement {
  return {
    id: Number(item.id),
    supplierId: Number(item.supplierId),
    supplier: normalizeSupplier(item.supplier),
    settleMonth: item.settleMonth ?? '',
    orderCount: Number(item.orderCount ?? 0),
    totalAmount: Number(item.totalAmount ?? 0),
    rebateAmount: Number(item.rebateAmount ?? 0),
    platformFee: Number(item.platformFee ?? 0),
    adjustmentAmount: Number(item.adjustmentAmount ?? 0),
    netPayable: Number(item.netPayable ?? 0),
    status: item.status ?? '',
    confirmedAt: item.confirmedAt ?? null,
    supplierConfirmedAt: item.supplierConfirmedAt ?? null,
    paidAt: item.paidAt ?? null,
  };
}

export async function realGetSupplySuppliers(params: { page?: number; pageSize?: number; keyword?: string; status?: string } = {}) {
  const response = await apiClient.get<unknown, unknown>('/supply-platform/suppliers', { params });
  return normalizePaginatedResponse<ApiSupplySupplier, SupplySupplier>(response, (item) => normalizeSupplier(item)!);
}

export async function realCreateSupplySupplier(data: CreateSupplySupplierPayload): Promise<SupplySupplier> {
  const response = await apiClient.post<unknown, ApiSupplySupplier>('/supply-platform/suppliers', data);
  return normalizeSupplier(response)!;
}

export async function realUpdateSupplySupplierStatus(
  id: number,
  data: { status: string; qualificationStatus?: string },
): Promise<SupplySupplier> {
  const response = await apiClient.patch<unknown, ApiSupplySupplier>(`/supply-platform/suppliers/${id}/status`, data);
  return normalizeSupplier(response)!;
}

export async function realCreateSupplierQualification(data: CreateSupplierQualificationPayload) {
  return apiClient.post<unknown, unknown>('/supply-platform/supplier-qualifications', data);
}

export async function realGetSupplySkus(params: { page?: number; pageSize?: number; supplierId?: number; keyword?: string; status?: string; auditStatus?: string } = {}) {
  const response = await apiClient.get<unknown, unknown>('/supply-platform/skus', { params });
  return normalizePaginatedResponse<ApiSupplySku, SupplySku>(response, normalizeSku);
}

export async function realCreateSupplySku(data: CreateSupplySkuPayload): Promise<SupplySku> {
  const response = await apiClient.post<unknown, ApiSupplySku>('/supply-platform/skus', data);
  return normalizeSku(response);
}

export async function realAuditSupplySku(id: number, data: { auditStatus: string; status?: string; rejectReason?: string }): Promise<SupplySku> {
  const response = await apiClient.patch<unknown, ApiSupplySku>(`/supply-platform/skus/${id}/audit`, data);
  return normalizeSku(response);
}

export async function realGetSupplyQuotes(params: {
  page?: number;
  pageSize?: number;
  supplySkuId?: number;
  supplierId?: number;
  storeId?: number;
  status?: string;
  auditStatus?: string;
  availableOnly?: boolean;
}) {
  const response = await apiClient.get<unknown, unknown>('/supply-platform/quotes', {
    params: { ...params, availableOnly: params.availableOnly ? 'true' : undefined, page: params.page ?? 1, pageSize: params.pageSize ?? 200 },
  });
  return normalizePaginatedResponse<ApiSupplyQuote, SupplyQuote>(response, normalizeQuote);
}

export async function realCreateSupplyQuote(data: CreateSupplyQuotePayload): Promise<SupplyQuote> {
  const response = await apiClient.post<unknown, ApiSupplyQuote>('/supply-platform/quotes', data);
  return normalizeQuote(response);
}

export async function realAuditSupplyQuote(id: number, data: { auditStatus: string; status?: string; rejectReason?: string }): Promise<SupplyQuote> {
  const response = await apiClient.patch<unknown, ApiSupplyQuote>(`/supply-platform/quotes/${id}/audit`, data);
  return normalizeQuote(response);
}

export const realGetProcurementOrders: GetProcurementOrders = async (params) => {
  const response = await apiClient.get<unknown, unknown>('/supply-platform/procurement/orders', { params });
  return normalizePaginatedResponse<ApiProcurementOrder, ProcurementOrder>(response, normalizeOrder);
};

export async function realGetProcurementOrder(id: number): Promise<ProcurementOrder> {
  const response = await apiClient.get<unknown, ApiProcurementOrder>(`/supply-platform/procurement/orders/${id}`);
  return normalizeOrder(response);
}

export async function realCreateProcurementOrder(data: CreateProcurementOrderPayload): Promise<ProcurementOrder> {
  const response = await apiClient.post<unknown, ApiProcurementOrder>('/supply-platform/procurement/orders', data);
  return normalizeOrder(response);
}

export async function realUpdateProcurementOrderStatus(id: number, status: string): Promise<ProcurementOrder> {
  const response = await apiClient.patch<unknown, ApiProcurementOrder>(`/supply-platform/procurement/orders/${id}/status`, { status });
  return normalizeOrder(response);
}

export async function realCreateSupplierShipment(id: number, data: CreateSupplierShipmentPayload): Promise<SupplierShipment> {
  const response = await apiClient.post<unknown, ApiSupplierShipment>(`/supply-platform/procurement/orders/${id}/shipments`, data);
  return normalizeShipment(response);
}

export async function realReceiveProcurementOrder(id: number, data: ReceiveProcurementOrderPayload): Promise<ProcurementOrder> {
  const response = await apiClient.post<unknown, ApiProcurementOrder>(`/supply-platform/procurement/orders/${id}/receipts`, data);
  return normalizeOrder(response);
}

export async function realGetSupplySettlements(params: { page?: number; pageSize?: number; supplierId?: number; status?: string } = {}) {
  const response = await apiClient.get<unknown, unknown>('/supply-platform/settlements', { params });
  return normalizePaginatedResponse<ApiSupplySettlement, SupplySettlement>(response, normalizeSettlement);
}

export async function realGenerateSupplySettlement(data: { settleMonth: string; supplierId?: number }): Promise<SupplySettlement> {
  const response = await apiClient.post<unknown, ApiSupplySettlement>('/supply-platform/settlements/generate', data);
  return normalizeSettlement(response);
}
