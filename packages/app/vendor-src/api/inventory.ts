import type { StockItem, Batch, ExpiringProduct, ReplenishmentSuggestion, PurchaseOrder, TransferOrder } from '@/types';
import type { InboundFormData, PurchaseOrderFormData, TransferFormData } from '@/schemas/inventory';
import { mockGetStockItems, mockGetBatches, mockGetExpiringProducts, mockGetReplenishmentSuggestions, mockGetPurchaseOrders, mockCreateInbound, mockCreatePurchaseOrder, mockCreateTransfer } from './mock/inventory';
import { realGetStockItems, realGetBatches, realGetExpiringProducts, realGetReplenishmentSuggestions, realGetPurchaseOrders, realCreateInbound, realCreatePurchaseOrder, realCreateTransfer } from './real/inventory';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getStockItems: (params?: { storeId?: number; status?: string; keyword?: string }) => Promise<StockItem[]> =
  isReal ? realGetStockItems : mockGetStockItems;

export const getBatches: (productId: number) => Promise<Batch[]> =
  isReal ? realGetBatches : mockGetBatches;

export const getExpiringProducts: () => Promise<ExpiringProduct[]> =
  isReal ? realGetExpiringProducts : mockGetExpiringProducts;

export const getReplenishmentSuggestions: () => Promise<ReplenishmentSuggestion[]> =
  isReal ? realGetReplenishmentSuggestions : mockGetReplenishmentSuggestions;

export const getPurchaseOrders: () => Promise<PurchaseOrder[]> =
  isReal ? realGetPurchaseOrders : mockGetPurchaseOrders;

export const createInbound: (data: InboundFormData) => Promise<Batch> =
  isReal ? realCreateInbound : mockCreateInbound;

export const createPurchaseOrder: (data: PurchaseOrderFormData) => Promise<PurchaseOrder> =
  isReal ? realCreatePurchaseOrder : mockCreatePurchaseOrder;

export const createTransfer: (data: TransferFormData) => Promise<TransferOrder> =
  isReal ? realCreateTransfer : mockCreateTransfer;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { mockGetStockItemsPaginated, mockGetPurchaseOrdersPaginated, mockGetExpiringProductsPaginated } from './mock/inventory';
import { realGetStockItemsPaginated, realGetPurchaseOrdersPaginated, realGetExpiringProductsPaginated } from './real/inventory';

export const getStockItemsPaginated: (params: PaginationParams & { storeId?: number; status?: string; keyword?: string }) => Promise<PaginatedResponse<StockItem>> =
  isReal ? realGetStockItemsPaginated : mockGetStockItemsPaginated;

export const getPurchaseOrdersPaginated: (params: PaginationParams) => Promise<PaginatedResponse<PurchaseOrder>> =
  isReal ? realGetPurchaseOrdersPaginated : mockGetPurchaseOrdersPaginated;

export const getExpiringProductsPaginated: (params: PaginationParams) => Promise<PaginatedResponse<ExpiringProduct>> =
  isReal ? realGetExpiringProductsPaginated : mockGetExpiringProductsPaginated;
