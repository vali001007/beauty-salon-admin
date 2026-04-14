import type { ProductOrder } from '@/types';
import { mockGetProductOrders, mockGetProductOrderById } from './mock/order';
import { realGetProductOrders, realGetProductOrderById } from './real/order';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getProductOrders: (params?: { status?: string; keyword?: string }) => Promise<ProductOrder[]> =
  isReal ? realGetProductOrders : mockGetProductOrders;

export const getProductOrderById: (id: number) => Promise<ProductOrder | undefined> =
  isReal ? realGetProductOrderById : mockGetProductOrderById;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import { mockGetProductOrdersPaginated } from './mock/order';
import { realGetProductOrdersPaginated } from './real/order';

export const getProductOrdersPaginated: (params: PaginationParams & { status?: string; keyword?: string }) => Promise<PaginatedResponse<ProductOrder>> =
  isReal ? realGetProductOrdersPaginated : mockGetProductOrdersPaginated;
