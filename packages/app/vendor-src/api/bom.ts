import type { Service, ConsumptionRecord } from '@/types/bom';
import { mockGetBomList, mockGetBomConsumption } from './mock/bom';
import { realGetBomList, realGetBomConsumption } from './real/bom';

const isReal = import.meta.env.VITE_API_MODE === 'real';

export const getBomList: () => Promise<Service[]> =
  isReal ? realGetBomList : mockGetBomList;

export const getBomConsumption: (bomId: number) => Promise<ConsumptionRecord[]> =
  isReal ? realGetBomConsumption : mockGetBomConsumption;
