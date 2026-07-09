import apiClient from '../client';
import type { FinanceMetricQuery, FinanceMetricResponse } from '@/types/financeMetrics';

export async function realGetFinanceDailyMetrics(params: FinanceMetricQuery) {
  return apiClient.get('/finance/metrics/daily', { params }) as Promise<FinanceMetricResponse>;
}
