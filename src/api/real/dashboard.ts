import type { DashboardOverview } from '@/types/dashboard';
import apiClient from '../client';

export async function realGetDashboardOverview(): Promise<DashboardOverview> {
  return apiClient.get('/dashboard/overview');
}
