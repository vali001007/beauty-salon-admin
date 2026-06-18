import apiClient from '../client';
import type { BusinessQueryAskRequest, BusinessQueryCapability, BusinessQueryResponse } from '@/types/businessQuery';

export async function askBusinessQuery(data: BusinessQueryAskRequest): Promise<BusinessQueryResponse> {
  return apiClient.post('/business-query/ask', data);
}

export async function getBusinessQueryCapabilities(role?: BusinessQueryAskRequest['role']): Promise<BusinessQueryCapability[]> {
  return apiClient.get('/business-query/capabilities', { params: { role } });
}

