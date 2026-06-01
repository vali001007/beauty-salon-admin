import type { StockItem, StockMovement, Batch, ExpiringProduct, ReplenishmentSuggestion, PurchaseOrder, TransferOrder } from '@/types';
import type { InboundFormData, PurchaseOrderFormData, TransferFormData } from '@/schemas/inventory';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetStockItems, realGetBatches, realGetStockMovements, realGetExpiringProducts, realGetReplenishmentSuggestions, realGetPurchaseOrders, realCreateInbound, realCreatePurchaseOrder, realCreateTransfer, realCancelPurchaseOrder, realCancelTransfer } from './real/inventory';

export const getStockItems: (params?: { storeId?: number; status?: string; keyword?: string }) => Promise<StockItem[]> =
  realGetStockItems;

export const getBatches: (productId: number) => Promise<Batch[]> =
  realGetBatches;

export const getStockMovements: (params: PaginationParams & {
  storeId?: number;
  productId?: number;
  sourceType?: string;
  sourceId?: number;
  movementType?: string;
}) => Promise<PaginatedResponse<StockMovement>> =
  realGetStockMovements;

export const getExpiringProducts: () => Promise<ExpiringProduct[]> =
  realGetExpiringProducts;

export const getReplenishmentSuggestions: () => Promise<ReplenishmentSuggestion[]> =
  realGetReplenishmentSuggestions;

export const getPurchaseOrders: () => Promise<PurchaseOrder[]> =
  realGetPurchaseOrders;

export const createInbound: (data: InboundFormData) => Promise<Batch> =
  realCreateInbound;

export const createPurchaseOrder: (data: PurchaseOrderFormData) => Promise<PurchaseOrder> =
  realCreatePurchaseOrder;

export const createTransfer: (data: TransferFormData) => Promise<TransferOrder> =
  realCreateTransfer;

export const cancelPurchaseOrder: (id: number) => Promise<void> =
  realCancelPurchaseOrder;

export const cancelTransfer: (id: number) => Promise<void> =
  realCancelTransfer;

import { realGetStockItemsPaginated, realGetPurchaseOrdersPaginated, realGetExpiringProductsPaginated, realGetTransferOrdersPaginated } from './real/inventory';

export const getStockItemsPaginated: (params: PaginationParams & { storeId?: number; status?: string; keyword?: string }) => Promise<PaginatedResponse<StockItem>> =
  realGetStockItemsPaginated;

export const getPurchaseOrdersPaginated: (params: PaginationParams) => Promise<PaginatedResponse<PurchaseOrder>> =
  realGetPurchaseOrdersPaginated;

export const getExpiringProductsPaginated: (params: PaginationParams) => Promise<PaginatedResponse<ExpiringProduct>> =
  realGetExpiringProductsPaginated;

export const getTransferOrdersPaginated: (params: PaginationParams) => Promise<PaginatedResponse<TransferOrder>> =
  realGetTransferOrdersPaginated;
