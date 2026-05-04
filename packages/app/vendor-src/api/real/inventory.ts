import type { StockItem, Batch, ExpiringProduct, ReplenishmentSuggestion, PurchaseOrder, TransferOrder } from '@/types';
import type { InboundFormData, PurchaseOrderFormData, TransferFormData } from '@/schemas/inventory';
import apiClient from '../client';

export async function realGetStockItems(params?: { storeId?: number; status?: string; keyword?: string }): Promise<StockItem[]> {
  return apiClient.get('/inventory/stock', { params });
}

export async function realGetBatches(productId: number): Promise<Batch[]> {
  return apiClient.get(`/inventory/batches`, { params: { productId } });
}

export async function realGetExpiringProducts(): Promise<ExpiringProduct[]> {
  return apiClient.get('/inventory/expiring');
}

export async function realGetReplenishmentSuggestions(): Promise<ReplenishmentSuggestion[]> {
  return apiClient.get('/inventory/replenishment');
}

export async function realGetPurchaseOrders(): Promise<PurchaseOrder[]> {
  return apiClient.get('/inventory/purchase-orders');
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

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetStockItemsPaginated(params: PaginationParams & { storeId?: number; status?: string; keyword?: string }): Promise<PaginatedResponse<StockItem>> {
  return apiClient.get('/inventory/stock/paginated', { params });
}

export async function realGetPurchaseOrdersPaginated(params: PaginationParams): Promise<PaginatedResponse<PurchaseOrder>> {
  return apiClient.get('/inventory/purchase-orders/paginated', { params });
}

export async function realGetExpiringProductsPaginated(params: PaginationParams): Promise<PaginatedResponse<ExpiringProduct>> {
  return apiClient.get('/inventory/expiring/paginated', { params });
}
