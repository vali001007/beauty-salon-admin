import apiClient from './client';
import type { AgentCreateRunRequest, AgentRunResult } from '@/types/agent';

export async function createAgentRun(data: AgentCreateRunRequest): Promise<AgentRunResult> {
  return apiClient.post('/agent/runs', data);
}
