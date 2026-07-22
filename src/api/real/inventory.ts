import type { StockItem, StockMovement, Batch, ExpiringProduct, ExpirySummary, ReplenishmentSuggestion, PurchaseOrder, TransferOrder, TransferSuggestion } from '@/types';
import type { InboundFormData, InventoryAdjustmentFormData, PurchaseOrderFormData, TransferFormData } from '@/schemas/inventory';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiStockItem = Partial<StockItem> & {
  name?: string;
  productName?: string;
  currentStock?: number | string;
  safetyStock?: number | string;
  costPrice?: number | string;
  supplier?: string | null;
  category?: { id?: number; name?: string };
};
type ApiBatch = Partial<Batch> & { stock?: number | string; product?: { name?: string; sku?: string } };
type ApiExpiringProduct = Partial<ExpiringProduct> & {
  productId?: number | string;
  storeId?: number | string;
  stock?: number | string;
  costAmount?: number | string;
  unitCost?: number | string;
  costPrice?: number | string;
  expiryDate?: string | Date | null;
  product?: {
    name?: string;
    sku?: string;
    unit?: string | null;
    specUnit?: string | null;
    retailPrice?: number | string;
    costPrice?: number | string;
    supplier?: string | null;
    storeId?: number | string;
    category?: { name?: string };
    store?: { name?: string };
  };
  store?: { name?: string };
};
type ApiExpirySummary = Partial<ExpirySummary> & {
  expiringBatchCount?: number | string;
  urgentBatchCount?: number | string;
  expiredBatchCount?: number | string;
  expiringCostAmount?: number | string;
  scrappedAmount?: number | string;
  wastageTrend?: Array<{ month?: string; amount?: number | string }>;
  categoryWastage?: Array<{ category?: string; percentage?: number | string; amount?: number | string }>;
};
type ApiStockMovement = Partial<StockMovement> & {
  store?: { id?: number; name?: string };
  product?: { id?: number; name?: string; sku?: string; unit?: string; specUnit?: string | null };
  batch?: { id?: number; batchNo?: string };
  operator?: { id?: number; name?: string; username?: string };
};
type ApiPurchaseOrder = Partial<Omit<PurchaseOrder, 'items' | 'totalAmount'>> & {
  totalAmount?: number | string;
  items?: unknown;
  createdAt?: string;
  updatedAt?: string;
};
type ApiTransferOrder = Partial<Omit<TransferOrder, 'fromStore' | 'toStore' | 'status'>> & {
  fromStoreId?: number | string;
  toStoreId?: number | string;
  status?: string;
  reason?: string;
  remark?: string;
  items?: unknown;
  fromStore?: string | { name?: string };
  toStore?: string | { name?: string };
  fromStoreName?: string;
  toStoreName?: string;
};
type ApiTransferSuggestion = Partial<TransferSuggestion> & {
  productId?: number | string;
  fromStoreId?: number | string;
  toStoreId?: number | string;
  sourceStock?: number | string;
  targetStock?: number | string;
  safetyStock?: number | string;
  suggestedQty?: number | string;
};

function normalizeStockItem(item: ApiStockItem): StockItem {
  const currentStock = Math.max(0, Number(item.currentStock ?? 0));
  const reserved = Math.max(0, Number(item.reserved ?? 0));
  const availableStock = Math.max(0, Number(item.availableStock ?? currentStock - reserved));
  const safetyStock = Math.max(0, Number(item.safetyStock ?? 0));
  const status = item.status ?? '正常';
  return {
    id: Number(item.id),
    productName: item.productName ?? item.name ?? '',
    sku: item.sku ?? '',
    currentStock,
    reserved,
    availableStock,
    safetyStock,
    maxStock: Math.max(0, Number(item.maxStock ?? Math.max(safetyStock * 5, currentStock))),
    categoryId: item.categoryId ?? item.category?.id ?? null,
    categoryName: item.categoryName ?? item.category?.name ?? '',
    costPrice: item.costPrice === undefined ? undefined : Number(item.costPrice),
    supplier: item.supplier ?? null,
    status,
    lastInboundDate: item.lastInboundDate ?? '',
    storeName: item.storeName ?? '',
  };
}

