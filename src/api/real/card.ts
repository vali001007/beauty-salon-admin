import type { Card } from '@/types/card';
import type { CardFormData } from '@/schemas/card';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiCard = Omit<Partial<Card>, 'status'> & {
  description?: string;
  createdAt?: string;
  status?: Card['status'] | 'active' | 'inactive' | 'disabled';
  storeId?: number | null;
  sortOrder?: number | string;
};

type ApiCardOrder = {
  id?: string | number;
  sourceOrderId?: number;
  sourceOrderNo?: string;
  sourceOrderItemId?: number;
  customerId?: number;
  customerCardId?: number;
  cardId?: number;
  cardName?: string;
  userName?: string;
  customerName?: string;
  customerPhone?: string;
  customer?: { id?: number; name?: string; phone?: string };
  handlerId?: number | string;
  handlerName?: string;
  operatorId?: number | string;
  operatorName?: string;
  operator?: { id?: number; name?: string; username?: string };
  card?: { id?: number; price?: number | string; projects?: unknown };
  cardProjects?: unknown;
  totalTimes?: number | string;
  remainingTimes?: number | string;
  actualPrice?: number | string;
  amount?: number | string;
  price?: number | string;
  totalAmount?: number | string;
  listAmount?: number | string;
  discountAmount?: number | string;
  refundAmount?: number | string;
  recognizedAmount?: number | string;
  status?: string;
  purchaseTime?: string;
  purchaseDate?: string;
  createdAt?: string;
  expireTime?: string;
  expiryDate?: string;
  paymentMethod?: string;
  remark?: string;
  storeId?: number;
  storeName?: string;
};

export type CreateCardOrderPayload = {
  cardId: number;
  userId?: number;
  customerId?: number;
  operatorId?: number;
  userName?: string;
  customerName?: string;
  storeId?: number;
  storeName?: string;
  cardName?: string;
  actualPrice: number;
  totalTimes?: number;
  remainingTimes?: number;
  expireTime?: string;
  expiryDate?: string;
};

export type CardOrderUpdatePayload = {
  expireTime?: string;
  expiryDate?: string;
  status?: 'active' | 'expired';
  remark?: string;
};

export type CardOrderVoidPayload = {
  reason?: string;
  refundAmount?: number;
};

export type CardOrderProfitCommissionRecord = {
  id: number;
  staffUserId?: number | null;
  staffUserName: string;
  beauticianId?: number | null;
  beauticianName?: string | null;
  ruleId?: number | null;
  ruleName?: string | null;
  sourceAmount: number;
  rate: number;
  amount: number;
  status: string;
  settleMonth?: string | null;
};

export type CardOrderProfitUsageRecord = {
  id: number;
  projectId?: number | null;
  projectName: string;
  times: number;
  recognizedUnitValue: number;
  recognizedAmount: number;
  remainingTimes: number;
  verifiedAt?: string;
  standardMaterialCost: number;
  actualMaterialCost: number;
  materialCost: number;
  materialCostSource: 'actual_stock_movement' | 'standard_bom' | 'missing' | string;
  commissionCost: number;
  projectCost: number;
  projectGrossProfit: number;
  projectGrossMargin: number;
  missingReasons: string[];
  materialMovements: Array<{
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    unit?: string | null;
    costPrice: number;
    costAmount: number;
    occurredAt?: string;
    remark?: string | null;
  }>;
  commissionRecords: CardOrderProfitCommissionRecord[];
};

export type CardOrderProfitDetail = {
  customerCardId: number;
  sourceOrderId?: number | null;
  sourceOrderNo?: string | null;
  customerId?: number | null;
  customerName: string;
  customerPhone?: string;
  storeId?: number | null;
  storeName: string;
  cardId?: number | null;
  cardName: string;
  status: string;
  totalTimes: number;
  remainingTimes: number;
  paymentMethod?: string;
  purchaseTime?: string;
  expireTime?: string;
  listAmount: number;
  discountAmount: number;
  paidAmount: number;
  refundAmount: number;
  netSalesAmount: number;
  recognizedAmount: number;
  remainingLiability: number;
  saleCommissionCost: number;
  unassignedCommissionCost: number;
  totalCost: number;
  recognizedCommissionCost: number;
  recognizedGrossProfit: number;
  recognizedGrossMargin: number;
  salesContribution: number;
  grossProfit: number;
  grossMargin: number;
  dataQuality: 'complete' | 'partial' | string;
  missingReasons: string[];
  saleCommissionRecords: CardOrderProfitCommissionRecord[];
  unassignedCommissionRecords: CardOrderProfitCommissionRecord[];
  usageRecords: CardOrderProfitUsageRecord[];
};

