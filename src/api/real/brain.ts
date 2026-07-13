import type {
  BrainActionDecisionResponse,
  BrainChatRequest,
  BrainChatResponse,
  BrainConversation,
  BrainConversationListResponse,
  BrainFeedbackResponse,
  BrainMessageListResponse,
  BrainMemoryListResponse,
  BrainMemoryRecord,
  BrainRunEventsResponse,
  BrainRunContextResponse,
  BrainStreamEvent,
} from '@/types/brain';
import apiClient from '../client';
import { useStoreStore } from '@/stores/storeStore';

export async function createBrainConversation(title?: string): Promise<BrainConversation> {
  return apiClient.post<unknown, BrainConversation>('/brain/conversations', { title });
}

export async function listBrainConversations(): Promise<BrainConversationListResponse> {
  return apiClient.get<unknown, BrainConversationListResponse>('/brain/conversations');
}

export async function listBrainMessages(conversationId: number): Promise<BrainMessageListResponse> {
  return apiClient.get<unknown, BrainMessageListResponse>(`/brain/conversations/${conversationId}/messages`);
}

export async function sendBrainMessage(conversationId: number, payload: BrainChatRequest): Promise<BrainChatResponse> {
  return apiClient.post<unknown, BrainChatResponse>(`/brain/conversations/${conversationId}/messages`, payload);
}

function readCsrfToken() {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function streamRequestHeaders() {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    'X-CSRF-Token': readCsrfToken(),
    'X-Request-Id': `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
  };
  const token = localStorage.getItem('token');
  const storeId = useStoreStore.getState().currentStoreId;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (storeId != null) headers['X-Store-Id'] = String(storeId);
  return headers;
}

export async function streamBrainMessage(
  conversationId: number,
  payload: BrainChatRequest,
  onEvent: (event: BrainStreamEvent) => void,
): Promise<BrainChatResponse> {
  const baseURL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
  const response = await fetch(`${baseURL}/brain/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: streamRequestHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || `流式请求失败 (${response.status})`);
  }
  if (!response.body) throw new Error('当前浏览器不支持流式响应');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: BrainChatResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const lines = frame.split('\n');
      const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
      const dataText = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      if (!eventName || !dataText) continue;
      const data = JSON.parse(dataText) as Record<string, unknown>;
      const event = { type: eventName, data } as BrainStreamEvent;
      onEvent(event);
      if (event.type === 'completed') completed = data as unknown as BrainChatResponse;
      if (event.type === 'failed') throw new Error(String(data.message || 'Ami Brain 回答失败'));
    }

    if (done) break;
  }

  if (!completed) throw new Error('流式响应未返回完成事件');
  return completed;
}

export async function getBrainRunEvents(runId: number): Promise<BrainRunEventsResponse> {
  return apiClient.get<unknown, BrainRunEventsResponse>(`/brain/runs/${runId}/events`);
}

export async function getBrainRunContext(runId: number): Promise<BrainRunContextResponse> {
  return apiClient.get<unknown, BrainRunContextResponse>(`/brain/runs/${runId}/context`);
}

export async function confirmBrainAction(actionId: string, runId: number): Promise<BrainActionDecisionResponse> {
  return apiClient.post<unknown, BrainActionDecisionResponse>(`/brain/actions/${actionId}/confirm`, { actionId, runId });
}

export async function rejectBrainAction(actionId: string, runId: number): Promise<BrainActionDecisionResponse> {
  return apiClient.post<unknown, BrainActionDecisionResponse>(`/brain/actions/${actionId}/reject`, { actionId, runId });
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

export async function listBrainResourceVersions(params?: { resourceType?: string; status?: string }) {
  return apiClient.get('/brain/governance/resource-versions', { params });
}

export async function changeBrainResourceVersionStatus(id: number, status: 'draft' | 'active' | 'disabled' | 'archived') {
  return apiClient.patch(`/brain/governance/resource-versions/${id}/status`, { status });
}

export async function runBrainInspection() {
  return apiClient.post('/brain/inspections/runs', {});
}

export async function listBrainInspectionFindings(status?: string) {
  return apiClient.get('/brain/inspections/findings', { params: status ? { status } : undefined });
}

export async function updateBrainInspectionFinding(
  findingId: number,
  payload: { disposition: 'adopted' | 'ignored' | 'false_positive'; note?: string },
) {
  return apiClient.patch(`/brain/inspections/findings/${findingId}`, payload);
}

export async function createBrainEvalRun(payload: { releaseId?: number; caseKeys?: string[]; roleKey?: string; modelVersion?: string }) {
  return apiClient.post('/brain/governance/evals/runs', payload);
}

export async function listBrainEvalRuns() {
  return apiClient.get('/brain/governance/evals/runs');
}

export async function getBrainEvalRun(evalRunId: number) {
  return apiClient.get(`/brain/governance/evals/runs/${evalRunId}`);
}

export async function createBrainRelease(payload: Record<string, unknown>) {
  return apiClient.post('/brain/governance/releases', payload);
}

export async function listBrainReleases() {
  return apiClient.get('/brain/governance/releases');
}

export async function activateBrainRelease(releaseId: number) {
  return apiClient.post(`/brain/governance/releases/${releaseId}/activate`, {});
}

export async function rollbackBrainRelease(releaseId: number, reason: string) {
  return apiClient.post(`/brain/governance/releases/${releaseId}/rollback`, { reason });
}

export async function listBrainFeedback() {
  return apiClient.get('/brain/governance/feedback');
}

export async function getBrainGovernanceDashboard() {
  return apiClient.get('/brain/governance/dashboard');
}

export async function createBrainFeedback(payload: {
  runId: number;
  rating: string;
  correction?: Record<string, unknown>;
}): Promise<BrainFeedbackResponse> {
  return apiClient.post<unknown, BrainFeedbackResponse>('/brain/feedback', payload);
}

export async function listBrainMemories(): Promise<BrainMemoryListResponse> {
  return apiClient.get<unknown, BrainMemoryListResponse>('/brain/governance/memories');
}

export async function correctBrainMemory(
  id: number,
  payload: { content: Record<string, unknown>; reason?: string },
): Promise<BrainMemoryRecord> {
  return apiClient.post<unknown, BrainMemoryRecord>(`/brain/governance/memories/${id}/correct`, payload);
}

export async function deleteBrainMemory(id: number, reason?: string): Promise<BrainMemoryRecord> {
  return apiClient.post<unknown, BrainMemoryRecord>(`/brain/governance/memories/${id}/delete`, { reason });
}

export async function restoreBrainMemory(id: number): Promise<BrainMemoryRecord> {
  return apiClient.post<unknown, BrainMemoryRecord>(`/brain/governance/memories/${id}/restore`, {});
}
