import type { AskDataCatalogResponse, AskDataQueryRequest, AskDataQueryResponse } from '@/types/askData';
import apiClient from '../client';

export async function queryAskData(data: AskDataQueryRequest): Promise<AskDataQueryResponse> {
  return apiClient.post('/ask-data/free-sql', data);
}

export async function getAskDataCatalog(): Promise<AskDataCatalogResponse> {
  return apiClient.get('/ask-data/free-sql/catalog');
}
