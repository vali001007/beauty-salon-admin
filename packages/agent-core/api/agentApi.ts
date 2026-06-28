import type { AgentAppendMessageRequest, AgentCreateRunRequest, AgentFeedbackRequest, AgentRunResultV2 } from '../types/result';
import type { AgentPersonaSummary } from '../types/persona';

export interface AgentHttpClient {
  get<T = unknown>(url: string, config?: unknown): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<T>;
}

const agentLongTaskConfig = { timeout: 60000, skipRetry: true };

export function createAgentApi(httpClient: AgentHttpClient) {
  return {
    createRun(data: AgentCreateRunRequest): Promise<AgentRunResultV2> {
      return httpClient.post('/agent/runs', data, agentLongTaskConfig);
    },
    appendMessage(runId: number, data: AgentAppendMessageRequest): Promise<AgentRunResultV2> {
      return httpClient.post(`/agent/runs/${runId}/messages`, data, agentLongTaskConfig);
    },
    getPersonas(): Promise<AgentPersonaSummary[]> {
      return httpClient.get('/agent/personas');
    },
    getPersonaByCode(code: string): Promise<AgentPersonaSummary> {
      return httpClient.get(`/agent/personas/${code}`);
    },
    submitFeedback(runId: number, data: AgentFeedbackRequest): Promise<void> {
      return httpClient.post(`/agent/runs/${runId}/feedback`, data);
    },
    getRunDetail<T = unknown>(runId: number): Promise<T> {
      return httpClient.get(`/agent/runs/${runId}/detail`);
    },
  };
}
