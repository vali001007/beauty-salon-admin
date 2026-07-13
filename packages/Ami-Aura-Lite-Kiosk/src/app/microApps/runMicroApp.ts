import type { AuraResolvedIntent } from '../intent/intentTypes';
import type { BusinessQueryContext } from '@/types/businessQuery';
import type { AgentRunResult } from '@/types/agent';
import { OFF_TOPIC_REPLY, isBusinessRelevant } from '../intent/relevanceGuard';
import {
  getBeauticianDashboard,
  getBeauticianCustomerList,
  getCardOpeningFlow,
  getCardVerificationFlow,
  getCashierFlow,
  getBeauticianCareAdvice,
  getCustomerCard,
  getFollowUpTasksView,
  getCustomerGrowthCandidates,
  getInventoryAlerts,
  getManagerDashboard,
  getOperationResult,
  getTodayPrintDocuments,
  getServiceRecordPreparation,
  prefetchAuraBootstrap,
  getReceptionDashboard,
  getRechargeFlow,
  getRefundFlow,
  getRegistrationFlow,
  getStaffSchedules,
  getServiceRecordFlow,
  runBusinessAgent,
  updateAppointmentAction,
} from '../services/auraCoreService';
import {
  TERMINAL_QUERY_TTL,
  formatTerminalQueryUpdatedAt,
  terminalPrefetch,
  terminalQuery,
  type TerminalQueryKey,
  type TerminalQueryResult,
} from '../services/terminalQueryClient';
import { isTerminalAgentRuntimeEnabled, runTerminalAgentIntent, shouldUseTerminalAgentRuntime } from '../services/terminalAgentAdapter';
import type { TerminalAgentEngine } from '../services/agentRuntimeService';
import type { MicroAppRunResult } from './microAppTypes';

type CacheableMicroAppConfig<T> = {
  key: TerminalQueryKey;
  ttlMs: number;
  loader: () => Promise<T>;
  toResult: (data: T) => MicroAppRunResult;
};

type RunMicroAppIntentOptions = {
  businessQueryContext?: BusinessQueryContext;
  agentContext?: Record<string, unknown>;
  agentEngine?: TerminalAgentEngine;
};

export function toTerminalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTerminalWeekStartKey() {
  const date = new Date();
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return toTerminalDateKey(date);
}

export function getTerminalTodayKey() {
  return toTerminalDateKey(new Date());
}

function formatAgentRuntimeError(error: unknown) {
  return error instanceof Error ? error.message : 'Agent Runtime 暂不可用';
}

function withCacheMeta<T>(
  key: TerminalQueryKey,
  state: TerminalQueryResult<T>,
  base: MicroAppRunResult,
): MicroAppRunResult {
  const refreshStatus = state.refreshStatus ?? 'idle';
  const suffix =
    refreshStatus === 'refreshing'
      ? ` · ${formatTerminalQueryUpdatedAt(state.updatedAt)}，正在后台刷新`
      : refreshStatus === 'failed'
        ? ` · 刷新失败，已显示上次数据`
        : state.updatedAt
          ? ` · ${formatTerminalQueryUpdatedAt(state.updatedAt)}`
          : '';

  return {
    ...base,
    messages: base.messages.map((message, index) => ({
      ...message,
      title: index === 0 && suffix ? `${message.title ?? 'Ami_Core 数据'}${suffix}` : message.title,
    })),
    cacheMeta: {
      key: JSON.stringify(key),
      refreshStatus,
      updatedAt: state.updatedAt,
      isStale: state.isStale,
      error: state.error,
    },
  };
}

async function runCacheableMicroApp<T>(config: CacheableMicroAppConfig<T>): Promise<MicroAppRunResult> {
  const state = await terminalQuery({
    key: config.key,
    ttlMs: config.ttlMs,
    loader: config.loader,
  });

  if (!state.data) {
    return {
      messages: [{ type: 'error', payload: { text: state.error ?? 'Ami_Core 数据加载失败', source: 'core' } }],
      cacheMeta: {
        key: JSON.stringify(config.key),
        refreshStatus: 'failed',
        error: state.error,
      },
    };
  }

  const initial = withCacheMeta(config.key, state, config.toResult(state.data));
  if (state.refresh) {
    initial.refresh = state.refresh.then((nextState) => {
      if (!nextState.data) {
        return withCacheMeta(config.key, nextState, config.toResult(state.data as T));
      }
      return withCacheMeta(config.key, nextState, config.toResult(nextState.data));
    });
  }
  return initial;
}

