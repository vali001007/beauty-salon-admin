import type { StockItem, StockMovement, Batch, ExpiringProduct, ReplenishmentSuggestion, PurchaseOrder, TransferOrder } from '@/types';
import type { InboundFormData, PurchaseOrderFormData, TransferFormData } from '@/schemas/inventory';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiStockItem = Partial<StockItem> & { name?: string; productName?: string; currentStock?: number | string; safetyStock?: number | string };
type ApiBatch = Partial<Batch> & { stock?: number | string; product?: { name?: string; sku?: string } };
type ApiStockMovement = Partial<StockMovement> & {
  store?: { id?: number; name?: string };
  product?: { id?: number; name?: string; sku?: string; unit?: string };
  batch?: { id?: number; batchNo?: string };
  operator?: { id?: number; name?: string; username?: string };
};
type ApiPurchaseOrder = Partial<Omit<PurchaseOrder, 'items' | 'totalAmount'>> & {
  totalAmount?: number | string;
  items?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

function normalizeStockItem(item: ApiStockItem): StockItem {
  const currentStock = Number(item.currentStock ?? 0);
  const safetyStock = Number(item.safetyStock ?? 0);
  const status: StockItem['status'] =
    currentStock <= 0 ? '缺货' : currentStock < safetyStock ? '低库存' : currentStock > safetyStock * 4 ? '积压' : '正常';
  return {
    id: Number(item.id),
    productName: item.productName ?? item.name ?? '',
    sku: item.sku ?? '',
    currentStock,
    reserved: Number(item.reserved ?? 0),
    availableStock: Number(item.availableStock ?? currentStock),
    safetyStock,
    maxStock: Number(item.maxStock ?? Math.max(safetyStock * 5, currentStock)),
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
    unit: item.unit ?? item.product?.unit ?? null,
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
    const value = raw as { id?: number | string; productName?: string; sku?: string; quantity?: number | string; unitPrice?: number | string; subtotal?: number | string };
    const quantity = Number(value.quantity ?? 0);
    const unitPrice = Number(value.unitPrice ?? 0);
    return {
      id: Number(value.id ?? index + 1),
      productName: value.productName ?? '',
      sku: value.sku ?? '',
      quantity,
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

export async function realGetStockItems(params?: { storeId?: number; status?: string; keyword?: string }): Promise<StockItem[]> {
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

export async function realGetExpiringProducts(): Promise<ExpiringProduct[]> {
  return apiClient.get('/inventory/expiring');
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

export async function realCreatePurchaseOrder(data: PurchaseOrderFormData): Promise<PurchaseOrder> {
  return apiClient.post('/inventory/purchase-orders', data);
}

export async function realCreateTransfer(data: TransferFormData): Promise<TransferOrder> {
  return apiClient.post('/inventory/transfers', data);
}

export async function realCancelPurchaseOrder(id: number): Promise<void> {
  return apiClient.delete(`/inventory/purchase-orders/${id}`);
}

export async function realCancelTransfer(id: number): Promise<void> {
  return apiClient.delete(`/inventory/transfers/${id}`);
}

export async function realGetStockItemsPaginated(params: PaginationParams & { storeId?: number; status?: string; keyword?: string }): Promise<PaginatedResponse<StockItem>> {
  const response = await apiClient.get<unknown, unknown>('/inventory/stock/paginated', { params });
  return normalizePaginatedResponse<ApiStockItem, StockItem>(response, normalizeStockItem);
}

export async function realGetPurchaseOrdersPaginated(params: PaginationParams): Promise<PaginatedResponse<PurchaseOrder>> {
  const response = await apiClient.get<unknown, unknown>('/inventory/purchase-orders/paginated', { params });
  return normalizePaginatedResponse<ApiPurchaseOrder, PurchaseOrder>(response, normalizePurchaseOrder);
}

export async function realGetExpiringProductsPaginated(params: PaginationParams): Promise<PaginatedResponse<ExpiringProduct>> {
  return apiClient.get('/inventory/expiring/paginated', { params });
}

export async function realGetTransferOrdersPaginated(params: PaginationParams): Promise<PaginatedResponse<TransferOrder>> {
  return apiClient.get('/inventory/transfers/paginated', { params });
}