function normalizeBatch(item: ApiBatch): Batch {
  const expiryDate = typeof item.expiryDate === 'string' ? item.expiryDate.slice(0, 10) : '';
  return {
    id: Number(item.id),
    batchNo: item.batchNo ?? '',
    productId: Number(item.productId ?? 0),
    inboundQty: Number(item.inboundQty ?? item.stock ?? 0),
    availableQty: Number(item.availableQty ?? item.stock ?? 0),
    productionDate: typeof item.productionDate === 'string' ? item.productionDate.slice(0, 10) : '',
    expiryDate,
    status: item.status ?? '正常',
    inboundDate: item.inboundDate ?? '',
  };
}

function normalizeExpiringProduct(item: ApiExpiringProduct): ExpiringProduct {
  const stock = Number(item.stock ?? 0);
  const unitCost = Number(item.unitCost ?? item.costPrice ?? item.product?.costPrice ?? 0);
  const expiryDate = item.expiryDate ? new Date(item.expiryDate) : undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const remainingDays = Number.isFinite(Number(item.remainingDays))
    ? Number(item.remainingDays)
    : expiryDate
      ? Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000)
      : 0;
  const urgency: ExpiringProduct['urgency'] =
    item.urgency === '已过期' || remainingDays < 0
      ? '已过期'
      : item.urgency === '紧急' || remainingDays <= 30
        ? '紧急'
        : '临期';
  const suggestion: ExpiringProduct['suggestion'] =
    item.suggestion === '报废' || urgency === '已过期'
      ? '报废'
      : item.suggestion === '调拨'
        ? '调拨'
        : '促销';

  return {
    id: Number(item.id ?? 0),
    productId: item.productId === undefined ? undefined : Number(item.productId),
    storeId: item.storeId === undefined && item.product?.storeId === undefined ? undefined : Number(item.storeId ?? item.product?.storeId),
    urgency,
    productName: item.productName ?? item.product?.name ?? '',
    sku: item.sku ?? item.product?.sku ?? '',
    batchNo: item.batchNo ?? '',
    remainingDays,
    stock,
    costAmount: Number(item.costAmount ?? stock * unitCost),
    storeName: item.storeName ?? item.store?.name ?? item.product?.store?.name ?? '',
    unit: item.unit ?? item.product?.specUnit ?? item.product?.unit ?? null,
    retailPrice: item.retailPrice === undefined && item.product?.retailPrice === undefined ? undefined : Number(item.retailPrice ?? item.product?.retailPrice),
    costPrice: unitCost,
    supplier: item.supplier ?? item.product?.supplier ?? null,
    categoryName: item.categoryName ?? item.product?.category?.name ?? null,
    riskLevel: item.riskLevel,
    suggestedAction: item.suggestedAction,
    suggestion,
  };
}

function normalizeExpirySummary(item: ApiExpirySummary): ExpirySummary {
  return {
    period: item.period ?? '60d',
    windowDays: Number(item.windowDays ?? 60),
    expiringBatchCount: Number(item.expiringBatchCount ?? 0),
    urgentBatchCount: Number(item.urgentBatchCount ?? 0),
    expiredBatchCount: Number(item.expiredBatchCount ?? 0),
    expiringCostAmount: Number(item.expiringCostAmount ?? 0),
    scrappedAmount: Number(item.scrappedAmount ?? 0),
    wastageTrend: (item.wastageTrend ?? []).map((entry) => ({
      month: entry.month ?? '',
      amount: Number(entry.amount ?? 0),
    })),
    categoryWastage: (item.categoryWastage ?? []).map((entry) => ({
      category: entry.category ?? '未分类',
      percentage: Number(entry.percentage ?? 0),
      amount: Number(entry.amount ?? 0),
    })),
  };
}

