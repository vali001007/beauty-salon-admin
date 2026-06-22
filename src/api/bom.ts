import type { BomPayloadItem, Service, ConsumptionRecord, ForecastItem } from '@/types/bom';
import { realGetBomList, realGetBomConsumption, realGetBomConsumptionRecords, realGetBomForecast, realCreateBom, realUpdateBom, realDeleteBom } from './real/bom';

export const getBomList: () => Promise<Service[]> =
  realGetBomList;

export const getBomConsumption: (bomId: number) => Promise<ConsumptionRecord[]> =
  realGetBomConsumption;

export const getBomConsumptionRecords: () => Promise<ConsumptionRecord[]> =
  realGetBomConsumptionRecords;

export const getBomForecast: () => Promise<ForecastItem[]> =
  realGetBomForecast;

export const createBom: (data: Omit<Service, 'id'>) => Promise<Service> =
  realCreateBom;

export const updateBom: (id: number, data: Partial<Omit<Service, 'bom'>> & { bom?: BomPayloadItem[] }) => Promise<Service> =
  realUpdateBom;

export const deleteBom: (id: number) => Promise<void> =
  realDeleteBom;
