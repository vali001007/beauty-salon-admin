import apiClient from '../client';
import type { AxiosRequestConfig } from 'axios';
import type {
  AgentAppendMessageRequest,
  AgentCreateRunRequest,
  AgentRunDetail,
  AgentRunListQuery,
  AgentRunRecord,
  AgentRunResultV2,
} from '@/types/agent';
import type {
  AgentV5GovernanceAdapters,
  AgentV5GovernanceClarifications,
  AgentV5GovernanceEval,
  AgentV5GovernanceFailures,
  AgentV5GovernanceMemory,
  AgentV5GovernanceOverview,
  AgentV5GovernanceRoutes,
} from '@/types/agentGovernance';
import type { PaginatedResponse } from '@/types/pagination';
import { normalizePaginatedResponse } from './response';

type AgentV5RequestConfig = AxiosRequestConfig & { skipRetry?: boolean };

const agentV5LongTaskConfig: AgentV5RequestConfig = { timeout: 60000, skipRetry: true };

export async function createAgentV5Run(data: AgentCreateRunRequest): Promise<AgentRunResultV2> {
  return apiClient.post('/agent-v5/runs', data, agentV5LongTaskConfig);
}

export async function appendAgentV5Message(id: number, data: AgentAppendMessageRequest): Promise<AgentRunResultV2> {
  return apiClient.post(`/agent-v5/runs/${id}/messages`, data, agentV5LongTaskConfig);
}

export async function getAgentV5Run(id: number): Promise<AgentRunResultV2> {
  return apiClient.get(`/agent-v5/runs/${id}`);
}

export async function getAgentV5RunDetail(id: number): Promise<AgentRunDetail> {
  return apiClient.get(`/agent-v5/runs/${id}/detail`);
}

export async function getAgentV5RunsPaginated(params: AgentRunListQuery): Promise<PaginatedResponse<AgentRunRecord>> {
  const response = await apiClient.get<unknown, unknown>('/agent-v5/runs', { params });
  return normalizePaginatedResponse<AgentRunRecord, AgentRunRecord>(response, (item) => item);
}

export async function getAgentV5GovernanceOverview(): Promise<AgentV5GovernanceOverview> {
  return apiClient.get('/agent-v5/governance/overview');
}

export async function getAgentV5GovernanceRoutes(): Promise<AgentV5GovernanceRoutes> {
  return apiClient.get('/agent-v5/governance/routes');
}

export async function getAgentV5GovernanceAdapters(): Promise<AgentV5GovernanceAdapters> {
  return apiClient.get('/agent-v5/governance/adapters');
}

export async function getAgentV5GovernanceClarifications(): Promise<AgentV5GovernanceClarifications> {
  return apiClient.get('/agent-v5/governance/clarifications');
}

export async function getAgentV5GovernanceMemory(): Promise<AgentV5GovernanceMemory> {
  return apiClient.get('/agent-v5/governance/memory');
}

export async function getAgentV5GovernanceFailures(): Promise<AgentV5GovernanceFailures> {
  return apiClient.get('/agent-v5/governance/failures');
}

export async function getAgentV5GovernanceEval(): Promise<AgentV5GovernanceEval> {
  return apiClient.get('/agent-v5/governance/eval');
}