function normalizeStockMovement(item: ApiStockMovement): StockMovement {
  return {
    id: Number(item.id),
    storeId: Number(item.storeId ?? item.store?.id ?? 0),
    storeName: item.storeName ?? item.store?.name,
    productId: Number(item.productId ?? item.product?.id ?? 0),
    productName: item.productName ?? item.product?.name,
    sku: item.sku ?? item.product?.sku,
    batchId: item.batchId ?? item.batch?.id ?? null,
    batchNo: item.batchNo ?? item.batch?.batchNo,
    movementNo: item.movementNo ?? '',
    movementType: item.movementType ?? '',
    quantity: Number(item.quantity ?? 0),
    beforeStock: item.beforeStock === undefined ? null : Number(item.beforeStock),
    afterStock: item.afterStock === undefined ? null : Number(item.afterStock),
    unit: item.unit ?? item.product?.specUnit ?? item.product?.unit ?? null,
    sourceType: item.sourceType ?? null,
    sourceId: item.sourceId ?? null,
    sourceNo: item.sourceNo ?? null,
    remark: item.remark ?? null,
    operatorName: item.operatorName ?? item.operator?.name ?? item.operator?.username,
    occurredAt: item.occurredAt ?? '',
    createdAt: item.createdAt ?? '',
  };
}

function normalizePurchaseStatus(status: unknown): PurchaseOrder['status'] {
  const value = String(status || '');
  if (['草稿', '待审核', '已审核', '已下单', '已收货', '已取消'].includes(value)) {
    return value as PurchaseOrder['status'];
  }
  const map: Record<string, PurchaseOrder['status']> = {
    draft: '草稿',
    pending: '草稿',
    review: '待审核',
    approved: '已审核',
    ordered: '已下单',
    partial_received: '部分收货',
    partialReceived: '部分收货',
    '部分收货': '部分收货',
    received: '已收货',
    cancelled: '已取消',
    canceled: '已取消',
  };
  return map[value] ?? '草稿';
}

function getPurchasePayload(item: ApiPurchaseOrder) {
  const payload = item.items && typeof item.items === 'object' && !Array.isArray(item.items)
    ? item.items as { items?: unknown; storeName?: string; expectedDate?: string }
    : undefined;
  const rawItems = Array.isArray(item.items) ? item.items : Array.isArray(payload?.items) ? payload.items : [];
  const items = rawItems.map((raw, index) => {
    const value = raw as { id?: number | string; productId?: number | string; productName?: string; sku?: string; quantity?: number | string; receivedQty?: number | string; unitPrice?: number | string; subtotal?: number | string };
    const quantity = Number(value.quantity ?? 0);
    const unitPrice = Number(value.unitPrice ?? 0);
    return {
      id: Number(value.id ?? index + 1),
      productId: value.productId === undefined ? undefined : Number(value.productId),
      productName: value.productName ?? '',
      sku: value.sku ?? '',
      quantity,
      receivedQty: Number(value.receivedQty ?? 0),
      unitPrice,
      subtotal: Number(value.subtotal ?? quantity * unitPrice),
    };
  });
  return { payload, items };
}

function normalizePurchaseOrder(item: ApiPurchaseOrder): PurchaseOrder {
  const { payload, items } = getPurchasePayload(item);
  const totalAmount = Number(item.totalAmount ?? items.reduce((sum, orderItem) => sum + orderItem.subtotal, 0));
  return {
    id: Number(item.id),
    orderNo: item.orderNo ?? '',
    supplier: item.supplier ?? '',
    storeName: item.storeName ?? payload?.storeName ?? '全部门店',
    productCount: Number(item.productCount ?? items.length),
    totalAmount,
    status: normalizePurchaseStatus(item.status),
    createDate: item.createDate ?? item.createdAt?.slice(0, 10) ?? '',
    expectedDate: item.expectedDate ?? payload?.expectedDate ?? '',
    items,
  };
}

