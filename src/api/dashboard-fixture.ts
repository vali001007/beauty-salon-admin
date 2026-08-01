import type { AdminWorkbenchRole, DashboardOverview, WorkbenchOverview } from '@/types/dashboard';
import { mockGetDashboardOverview } from './mock/dashboard';

export type DashboardSandboxMode = 'real' | 'success' | 'empty' | 'error' | 'loading';

const fixtureRoles: AdminWorkbenchRole[] = ['store_manager', 'cashier', 'beautician', 'inventory_manager'];

export async function getDashboardFixtureOverview(
  mode: Exclude<DashboardSandboxMode, 'real' | 'error' | 'loading'>,
  params?: { storeId?: number | null },
): Promise<DashboardOverview> {
  const overview = await mockGetDashboardOverview(params);
  if (mode === 'empty') {
    return {
      ...overview,
      metrics: overview.metrics.map((metric) => ({ ...metric, value: '0', hint: '暂无数据' })),
      priorities: overview.priorities.map((priority) => ({ ...priority, title: '暂无数据', detail: '当前筛选范围暂无可展示数据。' })),
      ai: { ...overview.ai, conclusion: '当前筛选范围暂无经营数据。', basis: '这是 Dashboard 专用空数据 fixture。' },
    };
  }
  return overview;
}

export async function getDashboardFixtureWorkbench(
  mode: Exclude<DashboardSandboxMode, 'real' | 'error' | 'loading'>,
  params?: { storeId?: number | null; role?: AdminWorkbenchRole },
): Promise<WorkbenchOverview> {
  const overview = await getDashboardFixtureOverview(mode, params);
  const role = params?.role && fixtureRoles.includes(params.role) ? params.role : 'store_manager';
  const empty = mode === 'empty';
  return {
    actor: {
      userId: 900001,
      name: 'Dashboard Fixture 用户',
      roles: ['store_manager', 'cashier', 'beautician'],
      currentRole: role,
      availableRoles: ['store_manager', 'cashier', 'beautician', 'inventory_manager'],
    },
    scope: overview.scope,
    metrics: empty
      ? overview.metrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          value: '0',
          hint: '暂无数据',
          tone: metric.tone,
          severity: 'normal' as const,
          path: metric.path,
          permission: 'core:dashboard:view',
        }))
      : overview.metrics.map((metric) => ({
          key: metric.key,
          label: metric.label,
          value: metric.value,
          hint: metric.hint,
          tone: metric.tone,
          severity: metric.key === 'inventory' && metric.value !== '0' ? ('warning' as const) : ('normal' as const),
          path: metric.path,
          permission: 'core:dashboard:view',
        })),
    todos: empty
      ? []
      : overview.priorities.map((priority, index) => ({
          id: `fixture-${priority.key}`,
          type: priority.key === 'inventory' ? ('inventory' as const) : priority.key === 'reservation' ? ('reservation' as const) : ('device' as const),
          title: priority.title,
          detail: priority.detail,
          tag: priority.tag,
          severity: priority.title.includes('暂无') || priority.title.includes('正常') ? ('normal' as const) : ('warning' as const),
          priority: 80 - index,
          path: priority.path,
          permission: 'core:dashboard:view',
          primaryAction: '查看详情',
        })),
    quickActions: empty
      ? []
      : [
          { key: 'fixture-customers', label: '客户数据', path: '/customers/data', icon: 'Users', permission: 'core:dashboard:view', group: 'operation' },
          { key: 'fixture-reservations', label: '今日预约', path: '/stores/reservations', icon: 'CalendarCheck', permission: 'core:dashboard:view', group: 'operation' },
        ],
    insight: {
      conclusion: overview.ai.conclusion,
      basis: overview.ai.basis,
      action: overview.ai.action,
      path: overview.ai.path,
      permission: 'core:dashboard:view',
    },
    terminalStatus: overview.terminalStatus,
    generatedAt: overview.generatedAt,
  };
}

export function dashboardSandboxMode(env: Record<string, unknown> = import.meta.env): DashboardSandboxMode {
  if (env.DEV !== true) return 'real';
  const value = env.VITE_DASHBOARD_SANDBOX;
  return value === 'success' || value === 'empty' || value === 'error' || value === 'loading' ? value : 'real';
}

export function dashboardSandboxError(): Error {
  return new Error('Dashboard fixture 模拟服务错误');
}
