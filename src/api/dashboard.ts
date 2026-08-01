import type { AdminWorkbenchRole, DashboardOverview, WorkbenchOverview } from '@/types/dashboard';
import { realGetDashboardOverview, realGetDashboardWorkbench } from './real/dashboard';
import {
  dashboardSandboxError,
  dashboardSandboxMode,
  getDashboardFixtureOverview,
  getDashboardFixtureWorkbench,
} from './dashboard-fixture';

export async function getDashboardOverview(params?: { storeId?: number | null }): Promise<DashboardOverview> {
  const mode = dashboardSandboxMode();
  if (mode === 'real') return realGetDashboardOverview(params);
  if (mode === 'error') throw dashboardSandboxError();
  if (mode === 'loading') return new Promise<DashboardOverview>(() => undefined);
  return getDashboardFixtureOverview(mode, params);
}

export async function getDashboardWorkbench(params?: {
  storeId?: number | null;
  role?: AdminWorkbenchRole;
}): Promise<WorkbenchOverview> {
  const mode = dashboardSandboxMode();
  if (mode === 'real') return realGetDashboardWorkbench(params);
  if (mode === 'error') throw dashboardSandboxError();
  if (mode === 'loading') return new Promise<WorkbenchOverview>(() => undefined);
  return getDashboardFixtureWorkbench(mode, params);
}
