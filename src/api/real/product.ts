import type { Product, Category } from '@/types';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiProduct = Omit<Partial<Product>, 'status'> & {
  category?: { id?: number; name?: string };
  store?: { name?: string };
  status?: Product['status'] | 'active' | 'inactive' | 'disabled';
};

function normalizeProduct(item: ApiProduct): Product {
  const rawStatus = String(item.status ?? '');
  return {
    id: Number(item.id),
    name: item.name ?? '',
    sku: item.sku ?? '',
    brand: item.brand ?? '',
    spec: item.spec ?? '',
    unit: (item.unit ?? '瓶') as Product['unit'],
    costPrice: Number(item.costPrice ?? 0),
    retailPrice: Number(item.retailPrice ?? 0),
    shelfLife: Number(item.shelfLife ?? 0),
    categoryId: Number(item.categoryId ?? item.category?.id ?? 0),
    categoryName: item.categoryName ?? item.category?.name ?? '',
    supplier: item.supplier ?? '',
    minPurchaseQty: Number(item.minPurchaseQty ?? 0),
    image: item.image,
    status: rawStatus === 'active' || rawStatus === '在售' ? '在售' : '停售',
  };
}

export async function realGetProducts(params?: { categoryId?: number; status?: string; keyword?: string }): Promise<Product[]> {
  const response = await apiClient.get<unknown, unknown>('/products', { params });
  return extractArray<ApiProduct>(response).map(normalizeProduct);
}

export async function realGetProductById(id: number): Promise<Product | undefined> {
  const item = await apiClient.get<unknown, ApiProduct>(`/products/${id}`);
  return normalizeProduct(item);
}

export async function realGetCategories(): Promise<Category[]> {
  return apiClient.get('/products/categories');
}

export async function realCreateProduct(data: Omit<Product, 'id' | 'sku'>): Promise<Product> {
  const item = await apiClient.post<unknown, ApiProduct>('/products', data);
  return normalizeProduct(item);
}

export async function realUpdateProduct(id: number, data: Partial<Product>): Promise<Product> {
  const item = await apiClient.put<unknown, ApiProduct>(`/products/${id}`, data);
  return normalizeProduct(item);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetProductsPaginated(params: PaginationParams & { categoryId?: number; status?: string; keyword?: string }): Promise<PaginatedResponse<Product>> {
  const response = await apiClient.get<unknown, unknown>('/products/paginated', { params });
  return normalizePaginatedResponse<ApiProduct, Product>(response, normalizeProduct);
}

import type { ImportResult } from '@/types/excel';

export async function realImportProducts(data: Record<string, any>[]): Promise<ImportResult> {
  return apiClient.post('/products/import', { data });
}
