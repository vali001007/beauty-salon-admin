import type { StockItem, StockMovement, Batch, ExpiringProduct, ExpirySummary, ReplenishmentSuggestion, PurchaseOrder, TransferOrder, TransferSuggestion } from '@/types';
import type { InboundFormData, InventoryAdjustmentFormData, PurchaseOrderFormData, TransferFormData } from '@/schemas/inventory';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import {
  realGetStockItems,
  realGetBatches,
  realGetStockMovements,
  realGetExpiringProducts,
  realGetExpirySummary,
  realGetReplenishmentSuggestions,
  realGetPurchaseOrders,
  realCreateInbound,
  realCreateInventoryAdjustment,
  realCreatePurchaseOrder,
  realUpdatePurchaseOrderStatus,
  realReceivePurchaseOrder,
  realCreateTransfer,
  realGetTransferSuggestions,
  realCancelPurchaseOrder,
  realCancelTransfer,
} from './real/inventory';

export const getStockItems: (params?: { storeId?: number; categoryId?: number; status?: string; keyword?: string }) => Promise<StockItem[]> =
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

export const getExpiringProducts: (params?: { period?: string }) => Promise<ExpiringProduct[]> =
  realGetExpiringProducts;

export const getExpirySummary: (params?: { period?: string }) => Promise<ExpirySummary> =
  realGetExpirySummary;

export const getReplenishmentSuggestions: () => Promise<ReplenishmentSuggestion[]> =
  realGetReplenishmentSuggestions;

export const getPurchaseOrders: () => Promise<PurchaseOrder[]> =
  realGetPurchaseOrders;

export const createInbound: (data: InboundFormData) => Promise<Batch> =
  realCreateInbound;

export const createInventoryAdjustment: (data: InventoryAdjustmentFormData) => Promise<StockMovement> =
  realCreateInventoryAdjustment;

export const createPurchaseOrder: (data: PurchaseOrderFormData) => Promise<PurchaseOrder> =
  realCreatePurchaseOrder;

export const updatePurchaseOrderStatus: (id: number, status: PurchaseOrder['status']) => Promise<PurchaseOrder> =
  realUpdatePurchaseOrderStatus;

export const receivePurchaseOrder: (id: number, data: {
  items?: Array<{ sku: string; receivedQty: number; batchNo?: string; productionDate?: string; expiryDate?: string }>;
  remark?: string;
}) => Promise<PurchaseOrder> =
  realReceivePurchaseOrder;

export const createTransfer: (data: TransferFormData) => Promise<TransferOrder> =
  realCreateTransfer;

export const getTransferSuggestions: () => Promise<TransferSuggestion[]> =
  realGetTransferSuggestions;

export const cancelPurchaseOrder: (id: number) => Promise<void> =
  realCancelPurchaseOrder;

export const cancelTransfer: (id: number) => Promise<void> =
  realCancelTransfer;

import { realGetStockItemsPaginated, realGetPurchaseOrdersPaginated, realGetExpiringProductsPaginated, realGetTransferOrdersPaginated } from './real/inventory';

export const getStockItemsPaginated: (params: PaginationParams & { storeId?: number; categoryId?: number; status?: string; keyword?: string }) => Promise<PaginatedResponse<StockItem>> =
  realGetStockItemsPaginated;

export const getPurchaseOrdersPaginated: (params: PaginationParams) => Promise<PaginatedResponse<PurchaseOrder>> =
  realGetPurchaseOrdersPaginated;

export const getExpiringProductsPaginated: (params: PaginationParams & { period?: string }) => Promise<PaginatedResponse<ExpiringProduct>> =
  realGetExpiringProductsPaginated;

export const getTransferOrdersPaginated: (params: PaginationParams) => Promise<PaginatedResponse<TransferOrder>> =
  realGetTransferOrdersPaginated;
