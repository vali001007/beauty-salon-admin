import type { Card } from '@/types/card';
import type { CardFormData } from '@/schemas/card';
import apiClient from '../client';

export async function realGetCards(): Promise<Card[]> {
  return apiClient.get('/cards');
}

export async function realCreateCard(data: CardFormData): Promise<Card> {
  return apiClient.post('/cards', data);
}

export async function realUpdateCard(id: number, data: Partial<CardFormData>): Promise<Card> {
  return apiClient.put(`/cards/${id}`, data);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetCardOrdersPaginated(params: PaginationParams & { userName?: string; cardName?: string }): Promise<PaginatedResponse<any>> {
  return apiClient.get('/card-orders/paginated', { params });
}

export async function realGetCardUsageRecordsPaginated(params: PaginationParams & { cardName?: string; userName?: string }): Promise<PaginatedResponse<any>> {
  return apiClient.get('/card-usage-records/paginated', { params });
}
