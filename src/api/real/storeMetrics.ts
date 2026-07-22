import apiClient from '../client';
import type { StoreMetricDefinition, StoreMetricDrilldown, StoreMetricsOverview, StoreMetricTarget } from '@/types/storeMetrics';

export function realGetStoreMetricsOverview(params: { storeId?: number; date?: string }) {
  return apiClient.get('/store-metrics/overview', { params }) as Promise<StoreMetricsOverview>;
}

export function realGetStoreMetricDrilldown(metricKey: string, params: { storeId?: number; date?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
  return apiClient.get(`/store-metrics/${encodeURIComponent(metricKey)}/drilldown`, { params }) as Promise<StoreMetricDrilldown>;
}

export function realGetStoreMetricDefinitions() {
  return apiClient.get('/store-metrics/definitions') as Promise<{ items: StoreMetricDefinition[]; total: number }>;
}

export function realGetStoreMetricTargets(params: { storeId?: number; period?: string }) {
  return apiClient.get('/store-metrics/targets', { params }) as Promise<StoreMetricTarget[]>;
}

export function realCreateStoreMetricTarget(payload: Omit<StoreMetricTarget, 'id' | 'status'>) {
  return apiClient.post('/store-metrics/targets', payload) as Promise<StoreMetricTarget>;
}

export function realUpdateStoreMetricTarget(id: number, payload: Partial<Pick<StoreMetricTarget, 'targetValue' | 'warningValue' | 'criticalValue' | 'weight' | 'status'>>) {
  return apiClient.put(`/store-metrics/targets/${id}`, payload) as Promise<StoreMetricTarget>;
}
