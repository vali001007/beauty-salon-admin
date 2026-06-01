import type { Product, Category } from '@/types';
import { realGetProducts, realGetProductById, realGetCategories, realCreateProduct, realUpdateProduct } from './real/product';

export const getProducts: (params?: { categoryId?: number; status?: string; keyword?: string }) => Promise<Product[]> =
  realGetProducts;

export const getProductById: (id: number) => Promise<Product | undefined> =
  realGetProductById;

export const getCategories: () => Promise<Category[]> =
  realGetCategories;

export const createProduct: (data: Omit<Product, 'id' | 'sku'>) => Promise<Product> =
  realCreateProduct;

export const updateProduct: (id: number, data: Partial<Product>) => Promise<Product> =
  realUpdateProduct;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetProductsPaginated } from './real/product';

export const getProductsPaginated: (params: PaginationParams & { categoryId?: number; status?: string; keyword?: string }) => Promise<PaginatedResponse<Product>> =
  realGetProductsPaginated;

import type { ImportResult } from '@/types/excel';
import { realImportProducts } from './real/product';

export const importProducts: (data: Record<string, any>[]) => Promise<ImportResult> =
  realImportProducts;
