import apiClient from '../client';
import type {
  AgentGovernanceAutoPublishRun,
  AgentGovernanceCapabilityHealth,
  AgentGovernanceCapabilityHeatMapItem,
  AgentGovernanceDebugRequest,
  AgentGovernanceDebugResult,
  AgentGovernanceEvalCase,
  AgentGovernanceEvalCaseInput,
  AgentGovernanceEvalDryRunBatchRequest,
  AgentGovernanceEvalDryRunBatchResult,
  AgentGovernanceEvalFailureReplayRequest,
  AgentGovernanceEvalFailureReplayResult,
  AgentGovernanceEvalGateReport,
  AgentGovernanceEvalRunDetail,
  AgentGovernanceEvalRunFailureList,
  AgentGovernanceEvalRunImportResult,
  AgentGovernanceEvalRunRecord,
  AgentGovernanceHealthMetrics,
  AgentGovernanceListQuery,
  AgentGovernanceListResult,
  AgentGovernanceRunDetail,
  AgentGovernanceRunStats,
  AgentGovernanceUncoveredQuestion,
  AgentV2GrayRule,
  CreateAgentV2GrayRuleInput,
  AgentKnowledgeGraphOverride,
  AgentKnowledgeGraphGap,
  AgentKnowledgeGraphNode,
  AgentKnowledgeGraphNodeDetail,
  AgentKnowledgeGraphPathResult,
  AgentKnowledgeGraphSummary,
  AgentKnowledgeGraphVisualizeResult,
  CreateAgentKnowledgeGraphExcludeInput,
  CreateAgentKnowledgeGraphSynonymInput,
} from '@/types/agentGovernance';
import type { AgentRunRecord } from '@/types/agent';

const BASE_PATH = '/agent-governance';

export async function getAgentGovernanceRuns(
  params: AgentGovernanceListQuery = {},
): Promise<AgentGovernanceListResult<AgentRunRecord>> {
  return apiClient.get(`${BASE_PATH}/runs`, { params });
}

export async function getAgentGovernanceRunStats(params: { storeId?: number } = {}): Promise<AgentGovernanceRunStats> {
  return apiClient.get(`${BASE_PATH}/runs/stats`, { params });
}

export async function getAgentGovernanceHealth(params: { days?: number; storeId?: number } = {}): Promise<AgentGovernanceHealthMetrics> {
  return apiClient.get(`${BASE_PATH}/health`, { params });
}

export async function getAgentGovernanceRunFailures(
  params: AgentGovernanceListQuery = {},
): Promise<AgentGovernanceListResult<AgentRunRecord>> {
  return apiClient.get(`${BASE_PATH}/runs/failures`, { params });
}

export async function getAgentGovernanceUncoveredTop(
  params: { limit?: number; storeId?: number } = {},
): Promise<AgentGovernanceUncoveredQuestion[]> {
  return apiClient.get(`${BASE_PATH}/runs/uncovered-top`, { params });
}

export async function getAgentGovernanceRunDetail(id: number, params: { storeId?: number } = {}): Promise<AgentGovernanceRunDetail> {
  return apiClient.get(`${BASE_PATH}/runs/${id}/detail`, { params });
}

export async function getAgentKnowledgeGraphSummary(): Promise<AgentKnowledgeGraphSummary> {
  return apiClient.get(`${BASE_PATH}/knowledge-graph/summary`);
}

export async function getAgentKnowledgeGraphNodes(params: {
  page?: number;
  pageSize?: number;
  type?: string;
  keyword?: string;
} = {}): Promise<AgentGovernanceListResult<AgentKnowledgeGraphNode>> {
  return apiClient.get(`${BASE_PATH}/knowledge-graph/nodes`, { params });
}

export async function getAgentKnowledgeGraphNode(id: string): Promise<AgentKnowledgeGraphNodeDetail> {
  return apiClient.get(`${BASE_PATH}/knowledge-graph/nodes/${encodeURIComponent(id)}`);
}

export async function getAgentKnowledgeGraphGaps(): Promise<AgentKnowledgeGraphGap[]> {
  return apiClient.get(`${BASE_PATH}/knowledge-graph/gaps`);
}

export async function getAgentKnowledgeGraphVisualize(params: {
  type?: string;
  limit?: number;
  focusId?: string;
  depth?: number;
} = {}): Promise<AgentKnowledgeGraphVisualizeResult> {
  return apiClient.get(`${BASE_PATH}/knowledge-graph/visualize`, { params });
}

export async function getAgentKnowledgeGraphPath(data: {
  from: string;
  to: string;
  maxDepth?: number;
}): Promise<AgentKnowledgeGraphPathResult> {
  return apiClient.post(`${BASE_PATH}/knowledge-graph/path`, data);
}

export async function getAgentKnowledgeGraphSynonyms(params: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}): Promise<AgentGovernanceListResult<AgentKnowledgeGraphOverride>> {
  return apiClient.get(`${BASE_PATH}/knowledge-graph/synonyms`, { params });
}

export async function createAgentKnowledgeGraphSynonym(data: CreateAgentKnowledgeGraphSynonymInput): Promise<AgentKnowledgeGraphOverride> {
  return apiClient.post(`${BASE_PATH}/knowledge-graph/synonyms`, data);
}

export async function deleteAgentKnowledgeGraphSynonym(id: number): Promise<AgentKnowledgeGraphOverride> {
  return apiClient.delete(`${BASE_PATH}/knowledge-graph/synonyms/${id}`);
}

