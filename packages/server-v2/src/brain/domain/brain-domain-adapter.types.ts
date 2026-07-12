import type { BrainCognitionResult } from '../cognition/brain-cognition.service.js';
import type { BrainQuestionIntentResult, BrainRuntimeQuestionIntent, BrainRuntimeAnswerShape } from '../cognition/brain-question-intent.service.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type { SendBrainMessageDto } from '../dto/brain-chat.dto.js';

export type BrainDomainRole =
  | 'store_manager'
  | 'receptionist'
  | 'marketing'
  | 'beautician'
  | 'inventory'
  | 'finance'
  | 'customer_service';

export type BrainDomainAdapterKey =
  | 'store_manager'
  | 'front_desk'
  | 'marketing_growth'
  | 'beautician_service'
  | 'inventory_procurement'
  | 'finance_risk'
  | 'customer_service';

export type BrainDomainGrounding = 'metric_query' | 'db_skill' | 'template_skill' | 'preview_action' | 'none';

export interface BrainRoleIntentPlan {
  role: BrainDomainRole;
  domain:
    | 'store_operation'
    | 'front_desk'
    | 'marketing_growth'
    | 'beautician_service'
    | 'inventory_procurement'
    | 'finance_risk'
    | 'customer_service'
    | 'semantic_metric';
  intent: BrainRuntimeQuestionIntent;
  answerShape: BrainRuntimeAnswerShape;
  adapterKey?: BrainDomainAdapterKey;
  expectedMetric?: string;
  requiredPermissions: string[];
  confidence: number;
  grounding: BrainDomainGrounding;
  unsupportedReason?: string;
  reason: string;
}

export interface BrainDomainAnswer {
  status: 'completed' | 'failed';
  answer: string;
  citations: Array<{ sourceType: string; sourceId: string; label?: string; definition?: string }>;
  suggestedActions?: unknown[];
  grounding: BrainDomainGrounding;
  metadata?: Record<string, unknown>;
}

export interface BrainDomainAdapterExecution {
  context: BrainRequestContext;
  dto: SendBrainMessageDto;
  runId: number;
  cognition: BrainCognitionResult;
  runtimeIntent: BrainQuestionIntentResult;
  plan: BrainRoleIntentPlan;
}

export interface BrainDomainAdapter {
  key: BrainDomainAdapterKey;
  role: BrainDomainRole;
  requiredPermissions: string[];
  canHandle(plan: BrainRoleIntentPlan): boolean;
  execute(input: BrainDomainAdapterExecution): Promise<BrainDomainAnswer | undefined>;
}
