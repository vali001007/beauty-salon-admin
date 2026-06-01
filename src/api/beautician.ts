import type { Beautician } from '@/types';
import { realGetBeauticians, realGetBeauticianById, realCreateBeautician, realUpdateBeautician, realDeleteBeautician, realGetBeauticiansPaginated } from './real/beautician';

export const getBeauticians: (params?: { keyword?: string; storeName?: string }) => Promise<Beautician[]> =
  realGetBeauticians;

export const getBeauticianById: (id: number) => Promise<Beautician | undefined> =
  realGetBeauticianById;

export const createBeautician: (data: Omit<Beautician, 'id' | 'createdAt'>) => Promise<Beautician> =
  realCreateBeautician;

export const updateBeautician: (id: number, data: Partial<Beautician>) => Promise<Beautician> =
  realUpdateBeautician;

export const deleteBeautician: (id: number) => Promise<void> =
  realDeleteBeautician;

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export const getBeauticiansPaginated: (params: PaginationParams & { keyword?: string; storeName?: string }) => Promise<PaginatedResponse<Beautician>> =
  realGetBeauticiansPaginated;
