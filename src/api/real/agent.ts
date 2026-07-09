import apiClient from '../client';
import type { AxiosRequestConfig } from 'axios';
import { createAgentApi } from '@ami/agent-core';
import type {
  AgentBusinessTaskCompileResult,
  AgentCompileBusinessTaskRequest,
  AgentApprovalDecisionRequest,
  AgentApprovalListItem,
  AgentApprovalListQuery,
  AgentAppendMessageRequest,
  AmiAiAuditRequest,
  AmiAiAuditResult,
  AgentAutomationDefinitionItem,
  AgentAutomationDraftRequest,
  AgentAutomationDueRunResult,
  AgentAutomationEffectItem,
  AgentAutomationEventEvaluateResult,
  AgentAutomationRunItem,
  AgentAutomationRunResult,
  AgentAutomationTriggerTemplate,
  AgentCreateRunRequest,
  AgentEvalSummary,
  AgentFeedbackFailureImportResult,
  AgentFeedbackFailureReport,
  AgentFeedbackRequest,
  AgentDailyArchiveItem,
  AgentKnowledgeGovernance,
  AgentMemoryItem,
  AgentPersonaSummary,
  AgentQualityReport,
  AgentRunDetail,
  AgentRunListQuery,
  AgentRunRecord,
  AgentRunResultV2,
  AgentSchemaReadiness,
  AgentToolCatalogItem,
  UpdateAgentPersonaRequest,
} from '@/types/agent';
import type { PaginatedResponse } from '@/types/pagination';
import { normalizePaginatedResponse } from './response';

type AgentRequestConfig = AxiosRequestConfig & { skipRetry?: boolean };

const agentLongTaskConfig: AgentRequestConfig = { timeout: 60000, skipRetry: true };
const sharedAgentApi = createAgentApi({
  get: (url, config) => apiClient.get(url, config as AxiosRequestConfig),
  post: (url, data, config) => apiClient.post(url, data, config as AgentRequestConfig),
});

export async function createAgentRun(data: AgentCreateRunRequest): Promise<AgentRunResultV2> {
  return sharedAgentApi.createRun(data);
}

export async function recordAmiAiAudit(data: AmiAiAuditRequest): Promise<AmiAiAuditResult> {
  return apiClient.post('/agent/ami-ai/audit', data, agentLongTaskConfig);
}

export async function compileBusinessTask(data: AgentCompileBusinessTaskRequest): Promise<AgentBusinessTaskCompileResult> {
  return apiClient.post('/agent/business-task/compile', data, agentLongTaskConfig);
}

export async function getAgentRun(id: number): Promise<AgentRunResultV2> {
  return apiClient.get(`/agent/runs/${id}`);
}

export async function appendAgentMessage(id: number, data: AgentAppendMessageRequest): Promise<AgentRunResultV2> {
  return sharedAgentApi.appendMessage(id, data);
}

export async function getAgentTools(): Promise<AgentToolCatalogItem[]> {
  return apiClient.get('/agent/tools');
}

export async function runDefaultAgentEvals(): Promise<AgentEvalSummary> {
  return apiClient.get('/agent/evals/default');
}

export async function getAgentRunsPaginated(params: AgentRunListQuery): Promise<PaginatedResponse<AgentRunRecord>> {
  const response = await apiClient.get<unknown, unknown>('/agent/runs', { params });
  return normalizePaginatedResponse<AgentRunRecord, AgentRunRecord>(response, (item) => item);
}

export async function getAgentRunDetail(id: number): Promise<AgentRunDetail> {
  return sharedAgentApi.getRunDetail<AgentRunDetail>(id);
}

export async function getAgentApprovalsPaginated(
  params: AgentApprovalListQuery,
): Promise<PaginatedResponse<AgentApprovalListItem>> {
  const response = await apiClient.get<unknown, unknown>('/agent/approvals', { params });
  return normalizePaginatedResponse<AgentApprovalListItem, AgentApprovalListItem>(response, (item) => item);
}

