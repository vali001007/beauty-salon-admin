import type { BrainCognitionResult } from '../cognition/brain-cognition.service.js';
import type { BrainQuestionIntentResult } from '../cognition/brain-question-intent.service.js';
import type { BrainDomainAdapterKey, BrainDomainRole, BrainRoleIntentPlan } from '../domain/brain-domain-adapter.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type { SendBrainMessageDto } from '../dto/brain-chat.dto.js';

export interface BrainTaskDependency {
  nodeId: string;
  required: boolean;
}

export interface BrainTaskNode {
  id: string;
  role: BrainDomainRole | 'supervisor';
  kind: 'adapter' | 'summary';
  adapterKey?: BrainDomainAdapterKey;
  intent: BrainRoleIntentPlan['intent'];
  answerShape: BrainRoleIntentPlan['answerShape'];
  prompt: string;
  dependencies: BrainTaskDependency[];
  requiredPermissions: string[];
  timeoutMs: number;
  maxRetries: number;
}

export interface BrainTaskPlan {
  planKey: string;
  objective: string;
  reason: string;
  nodes: BrainTaskNode[];
  isComposite: true;
}

export interface BrainTaskResult {
  nodeId: string;
  role: BrainTaskNode['role'];
  status: 'completed' | 'failed' | 'skipped';
  answer?: string;
  citations: Array<{ sourceType: string; sourceId: string; label?: string; definition?: string }>;
  suggestedActions: unknown[];
  latencyMs: number;
  attempts: number;
  error?: string;
}

export interface BrainTaskExecutionInput {
  plan: BrainTaskPlan;
  context: BrainRequestContext;
  dto: SendBrainMessageDto;
  runId: number;
  cognition: BrainCognitionResult;
  runtimeIntent: BrainQuestionIntentResult;
}

export interface BrainTaskExecutionResult {
  status: 'completed' | 'failed';
  answer: string;
  citations: BrainTaskResult['citations'];
  suggestedActions: unknown[];
  results: BrainTaskResult[];
}
