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
  AgentFeedbackDiagnosticReport,
  AgentGovernanceEngineFilter,
  AgentGovernanceHealthMetrics,
  AgentGovernanceListQuery,
  AgentGovernanceListResult,
  AgentGovernanceRunDetail,
  AgentGovernanceRunStats,
  AgentGovernanceUncoveredQuestion,
  AgentV2TextToSqlCandidate,
  AgentV2TextToSqlGuardInspectResult,
  AgentV2TextToSqlRun,
  AgentV2TextToSqlRunResult,
  AgentV2TextToSqlSemanticView,
  AgentV2TextToSqlStatus,
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
const GOVERNANCE_TEXT_TO_SQL_PATH = '/agent-v2/text-to-sql';

export async function getAgentGovernanceRuns(
  params: AgentGovernanceListQuery = {},
): Promise<AgentGovernanceListResult<AgentRunRecord>> {
  return apiClient.get(`${BASE_PATH}/runs`, { params });
}

export async function getAgentGovernanceRunStats(params: { storeId?: number; engine?: AgentGovernanceEngineFilter } = {}): Promise<AgentGovernanceRunStats> {
  return apiClient.get(`${BASE_PATH}/runs/stats`, { params });
}

export async function getAgentGovernanceHealth(params: { days?: number; storeId?: number; engine?: AgentGovernanceEngineFilter } = {}): Promise<AgentGovernanceHealthMetrics> {
  return apiClient.get(`${BASE_PATH}/health`, { params });
}

export async function getAgentGovernanceRunFailures(
  params: AgentGovernanceListQuery = {},
): Promise<AgentGovernanceListResult<AgentRunRecord>> {
  return apiClient.get(`${BASE_PATH}/runs/failures`, { params });
}

export async function getAgentGovernanceUncoveredTop(
  params: { limit?: number; storeId?: number; engine?: AgentGovernanceEngineFilter } = {},
): Promise<AgentGovernanceUncoveredQuestion[]> {
  return apiClient.get(`${BASE_PATH}/runs/uncovered-top`, { params });
}

export async function getAgentFeedbackDiagnostics(params: {
  page?: number;
  pageSize?: number;
  days?: number;
  category?: string;
  storeId?: number;
  engine?: AgentGovernanceEngineFilter;
} = {}): Promise<AgentFeedbackDiagnosticReport> {
  return apiClient.get(`${BASE_PATH}/feedback-diagnostics`, { params });
}

export async function getAgentGovernanceRunDetail(id: number, params: { storeId?: number; engine?: AgentGovernanceEngineFilter } = {}): Promise<AgentGovernanceRunDetail> {
  return apiClient.get(`${BASE_PATH}/runs/${id}/detail`, { params });
}

export async function getAgentV2TextToSqlSemanticViews(params: {
  includePlanned?: boolean;
  includeAdmin?: boolean;
} = {}): Promise<AgentV2TextToSqlSemanticView[]> {
  return apiClient.get(`${GOVERNANCE_TEXT_TO_SQL_PATH}/semantic-views`, { params });
}

export async function getAgentV2TextToSqlRuns(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  userId?: number;
} = {}): Promise<AgentGovernanceListResult<AgentV2TextToSqlRun>> {
  return apiClient.get(`${GOVERNANCE_TEXT_TO_SQL_PATH}/runs`, { params });
}

export async function getAgentV2TextToSqlRun(id: number): Promise<AgentV2TextToSqlRun | null> {
  return apiClient.get(`${GOVERNANCE_TEXT_TO_SQL_PATH}/runs/${id}`);
}

export async function getAgentV2TextToSqlStatus(): Promise<AgentV2TextToSqlStatus> {
  return apiClient.get(`${GOVERNANCE_TEXT_TO_SQL_PATH}/status`);
}

export async function dryRunAgentV2TextToSql(data: {
  question: string;
  storeId?: number;
  storeIds?: number[];
}): Promise<AgentV2TextToSqlRunResult> {
  return apiClient.post(`${GOVERNANCE_TEXT_TO_SQL_PATH}/dry-run`, data, { timeout: 60000 });
}

export async function executeAgentV2TextToSql(data: {
  question: string;
  storeId?: number;
  storeIds?: number[];
}): Promise<AgentV2TextToSqlRunResult> {
  return apiClient.post(`${GOVERNANCE_TEXT_TO_SQL_PATH}/execute`, data, { timeout: 60000 });
}

export async function inspectAgentV2TextToSqlGuard(data: {
  sql: string;
  storeId?: number;
  storeIds?: number[];
}): Promise<AgentV2TextToSqlGuardInspectResult> {
  return apiClient.post(`${GOVERNANCE_TEXT_TO_SQL_PATH}/guard/inspect`, data);
}

export async function testAgentV2TextToSqlSemanticView(viewName: string, data: {
  storeId?: number;
  storeIds?: number[];
} = {}): Promise<AgentV2TextToSqlGuardInspectResult> {
  return apiClient.post(`${GOVERNANCE_TEXT_TO_SQL_PATH}/semantic-views/${encodeURIComponent(viewName)}/test`, data);
}

export async function createAgentV2TextToSqlFeedback(id: number, data: {
  rating?: number;
  feedbackText?: string;
  isUseful?: boolean;
  isWrongAnswer?: boolean;
  isPermissionConcern?: boolean;
}) {
  return apiClient.post(`${GOVERNANCE_TEXT_TO_SQL_PATH}/runs/${id}/feedback`, data);
}

export async function promoteAgentV2TextToSqlRun(id: number): Promise<Record<string, unknown>> {
  return apiClient.post(`${GOVERNANCE_TEXT_TO_SQL_PATH}/runs/${id}/promote`);
}

export async function getAgentV2TextToSqlCandidates(params: {
  limit?: number;
  minHitCount?: number;
} = {}): Promise<AgentV2TextToSqlCandidate[]> {
  return apiClient.get(`${GOVERNANCE_TEXT_TO_SQL_PATH}/candidates`, { params });
}

export async function promoteAgentV2TextToSqlCandidate(clusterKey: string): Promise<Record<string, unknown>> {
  return apiClient.post(`${GOVERNANCE_TEXT_TO_SQL_PATH}/candidates/promote`, { clusterKey });
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
