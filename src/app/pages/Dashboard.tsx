import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { getDashboardOverview, getDashboardWorkbench } from '@/api/dashboard';
import { hasPermission } from '@/config/permissions';
import { useAuthStore } from '@/stores/authStore';
import { useStoreStore } from '@/stores/storeStore';
import type {
  AdminWorkbenchRole,
  DashboardOverview,
  WorkbenchInsight,
  WorkbenchMetric,
  WorkbenchOverview,
  WorkbenchQuickAction,
  WorkbenchScope,
  WorkbenchSeverity,
  WorkbenchTodo,
} from '@/types/dashboard';
import { AmiInsightPanel } from './workbench/AmiInsightPanel';
import { filterWorkbenchItems } from './workbench/filterWorkbenchItems';
import { MetricCardGrid } from './workbench/MetricCardGrid';
import { QuickActionGrid } from './workbench/QuickActionGrid';
import { resolveAvailableWorkbenchRoles, resolveDefaultWorkbenchRole } from './workbench/resolveWorkbenchRole';
import { TerminalStatusPanel } from './workbench/TerminalStatusPanel';
import { TodoList } from './workbench/TodoList';
import { getWorkbenchConfig } from './workbench/workbenchConfig';
import { WorkbenchHeader } from './workbench/WorkbenchHeader';

type WorkbenchLoadState = {
  workbench: WorkbenchOverview | null;
  overview: DashboardOverview | null;
  error: string | null;
};

const todoPermissionByKey: Record<string, { permission: string; type: WorkbenchTodo['type']; primaryAction: string }> = {
  inventory: { permission: 'core:inventory:stock', type: 'inventory', primaryAction: '查看库存预警' },
  reservation: { permission: 'core:store:reservations', type: 'reservation', primaryAction: '处理今日预约' },
  service: { permission: 'core:order:card-usage', type: 'service', primaryAction: '查看服务任务' },
  terminal: { permission: 'core:system:stores', type: 'device', primaryAction: '查看终端状态' },
  growth: { permission: 'core:marketing:view', type: 'marketing', primaryAction: '查看增长机会' },
};

function permissionForPath(path: string): string {
  if (path.startsWith('/inventory/expiry')) return 'core:inventory:expiry';
  if (path.startsWith('/inventory/purchase')) return 'core:inventory:purchase';
  if (path.startsWith('/inventory/transfer')) return 'core:inventory:transfer';
  if (path.startsWith('/inventory/consumption')) return 'core:inventory:consumption';
  if (path.startsWith('/inventory')) return 'core:inventory:stock';
  if (path.startsWith('/stores/reservations')) return 'core:store:reservations';
  if (path.startsWith('/stores/scheduling')) return 'core:store:scheduling';
  if (path.startsWith('/orders/card-usage')) return 'core:order:card-usage';
  if (path.startsWith('/orders/card-orders')) return 'core:order:card-orders';
  if (path.startsWith('/orders')) return 'core:order:products';
  if (path.startsWith('/customers/profile')) return 'core:customer:profile';
  if (path.startsWith('/customers/script')) return 'core:customer:script';
  if (path.startsWith('/customers')) return 'core:customer:view';
  if (path.startsWith('/customer-marketing')) return 'core:marketing:view';
  if (path.startsWith('/finance')) return 'core:finance:view';
  if (path.startsWith('/system/devices')) return 'core:system:stores';
  if (path.startsWith('/system/stores')) return 'core:system:stores';
  if (path.startsWith('/system/roles')) return 'core:system:roles';
  return 'core:dashboard:view';
}

function severityFromMetric(metric?: { key: string; value: string }): WorkbenchSeverity {
  if (!metric) return 'normal';
  const numeric = Number(String(metric.value).replace(/[^\d.-]/g, ''));
  if (['inventory', 'inventoryAlerts', 'lowStock', 'expiringBatches', 'pendingServices'].includes(metric.key) && numeric > 0) {
    return numeric >= 5 ? 'critical' : 'warning';
  }
  return 'normal';
}

