import type { AdminWorkbenchRole, DashboardOverview, WorkbenchOverview } from '@/types/dashboard';
import { realGetDashboardOverview, realGetDashboardWorkbench } from './real/dashboard';

export const getDashboardOverview: (params?: { storeId?: number | null }) => Promise<DashboardOverview> =
  realGetDashboardOverview;

export const getDashboardWorkbench: (params?: {
  storeId?: number | null;
  role?: AdminWorkbenchRole;
}) => Promise<WorkbenchOverview> = realGetDashboardWorkbench;
