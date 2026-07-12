import type { AskDataCatalogResponse, AskDataQueryRequest, AskDataQueryResponse } from '@/types/askData';
import apiClient from '../client';

export async function queryAskData(data: AskDataQueryRequest): Promise<AskDataQueryResponse> {
  return apiClient.post('/ask-data/query', data);
}

export async function getAskDataCatalog(): Promise<AskDataCatalogResponse> {
  return apiClient.get('/ask-data/catalog');
}
