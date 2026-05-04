import type { Product, Category } from '@/types';
import apiClient from '../client';

export async function realGetProducts(params?: { categoryId?: number; status?: string; keyword?: string }): Promise<Product[]> {
  return apiClient.get('/products', { params });
}

export async function realGetProductById(id: number): Promise<Product | undefined> {
  return apiClient.get(`/products/${id}`);
}

export async function realGetCategories(): Promise<Category[]> {
  return apiClient.get('/categories');
}

export async function realCreateProduct(data: Omit<Product, 'id' | 'sku'>): Promise<Product> {
  return apiClient.post('/products', data);
}

export async function realUpdateProduct(id: number, data: Partial<Product>): Promise<Product> {
  return apiClient.put(`/products/${id}`, data);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetProductsPaginated(params: PaginationParams & { categoryId?: number; status?: string; keyword?: string }): Promise<PaginatedResponse<Product>> {
  return apiClient.get('/products/paginated', { params });
}

import type { ImportResult } from '@/types/excel';

export async function realImportProducts(data: Record<string, any>[]): Promise<ImportResult> {
  return apiClient.post('/products/import', { data });
}
