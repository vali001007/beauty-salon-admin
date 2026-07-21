import type {
  AudiencePreview,
  MarketingActivity,
  MarketingAutomationEffect,
  MarketingAutomationExecution,
  MarketingAutomationStrategy,
  MarketingRuleRelation,
  MarketingRuleEffectSummary,
  MarketingRuleTemplate,
  MarketingRuleTemplateInput,
  MarketingRuleTemplateQuery,
  MarketingStrategyInput,
  MarketingEffectObjectType,
  MarketingTriggerOption,
  MarketingTriggerRule,
  CustomerPredictionSnapshot,
  CustomerLifecycleContext,
  CustomerLifecycleQualitySnapshot,
  CustomerLifecycleRuleVersion,
  CustomerOpportunity,
  CustomerOpportunityFulfillmentCheck,
  CustomerServiceCycleState,
  InvitationCandidateResponse,
  LifecycleAttributionEvent,
  LifecycleBusinessPlan,
  PredictionRunSummary,
  UnifiedMarketingEffectItem,
  UnifiedMarketingEffectsResponse,
} from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import type {
  TerminalFollowUpTask,
  TerminalFollowUpTaskBatchCreateResponse,
  TerminalFollowUpTaskCreateRequest,
  TerminalFollowUpTaskListResponse,
  TerminalFollowUpTaskQuery,
  TerminalFollowUpTaskSummary,
} from '@/types/terminal';
import type { MarketingStrategy, StrategyEffectSummary } from '../domain-types';
import apiClient from '../client';

export async function realCreateStrategy(data: { name: string; description: string; executionType: string; executionTime: string }): Promise<MarketingStrategy> {
  return apiClient.post('/marketing/strategies', data);
}

export async function realSaveStrategyDraft(data: { name: string; description: string; executionType: string; executionTime: string }): Promise<MarketingStrategy> {
  return apiClient.post('/marketing/strategies/draft', data);
}

export async function realGetMarketingActivities(): Promise<MarketingActivity[]> {
  const response = await apiClient.get<unknown, MarketingActivity[] | PaginatedResponse<MarketingActivity>>('/marketing/activities');
  return Array.isArray(response) ? response : response.items ?? response.data ?? [];
}

export async function realGetMarketingActivityById(id: number): Promise<MarketingActivity> {
  return apiClient.get(`/marketing/activities/${id}`);
}

export async function realCreateMarketingActivity(
  data: Omit<MarketingActivity, 'id'>,
): Promise<MarketingActivity> {
  return apiClient.post('/marketing/activities', data);
}

export async function realUpdateMarketingActivity(
  id: number,
  data: Partial<MarketingActivity>,
): Promise<MarketingActivity> {
  return apiClient.put(`/marketing/activities/${id}`, data);
}

export async function realGetStrategyEffects(): Promise<StrategyEffectSummary[]> {
  return apiClient.get('/marketing/strategies/effects');
}

export async function realGetAutomationTriggerOptions(): Promise<MarketingTriggerOption[]> {
  return apiClient.get('/marketing/automation/trigger-options');
}

export async function realGetMarketingRuleTemplatesPaginated(
  params: PaginationParams & MarketingRuleTemplateQuery,
): Promise<PaginatedResponse<MarketingRuleTemplate>> {
  const { source, category, scenario, priority, status, ...rest } = params;
  return apiClient.get('/marketing/automation/rule-templates', {
    params: {
      ...rest,
      ...(source && source !== 'all' ? { source } : {}),
      ...(category && category !== 'all' ? { category } : {}),
      ...(scenario && scenario !== 'all' ? { scenario } : {}),
      ...(priority && priority !== 'all' ? { priority } : {}),
      ...(status && status !== 'all' ? { status } : {}),
    },
  });
}

export async function realGetMarketingRuleTemplateById(id: number): Promise<MarketingRuleTemplate> {
  return apiClient.get(`/marketing/automation/rule-templates/${id}`);
}

export async function realCloneMarketingRuleTemplate(
  id: number,
  data: MarketingRuleTemplateInput = {},
): Promise<MarketingRuleTemplate> {
  return apiClient.post(`/marketing/automation/rule-templates/${id}/clone`, data);
}

export async function realCreateMarketingRuleTemplate(data: MarketingRuleTemplateInput): Promise<MarketingRuleTemplate> {
  return apiClient.post('/marketing/automation/rule-templates', data);
}

export async function realUpdateMarketingRuleTemplate(
  id: number,
  data: MarketingRuleTemplateInput,
): Promise<MarketingRuleTemplate> {
  return apiClient.put(`/marketing/automation/rule-templates/${id}`, data);
}

