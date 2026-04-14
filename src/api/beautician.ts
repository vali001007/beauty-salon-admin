import type { Beautician } from '@/types';
import { mockGetBeauticians, mockGetBeauticianById, mockCreateBeautician, mockUpdateBeautician } from './mock/beautician';
import { realGetBeauticians, realGetBeauticianById, realCreateBeautician, realUpdateBeautician } from './real/beautician';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getBeauticians: (params?: { keyword?: string; storeName?: string }) => Promise<Beautician[]> =
  isReal ? realGetBeauticians : mockGetBeauticians;

export const getBeauticianById: (id: number) => Promise<Beautician | undefined> =
  isReal ? realGetBeauticianById : mockGetBeauticianById;

export const createBeautician: (data: Omit<Beautician, 'id' | 'createdAt'>) => Promise<Beautician> =
  isReal ? realCreateBeautician : mockCreateBeautician;

export const updateBeautician: (id: number, data: Partial<Beautician>) => Promise<Beautician> =
  isReal ? realUpdateBeautician : mockUpdateBeautician;
