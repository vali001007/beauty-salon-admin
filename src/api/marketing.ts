import type { MarketingActivity } from '@/types';
import type {
  AudiencePreview,
  MarketingAutomationEffect,
  MarketingAutomationExecution,
  MarketingAutomationStrategy,
  MarketingRuleRelation,
  MarketingStrategyInput,
  MarketingTriggerOption,
  MarketingTriggerRule,
  CustomerPredictionSnapshot,
  PredictionRunSummary,
} from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import type { MarketingStrategy, StrategyEffectSummary } from './domain-types';
import {
  realCreateAutomationStrategy,
  realCreateMarketingActivity,
  realCreateStrategy,
  realDeleteAutomationStrategy,
  realEnableAutomationStrategy,
  realExecuteAutomationStrategy,
  realGetAutomationEffects,
  realGetAutomationExecutionById,
  realGetAutomationExecutionsPaginated,
  realGetAutomationStrategiesPaginated,
  realGetAutomationTriggerOptions,
  realGetCustomerPrediction,
  realGetLatestPredictionSummary,
  realGetMarketingActivities,
  realGetPredictionCustomers,
  realGetStrategyEffects,
  realPauseAutomationStrategy,
  realPreviewAutomationAudience,
  realRecordCustomerBehaviorEvent,
  realSaveAutomationStrategyDraft,
  realSaveStrategyDraft,
  realUpdateAutomationStrategy,
  realUpdateMarketingActivity,
  realRunPredictions,
} from './real/marketing';

export type { MarketingStrategy, StrategyEffectSummary };

export const getMarketingActivities: () => Promise<MarketingActivity[]> =
  realGetMarketingActivities;

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