export async function realPreviewMarketingRuleTemplateAudience(id: number): Promise<AudiencePreview> {
  return apiClient.post(`/marketing/automation/rule-templates/${id}/preview-audience`);
}

export async function realEnableMarketingRuleTemplate(
  id: number,
  data: MarketingRuleTemplateInput = {},
): Promise<{ strategy: MarketingAutomationStrategy; preview: AudiencePreview; template: MarketingRuleTemplate }> {
  return apiClient.post(`/marketing/automation/rule-templates/${id}/enable`, data);
}

export async function realDisableMarketingRuleTemplate(id: number): Promise<MarketingRuleTemplate> {
  return apiClient.post(`/marketing/automation/rule-templates/${id}/disable`);
}

export async function realGetMarketingRuleTemplateEffects(id: number): Promise<MarketingRuleEffectSummary> {
  return apiClient.get(`/marketing/automation/rule-templates/${id}/effects`);
}

export async function realBatchCreateMarketingFollowUpTasks(
  recommendationId: number,
  data: TerminalFollowUpTaskCreateRequest,
): Promise<TerminalFollowUpTaskBatchCreateResponse> {
  const idempotencyKey = data.idempotencyKey ?? globalThis.crypto?.randomUUID?.() ?? `marketing-follow-up-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return apiClient.post(`/marketing/recommendations/${recommendationId}/follow-up-tasks`, { ...data, idempotencyKey });
}

export async function realGetMarketingFollowUpTasks(
  params: TerminalFollowUpTaskQuery = {},
): Promise<TerminalFollowUpTaskListResponse> {
  return apiClient.get('/marketing/follow-up-tasks', { params });
}

export async function realGetMarketingFollowUpTaskSummary(): Promise<TerminalFollowUpTaskSummary> {
  return apiClient.get('/marketing/follow-up-tasks/summary');
}

export async function realAssignMarketingFollowUpTask(
  id: number,
  data: Pick<TerminalFollowUpTask, 'assigneeRole' | 'assigneeUserId' | 'assigneeBeauticianId'> & { note?: string },
): Promise<TerminalFollowUpTask> {
  return apiClient.patch(`/marketing/follow-up-tasks/${id}/assign`, data);
}

export async function realCancelMarketingFollowUpTask(id: number, note?: string): Promise<TerminalFollowUpTask> {
  return apiClient.patch(`/marketing/follow-up-tasks/${id}/cancel`, { note });
}

export async function realGetAutomationStrategiesPaginated(
  params: PaginationParams & { keyword?: string; status?: string },
): Promise<PaginatedResponse<MarketingAutomationStrategy>> {
  const { status, ...rest } = params;
  return apiClient.get('/marketing/automation/strategies/paginated', {
    params: {
      ...rest,
      ...(status && status !== 'all' ? { status } : {}),
    },
  });
}

export async function realCreateAutomationStrategy(data: MarketingStrategyInput): Promise<MarketingAutomationStrategy> {
  return apiClient.post('/marketing/automation/strategies', data);
}

export async function realSaveAutomationStrategyDraft(data: MarketingStrategyInput): Promise<MarketingAutomationStrategy> {
  return apiClient.post('/marketing/automation/strategies', { ...data, status: 'draft' });
}

export async function realUpdateAutomationStrategy(id: number, data: MarketingStrategyInput): Promise<MarketingAutomationStrategy> {
  return apiClient.put(`/marketing/automation/strategies/${id}`, data);
}

export async function realEnableAutomationStrategy(id: number): Promise<MarketingAutomationStrategy> {
  return apiClient.post(`/marketing/automation/strategies/${id}/enable`);
}

export async function realPauseAutomationStrategy(id: number): Promise<MarketingAutomationStrategy> {
  return apiClient.post(`/marketing/automation/strategies/${id}/pause`);
}

export async function realDeleteAutomationStrategy(id: number): Promise<void> {
  return apiClient.delete(`/marketing/automation/strategies/${id}`);
}

export async function realPreviewAutomationAudience(
  id: number | 'draft',
  data: { triggerRules: MarketingTriggerRule[]; ruleRelation: MarketingRuleRelation },
): Promise<AudiencePreview> {
  const path = id === 'draft'
    ? '/marketing/automation/strategies/preview-audience'
    : `/marketing/automation/strategies/${id}/preview-audience`;
  return apiClient.post(path, data);
}

export async function realExecuteAutomationStrategy(id: number): Promise<MarketingAutomationExecution> {
  return apiClient.post(`/marketing/automation/strategies/${id}/execute`);
}

export async function realGetAutomationExecutionsPaginated(
  params: PaginationParams & { strategyId?: number },
): Promise<PaginatedResponse<MarketingAutomationExecution>> {
  return apiClient.get('/marketing/automation/executions/paginated', { params });
}

export async function realGetAutomationExecutionById(id: number): Promise<MarketingAutomationExecution> {
  return apiClient.get(`/marketing/automation/executions/${id}`);
}

export async function realGetAutomationEffects(): Promise<MarketingAutomationEffect[]> {
  return apiClient.get('/marketing/automation/effects');
}

export async function realGetUnifiedMarketingEffects(params?: {
  objectType?: 'all' | MarketingEffectObjectType;
  objectId?: number | string;
}): Promise<UnifiedMarketingEffectsResponse> {
  const response = await apiClient.get('/marketing/effects/unified', {
    params: {
      ...(params?.objectType && params.objectType !== 'all' ? { objectType: params.objectType } : {}),
      ...(params?.objectId ? { objectId: params.objectId } : {}),
    },
  }) as unknown as any;
  if (!response?.summary?.revenue || typeof response.summary.revenue !== 'object') {
    return response as UnifiedMarketingEffectsResponse;
  }

  const dimensionMap = {
    activity: response.dimensions?.activities ?? [],
    auto: response.dimensions?.strategies ?? [],
    page: response.dimensions?.pages ?? [],
    promotion: response.dimensions?.promotions ?? [],
    recommendation: response.dimensions?.recommendations ?? [],
    glow: response.dimensions?.channels ?? [],
  } as const;
  const requestedType = params?.objectType && params.objectType !== 'all' ? params.objectType : undefined;
  const entries = requestedType
    ? dimensionMap[requestedType]
    : Object.entries(dimensionMap).flatMap(([objectType, values]) => values.map((value: any) => ({ ...value, objectType })));
  const sourceLabel = (source?: string) => source === 'actual' ? '真实' : source === 'predicted' ? '预测' : '估算';
  const typeLabel: Record<MarketingEffectObjectType, string> = {
    activity: '推广活动', auto: '自动触达', page: '推广页', promotion: '权益资产', recommendation: '智能推荐', glow: 'Ami Glow',
  };
  const items = entries
    .map((entry: any) => {
      const objectType = (requestedType ?? entry.objectType) as MarketingEffectObjectType;
      const exposureCount = Number(entry.exposure?.value ?? 0);
      const conversionCount = Number(entry.conversions?.value ?? 0);
      const revenue = Number(entry.revenue?.value ?? 0);
      const cost = Number(entry.cost?.value ?? 0);
      return {
        id: `${objectType}-${entry.id}`,
        objectId: entry.id,
        objectType,
        objectTypeLabel: typeLabel[objectType],
        objectName: entry.name ?? `${typeLabel[objectType]} #${entry.id}`,
        status: '已记录',
        exposureCount,
        clickCount: Number(entry.clicks?.value ?? 0),
        conversionCount,
        revenue,
        cost,
        roi: `${Number(entry.roi?.value ?? 0)}x`,
        conversionRate: exposureCount > 0 ? `${Math.round((conversionCount / exposureCount) * 1000) / 10}%` : '0%',
        metricsSource: `${sourceLabel(entry.revenue?.source)}收入 / ${sourceLabel(entry.cost?.source)}成本`,
        metrics: {
          exposure: entry.exposure,
          conversion: entry.conversions,
          revenue: entry.revenue,
          cost: entry.cost,
        },
      } as UnifiedMarketingEffectItem;
    })
    .filter((entry: UnifiedMarketingEffectItem) => params?.objectId ? String(entry.objectId) === String(params.objectId) : true);

  return {
    items,
    summary: {
      totalObjects: items.length,
      exposureCount: Number(response.summary.exposure?.value ?? 0),
      clickCount: Number(response.summary.clicks?.value ?? 0),
      conversionCount: Number(response.summary.conversions?.value ?? 0),
      revenue: Number(response.summary.revenue?.value ?? 0),
      cost: Number(response.summary.cost?.value ?? 0),
      roi: `${Number(response.summary.roi?.value ?? 0)}x`,
    },
    metricSummary: response.summary,
    dimensions: response.dimensions,
    emptyReasons: {},
    generatedAt: response.generatedAt,
  };
}

