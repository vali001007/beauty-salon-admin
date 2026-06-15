import type { AdminWorkbenchRole, DashboardOverview, WorkbenchOverview } from '@/types/dashboard';
import apiClient from '../client';

export async function realGetDashboardOverview(params?: { storeId?: number | null }): Promise<DashboardOverview> {
  return apiClient.get('/dashboard/overview', { params });
}

export async function realGetDashboardWorkbench(params?: {
  storeId?: number | null;
  role?: AdminWorkbenchRole;
}): Promise<WorkbenchOverview> {
  return apiClient.get('/dashboard/workbench', {
    params: { role: params?.role },
  });
}
