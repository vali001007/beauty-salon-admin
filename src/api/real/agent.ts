import apiClient from '../client';
import type {
  AgentBusinessTaskCompileResult,
  AgentCompileBusinessTaskRequest,
  AgentApprovalDecisionRequest,
  AgentApprovalListItem,
  AgentApprovalListQuery,
  AgentAppendMessageRequest,
  AgentCreateRunRequest,
  AgentEvalSummary,
  AgentRunDetail,
  AgentRunListQuery,
  AgentRunRecord,
  AgentRunResult,
  AgentToolCatalogItem,
} from '@/types/agent';
import type { PaginatedResponse } from '@/types/pagination';
import { normalizePaginatedResponse } from './response';

export async function createAgentRun(data: AgentCreateRunRequest): Promise<AgentRunResult> {
  return apiClient.post('/agent/runs', data);
}

export async function compileBusinessTask(data: AgentCompileBusinessTaskRequest): Promise<AgentBusinessTaskCompileResult> {
  return apiClient.post('/agent/business-task/compile', data);
}

export async function getAgentRun(id: number): Promise<AgentRunResult> {
  return apiClient.get(`/agent/runs/${id}`);
}

export async function appendAgentMessage(id: number, data: AgentAppendMessageRequest): Promise<AgentRunResult> {
  return apiClient.post(`/agent/runs/${id}/messages`, data);
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
  return apiClient.get(`/agent/runs/${id}/detail`);
}

export async function getAgentApprovalsPaginated(
  params: AgentApprovalListQuery,
): Promise<PaginatedResponse<AgentApprovalListItem>> {
  const response = await apiClient.get<unknown, unknown>('/agent/approvals', { params });
  return normalizePaginatedResponse<AgentApprovalListItem, AgentApprovalListItem>(response, (item) => item);
}

export async function approveAgentApproval(id: number, data: AgentApprovalDecisionRequest = {}): Promise<AgentRunResult> {
  return apiClient.post(`/agent/approvals/${id}/approve`, data);
}

export async function rejectAgentApproval(id: number, data: AgentApprovalDecisionRequest = {}): Promise<AgentRunResult> {
  return apiClient.post(`/agent/approvals/${id}/reject`, data);
}