export async function realRunPredictions(): Promise<PredictionRunSummary> {
  return apiClient.post('/marketing/predictions/run', {});
}

export async function realGetLatestPredictionSummary(): Promise<PredictionRunSummary | null> {
  return apiClient.get('/marketing/predictions/latest');
}

export async function realGetPredictionCustomers(
  params: PaginationParams & {
    churnLevel?: string;
    ltvTier?: string;
    minRepurchaseScore?: number;
    minMarketingResponseScore?: number;
  },
): Promise<PaginatedResponse<CustomerPredictionSnapshot>> {
  return apiClient.get('/marketing/predictions/customers', { params });
}

export async function realGetCustomerPrediction(customerId: number): Promise<{
  snapshot: CustomerPredictionSnapshot;
  history: Array<Pick<CustomerPredictionSnapshot, 'id' | 'runId' | 'churnScore' | 'repurchase30dScore' | 'marketingResponseScore' | 'ltv6m' | 'ltv12m' | 'createdAt'>>;
}> {
  return apiClient.get(`/marketing/predictions/customers/${customerId}`);
}

export async function realRebuildCustomerLifecycleOntology(data: {
  predictionRunId?: number;
  includeServiceCycles?: boolean;
  includeFulfillmentChecks?: boolean;
  includeAttribution?: boolean;
} = {}): Promise<{
  rebuilt: boolean;
  reason?: string | null;
  predictionRunId?: number | null;
  snapshotCount: number;
  opportunityCount: number;
  serviceCycleCount?: number;
  fulfillmentCheckCount?: number;
  attributionEventCount?: number;
}> {
  return apiClient.post('/marketing/lifecycle/rebuild', data);
}

