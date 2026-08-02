import { describe, expect, it } from 'vitest';
import {
  dashboardSandboxMode,
  getDashboardFixtureOverview,
  getDashboardFixtureWorkbench,
} from './dashboard-fixture';

describe('dashboard fixture sandbox', () => {
  it('is forced to real outside Vite development mode', () => {
    expect(dashboardSandboxMode({ DEV: false, VITE_DASHBOARD_SANDBOX: 'error' })).toBe('real');
  });

  it('supports success, empty, error, and loading modes only in development', () => {
    expect(dashboardSandboxMode({ DEV: true, VITE_DASHBOARD_SANDBOX: 'success' })).toBe('success');
    expect(dashboardSandboxMode({ DEV: true, VITE_DASHBOARD_SANDBOX: 'empty' })).toBe('empty');
    expect(dashboardSandboxMode({ DEV: true, VITE_DASHBOARD_SANDBOX: 'error' })).toBe('error');
    expect(dashboardSandboxMode({ DEV: true, VITE_DASHBOARD_SANDBOX: 'loading' })).toBe('loading');
  });

  it('keeps fixtures aligned with dashboard DTOs and store-role scope', async () => {
    const overview = await getDashboardFixtureOverview('success', { storeId: 3 });
    const workbench = await getDashboardFixtureWorkbench('success', { storeId: 3, role: 'cashier' });

    expect(overview.scope).toMatchObject({ storeId: 3, mode: 'store' });
    expect(workbench.actor.currentRole).toBe('cashier');
    expect(workbench.scope.storeId).toBe(3);
    expect(workbench.metrics.length).toBeGreaterThan(0);
  });

  it('returns zero-value DTO data for the empty fixture', async () => {
    const workbench = await getDashboardFixtureWorkbench('empty', { storeId: 3, role: 'beautician' });
    expect(workbench.metrics.every((metric) => metric.value === '0')).toBe(true);
    expect(workbench.todos).toEqual([]);
  });
});
