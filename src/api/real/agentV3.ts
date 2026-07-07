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
import type { PaginatedResponse } from '@/types/pagination';
import { normalizePaginatedResponse } from './response';

type AgentV3RequestConfig = AxiosRequestConfig & { skipRetry?: boolean };

const agentV3LongTaskConfig: AgentV3RequestConfig = { timeout: 60000, skipRetry: true };

export async function createAgentV3Run(data: AgentCreateRunRequest): Promise<AgentRunResultV2> {
  return apiClient.post('/agent-v3/runs', data, agentV3LongTaskConfig);
}

export async function appendAgentV3Message(id: number, data: AgentAppendMessageRequest): Promise<AgentRunResultV2> {
  return apiClient.post(`/agent-v3/runs/${id}/messages`, data, agentV3LongTaskConfig);
}

export async function getAgentV3Run(id: number): Promise<AgentRunResultV2> {
  return apiClient.get(`/agent-v3/runs/${id}`);
}

export async function getAgentV3RunDetail(id: number): Promise<AgentRunDetail> {
  return apiClient.get(`/agent-v3/runs/${id}/detail`);
}

export async function getAgentV3RunsPaginated(params: AgentRunListQuery): Promise<PaginatedResponse<AgentRunRecord>> {
  const response = await apiClient.get<unknown, unknown>('/agent-v3/runs', { params });
  return normalizePaginatedResponse<AgentRunRecord, AgentRunRecord>(response, (item) => item);
}
