import apiClient from './client';

export type BrainRoleKey = 'store_manager' | 'receptionist' | 'beautician';

export interface BrainConversation {
  id: number;
}

export interface BrainChatResponse {
  conversationId: number;
  runId: number;
  status: 'queued' | 'running' | 'needs_confirmation' | 'completed' | 'failed' | 'cancelled';
  answer: string;
  citations: Array<{ sourceType: string; sourceId: string; label?: string; definition?: string }>;
  suggestedActions: Array<{
    actionId: string;
    actionType?: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
    requiresConfirmation: boolean;
  }>;
  clarification?: { question: string; options: Array<{ id: string; label: string; value: unknown }> };
}

export function createBrainConversation(title: string): Promise<BrainConversation> {
  return apiClient.post('/brain/conversations', { title });
}

export function sendBrainMessage(
  conversationId: number,
  payload: { message: string; roleHint: BrainRoleKey; timezone: string },
): Promise<BrainChatResponse> {
  return apiClient.post(`/brain/conversations/${conversationId}/messages`, payload);
}
