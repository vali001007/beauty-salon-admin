import type {
  PaginatedResponse,
  PaginationParams,
  ProductSupplierLink,
  ProductSupplierPayload,
  ReceiveSupplierOrderPayload,
  Supplier,
  SupplierSettlement,
  SupplierSettlementStatus,
  SupplierOrder,
  SupplierOrderItem,
  SupplierOrderPayload,
  SupplierOrderStatus,
  SupplierPayload,
} from '@/types';
import apiClient from '../client';
import { normalizePaginatedResponse } from './response';

type ApiProductSupplierLink = Partial<ProductSupplierLink> & { id: number; productId: number };
type ApiSupplier = Partial<Supplier> & {
  id: number;
  rebateRate?: number | string | null;
  products?: ApiProductSupplierLink[];
};
type ApiSupplierOrderItem = Partial<SupplierOrderItem> & {
  id: number;
  productId: number;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  subtotal?: number | string | null;
  receivedQty?: number | string | null;
};
type ApiSupplierOrder = Partial<Omit<SupplierOrder, 'items'>> & {
  id: number;
  supplierId: number;
  storeId: number;
  totalAmount?: number | string | null;
  platformFee?: number | string | null;
  rebateAmount?: number | string | null;
  netAmount?: number | string | null;
  items?: ApiSupplierOrderItem[];
};
type ApiSupplierSettlement = Partial<SupplierSettlement> & {
  id: number;
  supplierId: number;
  totalAmount?: number | string | null;
  rebateAmount?: number | string | null;
  platformFee?: number | string | null;
  platformRevenue?: number | string | null;
  netPayable?: number | string | null;
};

function normalizeProductSupplier(item: ApiProductSupplierLink): ProductSupplierLink {
  return {
    id: Number(item.id),
    productId: Number(item.productId),
    productName: item.productName ?? '',
    sku: item.sku ?? '',
    categoryName: item.categoryName ?? '',
    supplyPrice: Number(item.supplyPrice ?? 0),
    moq: item.moq ?? null,
    leadDays: item.leadDays ?? null,
    isPrimary: Boolean(item.isPrimary),
  };
}

function normalizeSupplier(item: ApiSupplier): Supplier {
  return {
    id: Number(item.id),
    storeId: item.storeId ?? null,
    storeName: item.storeName ?? '',
    name: item.name ?? '',
    contactName: item.contactName ?? '',
    phone: item.phone ?? '',
    email: item.email ?? '',
    address: item.address ?? '',
    category: item.category ?? '',
    rebateRate: Number(item.rebateRate ?? 0),
    paymentTerms: item.paymentTerms ?? '',
    status: item.status ?? 'active',
    productCount: Number(item.productCount ?? item.products?.length ?? 0),
    products: Array.isArray(item.products) ? item.products.map(normalizeProductSupplier) : undefined,
    createdAt: item.createdAt ?? '',
    updatedAt: item.updatedAt ?? '',
  };
}

function normalizeSupplierOrderStatus(status: unknown): SupplierOrderStatus {
  const value = String(status ?? 'draft');
  const allowed: SupplierOrderStatus[] = [
    'draft',
    'pending',
    'approved',
    'ordered',
    'partial_received',
    'received',
    'cancelled',
    'settled',
  ];
  return allowed.includes(value as SupplierOrderStatus) ? (value as SupplierOrderStatus) : 'draft';
}

