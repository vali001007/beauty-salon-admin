import apiClient from '../client';
import type {
  BeauticianPerformancePage,
  BeauticianPerformanceQuery,
  CopyOperationCostsPayload,
  OperationCost,
  OperationCostPage,
  OperationCostPayload,
  OperationCostQuery,
  OperationProfitOverview,
  OperationProfitQuery,
  PrepaidLiabilityPage,
  PrepaidLiabilityQuery,
  ProductMarginPage,
  ProductMarginQuery,
  ProjectMarginPage,
  ProjectMarginQuery,
} from '@/types/operationProfit';
import type { PaginatedResponse } from '@/types/pagination';

function normalizePaginated<T>(response: any): PaginatedResponse<T> {
  const items = (response?.items ?? response?.data ?? []) as T[];
  return {
    items,
    data: items,
    total: Number(response?.total ?? items.length),
    page: Number(response?.page ?? 1),
    pageSize: Number(response?.pageSize ?? (items.length || 20)),
  };
}

export async function realGetOperationProfitOverview(params: OperationProfitQuery) {
  return apiClient.get('/operation-profit/overview', { params }) as Promise<OperationProfitOverview>;
}

export async function realGetProjectMargins(params: ProjectMarginQuery) {
  const response = await apiClient.get('/operation-profit/project-margins', { params });
  return normalizePaginated(response) as ProjectMarginPage;
}

export async function realGetProductMargins(params: ProductMarginQuery) {
  const response = await apiClient.get('/operation-profit/product-margins', { params });
  return normalizePaginated(response) as ProductMarginPage;
}

export async function realGetPrepaidLiabilities(params: PrepaidLiabilityQuery) {
  const response = await apiClient.get('/operation-profit/prepaid-liabilities', { params });
  return normalizePaginated(response) as PrepaidLiabilityPage;
}

export async function realGetBeauticianPerformance(params: BeauticianPerformanceQuery) {
  const response = await apiClient.get('/operation-profit/beautician-performance', { params });
  return normalizePaginated(response) as BeauticianPerformancePage;
}

export async function realGetOperationCosts(params: OperationCostQuery) {
  const response = await apiClient.get('/operation-costs', { params });
  return normalizePaginated(response) as OperationCostPage;
}

export async function realCreateOperationCost(payload: OperationCostPayload) {
  return apiClient.post('/operation-costs', payload) as Promise<OperationCost>;
}

export async function realUpdateOperationCost(id: number, payload: Partial<OperationCostPayload>) {
  return apiClient.patch(`/operation-costs/${id}`, payload) as Promise<OperationCost>;
}

export async function realDeleteOperationCost(id: number) {
  return apiClient.delete(`/operation-costs/${id}`) as Promise<{ success: boolean }>;
}

export async function realCopyOperationCostsFromPreviousMonth(payload: CopyOperationCostsPayload) {
  const response = await apiClient.post('/operation-costs/copy-from-previous-month', payload);
  return normalizePaginated(response) as OperationCostPage;
}
