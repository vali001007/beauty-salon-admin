import type { Card } from '@/types/card';
import type { CardFormData } from '@/schemas/card';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiCard = Omit<Partial<Card>, 'status'> & {
  description?: string;
  createdAt?: string;
  status?: Card['status'] | 'active' | 'inactive' | 'disabled';
};

type ApiCardOrder = {
  id?: string | number;
  cardName?: string;
  userName?: string;
  customerName?: string;
  customer?: { name?: string };
  card?: { price?: number | string };
  actualPrice?: number | string;
  amount?: number | string;
  price?: number | string;
  totalAmount?: number | string;
  status?: string;
  purchaseTime?: string;
  purchaseDate?: string;
  createdAt?: string;
  expireTime?: string;
  expiryDate?: string;
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
    storeName: item.storeName ?? '全部门店',
    status: rawStatus === '' || rawStatus === 'active' || rawStatus === '上架' ? '上架' : '下架',
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
  const status = item.status === 'voided' || item.status === '已作废'
    ? 'voided'
    : item.status === 'expired' || item.status === '已过期'
      ? 'expired'
      : 'active';

  return {
    id: String(item.id ?? ''),
    cardName: item.cardName ?? '',
    userName: item.userName ?? item.customerName ?? item.customer?.name ?? '未知客户',
    actualPrice,
    status,
    purchaseTime: normalizeDateTime(item.purchaseTime ?? item.purchaseDate ?? item.createdAt),
    expireTime: normalizeDateTime(item.expireTime ?? item.expiryDate),
  };
}

export async function realGetCards(): Promise<Card[]> {
  const response = await apiClient.get<unknown, unknown>('/cards');
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

export async function realCreateCardOrder(data: { cardId: number; userId: number; actualPrice: number }): Promise<any> {
  return apiClient.post('/orders/card', data);
}

export async function realCreateCardUsage(data: { cardOrderId: string; projectName: string; consumedTimes: number }): Promise<any> {
  return apiClient.post('/cards/usage', data);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetCardOrdersPaginated(params: PaginationParams & { userName?: string; cardName?: string }): Promise<PaginatedResponse<any>> {
  const response = await apiClient.get<unknown, unknown>('/orders/card-orders/paginated', { params });
  return normalizePaginatedResponse<ApiCardOrder, ReturnType<typeof normalizeCardOrder>>(response, normalizeCardOrder);
}

export async function realGetCardUsageRecordsPaginated(params: PaginationParams & { cardName?: string; userName?: string }): Promise<PaginatedResponse<any>> {
  return apiClient.get('/orders/card-usage/paginated', { params });
}