function normalizeSupplierOrderItem(item: ApiSupplierOrderItem): SupplierOrderItem {
  return {
    id: Number(item.id),
    productId: Number(item.productId),
    productName: item.productName ?? '',
    sku: item.sku ?? '',
    unit: item.unit ?? '',
    quantity: Number(item.quantity ?? 0),
    unitPrice: Number(item.unitPrice ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    receivedQty: Number(item.receivedQty ?? 0),
    moq: item.moq ?? null,
  };
}

function normalizeSupplierOrder(item: ApiSupplierOrder): SupplierOrder {
  const items = Array.isArray(item.items) ? item.items.map(normalizeSupplierOrderItem) : [];
  return {
    id: Number(item.id),
    orderNo: item.orderNo ?? '',
    supplierId: Number(item.supplierId),
    supplierName: item.supplierName ?? '',
    storeId: Number(item.storeId),
    storeName: item.storeName ?? '',
    totalAmount: Number(item.totalAmount ?? 0),
    platformFee: Number(item.platformFee ?? 0),
    rebateAmount: Number(item.rebateAmount ?? 0),
    netAmount: Number(item.netAmount ?? item.totalAmount ?? 0),
    platformRevenue: Number(item.platformRevenue ?? 0),
    status: normalizeSupplierOrderStatus(item.status),
    orderedAt: item.orderedAt ?? '',
    receivedAt: item.receivedAt ?? null,
    settledAt: item.settledAt ?? null,
    createdAt: item.createdAt ?? '',
    updatedAt: item.updatedAt ?? '',
    productCount: Number(item.productCount ?? items.length),
    totalQuantity: Number(item.totalQuantity ?? items.reduce((sum, orderItem) => sum + orderItem.quantity, 0)),
    receivedQuantity: Number(item.receivedQuantity ?? items.reduce((sum, orderItem) => sum + orderItem.receivedQty, 0)),
    items,
  };
}

function normalizeSettlementStatus(status: unknown): SupplierSettlementStatus {
  const value = String(status ?? 'draft');
  return value === 'confirmed' || value === 'paid' ? value : 'draft';
}

function normalizeSupplierSettlement(item: ApiSupplierSettlement): SupplierSettlement {
  const platformFee = Number(item.platformFee ?? 0);
  const rebateAmount = Number(item.rebateAmount ?? 0);
  return {
    id: Number(item.id),
    supplierId: Number(item.supplierId),
    supplierName: item.supplierName ?? '',
    settleMonth: item.settleMonth ?? '',
    orderCount: Number(item.orderCount ?? 0),
    totalAmount: Number(item.totalAmount ?? 0),
    rebateAmount,
    platformFee,
    platformRevenue: Number(item.platformRevenue ?? platformFee + rebateAmount),
    netPayable: Number(item.netPayable ?? 0),
    status: normalizeSettlementStatus(item.status),
    confirmedAt: item.confirmedAt ?? null,
    paidAt: item.paidAt ?? null,
    createdAt: item.createdAt ?? '',
    updatedAt: item.updatedAt ?? '',
  };
}

export async function realGetSuppliersPaginated(
  params: PaginationParams & { keyword?: string; category?: string; status?: string; storeId?: number | null },
): Promise<PaginatedResponse<Supplier>> {
  const response = await apiClient.get<unknown, unknown>('/supply-chain/suppliers', { params });
  return normalizePaginatedResponse<ApiSupplier, Supplier>(response, normalizeSupplier);
}

export async function realGetSupplier(id: number): Promise<Supplier> {
  const response = await apiClient.get<unknown, ApiSupplier>(`/supply-chain/suppliers/${id}`);
  return normalizeSupplier(response);
}

export async function realCreateSupplier(data: SupplierPayload): Promise<Supplier> {
  const response = await apiClient.post<unknown, ApiSupplier>('/supply-chain/suppliers', data);
  return normalizeSupplier(response);
}

export async function realUpdateSupplier(id: number, data: Partial<SupplierPayload>): Promise<Supplier> {
  const response = await apiClient.put<unknown, ApiSupplier>(`/supply-chain/suppliers/${id}`, data);
  return normalizeSupplier(response);
}

export async function realDeleteSupplier(id: number): Promise<void> {
  await apiClient.delete(`/supply-chain/suppliers/${id}`);
}

export async function realLinkSupplierProduct(supplierId: number, data: ProductSupplierPayload): Promise<ProductSupplierLink> {
  const response = await apiClient.post<unknown, ApiProductSupplierLink>(`/supply-chain/suppliers/${supplierId}/products`, data);
  return normalizeProductSupplier(response);
}

export async function realUnlinkSupplierProduct(supplierId: number, productId: number): Promise<void> {
  await apiClient.delete(`/supply-chain/suppliers/${supplierId}/products/${productId}`);
}

export async function realGetSupplierOrdersPaginated(
  params: PaginationParams & { keyword?: string; status?: string; supplierId?: number; storeId?: number | null },
): Promise<PaginatedResponse<SupplierOrder>> {
  const response = await apiClient.get<unknown, unknown>('/supply-chain/orders', { params });
  return normalizePaginatedResponse<ApiSupplierOrder, SupplierOrder>(response, normalizeSupplierOrder);
}

export async function realGetSupplierOrder(id: number): Promise<SupplierOrder> {
  const response = await apiClient.get<unknown, ApiSupplierOrder>(`/supply-chain/orders/${id}`);
  return normalizeSupplierOrder(response);
}

export async function realCreateSupplierOrder(data: SupplierOrderPayload): Promise<SupplierOrder> {
  const response = await apiClient.post<unknown, ApiSupplierOrder>('/supply-chain/orders', data);
  return normalizeSupplierOrder(response);
}

export async function realUpdateSupplierOrderStatus(id: number, status: SupplierOrderStatus): Promise<SupplierOrder> {
  const response = await apiClient.patch<unknown, ApiSupplierOrder>(`/supply-chain/orders/${id}/status`, { status });
  return normalizeSupplierOrder(response);
}

export async function realReceiveSupplierOrder(id: number, data: ReceiveSupplierOrderPayload): Promise<SupplierOrder> {
  const response = await apiClient.post<unknown, ApiSupplierOrder>(`/supply-chain/orders/${id}/receive`, data);
  return normalizeSupplierOrder(response);
}

export async function realConfirmSupplierOrder(id: number): Promise<SupplierOrder> {
  const response = await apiClient.put<unknown, ApiSupplierOrder>(`/supply-chain/orders/${id}/confirm`);
  return normalizeSupplierOrder(response);
}

export async function realSettleSupplierOrder(id: number): Promise<SupplierOrder> {
  const response = await apiClient.put<unknown, ApiSupplierOrder>(`/supply-chain/orders/${id}/settle`);
  return normalizeSupplierOrder(response);
}

export async function realGetSupplierSettlementsPaginated(
  params: PaginationParams & { supplierId?: number; settleMonth?: string; status?: string },
): Promise<PaginatedResponse<SupplierSettlement>> {
  const response = await apiClient.get<unknown, unknown>('/supply-chain/settlements', { params });
  return normalizePaginatedResponse<ApiSupplierSettlement, SupplierSettlement>(response, normalizeSupplierSettlement);
}

export async function realGenerateSupplierSettlement(data: {
  settleMonth: string;
  supplierId?: number;
}): Promise<{ items: SupplierSettlement[]; total: number }> {
  const response = await apiClient.post<unknown, { items?: ApiSupplierSettlement[]; total?: number }>('/supply-chain/settlements/generate', data);
  const items = Array.isArray(response.items) ? response.items.map(normalizeSupplierSettlement) : [];
  return { items, total: Number(response.total ?? items.length) };
}

export async function realConfirmSupplierSettlement(id: number): Promise<SupplierSettlement> {
  const response = await apiClient.put<unknown, ApiSupplierSettlement>(`/supply-chain/settlements/${id}/confirm`);
  return normalizeSupplierSettlement(response);
}

export async function realMarkSupplierSettlementPaid(id: number): Promise<SupplierSettlement> {
  const response = await apiClient.put<unknown, ApiSupplierSettlement>(`/supply-chain/settlements/${id}/mark-paid`);
  return normalizeSupplierSettlement(response);
}

export async function realExportSupplierSettlements(params: { supplierId?: number; settleMonth?: string; status?: string }): Promise<string> {
  return apiClient.get<unknown, string>('/supply-chain/settlements/export', {
    params,
    responseType: 'text' as any,
  });
}
