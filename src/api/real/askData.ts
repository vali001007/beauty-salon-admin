import type { AskDataCatalogResponse, AskDataQueryRequest, AskDataQueryResponse } from '@/types/askData';
import type { AxiosRequestConfig } from 'axios';
import apiClient from '../client';

type AskDataRequestConfig = AxiosRequestConfig & { skipRetry?: boolean };

// Ask runs two bounded model calls around a guarded database query. The global
// 15s API timeout is too short for this workflow and its generic retry policy can
// execute the same expensive read multiple times after the browser has timed out.
const askDataQueryConfig: AskDataRequestConfig = { timeout: 70_000, skipRetry: true };

export async function queryAskData(data: AskDataQueryRequest): Promise<AskDataQueryResponse> {
  return apiClient.post('/ask-data/free-sql', data, askDataQueryConfig);
}

export async function getAskDataCatalog(): Promise<AskDataCatalogResponse> {
  return apiClient.get('/ask-data/free-sql/catalog');
}
