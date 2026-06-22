import type { BomPayloadItem, Service, ConsumptionRecord, ForecastItem } from '@/types/bom';
import apiClient from '../client';

export async function realGetBomList(): Promise<Service[]> {
  return apiClient.get('/bom/services');
}

export async function realGetBomConsumption(bomId: number): Promise<ConsumptionRecord[]> {
  return apiClient.get(`/bom/services/${bomId}/consumption`);
}

export async function realGetBomConsumptionRecords(): Promise<ConsumptionRecord[]> {
  return apiClient.get('/bom/consumption-records');
}

export async function realGetBomForecast(): Promise<ForecastItem[]> {
  return apiClient.get('/bom/forecast');
}

export async function realCreateBom(data: Omit<Service, 'id'>): Promise<Service> {
  return apiClient.post('/bom/services', data);
}

export async function realUpdateBom(
  id: number,
  data: Partial<Omit<Service, 'bom'>> & { bom?: BomPayloadItem[] },
): Promise<Service> {
  return apiClient.put(`/bom/services/${id}`, data);
}

export async function realDeleteBom(id: number): Promise<void> {
  return apiClient.delete(`/bom/services/${id}`);
}
