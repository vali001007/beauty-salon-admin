import type { MarketingActivity } from '@/types';
import type {
  AudiencePreview,
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
import type { MarketingStrategy, StrategyEffectSummary } from './domain-types';
import {
  realAssignMarketingFollowUpTask,
  realBatchCreateMarketingFollowUpTasks,
  realCancelMarketingFollowUpTask,
  realCreateAutomationStrategy,
  realCloneMarketingRuleTemplate,
  realCreateMarketingRuleTemplate,
  realCreateMarketingActivity,
  realCreateStrategy,
  realDisableMarketingRuleTemplate,
  realEnableMarketingRuleTemplate,
  realDeleteAutomationStrategy,
  realEnableAutomationStrategy,
  realExecuteAutomationStrategy,
  realGetAutomationEffects,
  realGetAutomationExecutionById,
  realGetAutomationExecutionsPaginated,
  realGetAutomationStrategiesPaginated,
  realGetAutomationTriggerOptions,
  realGetUnifiedMarketingEffects,
  realGetCustomerPrediction,
  realCreateCustomerLifecycleRule,
  realCreateLifecycleBusinessPlan,
  realGetCustomerLifecycleAttribution,
  realGetCustomerLifecycleContext,
  realGetCustomerLifecycleOpportunities,
  realGetCustomerLifecycleOpportunityFulfillment,
  realGetCustomerLifecycleQuality,
  realGetCustomerLifecycleRules,
  realGetCustomerLifecycleServiceCycles,
  realGetInvitationCandidates,
  realGetLatestPredictionSummary,
  realGetMarketingActivities,
  realGetMarketingActivityById,
  realGetMarketingRuleTemplateById,
  realGetMarketingRuleTemplateEffects,
  realGetMarketingRuleTemplatesPaginated,
  realGetMarketingFollowUpTasks,
  realGetMarketingFollowUpTaskSummary,
  realGetPredictionCustomers,
  realGetStrategyEffects,
  realPauseAutomationStrategy,
  realPreviewMarketingRuleTemplateAudience,
  realPreviewAutomationAudience,
  realRecordCustomerBehaviorEvent,
  realPublishCustomerLifecycleRule,
  realRollbackCustomerLifecycleRule,
  realSaveAutomationStrategyDraft,
  realSaveStrategyDraft,
  realUpdateAutomationStrategy,
  realUpdateMarketingActivity,
  realUpdateMarketingRuleTemplate,
  realRunPredictions,
  realRebuildCustomerLifecycleOntology,
  realSubmitLifecycleBusinessPlanActions,
} from './real/marketing';

export type { MarketingStrategy, StrategyEffectSummary };

export const getMarketingActivities: () => Promise<MarketingActivity[]> =
  realGetMarketingActivities;

export const getMarketingActivityById: (id: number) => Promise<MarketingActivity> =
  realGetMarketingActivityById;

export const createMarketingActivity: (data: Omit<MarketingActivity, 'id'>) => Promise<MarketingActivity> =
  realCreateMarketingActivity;

export const updateMarketingActivity: (id: number, data: Partial<MarketingActivity>) => Promise<MarketingActivity> =
  realUpdateMarketingActivity;

export const createStrategy: (data: { name: string; description: string; executionType: string; executionTime: string }) => Promise<MarketingStrategy> =
  realCreateStrategy;

export const saveStrategyDraft: (data: { name: string; description: string; executionType: string; executionTime: string }) => Promise<MarketingStrategy> =
  realSaveStrategyDraft;

export const getStrategyEffects: () => Promise<StrategyEffectSummary[]> =
  realGetStrategyEffects;

export const getAutomationTriggerOptions: () => Promise<MarketingTriggerOption[]> =
  realGetAutomationTriggerOptions;

export const getMarketingRuleTemplatesPaginated: (
  params: PaginationParams & MarketingRuleTemplateQuery,
) => Promise<PaginatedResponse<MarketingRuleTemplate>> =
  realGetMarketingRuleTemplatesPaginated;

export const getMarketingRuleTemplateById: (id: number) => Promise<MarketingRuleTemplate> =
  realGetMarketingRuleTemplateById;

export const cloneMarketingRuleTemplate: (
  id: number,
  data?: MarketingRuleTemplateInput,
) => Promise<MarketingRuleTemplate> =
  realCloneMarketingRuleTemplate;

export const createMarketingRuleTemplate: (data: MarketingRuleTemplateInput) => Promise<MarketingRuleTemplate> =
  realCreateMarketingRuleTemplate;

export const updateMarketingRuleTemplate: (
  id: number,
  data: MarketingRuleTemplateInput,
) => Promise<MarketingRuleTemplate> =
  realUpdateMarketingRuleTemplate;

export const previewMarketingRuleTemplateAudience: (id: number) => Promise<AudiencePreview> =
  realPreviewMarketingRuleTemplateAudience;

export const enableMarketingRuleTemplate: (
  id: number,
  data?: MarketingRuleTemplateInput,
) => Promise<{ strategy: MarketingAutomationStrategy; preview: AudiencePreview; template: MarketingRuleTemplate }> =
  realEnableMarketingRuleTemplate;

export const disableMarketingRuleTemplate: (id: number) => Promise<MarketingRuleTemplate> =
  realDisableMarketingRuleTemplate;

export const getMarketingRuleTemplateEffects: (id: number) => Promise<MarketingRuleEffectSummary> =
  realGetMarketingRuleTemplateEffects;

export const batchCreateMarketingFollowUpTasks: (
  recommendationId: number,
  data: TerminalFollowUpTaskCreateRequest,
) => Promise<TerminalFollowUpTaskBatchCreateResponse> =
  realBatchCreateMarketingFollowUpTasks;

export const getMarketingFollowUpTasks: (
  params?: TerminalFollowUpTaskQuery,
) => Promise<TerminalFollowUpTaskListResponse> =
  realGetMarketingFollowUpTasks;

export const getMarketingFollowUpTaskSummary: () => Promise<TerminalFollowUpTaskSummary> =
  realGetMarketingFollowUpTaskSummary;

export const assignMarketingFollowUpTask: (
  id: number,
  data: Pick<TerminalFollowUpTask, 'assigneeRole' | 'assigneeUserId' | 'assigneeBeauticianId'> & { note?: string },
) => Promise<TerminalFollowUpTask> =
  realAssignMarketingFollowUpTask;

export const cancelMarketingFollowUpTask: (id: number, note?: string) => Promise<TerminalFollowUpTask> =
  realCancelMarketingFollowUpTask;

export const getAutomationStrategiesPaginated: (
  params: PaginationParams & { keyword?: string; status?: string },
) => Promise<PaginatedResponse<MarketingAutomationStrategy>> =
  realGetAutomationStrategiesPaginated;

export const createAutomationStrategy: (data: MarketingStrategyInput) => Promise<MarketingAutomationStrategy> =
  realCreateAutomationStrategy;

export const saveAutomationStrategyDraft: (data: MarketingStrategyInput) => Promise<MarketingAutomationStrategy> =
  realSaveAutomationStrategyDraft;

export const updateAutomationStrategy: (id: number, data: MarketingStrategyInput) => Promise<MarketingAutomationStrategy> =
  realUpdateAutomationStrategy;

export const enableAutomationStrategy: (id: number) => Promise<MarketingAutomationStrategy> =
  realEnableAutomationStrategy;

export const pauseAutomationStrategy: (id: number) => Promise<MarketingAutomationStrategy> =
  realPauseAutomationStrategy;

export const deleteAutomationStrategy: (id: number) => Promise<void> =
  realDeleteAutomationStrategy;

export const previewAutomationAudience: (
  id: number | 'draft',
  data: { triggerRules: MarketingTriggerRule[]; ruleRelation: MarketingRuleRelation },
) => Promise<AudiencePreview> =
  realPreviewAutomationAudience;

export const executeAutomationStrategy: (id: number) => Promise<MarketingAutomationExecution> =
  realExecuteAutomationStrategy;

export const getAutomationExecutionsPaginated: (
  params: PaginationParams & { strategyId?: number },
) => Promise<PaginatedResponse<MarketingAutomationExecution>> =
  realGetAutomationExecutionsPaginated;

export const getAutomationExecutionById: (id: number) => Promise<MarketingAutomationExecution | undefined> =
  realGetAutomationExecutionById;

export const getAutomationEffects: () => Promise<MarketingAutomationEffect[]> =
  realGetAutomationEffects;

export const getUnifiedMarketingEffects: (params?: {
  objectType?: 'all' | MarketingEffectObjectType;
  objectId?: number | string;
  storeId?: number;
}) => Promise<UnifiedMarketingEffectsResponse> =
  realGetUnifiedMarketingEffects;

export const runPredictions: (storeId?: number) => Promise<PredictionRunSummary> =
  realRunPredictions;

export const getLatestPredictionSummary: (storeId?: number) => Promise<PredictionRunSummary | null> =
  realGetLatestPredictionSummary;

export const getPredictionCustomers: (
  params: PaginationParams & {
    storeId?: number;
    churnLevel?: string;
    ltvTier?: string;
    minRepurchaseScore?: number;
    minMarketingResponseScore?: number;
  },
) => Promise<PaginatedResponse<CustomerPredictionSnapshot>> =
  realGetPredictionCustomers;

export const getCustomerPrediction: (customerId: number) => Promise<{
  snapshot: CustomerPredictionSnapshot;
  history: Array<Pick<CustomerPredictionSnapshot, 'id' | 'runId' | 'churnScore' | 'repurchase30dScore' | 'marketingResponseScore' | 'ltv6m' | 'ltv12m' | 'createdAt'>>;
}> =
  realGetCustomerPrediction;

export const rebuildCustomerLifecycleOntology: (data?: {
  storeId?: number;
  predictionRunId?: number;
  includeServiceCycles?: boolean;
  includeFulfillmentChecks?: boolean;
  includeAttribution?: boolean;
}) => Promise<{
  rebuilt: boolean;
  reason?: string | null;
  predictionRunId?: number | null;
  snapshotCount: number;
  opportunityCount: number;
  serviceCycleCount?: number;
  fulfillmentCheckCount?: number;
  attributionEventCount?: number;
}> =
  realRebuildCustomerLifecycleOntology;

export const getCustomerLifecycleOpportunities: (
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
) => Promise<PaginatedResponse<CustomerOpportunity>> =
  realGetCustomerLifecycleOpportunities;

export const getCustomerLifecycleContext: (customerId: number) => Promise<CustomerLifecycleContext | null> =
  realGetCustomerLifecycleContext;

export const getCustomerLifecycleServiceCycles: (
  params: PaginationParams & {
    customerId?: number;
    projectId?: number;
    dueBefore?: string;
  },
) => Promise<PaginatedResponse<CustomerServiceCycleState>> =
  realGetCustomerLifecycleServiceCycles;

export const getCustomerLifecycleOpportunityFulfillment: (
  opportunityId: number,
) => Promise<CustomerOpportunityFulfillmentCheck[]> =
  realGetCustomerLifecycleOpportunityFulfillment;

export const getCustomerLifecycleAttribution: (params?: {
  customerId?: number;
  opportunityId?: number;
  recommendationKey?: string;
  eventType?: string;
}) => Promise<LifecycleAttributionEvent[]> =
  realGetCustomerLifecycleAttribution;

export const getCustomerLifecycleQuality: (storeId?: number) => Promise<CustomerLifecycleQualitySnapshot | null> =
  realGetCustomerLifecycleQuality;

export const getCustomerLifecycleRules: (params?: {
  ruleType?: string;
  status?: string;
}) => Promise<CustomerLifecycleRuleVersion[]> =
  realGetCustomerLifecycleRules;

export const createCustomerLifecycleRule: (data: {
  ruleType: string;
  ruleJson: Record<string, unknown>;
  rolloutRatio?: number;
  changeLog?: string;
  storeId?: number;
}) => Promise<CustomerLifecycleRuleVersion> =
  realCreateCustomerLifecycleRule;

export const publishCustomerLifecycleRule: (id: number) => Promise<CustomerLifecycleRuleVersion> =
  realPublishCustomerLifecycleRule;

export const rollbackCustomerLifecycleRule: (id: number) => Promise<CustomerLifecycleRuleVersion> =
  realRollbackCustomerLifecycleRule;

export const createLifecycleBusinessPlan: (data?: {
  storeId?: number;
  planPeriod?: string;
  title?: string;
  goalsJson?: Record<string, unknown>;
}) => Promise<LifecycleBusinessPlan> =
  realCreateLifecycleBusinessPlan;

export const submitLifecycleBusinessPlanActions: (id: number) => Promise<LifecycleBusinessPlan> =
  realSubmitLifecycleBusinessPlanActions;

export const getInvitationCandidates: (params?: {
  storeId?: number;
  limit?: number;
}) => Promise<InvitationCandidateResponse> =
  realGetInvitationCandidates;

export const recordCustomerBehaviorEvent: (data: {
  storeId: number;
  customerId: number;
  eventType: string;
  targetType?: string;
  targetId?: string | number;
  sessionId?: string;
  metadataJson?: Record<string, unknown>;
  occurredAt?: string;
}) => Promise<Record<string, unknown>> =
  realRecordCustomerBehaviorEvent;