export async function approveAgentApproval(id: number, data: AgentApprovalDecisionRequest = {}): Promise<AgentRunResultV2> {
  return apiClient.post(`/agent/approvals/${id}/approve`, data, agentLongTaskConfig);
}

export async function rejectAgentApproval(id: number, data: AgentApprovalDecisionRequest = {}): Promise<AgentRunResultV2> {
  return apiClient.post(`/agent/approvals/${id}/reject`, data, agentLongTaskConfig);
}

// ─── Persona API ─────────────────────────────────────────────────────────────

export async function getAgentPersonas(): Promise<AgentPersonaSummary[]> {
  return sharedAgentApi.getPersonas();
}

export async function getAgentPersonaByCode(code: string): Promise<AgentPersonaSummary> {
  return sharedAgentApi.getPersonaByCode(code);
}

export async function getAllAgentPersonas(): Promise<AgentPersonaSummary[]> {
  return apiClient.get('/agent/personas/all');
}

export async function updateAgentPersona(code: string, data: UpdateAgentPersonaRequest): Promise<AgentPersonaSummary> {
  return apiClient.patch(`/agent/personas/${code}`, data);
}

// ─── Feedback API ─────────────────────────────────────────────────────────────

export async function submitAgentFeedback(runId: number, data: AgentFeedbackRequest): Promise<void> {
  return sharedAgentApi.submitFeedback(runId, data);
}

export async function getAgentFeedbackFailures(params: {
  days?: number;
  personaCode?: string;
  limit?: number;
} = {}): Promise<AgentFeedbackFailureReport> {
  return apiClient.get('/agent/feedback/failures', { params });
}

export async function importAgentFeedbackFailuresToEvalCases(data: {
  days?: number;
  personaCode?: string;
  limit?: number;
  dryRun?: boolean;
} = {}): Promise<AgentFeedbackFailureImportResult> {
  return apiClient.post('/agent/feedback/failures/eval-cases', data);
}

// ─── Memory / Archive / Quality ──────────────────────────────────────────────

export async function getAgentMemories(params: {
  personaCode?: string;
  memoryType?: string;
  limit?: number;
} = {}): Promise<PaginatedResponse<AgentMemoryItem>> {
  const response = await apiClient.get<unknown, unknown>('/agent/memories', { params });
  return normalizePaginatedResponse<AgentMemoryItem, AgentMemoryItem>(response, (item) => item);
}

export async function createAgentMemory(data: {
  personaCode?: string;
  memoryType?: string;
  title: string;
  content: string;
  summary?: string;
  importance?: number;
  sourceRunId?: number;
}): Promise<AgentMemoryItem> {
  return apiClient.post('/agent/memories', data);
}