export type CardUsageProfitDetail = CardOrderProfitUsageRecord & {
  customerCardId?: number | null;
  sourceOrderId?: number | null;
  sourceOrderNo?: string | null;
  customerId?: number | null;
  customerName: string;
  customerPhone?: string;
  storeId?: number | null;
  storeName: string;
  cardId?: number | null;
  cardName: string;
  cardStatus?: string | null;
  operatorId?: number | null;
  operatorName?: string;
  beauticianId?: number | null;
  beauticianName?: string;
  dataQuality: 'complete' | 'partial' | string;
};

function normalizeCard(item: ApiCard): Card {
  const rawStatus = String(item.status ?? '');
  const totalTimes = Number(item.totalTimes ?? 0);
  return {
    id: Number(item.id),
    name: item.name ?? '',
    type: item.type ?? '次卡',
    totalTimes,
    price: Number(item.price ?? 0),
    validDays: Number(item.validDays ?? 365),
    storeId: item.storeId == null ? undefined : Number(item.storeId),
    storeName: item.storeName ?? '全部门店',
    status: rawStatus === '' || rawStatus === 'active' || rawStatus === '上架' ? '上架' : '下架',
    sortOrder: Number(item.sortOrder ?? 0),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt.replace('T', ' ').slice(0, 19) : '',
    projects: extractArray<string | { projectName?: string; timesPerCard?: number | string }>(item.projects)
      .map((project) =>
        typeof project === 'string'
          ? { projectName: project, timesPerCard: totalTimes || 1 }
          : { projectName: project.projectName ?? '', timesPerCard: Number(project.timesPerCard ?? (totalTimes || 1)) },
      )
      .filter((project) => project.projectName),
  };
}

function normalizeDateTime(value?: string): string {
  return value ? value.replace('T', ' ').slice(0, 19) : '';
}

function normalizeCardOrder(item: ApiCardOrder) {
  const actualPrice = Number(item.actualPrice ?? item.amount ?? item.totalAmount ?? item.price ?? item.card?.price ?? 0);
  const projects = extractArray<{
    projectName?: string;
    name?: string;
    totalCount?: number | string;
    timesPerCard?: number | string;
    usedCount?: number | string;
    remainCount?: number | string;
  }>(item.cardProjects ?? item.card?.projects).map((project) => {
    const totalCount = Number(project.totalCount ?? project.timesPerCard ?? 0);
    const usedCount = Number(project.usedCount ?? 0);
    return {
      projectName: project.projectName ?? project.name ?? '',
      totalCount,
      usedCount,
      remainCount: Number(project.remainCount ?? Math.max(totalCount - usedCount, 0)),
    };
  }).filter((project) => project.projectName);
  const status = item.status === 'voided' || item.status === '已作废'
    ? 'voided'
    : item.status === 'expired' || item.status === '已过期'
      ? 'expired'
      : 'active';

  return {
    id: String(item.id ?? ''),
    sourceOrderId: Number(item.sourceOrderId ?? 0) || undefined,
    sourceOrderNo: item.sourceOrderNo ?? '',
    sourceOrderItemId: Number(item.sourceOrderItemId ?? 0) || undefined,
    customerId: Number(item.customerId ?? item.customer?.id ?? 0) || undefined,
    customerCardId: Number(item.customerCardId ?? item.id ?? 0) || undefined,
    cardId: Number(item.cardId ?? item.card?.id ?? 0) || undefined,
    cardName: item.cardName ?? '',
    userName: item.userName ?? item.customerName ?? item.customer?.name ?? '未知客户',
    customerPhone: item.customerPhone ?? item.customer?.phone ?? '',
    handlerId: Number(item.handlerId ?? item.operatorId ?? item.operator?.id ?? 0) || undefined,
    handlerName: item.handlerName ?? item.operatorName ?? item.operator?.name ?? item.operator?.username ?? '',
    totalTimes: Number(item.totalTimes ?? 0),
    remainingTimes: Number(item.remainingTimes ?? 0),
    cardProjects: projects,
    actualPrice,
    listAmount: Number(item.listAmount ?? actualPrice),
    discountAmount: Number(item.discountAmount ?? 0),
    refundAmount: Number(item.refundAmount ?? 0),
    recognizedAmount: Number(item.recognizedAmount ?? 0),
    status,
    purchaseTime: normalizeDateTime(item.purchaseTime ?? item.purchaseDate ?? item.createdAt),
    expireTime: normalizeDateTime(item.expireTime ?? item.expiryDate),
    paymentMethod: item.paymentMethod,
    remark: item.remark ?? '',
    storeId: Number(item.storeId ?? 0) || undefined,
    storeName: item.storeName ?? '',
  };
}