export async function prefetchTerminalMicroApps(actions: string[]) {
  const configs = actions
    .map((action) => getCacheableMicroAppConfig(action))
    .filter((config): config is CacheableMicroAppConfig<unknown> => Boolean(config));

  await prefetchAuraBootstrap().catch(() => undefined);

  const pending = [...configs];
  const workerCount = Math.min(2, pending.length);
  await Promise.allSettled(
    Array.from({ length: workerCount }, async () => {
      while (pending.length) {
        const config = pending.shift();
        if (!config) return;
        await terminalPrefetch({
          key: config.key,
          ttlMs: config.ttlMs,
          loader: config.loader,
          source: 'prefetch',
        }).catch(() => undefined);
      }
    }),
  );
}

function getCacheableMicroAppConfig(action: string): CacheableMicroAppConfig<unknown> | null {
  const today = getTerminalTodayKey();
  const weekStart = getTerminalWeekStartKey();

  if (action === 'manager.dashboard') {
    return {
      key: ['manager-dashboard', today],
      ttlMs: TERMINAL_QUERY_TTL.managerDashboard,
      loader: getManagerDashboard,
      toResult: (data) => ({
        messages: [
          {
            type: 'dashboard',
            payload: { kind: 'manager', data: data as Awaited<ReturnType<typeof getManagerDashboard>> },
          },
        ],
        aiSummary: (data as Awaited<ReturnType<typeof getManagerDashboard>>).summary,
      }),
    };
  }

  if (action === 'manager.staff') {
    return {
      key: ['staff-schedules', weekStart],
      ttlMs: TERMINAL_QUERY_TTL.staffSchedules,
      loader: getStaffSchedules,
      toResult: (data) => ({
        messages: [
          {
            type: 'dashboard',
            payload: { kind: 'staff', data: data as Awaited<ReturnType<typeof getStaffSchedules>> },
          },
        ],
        aiSummary: `员工排班共 ${(data as Awaited<ReturnType<typeof getStaffSchedules>>).length} 人，优先关注占用率和服务状态。`,
      }),
    };
  }

  if (action === 'manager.customers') {
    return {
      key: ['customer-growth'],
      ttlMs: TERMINAL_QUERY_TTL.customerGrowth,
      loader: getCustomerGrowthCandidates,
      toResult: (data) => ({
        messages: [
          {
            type: 'dashboard',
            payload: { kind: 'growth', data: data as Awaited<ReturnType<typeof getCustomerGrowthCandidates>> },
          },
        ],
        aiSummary: `筛选出 ${(data as Awaited<ReturnType<typeof getCustomerGrowthCandidates>>).length} 位客户增长或流失风险对象。`,
      }),
    };
  }

  if (action === 'manager.inventory') {
    return {
      key: ['inventory-alerts'],
      ttlMs: TERMINAL_QUERY_TTL.inventoryAlerts,
      loader: getInventoryAlerts,
      toResult: (data) => ({
        messages: [
          {
            type: 'dashboard',
            payload: { kind: 'inventory', data: data as Awaited<ReturnType<typeof getInventoryAlerts>> },
          },
        ],
        aiSummary: (data as Awaited<ReturnType<typeof getInventoryAlerts>>).summary,
      }),
    };
  }

  if (action === 'reception.appointments') {
    return {
      key: ['today-reservations', today],
      ttlMs: TERMINAL_QUERY_TTL.todayReservations,
      loader: getReceptionDashboard,
      toResult: (data) => ({
        messages: [
          {
            type: 'dashboard',
            payload: { kind: 'reception', data: data as Awaited<ReturnType<typeof getReceptionDashboard>> },
          },
        ],
        aiSummary: (data as Awaited<ReturnType<typeof getReceptionDashboard>>).summary,
      }),
    };
  }

  if (action === 'operation.cashier') {
    return {
      key: ['cashier-context', today],
      ttlMs: TERMINAL_QUERY_TTL.cashierContext,
      loader: getCashierFlow,
      toResult: (data) => ({
        messages: [
          { type: 'cashier', payload: { kind: 'cashier', data: data as Awaited<ReturnType<typeof getCashierFlow>> } },
        ],
      }),
    };
  }

  if (action === 'operation.print') {
    return {
      key: ['print-documents', today],
      ttlMs: TERMINAL_QUERY_TTL.printDocuments,
      loader: getTodayPrintDocuments,
      toResult: (data) => ({
        messages: [
          {
            type: 'dashboard',
            payload: { kind: 'printDocuments', data: data as Awaited<ReturnType<typeof getTodayPrintDocuments>> },
          },
        ],
        aiSummary: (data as Awaited<ReturnType<typeof getTodayPrintDocuments>>).summary,
      }),
    };
  }

  if (action === 'operation.verify') {
    return {
      key: ['card-verification-context', today, ''],
      ttlMs: TERMINAL_QUERY_TTL.cardVerificationContext,
      loader: getCardVerificationFlow,
      toResult: (data) => ({
        messages: [
          {
            type: 'cardVerification',
            payload: { kind: 'cardVerification', data: data as Awaited<ReturnType<typeof getCardVerificationFlow>> },
          },
        ],
      }),
    };
  }

  if (action === 'beautician.schedule') {
    return {
      key: ['beautician-dashboard', today, 'schedule'],
      ttlMs: TERMINAL_QUERY_TTL.todayReservations,
      loader: getBeauticianDashboard,
      toResult: (data) => ({
        messages: [
          {
            type: 'dashboard',
            payload: {
              kind: 'beautician',
              data: data as Awaited<ReturnType<typeof getBeauticianDashboard>>,
              focus: 'schedule',
            },
          },
        ],
        aiSummary: '已打开我的预约，仅显示本人排班，可直接切换正常、忙碌和请假状态。',
      }),
    };
  }

  if (action === 'beautician.commission') {
    return {
      key: ['beautician-dashboard', today, action],
      ttlMs: TERMINAL_QUERY_TTL.todayReservations,
      loader: getBeauticianDashboard,
      toResult: (data) => ({
        messages: [
          {
            type: 'dashboard',
            payload: {
              kind: 'beautician',
              data: data as Awaited<ReturnType<typeof getBeauticianDashboard>>,
              focus: 'commission',
            },
          },
        ],
        aiSummary: '已打开我的提成，仅显示本人今日提成、本月累计、待确认、已确认和最近流水。',
      }),
    };
  }

  return null;
}

