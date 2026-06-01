import type { DashboardOverview } from '@/types/dashboard';
import { realGetDashboardOverview } from './real/dashboard';

export const getDashboardOverview: (params?: { storeId?: number | null }) => Promise<DashboardOverview> =
  realGetDashboardOverview;