export async function realGetCustomerLifecycleOpportunities(
  params: PaginationParams & {
    opportunityType?: string;
    priority?: string;
    status?: string;
    customerId?: number;
    inventoryReady?: boolean;
    capacityReady?: boolean;
    projectId?: number;
    hasAttribution?: boolean;
  },
): Promise<PaginatedResponse<CustomerOpportunity>> {
  return apiClient.get('/marketing/lifecycle/opportunities', { params });
}

export async function realGetCustomerLifecycleContext(customerId: number): Promise<CustomerLifecycleContext | null> {
  return apiClient.get(`/marketing/lifecycle/customers/${customerId}`);
}

export async function realGetCustomerLifecycleServiceCycles(
  params: PaginationParams & {
    customerId?: number;
    projectId?: number;
    dueBefore?: string;
  },
): Promise<PaginatedResponse<CustomerServiceCycleState>> {
  return apiClient.get('/marketing/lifecycle/service-cycles', { params });
}

export async function realGetCustomerLifecycleOpportunityFulfillment(
  opportunityId: number,
): Promise<CustomerOpportunityFulfillmentCheck[]> {
  return apiClient.get(`/marketing/lifecycle/opportunities/${opportunityId}/fulfillment`);
}

export async function realGetCustomerLifecycleAttribution(params?: {
  customerId?: number;
  opportunityId?: number;
  recommendationKey?: string;
  eventType?: string;
}): Promise<LifecycleAttributionEvent[]> {
  return apiClient.get('/marketing/lifecycle/attribution', { params });
}

export async function realGetCustomerLifecycleQuality(): Promise<CustomerLifecycleQualitySnapshot | null> {
  return apiClient.get('/marketing/lifecycle/quality');
}

export async function realGetCustomerLifecycleRules(params?: {
  ruleType?: string;
  status?: string;
}): Promise<CustomerLifecycleRuleVersion[]> {
  return apiClient.get('/marketing/lifecycle/rules', { params });
}

export async function realCreateCustomerLifecycleRule(data: {
  ruleType: string;
  ruleJson: Record<string, unknown>;
  rolloutRatio?: number;
  changeLog?: string;
}): Promise<CustomerLifecycleRuleVersion> {
  return apiClient.post('/marketing/lifecycle/rules', data);
}

export async function realPublishCustomerLifecycleRule(id: number): Promise<CustomerLifecycleRuleVersion> {
  return apiClient.post(`/marketing/lifecycle/rules/${id}/publish`);
}

export async function realRollbackCustomerLifecycleRule(id: number): Promise<CustomerLifecycleRuleVersion> {
  return apiClient.post(`/marketing/lifecycle/rules/${id}/rollback`);
}

export async function realCreateLifecycleBusinessPlan(data: {
  planPeriod?: string;
  title?: string;
  goalsJson?: Record<string, unknown>;
} = {}): Promise<LifecycleBusinessPlan> {
  return apiClient.post('/marketing/lifecycle/business-plans', data);
}

export async function realSubmitLifecycleBusinessPlanActions(id: number): Promise<LifecycleBusinessPlan> {
  return apiClient.post(`/marketing/lifecycle/business-plans/${id}/submit-actions`);
}

export async function realGetInvitationCandidates(params?: {
  limit?: number;
}): Promise<InvitationCandidateResponse> {
  return apiClient.get('/marketing/invitation-candidates', { params });
}

export async function realRecordCustomerBehaviorEvent(data: {
  customerId: number;
  eventType: string;
  targetType?: string;
  targetId?: string | number;
  sessionId?: string;
  metadataJson?: Record<string, unknown>;
  occurredAt?: string;
}): Promise<Record<string, unknown>> {
  return apiClient.post('/marketing/customer-events', data);
}
