import type { Product, Category } from '@/types';
import { mockGetProducts, mockGetProductById, mockGetCategories, mockCreateProduct, mockUpdateProduct } from './mock/product';
import { realGetProducts, realGetProductById, realGetCategories, realCreateProduct, realUpdateProduct } from './real/product';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getProducts: (params?: { categoryId?: number; status?: string; keyword?: string }) => Promise<Product[]> =
  isReal ? realGetProducts : mockGetProducts;

export const getProductById: (id: number) => Promise<Product | undefined> =
  isReal ? realGetProductById : mockGetProductById;

export const getCategories: () => Promise<Category[]> =
  isReal ? realGetCategories : mockGetCategories;

export const createProduct: (data: Omit<Product, 'id' | 'sku'>) => Promise<Product> =
  isReal ? realCreateProduct : mockCreateProduct;

export const updateProduct: (id: number, data: Partial<Product>) => Promise<Product> =
  isReal ? realUpdateProduct : mockUpdateProduct;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { mockGetProductsPaginated } from './mock/product';
import { realGetProductsPaginated } from './real/product';

export const getProductsPaginated: (params: PaginationParams & { categoryId?: number; status?: string; keyword?: string }) => Promise<PaginatedResponse<Product>> =
  isReal ? realGetProductsPaginated : mockGetProductsPaginated;

import type { ImportResult } from '@/types/excel';
import { mockImportProducts } from './mock/product';
import { realImportProducts } from './real/product';

export const importProducts: (data: Record<string, any>[]) => Promise<ImportResult> =
  isReal ? realImportProducts : mockImportProducts;
