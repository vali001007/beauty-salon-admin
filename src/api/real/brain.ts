import type { BrainChatRequest, BrainChatResponse } from '@/types/brain';
import apiClient from '../client';

export async function createBrainConversation(title?: string) {
  return apiClient.post('/brain/conversations', { title });
}

export async function listBrainConversations() {
  return apiClient.get('/brain/conversations');
}

export async function listBrainMessages(conversationId: number) {
  return apiClient.get(`/brain/conversations/${conversationId}/messages`);
}

export async function sendBrainMessage(conversationId: number, payload: BrainChatRequest): Promise<BrainChatResponse> {
  return apiClient.post(`/brain/conversations/${conversationId}/messages`, payload);
}

export async function getBrainRunEvents(runId: number) {
  return apiClient.get(`/brain/runs/${runId}/events`);
}

export async function confirmBrainAction(actionId: string, runId: number) {
  return apiClient.post(`/brain/actions/${actionId}/confirm`, { actionId, runId });
}

export async function rejectBrainAction(actionId: string, runId: number) {
  return apiClient.post(`/brain/actions/${actionId}/reject`, { actionId, runId });
}

export async function listBrainTraces() {
  return apiClient.get('/brain/governance/traces');
}

export async function getBrainTrace(runId: number) {
  return apiClient.get(`/brain/governance/traces/${runId}`);
}

export async function listBrainSemanticResource(resource: 'metrics' | 'entities' | 'relations' | string) {
  return apiClient.get(`/brain/governance/semantic/${resource}`);
}

export async function createBrainSemanticResource(resource: string, payload: Record<string, unknown>) {
  return apiClient.post(`/brain/governance/semantic/${resource}`, payload);
}

export async function updateBrainSemanticResource(resource: string, key: string, payload: Record<string, unknown>) {
  return apiClient.patch(`/brain/governance/semantic/${resource}/${key}`, payload);
}

export async function listBrainRoleProfiles() {
  return apiClient.get('/brain/governance/roles');
}

export async function createBrainRoleProfile(payload: Record<string, unknown>) {
  return apiClient.post('/brain/governance/roles', payload);
}

export async function updateBrainRoleProfile(roleKey: string, payload: Record<string, unknown>) {
  return apiClient.patch(`/brain/governance/roles/${roleKey}`, payload);
}

export async function listBrainSkills() {
  return apiClient.get('/brain/governance/skills');
}

export async function createBrainSkill(payload: Record<string, unknown>) {
  return apiClient.post('/brain/governance/skills', payload);
}

export async function updateBrainSkill(skillKey: string, payload: Record<string, unknown>) {
  return apiClient.patch(`/brain/governance/skills/${skillKey}`, payload);
}

export async function listBrainInspectionRules() {
  return apiClient.get('/brain/governance/inspection-rules');
}

export async function createBrainInspectionRule(payload: Record<string, unknown>) {
  return apiClient.post('/brain/governance/inspection-rules', payload);
}

export async function updateBrainInspectionRule(ruleKey: string, payload: Record<string, unknown>) {
  return apiClient.patch(`/brain/governance/inspection-rules/${ruleKey}`, payload);
}

export async function createBrainEvalRun(payload: { releaseId?: string; caseKeys?: string[] }) {
  return apiClient.post('/brain/governance/evals/runs', payload);
}

export async function createBrainRelease(payload: Record<string, unknown>) {
  return apiClient.post('/brain/governance/releases', payload);
}

export async function createBrainFeedback(payload: { runId: number; rating: string; correction?: Record<string, unknown> }) {
  return apiClient.post('/brain/feedback', payload);
}
