import apiClient from '../client';
import type { AxiosRequestConfig } from 'axios';
import type {
  AgentAppendMessageRequest,
  AgentCreateRunRequest,
  AgentRunDetail,
  AgentRunListQuery,
  AgentRunRecord,
  AgentRunResultV2,
  AgentToolCatalogItem,
} from '@/types/agent';
import type { PaginatedResponse } from '@/types/pagination';
import { normalizePaginatedResponse } from './response';

type AgentV2RequestConfig = AxiosRequestConfig & { skipRetry?: boolean };

const agentV2LongTaskConfig: AgentV2RequestConfig = { timeout: 60000, skipRetry: true };

export async function createAgentV2Run(data: AgentCreateRunRequest): Promise<AgentRunResultV2> {
  return apiClient.post('/agent-v2/runs', data, agentV2LongTaskConfig);
}

export async function appendAgentV2Message(id: number, data: AgentAppendMessageRequest): Promise<AgentRunResultV2> {
  return apiClient.post(`/agent-v2/runs/${id}/messages`, data, agentV2LongTaskConfig);
}

export async function getAgentV2Run(id: number): Promise<AgentRunResultV2> {
  return apiClient.get(`/agent-v2/runs/${id}`);
}

export async function getAgentV2RunDetail(id: number): Promise<AgentRunDetail> {
  return apiClient.get(`/agent-v2/runs/${id}/detail`);
}

export async function getAgentV2RunsPaginated(params: AgentRunListQuery): Promise<PaginatedResponse<AgentRunRecord>> {
  const response = await apiClient.get<unknown, unknown>('/agent-v2/runs', { params });
  return normalizePaginatedResponse<AgentRunRecord, AgentRunRecord>(response, (item) => item);
}

export async function getAgentV2Tools(): Promise<AgentToolCatalogItem[]> {
  return apiClient.get('/agent-v2/tools');
}