function buildFallbackMetrics(role: AdminWorkbenchRole, overview: DashboardOverview | null): WorkbenchMetric[] {
  const config = getWorkbenchConfig(role);
  const metricByKey = new Map((overview?.metrics ?? []).map((metric) => [metric.key, metric]));

  return config.metrics.map((metricConfig) => {
    const sourceKeys = [metricConfig.key, ...(metricConfig.fallbackKeys ?? [])];
    const sourceMetric = sourceKeys.map((key) => metricByKey.get(key)).find(Boolean);
    return {
      key: metricConfig.key,
      label: metricConfig.label,
      value: sourceMetric?.value ?? metricConfig.fallbackValue ?? '-',
      hint: sourceMetric?.hint ?? metricConfig.fallbackHint ?? '数据待接入',
      tone: sourceMetric?.tone ?? metricConfig.tone,
      severity: metricConfig.fallbackSeverity ?? severityFromMetric(sourceMetric),
      path: metricConfig.path,
      permission: metricConfig.permission,
    };
  });
}

function buildFallbackTodos(overview: DashboardOverview | null): WorkbenchTodo[] {
  return (overview?.priorities ?? []).map((item, index) => {
    const mapping = todoPermissionByKey[item.key] ?? {
      permission: permissionForPath(item.path),
      type: 'system' as WorkbenchTodo['type'],
      primaryAction: '进入处理',
    };
    const isNormal = item.title.includes('暂无') || item.title.includes('正常');
    return {
      id: `overview-${item.key}-${index}`,
      type: mapping.type,
      title: item.title,
      detail: item.detail,
      tag: item.tag,
      severity: isNormal ? 'normal' : 'warning',
      priority: isNormal ? 20 : 80 - index,
      path: item.path,
      permission: mapping.permission,
      primaryAction: mapping.primaryAction,
    };
  });
}

function scopeFromOverview(overview: DashboardOverview | null, currentStoreId: number | null): WorkbenchScope | null {
  if (overview?.scope) {
    return {
      storeId: overview.scope.storeId,
      storeName: overview.scope.storeName,
      mode: overview.scope.mode,
    };
  }
  if (currentStoreId) {
    return { storeId: currentStoreId, storeName: '当前门店', mode: 'store' };
  }
  return { storeId: null, storeName: '全部门店', mode: 'all' };
}

function buildFallbackInsight(
  role: AdminWorkbenchRole,
  overview: DashboardOverview | null,
  error: string | null,
): WorkbenchInsight {
  const configInsight = getWorkbenchConfig(role).insight;
  if (error && !overview) {
    return {
      conclusion: '工作台数据暂不可用。',
      basis: '当前未拿到可用经营数据，请稍后刷新或检查后端服务。',
      action: '刷新工作台',
      path: '/dashboard',
      permission: 'core:dashboard:view',
    };
  }
  if (overview?.ai) {
    return {
      ...overview.ai,
      permission: permissionForPath(overview.ai.path),
    };
  }
  return configInsight;
}

function isInsightAllowed(insight: WorkbenchInsight, permissions: string[], deniedPermissions: string[]) {
  if (hasPermission(deniedPermissions, '*') || hasPermission(deniedPermissions, insight.permission)) return false;
  return hasPermission(permissions, insight.permission);
}

function resolveInsight(
  insight: WorkbenchInsight,
  quickActions: WorkbenchQuickAction[],
  permissions: string[],
  deniedPermissions: string[],
): WorkbenchInsight {
  if (isInsightAllowed(insight, permissions, deniedPermissions)) return insight;
  const fallbackAction = quickActions[0];
  if (!fallbackAction) {
    return {
      conclusion: '当前账号暂无可执行建议。',
      basis: '工作台已隐藏无权限动作，请联系管理员开通对应权限。',
      action: '留在工作台',
      path: '/dashboard',
      permission: 'core:dashboard:view',
    };
  }
  return {
    conclusion: '建议先处理当前可用的高频事项。',
    basis: '该入口来自当前账号可访问的工作台快捷操作。',
    action: fallbackAction.label,
    path: fallbackAction.path,
    permission: fallbackAction.permission,
  };
}

