import apiClient from './client';

export type BrainRoleKey = 'store_manager' | 'receptionist' | 'beautician';

export interface BrainConversation {
  id: number;
}

export interface BrainCitation {
  sourceType: string;
  sourceId: string;
  label?: string;
  definition?: string;
}

export interface BrainActionPreview {
  actionId: string;
  actionType?: string;
  skillKey?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  impactItems?: Array<{ objectType: string; objectId: string; label: string }>;
  requiresConfirmation: boolean;
}

export type BrainActionDecisionStatus =
  | 'pending'
  | 'queued'
  | 'executing'
  | 'succeeded'
  | 'partially_succeeded'
  | 'failed'
  | 'expired'
  | 'rejected';

export interface BrainActionDecisionResponse {
  actionId: string;
  runId: number;
  status: BrainActionDecisionStatus;
  executionId?: number;
  duplicated?: boolean;
  retried?: boolean;
  retryable?: boolean;
  recovery?: 'safe_replay' | 'manual_reconcile';
  receipt?: { message?: string; [key: string]: unknown } | null;
  error?: { code?: string; message?: string };
}

export interface BrainGuidanceSelection {
  kind: 'clarification' | 'follow_up';
  sourceRunId: number;
  optionId: string;
}

export type BrainResponseBlock =
  | { kind: 'text'; text: string; citationIds?: string[] }
  | { kind: 'kpi'; items: Array<{ label: string; value: string; hint?: string }>; citationIds?: string[] }
  | { kind: 'ranking' | 'table'; rows: Array<Record<string, unknown>>; columns: string[]; citationIds?: string[] }
  | { kind: 'chart'; chartType: 'bar' | 'line'; rows: Array<Record<string, unknown>>; xKey: string; yKeys: string[]; citationIds?: string[] }
  | { kind: 'comparison'; items: Array<{ label: string; current: string; previous: string; delta?: string }>; citationIds?: string[] }
  | { kind: 'diagnosis'; findings: Array<{ title: string; detail: string; severity: 'info' | 'warning' | 'critical' }>; citationIds?: string[] }
  | { kind: 'clarification'; question: string; options: Array<{ id: string; label: string; value: unknown }> }
  | { kind: 'follow_up_questions'; questions: Array<{ id: string; label: string; value: string }> }
  | { kind: 'action_preview'; actions: BrainActionPreview[] }
  | { kind: 'limitations'; items: string[] }
  | { kind: 'evidence'; citations: BrainCitation[] };

export interface BrainChatResponse {
  conversationId: number;
  runId: number;
  status: 'queued' | 'running' | 'needs_confirmation' | 'completed' | 'failed' | 'cancelled';
  answer: string;
  citations: BrainCitation[];
  suggestedActions: BrainActionPreview[];
  blocks?: BrainResponseBlock[];
  productProfile?: string | null;
  actionsEnabled?: boolean;
  actionExecutionPolicy?: string | null;
  allowedCapabilityManifest?: string | null;
  productProfileFingerprint?: string | null;
  clarification?: { question: string; options: Array<{ id: string; label: string; value: unknown }> };
}

export function createBrainConversation(title: string): Promise<BrainConversation> {
  return apiClient.post('/brain/conversations', { title });
}

export function sendBrainMessage(
  conversationId: number,
  payload: { message: string; roleHint: BrainRoleKey; timezone: string; guidanceSelection?: BrainGuidanceSelection },
): Promise<BrainChatResponse> {
  return apiClient.post(`/brain/conversations/${conversationId}/messages`, payload);
}

export function confirmBrainAction(actionId: string, runId: number): Promise<BrainActionDecisionResponse> {
  return apiClient.post(`/brain/actions/${encodeURIComponent(actionId)}/confirm`, { actionId, runId });
}

export function rejectBrainAction(actionId: string, runId: number): Promise<BrainActionDecisionResponse> {
  return apiClient.post(`/brain/actions/${encodeURIComponent(actionId)}/reject`, { actionId, runId });
}