export async function realGetCards(): Promise<Card[]> {
  const response = await apiClient.get<unknown, unknown>('/cards');
  return extractArray<ApiCard>(response).map(normalizeCard);
}

export async function realGetSaleCards(params?: { storeId?: number }): Promise<Card[]> {
  const response = await apiClient.get<unknown, unknown>('/cards/sale-options', { params });
  return extractArray<ApiCard>(response).map(normalizeCard);
}

export async function realCreateCard(data: CardFormData): Promise<Card> {
  const item = await apiClient.post<unknown, ApiCard>('/cards', data);
  return normalizeCard(item);
}

export async function realUpdateCard(id: number, data: Partial<CardFormData>): Promise<Card> {
  const item = await apiClient.put<unknown, ApiCard>(`/cards/${id}`, data);
  return normalizeCard(item);
}

export async function realDeleteCard(id: number): Promise<void> {
  return apiClient.delete(`/cards/${id}`);
}

export async function realCreateCardOrder(data: CreateCardOrderPayload): Promise<any> {
  return apiClient.post('/orders/card', data);
}

export async function realGetCardOrderById(id: string | number): Promise<any> {
  const item = await apiClient.get<unknown, ApiCardOrder>(`/orders/card-orders/${id}`);
  return normalizeCardOrder(item);
}

export async function realUpdateCardOrder(id: string | number, data: CardOrderUpdatePayload): Promise<any> {
  const item = await apiClient.put<unknown, ApiCardOrder>(`/orders/card-orders/${id}`, data);
  return normalizeCardOrder(item);
}

export async function realVoidCardOrder(id: string | number, data?: CardOrderVoidPayload): Promise<any> {
  const item = await apiClient.post<unknown, ApiCardOrder>(`/orders/card-orders/${id}/void`, data ?? {});
  return normalizeCardOrder(item);
}

export async function realGetCardOrderProfit(id: string | number): Promise<CardOrderProfitDetail> {
  return apiClient.get<unknown, CardOrderProfitDetail>(`/orders/card-orders/${id}/profit`);
}

export async function realGetCardUsageProfit(id: string | number): Promise<CardUsageProfitDetail> {
  return apiClient.get<unknown, CardUsageProfitDetail>(`/orders/card-usage/${id}/profit`);
}

export async function realCreateCardUsage(data: {
  cardOrderId?: string | number;
  customerCardId?: string | number;
  customerId?: number;
  cardName?: string;
  projectName: string;
  consumedTimes: number;
  operatorId?: number;
}): Promise<any> {
  return apiClient.post('/cards/usage', data);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetCardOrdersPaginated(params: PaginationParams & { userName?: string; cardName?: string }): Promise<PaginatedResponse<any>> {
  const response = await apiClient.get<unknown, unknown>('/orders/card-orders/paginated', { params });
  return normalizePaginatedResponse<ApiCardOrder, ReturnType<typeof normalizeCardOrder>>(response, normalizeCardOrder);
}

export async function realGetCardUsageRecordsPaginated(
  params: PaginationParams & { cardName?: string; userName?: string; projectName?: string },
): Promise<PaginatedResponse<any>> {
  return apiClient.get('/orders/card-usage/paginated', { params });
}
