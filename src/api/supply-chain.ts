import type {
  PaginatedResponse,
  PaginationParams,
  ProductSupplierLink,
  ProductSupplierPayload,
  ReceiveSupplierOrderPayload,
  Supplier,
  SupplierSettlement,
  SupplierOrder,
  SupplierOrderPayload,
  SupplierOrderStatus,
  SupplierPayload,
} from '@/types';
import {
  realConfirmSupplierOrder,
  realConfirmSupplierSettlement,
  realCreateSupplierOrder,
  realCreateSupplier,
  realDeleteSupplier,
  realExportSupplierSettlements,
  realGenerateSupplierSettlement,
  realGetSupplierOrder,
  realGetSupplierOrdersPaginated,
  realGetSupplierSettlementsPaginated,
  realGetSupplier,
  realGetSuppliersPaginated,
  realLinkSupplierProduct,
  realMarkSupplierSettlementPaid,
  realReceiveSupplierOrder,
  realSettleSupplierOrder,
  realUnlinkSupplierProduct,
  realUpdateSupplierOrderStatus,
  realUpdateSupplier,
} from './real/supply-chain';

export const getSuppliersPaginated: (
  params: PaginationParams & { keyword?: string; category?: string; status?: string; storeId?: number | null },
) => Promise<PaginatedResponse<Supplier>> = realGetSuppliersPaginated;

export const getSupplier: (id: number) => Promise<Supplier> = realGetSupplier;

export const createSupplier: (data: SupplierPayload) => Promise<Supplier> = realCreateSupplier;

export const updateSupplier: (id: number, data: Partial<SupplierPayload>) => Promise<Supplier> = realUpdateSupplier;

export const deleteSupplier: (id: number) => Promise<void> = realDeleteSupplier;

export const linkSupplierProduct: (supplierId: number, data: ProductSupplierPayload) => Promise<ProductSupplierLink> =
  realLinkSupplierProduct;

export const unlinkSupplierProduct: (supplierId: number, productId: number) => Promise<void> = realUnlinkSupplierProduct;

export const getSupplierOrdersPaginated: (
  params: PaginationParams & { keyword?: string; status?: string; supplierId?: number; storeId?: number | null },
) => Promise<PaginatedResponse<SupplierOrder>> = realGetSupplierOrdersPaginated;

export const getSupplierOrder: (id: number) => Promise<SupplierOrder> = realGetSupplierOrder;

export const createSupplierOrder: (data: SupplierOrderPayload) => Promise<SupplierOrder> = realCreateSupplierOrder;

export const updateSupplierOrderStatus: (id: number, status: SupplierOrderStatus) => Promise<SupplierOrder> =
  realUpdateSupplierOrderStatus;

export const receiveSupplierOrder: (id: number, data: ReceiveSupplierOrderPayload) => Promise<SupplierOrder> =
  realReceiveSupplierOrder;

export const confirmSupplierOrder: (id: number) => Promise<SupplierOrder> = realConfirmSupplierOrder;

export const settleSupplierOrder: (id: number) => Promise<SupplierOrder> = realSettleSupplierOrder;

export const getSupplierSettlementsPaginated: (
  params: PaginationParams & { supplierId?: number; settleMonth?: string; status?: string },
) => Promise<PaginatedResponse<SupplierSettlement>> = realGetSupplierSettlementsPaginated;

export const generateSupplierSettlement: (data: {
  settleMonth: string;
  supplierId?: number;
}) => Promise<{ items: SupplierSettlement[]; total: number }> = realGenerateSupplierSettlement;

export const confirmSupplierSettlement: (id: number) => Promise<SupplierSettlement> = realConfirmSupplierSettlement;

export const markSupplierSettlementPaid: (id: number) => Promise<SupplierSettlement> = realMarkSupplierSettlementPaid;

export const exportSupplierSettlements: (params: {
  supplierId?: number;
  settleMonth?: string;
  status?: string;
}) => Promise<string> = realExportSupplierSettlements;
