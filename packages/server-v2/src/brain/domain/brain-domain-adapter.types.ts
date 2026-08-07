import type { BrainCognitionResult } from '../cognition/brain-cognition.service.js';
import type {
  BrainQuestionIntentResult,
  BrainRuntimeQuestionIntent,
  BrainRuntimeAnswerShape,
} from '../cognition/brain-question-intent.service.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type { SendBrainMessageDto } from '../dto/brain-chat.dto.js';
import type { BrainResponseBlock } from '../response/brain-response.types.js';
import type { BrainActionExecutionProvenance } from '../cognition/brain-action-execution-provenance.types.js';
import type {
  BrainDefinitionRef,
  BrainSemanticActionModality,
  BrainSemanticActionSlot,
} from '../cognition/brain-semantic-intent.types.js';

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
  capabilityKey?: string;
  capabilityVersion?: number;
  executionPlanId?: string;
  actionProvenance?: BrainActionExecutionProvenance;
  actionRef?: BrainDefinitionRef<'action'>;
  actionModality?: BrainSemanticActionModality;
  actionSlots?: readonly BrainSemanticActionSlot[];
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
  citations: Array<{
    sourceType: string;
    sourceId: string;
    label?: string;
    definition?: string;
    timeRange?: string;
    filters?: string[];
    metrics?: string[];
    formula?: {
      key?: string;
      version?: string;
      expression?: string;
      inputs?: Record<string, unknown>;
      computedValues?: Record<string, unknown>;
      calculationSteps?: string[];
    };
    sampleRows?: Array<Record<string, unknown>>;
    limitations?: string[];
  }>;
  suggestedActions?: unknown[];
  grounding: BrainDomainGrounding;
  blocks?: BrainResponseBlock[];
  metadata?: Record<string, unknown>;
}

export type BrainDomainAnswerBlock = BrainResponseBlock;

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