export async function realGetStockItems(params?: { storeId?: number; categoryId?: number; status?: string; keyword?: string }): Promise<StockItem[]> {
  const response = await apiClient.get<unknown, unknown>('/inventory/stock', { params });
  return extractArray<ApiStockItem>(response).map(normalizeStockItem);
}

export async function realGetBatches(productId: number): Promise<Batch[]> {
  const response = await apiClient.get<unknown, unknown>(`/inventory/batches`, { params: { productId } });
  return extractArray<ApiBatch>(response).map(normalizeBatch);
}

export async function realGetStockMovements(params?: {
  storeId?: number;
  productId?: number;
  sourceType?: string;
  sourceId?: number;
  movementType?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<StockMovement>> {
  const response = await apiClient.get<unknown, unknown>('/inventory/stock-movements', { params });
  return normalizePaginatedResponse<ApiStockMovement, StockMovement>(response, normalizeStockMovement);
}

export async function realGetExpiringProducts(params?: { period?: string }): Promise<ExpiringProduct[]> {
  const response = await apiClient.get<unknown, unknown>('/inventory/expiring', { params });
  return extractArray<ApiExpiringProduct>(response).map(normalizeExpiringProduct);
}

export async function realGetExpirySummary(params?: { period?: string }): Promise<ExpirySummary> {
  const response = await apiClient.get<unknown, unknown>('/inventory/expiring/summary', { params });
  return normalizeExpirySummary(response as ApiExpirySummary);
}

export async function realGetReplenishmentSuggestions(): Promise<ReplenishmentSuggestion[]> {
  return apiClient.get('/inventory/replenishment');
}

export async function realGetPurchaseOrders(): Promise<PurchaseOrder[]> {
  const response = await apiClient.get<unknown, unknown>('/inventory/purchase-orders');
  return extractArray<ApiPurchaseOrder>(response).map(normalizePurchaseOrder);
}

export async function realCreateInbound(data: InboundFormData): Promise<Batch> {
  return apiClient.post('/inventory/inbound', data);
}

function normalizeTransferStatus(status: unknown): TransferOrder['status'] {
  const value = String(status || '');
  if (['待确认', '运输中', '已完成', '已取消'].includes(value)) {
    return value as TransferOrder['status'];
  }
  const map: Record<string, TransferOrder['status']> = {
    pending: '待确认',
    confirmed: '待确认',
    shipping: '运输中',
    in_transit: '运输中',
    completed: '已完成',
    received: '已完成',
    done: '已完成',
    cancelled: '已取消',
    canceled: '已取消',
  };
  return map[value] ?? '待确认';
}

function getTransferStoreName(value: ApiTransferOrder['fromStore'] | ApiTransferOrder['toStore'], fallback?: string) {
  if (typeof value === 'string') return value;
  return value?.name ?? fallback ?? '';
}

function normalizeTransferOrder(item: ApiTransferOrder): TransferOrder {
  const rawItems = Array.isArray(item.items) ? item.items : [];
  return {
    id: Number(item.id),
    orderNo: item.orderNo ?? '',
    fromStore: getTransferStoreName(item.fromStore, item.fromStoreName),
    toStore: getTransferStoreName(item.toStore, item.toStoreName),
    productCount: Number(item.productCount ?? rawItems.length),
    status: normalizeTransferStatus(item.status),
    createdAt: item.createdAt ?? '',
    reason: item.reason ?? item.remark,
  };
}

function normalizeTransferSuggestion(item: ApiTransferSuggestion): TransferSuggestion {
  return {
    id: String(item.id ?? `${item.fromStoreId}-${item.toStoreId}-${item.sku}`),
    sku: item.sku ?? '',
    productName: item.productName ?? '',
    productId: Number(item.productId ?? 0),
    fromStoreId: Number(item.fromStoreId ?? 0),
    fromStoreName: item.fromStoreName ?? '',
    toStoreId: Number(item.toStoreId ?? 0),
    toStoreName: item.toStoreName ?? '',
    sourceStock: Number(item.sourceStock ?? 0),
    targetStock: Number(item.targetStock ?? 0),
    safetyStock: Number(item.safetyStock ?? 0),
    suggestedQty: Number(item.suggestedQty ?? 0),
    unit: item.unit ?? null,
    reason: item.reason ?? '',
  };
}

export async function realCreateInventoryAdjustment(data: InventoryAdjustmentFormData): Promise<StockMovement> {
  return apiClient.post('/inventory/adjustments', data);
}

export async function realCreatePurchaseOrder(data: PurchaseOrderFormData): Promise<PurchaseOrder> {
  const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `purchase-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await apiClient.post<unknown, unknown>(
    '/inventory/purchase-orders',
    { ...data, source: 'admin', idempotencyKey },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return normalizePurchaseOrder(response as ApiPurchaseOrder);
}

export async function realUpdatePurchaseOrderStatus(id: number, status: PurchaseOrder['status']): Promise<PurchaseOrder> {
  const response = await apiClient.patch<unknown, unknown>(`/inventory/purchase-orders/${id}/status`, { status });
  return normalizePurchaseOrder(response as ApiPurchaseOrder);
}

export async function realReceivePurchaseOrder(id: number, data: {
  items?: Array<{ sku: string; receivedQty: number; batchNo?: string; productionDate?: string; expiryDate?: string }>;
  remark?: string;
}): Promise<PurchaseOrder> {
  const response = await apiClient.post<unknown, unknown>(`/inventory/purchase-orders/${id}/receive`, data);
  return normalizePurchaseOrder(response as ApiPurchaseOrder);
}

export async function realCreateTransfer(data: TransferFormData): Promise<TransferOrder> {
  const response = await apiClient.post<unknown, unknown>('/inventory/transfers', data);
  return normalizeTransferOrder(response as ApiTransferOrder);
}

export async function realGetTransferSuggestions(): Promise<TransferSuggestion[]> {
  const response = await apiClient.get<unknown, unknown>('/inventory/transfers/suggestions');
  return extractArray<ApiTransferSuggestion>(response).map(normalizeTransferSuggestion);
}

export async function realCancelPurchaseOrder(id: number): Promise<void> {
  return apiClient.delete(`/inventory/purchase-orders/${id}`);
}

export async function realCancelTransfer(id: number): Promise<void> {
  return apiClient.delete(`/inventory/transfers/${id}`);
}

export async function realGetStockItemsPaginated(params: PaginationParams & { storeId?: number; categoryId?: number; status?: string; keyword?: string }): Promise<PaginatedResponse<StockItem>> {
  const response = await apiClient.get<unknown, unknown>('/inventory/stock/paginated', { params });
  return normalizePaginatedResponse<ApiStockItem, StockItem>(response, normalizeStockItem);
}

export async function realGetPurchaseOrdersPaginated(params: PaginationParams): Promise<PaginatedResponse<PurchaseOrder>> {
  const response = await apiClient.get<unknown, unknown>('/inventory/purchase-orders/paginated', { params });
  return normalizePaginatedResponse<ApiPurchaseOrder, PurchaseOrder>(response, normalizePurchaseOrder);
}

export async function realGetExpiringProductsPaginated(params: PaginationParams & { period?: string }): Promise<PaginatedResponse<ExpiringProduct>> {
  const response = await apiClient.get<unknown, unknown>('/inventory/expiring/paginated', { params });
  return normalizePaginatedResponse<ApiExpiringProduct, ExpiringProduct>(response, normalizeExpiringProduct);
}

export async function realGetTransferOrdersPaginated(params: PaginationParams): Promise<PaginatedResponse<TransferOrder>> {
  const response = await apiClient.get<unknown, unknown>('/inventory/transfers/paginated', { params });
  return normalizePaginatedResponse<ApiTransferOrder, TransferOrder>(response, normalizeTransferOrder);
}
