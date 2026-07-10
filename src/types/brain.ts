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

export interface BrainChatRequest {
  conversationId?: number;
  message: string;
  roleHint?: BrainRoleKey;
  timezone: string;
}

export interface BrainCitation {
  sourceType: 'metric' | 'table' | 'memory' | 'skill' | 'prediction';
  sourceId: string;
  label: string;
  definition: string;
}

export interface BrainActionPreview {
  actionId: string;
  skillKey: string;
  riskLevel: BrainRiskLevel;
  summary: string;
  impactItems: Array<{ objectType: string; objectId: string; label: string }>;
  requiresConfirmation: boolean;
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