export async function getAgentKnowledgeGraphExcludes(params: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}): Promise<AgentGovernanceListResult<AgentKnowledgeGraphOverride>> {
  return apiClient.get(`${BASE_PATH}/knowledge-graph/excludes`, { params });
}

export async function createAgentKnowledgeGraphExclude(data: CreateAgentKnowledgeGraphExcludeInput): Promise<AgentKnowledgeGraphOverride> {
  return apiClient.post(`${BASE_PATH}/knowledge-graph/excludes`, data);
}

export async function deleteAgentKnowledgeGraphExclude(id: number): Promise<AgentKnowledgeGraphOverride> {
  return apiClient.delete(`${BASE_PATH}/knowledge-graph/excludes/${id}`);
}

export async function getAgentGovernanceCapabilityHealth(): Promise<AgentGovernanceCapabilityHealth> {
  return apiClient.get(`${BASE_PATH}/capabilities/health`);
}

export async function getAgentGovernanceCapabilityHeatMap(): Promise<AgentGovernanceCapabilityHeatMapItem[]> {
  return apiClient.get(`${BASE_PATH}/capabilities/heat-map`);
}

export async function getAgentGovernanceAutoPublishLogs(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  trigger?: string;
} = {}): Promise<AgentGovernanceListResult<AgentGovernanceAutoPublishRun>> {
  return apiClient.get(`${BASE_PATH}/auto-publish/logs`, { params });
}

export async function getAgentGovernanceAutoPublishLog(id: number): Promise<AgentGovernanceAutoPublishRun | null> {
  return apiClient.get(`${BASE_PATH}/auto-publish/logs/${id}`);
}

export async function getAgentV2GrayRules(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  mode?: string;
} = {}): Promise<AgentGovernanceListResult<AgentV2GrayRule>> {
  return apiClient.get(`${BASE_PATH}/gray-rules`, { params });
}

export async function createAgentV2GrayRule(data: CreateAgentV2GrayRuleInput): Promise<AgentV2GrayRule> {
  return apiClient.post(`${BASE_PATH}/gray-rules`, data);
}

export async function deleteAgentV2GrayRule(id: number): Promise<AgentV2GrayRule> {
  return apiClient.delete(`${BASE_PATH}/gray-rules/${id}`);
}

export async function getAgentGovernanceEvalCases(params: {
  page?: number;
  pageSize?: number;
  priority?: string;
} = {}): Promise<AgentGovernanceListResult<AgentGovernanceEvalCase>> {
  return apiClient.get(`${BASE_PATH}/eval/cases`, { params });
}

export async function createAgentGovernanceEvalCase(data: AgentGovernanceEvalCaseInput): Promise<AgentGovernanceEvalCase> {
  return apiClient.post(`${BASE_PATH}/eval/cases`, data);
}

export async function updateAgentGovernanceEvalCase(id: number, data: Partial<AgentGovernanceEvalCaseInput>): Promise<AgentGovernanceEvalCase> {
  return apiClient.patch(`${BASE_PATH}/eval/cases/${id}`, data);
}

export async function getAgentGovernanceEvalRuns(): Promise<AgentGovernanceEvalGateReport> {
  return apiClient.get(`${BASE_PATH}/eval/runs`);
}

export async function createAgentGovernanceEvalRun(data: { note?: string } = {}): Promise<AgentGovernanceEvalRunImportResult> {
  return apiClient.post(`${BASE_PATH}/eval/runs`, data);
}

export async function runAgentGovernanceEvalDryRunBatch(
  data: AgentGovernanceEvalDryRunBatchRequest = {},
): Promise<AgentGovernanceEvalDryRunBatchResult> {
  return apiClient.post(`${BASE_PATH}/eval/runs/dry-run-batch`, data);
}

export async function getAgentGovernanceEvalRunHistory(params: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}): Promise<AgentGovernanceListResult<AgentGovernanceEvalRunRecord>> {
  return apiClient.get(`${BASE_PATH}/eval/runs/history`, { params });
}

export async function getAgentGovernanceEvalRunDetail(id: number): Promise<AgentGovernanceEvalRunDetail> {
  return apiClient.get(`${BASE_PATH}/eval/runs/${id}`);
}

export async function getAgentGovernanceEvalRunFailures(id: number, params: {
  page?: number;
  pageSize?: number;
  category?: string;
} = {}): Promise<AgentGovernanceEvalRunFailureList> {
  return apiClient.get(`${BASE_PATH}/eval/runs/${id}/failures`, { params });
}

export async function replayAgentGovernanceEvalRunFailure(
  id: number,
  data: AgentGovernanceEvalFailureReplayRequest,
): Promise<AgentGovernanceEvalFailureReplayResult> {
  return apiClient.post(`${BASE_PATH}/eval/runs/${id}/failures/replay`, data);
}

export async function importLatestAgentGovernanceEvalRun(): Promise<AgentGovernanceEvalRunImportResult> {
  return apiClient.post(`${BASE_PATH}/eval/runs/import-latest`, {});
}

export async function debugAgentGovernanceExecute(data: AgentGovernanceDebugRequest): Promise<AgentGovernanceDebugResult> {
  return apiClient.post(`${BASE_PATH}/debug/execute`, data);
}

export async function debugAgentGovernanceCompare(data: AgentGovernanceDebugRequest): Promise<AgentGovernanceDebugResult> {
  return apiClient.post(`${BASE_PATH}/debug/compare`, data);
}

export async function simulateAgentGovernanceManifest(data: AgentGovernanceDebugRequest): Promise<AgentGovernanceDebugResult> {
  return apiClient.post(`${BASE_PATH}/debug/simulate-manifest`, data);
}
