import type { Service, ConsumptionRecord } from '@/types/bom';
import apiClient from '../client';

export async function realGetBomList(): Promise<Service[]> {
  return apiClient.get('/bom');
}

export async function realGetBomConsumption(bomId: number): Promise<ConsumptionRecord[]> {
  return apiClient.get(`/bom/${bomId}/consumption`);
}
