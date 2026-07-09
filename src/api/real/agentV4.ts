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

type AgentV4RequestConfig = AxiosRequestConfig & { skipRetry?: boolean };

const agentV4LongTaskConfig: AgentV4RequestConfig = { timeout: 60000, skipRetry: true };

export async function createAgentV4Run(data: AgentCreateRunRequest): Promise<AgentRunResultV2> {
  return apiClient.post('/agent-v4/runs', data, agentV4LongTaskConfig);
}

export async function appendAgentV4Message(id: number, data: AgentAppendMessageRequest): Promise<AgentRunResultV2> {
  return apiClient.post(`/agent-v4/runs/${id}/messages`, data, agentV4LongTaskConfig);
}

export async function getAgentV4Run(id: number): Promise<AgentRunResultV2> {
  return apiClient.get(`/agent-v4/runs/${id}`);
}

export async function getAgentV4RunDetail(id: number): Promise<AgentRunDetail> {
  return apiClient.get(`/agent-v4/runs/${id}/detail`);
}

export async function getAgentV4RunsPaginated(params: AgentRunListQuery): Promise<PaginatedResponse<AgentRunRecord>> {
  const response = await apiClient.get<unknown, unknown>('/agent-v4/runs', { params });
  return normalizePaginatedResponse<AgentRunRecord, AgentRunRecord>(response, (item) => item);
}
