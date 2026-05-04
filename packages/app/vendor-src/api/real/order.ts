import type { ProductOrder } from '@/types';
import apiClient from '../client';

export async function realGetProductOrders(params?: { status?: string; keyword?: string }): Promise<ProductOrder[]> {
  return apiClient.get('/orders/product', { params });
}

export async function realGetProductOrderById(id: number): Promise<ProductOrder | undefined> {
  return apiClient.get(`/orders/product/${id}`);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetProductOrdersPaginated(params: PaginationParams & { status?: string; keyword?: string }): Promise<PaginatedResponse<ProductOrder>> {
  return apiClient.get('/orders/product/paginated', { params });
}