export function isCacheableMicroAppAction(action?: string | null) {
  return Boolean(action && getCacheableMicroAppConfig(action));
}

export async function runMicroAppIntent(
  intent: AuraResolvedIntent,
  command: string,
  options: RunMicroAppIntentOptions = {},
): Promise<MicroAppRunResult> {
  const action = intent.action;

  if (intent.deniedReason) {
    return {
      messages: [{ type: 'error', payload: { text: intent.deniedReason, source: 'permission' } }],
    };
  }

  if (!action) {
    if (!isBusinessRelevant(command)) {
      return {
        messages: [
          {
            type: 'ai',
            payload: {
              kind: 'ai',
              data: {
                title: 'Ami 提示',
                text: OFF_TOPIC_REPLY,
                source: 'Ami AI',
              },
            },
          },
        ],
      };
    }

    return {
      messages: [],
      aiStream: { role: intent.role, command },
    };
  }

  if (shouldUseTerminalAgentRuntime(intent)) {
    try {
      return await runTerminalAgentIntent(intent, command, intent.role, options);
    } catch (error) {
      const reason = formatAgentRuntimeError(error);
      return {
        messages: [
          {
            type: 'error',
            payload: {
              text: `Agent Runtime 暂不可用，已切换到 Ami 智能问答兜底。原因：${reason}`,
              source: 'agent-runtime',
            },
          },
        ],
        aiStream: {
          role: intent.role,
          command,
          businessContext: `Agent Runtime fallback: ${reason}`,
        },
        aiCommand: command,
      };
    }
  }

  const cacheableConfig = getCacheableMicroAppConfig(action);
  if (cacheableConfig) {
    const result = await runCacheableMicroApp(cacheableConfig);
    return result.aiSummary ? { ...result, aiCommand: command } : result;
  }

  if (action === 'business.query') {
    if (!isTerminalAgentRuntimeEnabled()) {
      return {
        messages: [],
        aiStream: { role: intent.role, command },
      };
    }
    const context = {
      ...(options.agentContext ?? {}),
      ...(options.agentEngine ? { agentEngine: options.agentEngine } : {}),
      ...(options.agentEngine === 'agent_v2'
        ? { architecture: 'kg_llm_agent' }
        : options.agentEngine === 'agent_v3'
          ? { architecture: 'agent_v3_text_to_sql', agentV3Mode: 'execute' }
          : options.agentEngine === 'agent_v5'
            ? { architecture: 'agent_v5_business_ontology_agent', agentV5Mode: 'execute', boundary: 'drafts_followups_and_approval_only' }
          : options.agentEngine === 'agent_v4'
            ? { architecture: 'agent_v4_lifecycle_business_agent', agentV4Mode: 'execute', boundary: 'drafts_and_approval_only' }
        : {}),
      ...(options.businessQueryContext ? { previousBusinessQuery: options.businessQueryContext } : {}),
    };
    const data = await runBusinessAgent(command, intent.role, context);
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'agentRun', data: data as AgentRunResult } }],
    };
  }

  if (action === 'customer.followup') {
    const data = await getFollowUpTasksView();
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'followUpTasks', data } }],
    };
  }

  if (action === 'manager.dashboard') {
    const data = await getManagerDashboard();
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'manager', data } }],
      aiSummary: data.summary,
      aiCommand: command,
    };
  }

  if (action === 'manager.staff') {
    const data = await getStaffSchedules();
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'staff', data } }],
      aiSummary: `员工排班共 ${data.length} 人，优先关注占用率和服务状态。`,
      aiCommand: command,
    };
  }

  if (action === 'manager.customers') {
    const data = await getCustomerGrowthCandidates();
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'growth', data } }],
      aiSummary: `筛选出 ${data.length} 位客户增长或流失风险对象。`,
      aiCommand: command,
    };
  }

  if (action === 'manager.inventory') {
    const data = await getInventoryAlerts();
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'inventory', data } }],
      aiSummary: data.summary,
      aiCommand: command,
    };
  }

  if (action === 'reception.appointments') {
    const data = await getReceptionDashboard();
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'reception', data } }],
      aiSummary: data.summary,
      aiCommand: command,
    };
  }

  if (action === 'operation.verify') {
    const data = await getCardVerificationFlow();
    return { messages: [{ type: 'cardVerification', payload: { kind: 'cardVerification', data } }] };
  }

  if (action === 'operation.cashier') {
    const data = await getCashierFlow();
    return { messages: [{ type: 'cashier', payload: { kind: 'cashier', data } }] };
  }

  if (action === 'operation.card') {
    const data = await getCardOpeningFlow();
    return { messages: [{ type: 'cardOpening', payload: { kind: 'cardOpening', data } }] };
  }

  if (action === 'operation.register') {
    const data = await getRegistrationFlow();
    return { messages: [{ type: 'registration', payload: { kind: 'registration', data } }] };
  }

  if (action === 'operation.recharge') {
    const data = await getRechargeFlow();
    return { messages: [{ type: 'recharge', payload: { kind: 'recharge', data } }] };
  }

  if (action === 'operation.refund') {
    const data = await getRefundFlow();
    return { messages: [{ type: 'refund', payload: { kind: 'refund', data } }] };
  }

  if (action === 'beautician.schedule' || action === 'beautician.commission') {
    const data = await getBeauticianDashboard();
    return {
      messages: [
        {
          type: 'dashboard',
          payload: { kind: 'beautician', data, focus: action === 'beautician.commission' ? 'commission' : 'schedule' },
        },
      ],
      aiSummary:
        action === 'beautician.commission'
          ? '已打开我的提成，仅显示本人今日提成、本月累计、待确认、已确认和最近流水。'
          : '已打开我的预约，仅显示本人排班，可直接切换正常、忙碌和请假状态。',
      aiCommand: command,
    };
  }

  if (
    action === 'beautician.customer' &&
    (intent.source === 'quick_action' || command.includes('我的客户') || command.includes('客户档案'))
  ) {
    const data = await getBeauticianCustomerList();
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'beauticianCustomers', data } }],
      aiSummary: data.summary,
      aiCommand: command,
    };
  }

  if (action === 'beautician.customer' || action.startsWith('customer:')) {
    const keyword = action.startsWith('customer:') ? action.slice('customer:'.length) : command;
    const data = await getCustomerCard(keyword);
    if (!data) {
      return { messages: [{ type: 'error', payload: { text: '未找到匹配客户', source: 'core' } }] };
    }
    return {
      messages: [{ type: 'dashboard', payload: { kind: 'customer', data } }],
      aiSummary: data.summary,
      aiCommand: command,
    };
  }

  if (action === 'beautician.advice') {
    const data = await getBeauticianCareAdvice(command);
    if (!data) {
      return { messages: [{ type: 'error', payload: { text: '暂无可生成护理建议的客户档案', source: 'core' } }] };
    }

    return {
      messages: [{ type: 'ai', payload: { kind: 'ai', data } }],
      aiSummary: data.text,
      aiCommand: command,
    };
  }

  if (action === 'beautician.record' || action === 'operation.service-complete') {
    try {
      const data = await getServiceRecordFlow();
      return { messages: [{ type: 'serviceRecord', payload: { kind: 'serviceRecord', data } }] };
    } catch {
      const data = await getServiceRecordPreparation();
      return { messages: [{ type: 'operation', payload: { kind: 'operation', data } }] };
    }
  }

  if (action.startsWith('appointment:')) {
    const data = await updateAppointmentAction(action);
    const latest = await getReceptionDashboard();
    return {
      messages: [
        { type: 'operation', payload: { kind: 'operation', data } },
        { type: 'dashboard', payload: { kind: 'reception', data: latest } },
      ],
    };
  }

  const data = await getOperationResult(action);
  return { messages: [{ type: 'operation', payload: { kind: 'operation', data } }] };
}
