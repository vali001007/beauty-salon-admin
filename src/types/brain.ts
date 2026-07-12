export type BrainRoleKey =
  | 'store_manager'
  | 'receptionist'
  | 'beautician'
  | 'marketing'
  | 'finance'
  | 'inventory'
  | 'customer_service';

export type BrainRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type BrainRunStatus = 'queued' | 'running' | 'needs_confirmation' | 'completed' | 'failed' | 'cancelled';
export type BrainActionDecisionStatus = 'queued' | 'executing' | 'succeeded' | 'failed' | 'expired' | 'rejected';
export type BrainMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface BrainChatRequest {
  conversationId?: number;
  message: string;
  roleHint?: BrainRoleKey;
  timezone: string;
}

export interface BrainCitation {
  sourceType: 'metric' | 'table' | 'memory' | 'skill' | 'prediction' | string;
  sourceId: string;
  label?: string;
  definition?: string;
}

export interface BrainActionPreview {
  actionId: string;
  skillKey?: string;
  actionType?: string;
  riskLevel: BrainRiskLevel;
  summary: string;
  impactItems?: Array<{ objectType: string; objectId: string; label: string }>;
  requiresConfirmation: boolean;
}

export interface BrainConversation {
  id: number;
  storeId: number;
  userId: number;
  title?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface BrainConversationListResponse {
  items: BrainConversation[];
  total: number;
  storeId: number;
}

export interface BrainMessageMetadata {
  requestId?: string;
  timezone?: string;
  roleHint?: BrainRoleKey;
  runId?: number;
  status?: BrainRunStatus;
  citations?: BrainCitation[];
  suggestedActions?: BrainActionPreview[];
  routePlan?: Record<string, unknown>;
  adapterKey?: string;
  grounding?: Record<string, unknown>;
  adapterMetadata?: Record<string, unknown>;
}

export interface BrainMessage {
  id: number;
  conversationId: number;
  role: BrainMessageRole;
  content: string;
  metadata?: BrainMessageMetadata | null;
  createdAt: string;
}

export interface BrainMessageListResponse {
  conversationId: number;
  items: BrainMessage[];
  total: number;
  storeId: number;
}

export interface BrainRunEvent {
  id: number;
  runId: number;
  stepKey: string;
  layer: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  status: string;
  latencyMs?: number | null;
  error?: Record<string, unknown> | null;
  createdAt: string;
}

export interface BrainRunEventsResponse {
  runId: number;
  events: BrainRunEvent[];
  storeId: number;
}

export interface BrainRunContextResponse {
  runId: number;
  conversationId: number;
  status: BrainRunStatus;
  storeId: number;
}

export interface BrainActionDecisionResponse {
  actionId: string;
  runId: number;
  status: BrainActionDecisionStatus;
  storeId: number;
  executionId?: number;
  duplicated?: boolean;
  receipt?: {
    businessObjectType?: string;
    businessObjectId?: string | number;
    message?: string;
    [key: string]: unknown;
  } | null;
  error?: { code?: string; message?: string };
}

export interface BrainFeedbackResponse {
  id?: number;
  runId: number;
  storeId: number;
  rating: string;
  status?: string;
}

export type BrainMemoryType = 'working' | 'session' | 'episodic' | 'semantic' | 'procedural';

export interface BrainMemoryRecord {
  id: number;
  storeId: number;
  userId?: number | null;
  type: BrainMemoryType;
  subjectKey: string;
  content: Record<string, unknown>;
  confidence: number;
  validFrom: string;
  expiresAt?: string | null;
  sourceRunId?: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface BrainMemoryListResponse {
  items: BrainMemoryRecord[];
  total: number;
}

export type BrainStreamEventType = 'run_started' | 'step' | 'answer_delta' | 'action_preview' | 'completed' | 'failed';

export interface BrainStreamEvent {
  type: BrainStreamEventType;
  data: Record<string, unknown>;
}

export interface BrainChatResponse {
  conversationId: number;
  runId: number;
  status: BrainRunStatus;
  answer: string;
  citations: BrainCitation[];
  suggestedActions: BrainActionPreview[];
  clarification?: {
    question: string;
    options: Array<{ id: string; label: string; value: unknown }>;
  };
}