export async function getAgentDailyArchives(params: {
  personaCode?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PaginatedResponse<AgentDailyArchiveItem>> {
  const response = await apiClient.get<unknown, unknown>('/agent/daily-archives', { params });
  return normalizePaginatedResponse<AgentDailyArchiveItem, AgentDailyArchiveItem>(response, (item) => item);
}

export async function generateAgentDailyArchive(data: { personaCode?: string; date?: string } = {}): Promise<AgentDailyArchiveItem> {
  return apiClient.post('/agent/daily-archives/generate', data, agentLongTaskConfig);
}

export async function getAgentQualityReport(params: { days?: number; personaCode?: string } = {}): Promise<AgentQualityReport> {
  return apiClient.get('/agent/quality-report', { params });
}

export async function getAgentSchemaReadiness(): Promise<AgentSchemaReadiness> {
  return apiClient.get('/agent/schema-readiness');
}

export async function getAgentKnowledgeGovernance(params: {
  capabilityId?: string;
  q?: string;
  personaCode?: string;
  riskLevel?: string;
  domain?: string;
} = {}): Promise<AgentKnowledgeGovernance> {
  return apiClient.get('/agent/knowledge/governance', { params });
}

// ─── Automation Engine ──────────────────────────────────────────────────────

export async function getAgentAutomationTriggers(): Promise<AgentAutomationTriggerTemplate[]> {
  return apiClient.get('/agent/automations/triggers');
}

export async function getAgentAutomations(params: {
  personaCode?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PaginatedResponse<AgentAutomationDefinitionItem>> {
  const response = await apiClient.get<unknown, unknown>('/agent/automations', { params });
  return normalizePaginatedResponse<AgentAutomationDefinitionItem, AgentAutomationDefinitionItem>(response, (item) => item);
}

export async function createAgentAutomationDraft(data: AgentAutomationDraftRequest): Promise<AgentAutomationDefinitionItem> {
  return apiClient.post('/agent/automations/drafts', data, agentLongTaskConfig);
}

export async function getAgentAutomationRuns(params: {
  definitionId?: number;
  personaCode?: string;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PaginatedResponse<AgentAutomationRunItem>> {
  const response = await apiClient.get<unknown, unknown>('/agent/automations/runs', { params });
  return normalizePaginatedResponse<AgentAutomationRunItem, AgentAutomationRunItem>(response, (item) => item);
}

export async function getAgentAutomationEffects(params: {
  definitionId?: number;
  runId?: number;
  status?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PaginatedResponse<AgentAutomationEffectItem>> {
  const response = await apiClient.get<unknown, unknown>('/agent/automations/effects', { params });
  return normalizePaginatedResponse<AgentAutomationEffectItem, AgentAutomationEffectItem>(response, (item) => item);
}

export async function runAgentAutomationOnce(
  id: number,
  data: { mode?: string; dryRun?: boolean; input?: unknown } = {},
): Promise<AgentAutomationRunResult> {
  return apiClient.post(`/agent/automations/${id}/run`, data, agentLongTaskConfig);
}

export async function runDueAgentAutomations(data: {
  now?: string;
  limit?: number;
  dryRun?: boolean;
} = {}): Promise<AgentAutomationDueRunResult> {
  return apiClient.post('/agent/automations/due/run', data, agentLongTaskConfig);
}

export async function evaluateAgentAutomationEvent(data: {
  eventType: string;
  payload?: unknown;
  limit?: number;
  dryRun?: boolean;
}): Promise<AgentAutomationEventEvaluateResult> {
  return apiClient.post('/agent/automations/events/evaluate', data, agentLongTaskConfig);
}

export async function getAgentAutomationPendingApprovals(params: {
  definitionId?: number;
  personaCode?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PaginatedResponse<AgentAutomationRunItem>> {
  const response = await apiClient.get<unknown, unknown>('/agent/automations/pending-approvals', { params });
  return normalizePaginatedResponse<AgentAutomationRunItem, AgentAutomationRunItem>(response, (item) => item);
}

export async function approveAgentAutomationRun(id: number, data: { comment?: string } = {}): Promise<{
  run: AgentAutomationRunItem;
  effect: AgentAutomationEffectItem;
  approved: boolean;
}> {
  return apiClient.post(`/agent/automations/runs/${id}/approve`, data, agentLongTaskConfig);
}

export async function rejectAgentAutomationRun(id: number, data: { comment?: string } = {}): Promise<{
  run: AgentAutomationRunItem;
  effect: AgentAutomationEffectItem;
  approved: boolean;
}> {
  return apiClient.post(`/agent/automations/runs/${id}/reject`, data, agentLongTaskConfig);
}

export async function recoverAgentAutomation(id: number, data: { maxFailures?: number } = {}): Promise<Record<string, unknown>> {
  return apiClient.post(`/agent/automations/${id}/recover`, data, agentLongTaskConfig);
}

export async function recordAgentAutomationAttribution(data: {
  definitionId?: number;
  runId?: number;
  effectType?: string;
  objectType?: string;
  objectId?: number;
  customerId?: number;
  metricKey?: string;
  impact?: unknown;
}): Promise<AgentAutomationEffectItem> {
  return apiClient.post('/agent/automations/effects/attribute', data, agentLongTaskConfig);
}
