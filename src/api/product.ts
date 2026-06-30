import type { Product, Category } from '@/types';
import {
  realGetProducts,
  realGetProductById,
  realGetCategories,
  realCreateCategory,
  realUpdateCategory,
  realDeleteCategories,
  realCreateProduct,
  realUpdateProduct,
} from './real/product';

export const getProducts: (params?: { categoryId?: number; status?: string; keyword?: string }) => Promise<Product[]> =
  realGetProducts;

export const getProductById: (id: number) => Promise<Product | undefined> =
  realGetProductById;

export const getCategories: () => Promise<Category[]> =
  realGetCategories;

export const createCategory: (data: {
  name: string;
  parentId?: number | null;
  description?: string;
  status?: '启用' | '停用';
}) => Promise<Category> =
  realCreateCategory;

export const updateCategory: (
  id: number,
  data: Partial<{ name: string; parentId: number | null; description: string; status: '启用' | '停用' }>,
) => Promise<Category> =
  realUpdateCategory;

export const deleteCategories: (ids: number[]) => Promise<void> =
  realDeleteCategories;

export const createProduct: (data: Omit<Product, 'id' | 'sku'>) => Promise<Product> =
  realCreateProduct;

export const updateProduct: (id: number, data: Partial<Product>) => Promise<Product> =
  realUpdateProduct;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { realGetProductsPaginated } from './real/product';

export const getProductsPaginated: (params: PaginationParams & { categoryId?: number; status?: string; keyword?: string; sellableOnly?: boolean }) => Promise<PaginatedResponse<Product>> =
  realGetProductsPaginated;

import type { ImportResult } from '@/types/excel';
import { realImportProducts } from './real/product';

export const importProducts: (data: Record<string, any>[]) => Promise<ImportResult> =
  realImportProducts;