export function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const currentStoreId = useStoreStore((state) => state.currentStoreId);
  const permissions = useMemo(() => user?.permissions ?? [], [user?.permissions]);
  const deniedPermissions = useMemo(() => user?.deniedPermissions ?? [], [user?.deniedPermissions]);
  const fallbackAvailableRoles = useMemo(() => resolveAvailableWorkbenchRoles(user), [user]);
  const [selectedRole, setSelectedRole] = useState<AdminWorkbenchRole>(() => resolveDefaultWorkbenchRole(user));
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [state, setState] = useState<WorkbenchLoadState>({
    workbench: null,
    overview: null,
    error: null,
  });

  useEffect(() => {
    const nextRole = resolveDefaultWorkbenchRole(user);
    setSelectedRole((current) => (fallbackAvailableRoles.includes(current) ? current : nextRole));
  }, [fallbackAvailableRoles, user]);

  useEffect(() => {
    let ignore = false;
    setIsLoading(true);
    setState((current) => ({ ...current, error: null }));

    async function loadWorkbench() {
      try {
        const workbench = await getDashboardWorkbench({ storeId: currentStoreId, role: selectedRole });
        if (!ignore) {
          setState({ workbench, overview: null, error: null });
        }
      } catch (workbenchError) {
        const message = workbenchError instanceof Error ? workbenchError.message : '工作台数据加载失败';
        try {
          const overview = await getDashboardOverview({ storeId: currentStoreId });
          if (!ignore) {
            setState({
              workbench: null,
              overview,
              error: `工作台接口暂不可用，已使用兼容数据：${message}`,
            });
          }
        } catch (overviewError) {
          if (!ignore) {
            setState({
              workbench: null,
              overview: null,
              error: overviewError instanceof Error ? overviewError.message : message,
            });
          }
        }
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadWorkbench();

    return () => {
      ignore = true;
    };
  }, [currentStoreId, refreshIndex, selectedRole]);

  const currentRole = state.workbench?.actor.currentRole ?? selectedRole;
  const availableRoles = state.workbench?.actor.availableRoles?.length
    ? state.workbench.actor.availableRoles
    : fallbackAvailableRoles;
  const config = getWorkbenchConfig(currentRole);
  const scope = state.workbench?.scope ?? scopeFromOverview(state.overview, currentStoreId);
  const generatedAt = state.workbench?.generatedAt ?? state.overview?.generatedAt;

  const quickActions = useMemo(() => {
    const sourceActions = state.workbench?.quickActions?.length ? state.workbench.quickActions : config.quickActions;
    return filterWorkbenchItems(sourceActions, permissions, deniedPermissions);
  }, [config.quickActions, deniedPermissions, permissions, state.workbench]);

  const metrics = useMemo(() => {
    const sourceMetrics = state.workbench?.metrics?.length
      ? state.workbench.metrics
      : buildFallbackMetrics(currentRole, state.overview);
    return filterWorkbenchItems(sourceMetrics, permissions, deniedPermissions);
  }, [currentRole, deniedPermissions, permissions, state.overview, state.workbench]);

  const todos = useMemo(() => {
    const sourceTodos = state.workbench?.todos ?? buildFallbackTodos(state.overview);
    return filterWorkbenchItems(sourceTodos, permissions, deniedPermissions);
  }, [deniedPermissions, permissions, state.overview, state.workbench]);

  const insight = useMemo(() => {
    const sourceInsight = state.workbench?.insight ?? buildFallbackInsight(currentRole, state.overview, state.error);
    return resolveInsight(sourceInsight, quickActions, permissions, deniedPermissions);
  }, [currentRole, deniedPermissions, permissions, quickActions, state.error, state.overview, state.workbench]);

  const terminalStatus = state.workbench?.terminalStatus ?? state.overview?.terminalStatus;

  const handleNavigate = (path: string) => {
    if (path === '/dashboard') {
      setRefreshIndex((value) => value + 1);
      return;
    }
    navigate(path);
  };

  return (
    <div className="space-y-6">
      <WorkbenchHeader
        role={currentRole}
        availableRoles={availableRoles}
        scope={scope}
        generatedAt={generatedAt}
        userName={user?.name}
        isLoading={isLoading}
        error={state.error}
        onRoleChange={setSelectedRole}
        onRefresh={() => setRefreshIndex((value) => value + 1)}
      />

      <MetricCardGrid metrics={metrics} isLoading={isLoading} onNavigate={handleNavigate} />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <TodoList todos={todos} isLoading={isLoading} onNavigate={handleNavigate} />
        <AmiInsightPanel insight={insight} onNavigate={handleNavigate} />
      </section>

      <QuickActionGrid actions={quickActions} onNavigate={handleNavigate} />

      <TerminalStatusPanel status={terminalStatus} />
    </div>
  );
}
