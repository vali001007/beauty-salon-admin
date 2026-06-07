import type { Product, Category } from '@/types';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiProduct = Omit<Partial<Product>, 'status'> & {
  category?: { id?: number; name?: string };
  store?: { name?: string };
  status?: Product['status'] | 'active' | 'inactive' | 'disabled';
  salePrice?: number | string | null;
  discountRate?: number | string | null;
  miniappPublishedAt?: string | Date | null;
};
type ApiCategory = Partial<Category> & {
  _count?: { products?: number };
  children?: ApiCategory[];
};

function normalizeProduct(item: ApiProduct): Product {
  const rawStatus = String(item.status ?? '');
  return {
    id: Number(item.id),
    storeId: item.storeId === undefined ? undefined : Number(item.storeId),
    storeName: item.storeName ?? item.store?.name ?? '',
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
    salePrice: item.salePrice === undefined || item.salePrice === null ? null : Number(item.salePrice),
    discountRate: item.discountRate === undefined || item.discountRate === null ? null : Number(item.discountRate),
    discountLabel: item.discountLabel ?? null,
    salesDescription: item.salesDescription ?? null,
    miniappStatus: item.miniappStatus ?? 'unpublished',
    miniappPublishedAt: item.miniappPublishedAt ? String(item.miniappPublishedAt) : null,
  };
}

function normalizeProductPayload(data: Omit<Product, 'id' | 'sku'> | Partial<Product>) {
  const payload = { ...data } as Record<string, unknown>;
  delete payload.categoryName;
  payload.status =
    data.status === '在售'
      ? 'active'
      : data.status === '停售'
        ? 'inactive'
        : data.status;
  return payload;
}

function normalizeCategory(item: ApiCategory): Category {
  return {
    id: Number(item.id),
    name: item.name ?? '',
    parentId: item.parentId ?? null,
    description: item.description ?? '',
    status: item.status ?? '启用',
    productCount: Number(item.productCount ?? item._count?.products ?? 0),
    children: Array.isArray(item.children) ? item.children.map(normalizeCategory) : [],
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
  const response = await apiClient.get<unknown, unknown>('/products/categories');
  return extractArray<ApiCategory>(response).map(normalizeCategory);
}

export async function realCreateCategory(data: {
  name: string;
  parentId?: number | null;
  description?: string;
  status?: '启用' | '停用';
}): Promise<Category> {
  const response = await apiClient.post<unknown, ApiCategory>('/products/categories', data);
  return normalizeCategory(response);
}

export async function realUpdateCategory(
  id: number,
  data: Partial<{ name: string; parentId: number | null; description: string; status: '启用' | '停用' }>,
): Promise<Category> {
  const response = await apiClient.put<unknown, ApiCategory>(`/products/categories/${id}`, data);
  return normalizeCategory(response);
}

export async function realDeleteCategories(ids: number[]): Promise<void> {
  return apiClient.post('/products/categories/batch-delete', { ids });
}

export async function realCreateProduct(data: Omit<Product, 'id' | 'sku'>): Promise<Product> {
  const item = await apiClient.post<unknown, ApiProduct>('/products', normalizeProductPayload(data));
  return normalizeProduct(item);
}

export async function realUpdateProduct(id: number, data: Partial<Product>): Promise<Product> {
  const item = await apiClient.put<unknown, ApiProduct>(`/products/${id}`, normalizeProductPayload(data));
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
