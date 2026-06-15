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
  InvitationCandidateResponse,
  PredictionRunSummary,
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
  return apiClient.post(`/marketing/recommendations/${recommendationId}/follow-up-tasks`, data);
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
  storeId?: number;
}): Promise<UnifiedMarketingEffectsResponse> {
  return apiClient.get('/marketing/effects/unified', {
    params: {
      ...(params?.objectType && params.objectType !== 'all' ? { objectType: params.objectType } : {}),
      ...(params?.storeId ? { storeId: params.storeId } : {}),
    },
  });
}

export async function realRunPredictions(storeId?: number): Promise<PredictionRunSummary> {
  return apiClient.post('/marketing/predictions/run', storeId ? { storeId } : {});
}

export async function realGetLatestPredictionSummary(storeId?: number): Promise<PredictionRunSummary | null> {
  return apiClient.get('/marketing/predictions/latest', { params: storeId ? { storeId } : undefined });
}

export async function realGetPredictionCustomers(
  params: PaginationParams & {
    storeId?: number;
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

export async function realGetInvitationCandidates(params?: {
  storeId?: number;
  limit?: number;
}): Promise<InvitationCandidateResponse> {
  return apiClient.get('/marketing/invitation-candidates', { params });
}

export async function realRecordCustomerBehaviorEvent(data: {
  storeId: number;
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
