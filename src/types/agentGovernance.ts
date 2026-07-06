import type {
  AgentApprovalRecord,
  AgentMessageRecord,
  AgentRunRecord,
  AgentStepRecord,
  AgentToolCallRecord,
} from './agent';

export type AgentGovernanceStatus = 'completed' | 'failed' | 'running' | 'waiting_approval' | 'cancelled' | string;

export interface AgentGovernanceListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  storeId?: number;
}

export interface AgentGovernanceListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AgentGovernanceRunStats {
  total: number;
  byStatus: Record<string, number>;
  activeManifestVersion?: string | null;
}

export interface AgentGovernanceHealthMetrics {
  generatedAt: string;
  activeManifestVersion?: string | null;
  window: {
    days: number;
    since: string;
    until: string;
    storeId?: number | null;
  };
  runs: {
    total: number;
    completed: number;
    failed: number;
    successRate: number;
    byStatus: Record<string, number>;
    runLatencyP99Ms: number | null;
    latencySampleCount: number;
  };
  tools: {
    total: number;
    failed: number;
    highRiskAutoExecutionCount: number;
    byStatus: Record<string, number>;
    byRiskLevel: Record<string, number>;
    topTools: Array<{ key: string; count: number }>;
    toolLatencyP99Ms: number | null;
    latencySampleCount: number;
  };
  approvals: {
    total: number;
    byStatus: Record<string, number>;
  };
  strategy: {
    byMode: Record<string, number>;
    byFinalEngine: Record<string, number>;
    legacyFallbackCount: number;
    shadowCount: number;
    sampleCount: number;
  };
  cache: {
    status: 'measured' | 'not_measured' | string;
    hitRate: number | null;
    sampleCount: number;
    reason?: string;
  };
  cost?: {
    status: 'measured' | 'estimated' | 'not_measured' | string;
    sampleCount: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalChars: number;
    estimatedUsd: number;
    source?: string;
    reason?: string;
  };
  eval: {
    total: number;
    byStatus: Record<string, number>;
  };
  risks: {
    unauthorizedEvidenceCount: number;
    highRiskAutoExecutionCount: number;
  };
}

export interface AgentGovernanceRunDetail {
  run: AgentRunRecord;
  messages: AgentMessageRecord[];
  steps: AgentStepRecord[];
  toolCalls: AgentToolCallRecord[];
  approvals: AgentApprovalRecord[];
  replay?: Record<string, unknown>;
}

export interface AgentGovernanceUncoveredQuestion {
  question: string;
  count: number;
  latestAt?: string;
  lastError?: string | null;
}

export type AgentKnowledgeGraphNodeType =
  | 'Domain'
  | 'BusinessObject'
  | 'DataModel'
  | 'Field'
  | 'Capability'
  | 'ActionIntent'
  | 'Word'
  | 'PermissionCode'
  | string;

export type AgentKnowledgeGraphEdgeType =
  | 'BELONGS_TO'
  | 'COMPOSED_OF'
  | 'HAS_FIELD'
  | 'FK_RELATION'
  | 'SYNONYM_OF'
  | 'TRIGGERS'
  | 'SUPPORTS_ACTION'
  | 'EXCLUDES'
  | 'REQUIRES_PERM'
  | string;

export interface AgentKnowledgeGraphSummary {
  generatedAt: string;
  schemaHash: string;
  nodeCount: number;
  edgeCount: number;
  nodeCountsByType: Record<string, number>;
  edgeCountsByType: Record<string, number>;
  businessObjectCount: number;
  dataModelCount: number;
  activeCapabilityCount: number;
  permissionCodeCount: number;
  passed: boolean;
  blockerCount: number;
  warningCount: number;
}

export interface AgentKnowledgeGraphNode {
  id: string;
  type: AgentKnowledgeGraphNodeType;
  name: string;
  displayName?: string;
  description?: string;
  source: string;
  sourcePath?: string;
  confidence: number;
  updatedAt: string;
  properties?: Record<string, unknown>;
}

export interface AgentKnowledgeGraphEdge {
  id: string;
  type: AgentKnowledgeGraphEdgeType;
  from: string;
  to: string;
  label?: string;
  source: string;
  sourcePath?: string;
  confidence: number;
  updatedAt: string;
  properties?: Record<string, unknown>;
}

export interface AgentKnowledgeGraphNodeDetail {
  node: AgentKnowledgeGraphNode;
  outgoing: AgentKnowledgeGraphEdge[];
  incoming: AgentKnowledgeGraphEdge[];
  relatedNodes?: AgentKnowledgeGraphNode[];
}

export interface AgentKnowledgeGraphGap {
  code: string;
  severity: 'blocker' | 'warning' | 'info' | string;
  title: string;
  detail: string;
  targetId?: string;
  sourcePath?: string;
  suggestedFix: string;
}

export interface AgentKnowledgeGraphVisualizeResult {
  focusId?: string;
  depth?: number;
  nodes: AgentKnowledgeGraphNode[];
  edges: AgentKnowledgeGraphEdge[];
}

export interface AgentKnowledgeGraphPathResult {
  found: boolean;
  path: string[];
  maxDepth: number;
}

export interface AgentKnowledgeGraphOverride {
  id: number;
  overrideType: 'synonym' | 'exclude' | string;
  relationType: string;
  sourceNodeId?: string | null;
  targetNodeId?: string | null;
  value?: string | null;
  label?: string | null;
  reason?: string | null;
  status: string;
  source: string;
  confidence: number;
  payload?: Record<string, unknown> | null;
  createdBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  nextGraphMerge?: string;
}

export interface CreateAgentKnowledgeGraphSynonymInput {
  targetNodeId: string;
  synonym: string;
  reason?: string;
  confidence?: number;
}

export interface CreateAgentKnowledgeGraphExcludeInput {
  sourceNodeId: string;
  targetNodeId: string;
  reason?: string;
  confidence?: number;
}

export interface AgentGovernanceCapabilityHealth {
  activeManifestVersion?: string | null;
  total: number;
  enabled: number;
  disabled: number;
  byReleaseStrategy: Record<string, number>;
  byRiskLevel: Record<string, number>;
}

export interface AgentGovernanceCapabilityHeatMapItem {
  domain: string;
  releaseStrategy: string;
  count: number;
}

export interface AgentGovernanceAutoPublishRun {
  id: number;
  runNo: string;
  status: AgentGovernanceStatus;
  requestedBy?: number | null;
  sourceVersionId?: number | null;
  targetVersionId?: number | null;
  input?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string | null;
  createdAt: string;
}

export type AgentV2GrayMode =
  | 'legacy_regex'
  | 'shadow'
  | 'kg_llm_preferred'
  | 'kg_llm_only'
  | 'legacy_retired'
  | string;

export interface AgentV2GrayRule {
  id: number;
  name: string;
  mode: AgentV2GrayMode;
  status: string;
  priority: number;
  storeIds: number[];
  personaCodes: string[];
  roles: string[];
  entrypoints: string[];
  capabilityIds: string[];
  scopeSummary: string;
  reason?: string | null;
  source: string;
  payload?: Record<string, unknown> | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  deletedBy?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  nextRuntimeRefresh?: string;
}

export interface CreateAgentV2GrayRuleInput {
  name: string;
  mode: AgentV2GrayMode;
  priority?: number;
  storeIds?: number[];
  personaCodes?: string[];
  roles?: string[];
  entrypoints?: string[];
  capabilityIds?: string[];
  reason?: string;
}

export interface AgentGovernanceEvalCase {
  id: string;
  source?: string;
  question: string;
  roleGroup?: string;
  expectedCapabilityId?: string;
  expectedIntent?: string;
  expectedPersonaCodes?: string[];
  expectedOutputKinds?: string[];
  permissionResult?: string;
  contractResult?: string;
  failureCategory?: string;
  priority: string;
}

export interface AgentGovernanceEvalCaseInput {
  question: string;
  scenario?: string;
  role?: string;
  roleGroup?: string;
  expectedCapabilityId?: string;
  expectedIntent?: string;
  expectedPersonaCodes?: string[];
  expectedOutputKinds?: string[];
  permissionResult?: string;
  contractResult?: string;
  failureCategory?: string;
  priority?: string;
  status?: string;
}

export interface AgentGovernanceEvalGate {
  gate: string;
  expected: string;
  actual: string;
  pass: boolean;
  level?: string;
}

export interface AgentGovernanceEvalMetricStatus {
  status: string;
  reason?: string;
}

export interface AgentGovernanceEvalGateReport {
  generatedAt: string;
  source?: Record<string, string>;
  summary: Record<string, number | boolean | string>;
  metrics?: Record<string, number | string | AgentGovernanceEvalMetricStatus>;
  gates: AgentGovernanceEvalGate[];
  samples?: Record<string, unknown[]>;
}

export interface AgentGovernanceEvalRunRecord {
  id: number;
  caseId?: number | null;
  runId?: number | null;
  status: string;
  score?: number | string | null;
  resultJson?: Record<string, unknown> | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface AgentGovernanceEvalRunFailure {
  type: string;
  category: string;
  index?: number;
  id?: string | number | null;
  title?: string;
  question?: string;
  expected?: string;
  actual?: string;
  expectedCapabilityId?: string | null;
  actualCapabilityId?: string | null;
  reason?: string;
  severity?: string;
  sample?: Record<string, unknown>;
}

export interface AgentGovernanceEvalRunDetail extends AgentGovernanceEvalRunRecord {
  source?: unknown;
  importedAt?: string | null;
  summary?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  gates?: AgentGovernanceEvalGate[];
  failedGates?: AgentGovernanceEvalGate[];
  samples?: Record<string, unknown>;
  failureCount: number;
  failures: AgentGovernanceEvalRunFailure[];
}

export interface AgentGovernanceEvalRunFailureList extends AgentGovernanceListResult<AgentGovernanceEvalRunFailure> {
  categories: Record<string, number>;
  run: Pick<AgentGovernanceEvalRunRecord, 'id' | 'status' | 'score' | 'createdAt'>;
  summary: string;
}

export interface AgentGovernanceQueryReplay {
  requested: boolean;
  available: boolean;
  source?: string;
  toolCount?: number;
  reason?: string;
  queryTraces?: Array<Record<string, unknown>>;
  sqlSummaries?: Array<Record<string, unknown>>;
  note?: string;
}

export interface AgentGovernancePolicyTrace {
  available: boolean;
  overallStatus: 'pass' | 'review' | 'deny' | 'not_applicable' | string;
  allowed?: boolean;
  requiresApproval?: boolean;
  actor?: Record<string, unknown>;
  capability?: Record<string, unknown> | null;
  tool?: Record<string, unknown> | null;
  fieldPolicySummary?: {
    allow?: string[];
    mask?: string[];
    deny?: string[];
  };
  checks?: Array<{
    name: string;
    status: 'pass' | 'review' | 'deny' | string;
    reason: string;
  }>;
  note?: string;
}

export interface AgentGovernanceEvalFailureReplayRequest {
  category?: string;
  index?: number;
  failureId?: string | number;
  storeId?: number;
  role?: 'manager' | 'reception' | 'beautician' | string;
  entrypoint?: string;
  grayMode?: string;
  toolReplay?: boolean;
}

export interface AgentGovernanceEvalFailureReplayResult {
  run: Pick<AgentGovernanceEvalRunRecord, 'id' | 'status' | 'score' | 'createdAt'>;
  failure: AgentGovernanceEvalRunFailure;
  replay: AgentGovernanceDebugResult;
  comparison: {
    expectedCapabilityId: string | null;
    previousActualCapabilityId: string | null;
    replayCapabilityId: string | null;
    previousMatchedExpected: boolean | null;
    replayMatchedExpected: boolean | null;
    changedFromPrevious: boolean | null;
  };
  diagnosis: {
    category: string;
    status: string;
    message: string;
  };
  safety: {
    dryRun: boolean;
    toolExecution: boolean;
    readOnlyToolReplay?: boolean;
    writeExecution: boolean;
    note?: string;
  };
  toolReplay?: {
    requested: boolean;
    executed: boolean;
    mode?: string;
    allowedTools?: string[];
    skipped?: Array<Record<string, unknown>>;
    results?: Array<Record<string, unknown>>;
    note?: string;
  };
  queryReplay?: AgentGovernanceQueryReplay;
  contractReplay?: {
    requested: boolean;
    executed: boolean;
    reason?: string;
    answer?: string | null;
    renderedBlocks?: Array<Record<string, unknown>>;
    answerContract?: {
      valid: boolean;
      errors: string[];
      warnings: string[];
    } | null;
    phaseOutputs?: Array<Record<string, unknown>>;
    note?: string;
  };
}

export interface AgentGovernanceEvalRunImportResult {
  id: number;
  status: string;
  score?: number | string | null;
  totalQuestions: number;
  p0Questions: number;
  createdAt: string;
  source?: string;
  trigger?: string;
}

export interface AgentGovernanceEvalDryRunBatchRequest {
  priority?: string;
  limit?: number;
  role?: 'manager' | 'reception' | 'beautician' | string;
  storeId?: number;
  entrypoint?: string;
  grayMode?: string;
  note?: string;
}

export interface AgentGovernanceEvalDryRunBatchResult extends AgentGovernanceEvalRunImportResult {
  summary?: Record<string, unknown>;
  gates?: AgentGovernanceEvalGate[];
  samples?: Record<string, unknown[]>;
}

export interface AgentGovernanceDebugContext {
  question: string;
  storeId?: number | null;
  role?: string;
  entrypoint?: string;
  grayMode?: string;
  manifestVersion?: string | null;
  activeManifestVersion?: string | null;
  manifestVersionSource?: string;
  permissions?: string[];
  dryRun?: boolean;
}

export interface AgentGovernanceGraphTrace {
  available: boolean;
  source?: string;
  cacheHit?: boolean;
  normalizedQuestion?: string | null;
  graphContextCounts?: {
    objectHints?: number;
    domainHints?: number;
    capabilityHints?: number;
    exclusions?: number;
    fieldHints?: number;
  };
  selectedIntent?: {
    objects?: string[];
    domain?: string;
    action?: string;
    timeIntent?: string;
    candidateCapabilities?: string[];
    confidence?: number;
  } | null;
  objectHints?: Array<Record<string, unknown>>;
  domainHints?: Array<Record<string, unknown>>;
  capabilityHints?: Array<Record<string, unknown>>;
  exclusions?: Array<Record<string, unknown>>;
  reason?: string;
  note?: string;
}

export interface AgentGovernanceDebugComparison {
  manifestVersions?: {
    active?: string | null;
    target?: string | null;
    targetAvailable?: boolean | null;
    selectedByMode?: Record<string, string | null>;
    selectedByVersion?: Record<string, string | null>;
    changedAcrossModes?: boolean;
  };
  graphContext?: {
    withGraphMode?: string;
    withoutGraphMode?: string;
    withGraph?: Record<string, unknown> | null;
    withoutGraph?: Record<string, unknown> | null;
  };
  legacyVsKgLlm?: {
    legacy?: Record<string, unknown> | null;
    kgLlm?: Record<string, unknown> | null;
    changedCapability?: boolean;
    changedOutputShape?: boolean;
    changedEvidence?: boolean;
  };
  consistency?: {
    mode?: string;
    iterations?: number;
    stable?: boolean;
    capabilityCounts?: Record<string, number>;
    finalEngineCounts?: Record<string, number>;
    outputShapeCounts?: Record<string, number>;
    evidenceCounts?: Record<string, number>;
    latencyMs?: Record<string, number>;
    costEstimate?: Record<string, unknown>;
    samples?: Array<Record<string, unknown>>;
  };
  differences?: Record<string, unknown>;
  manifestVersionComparison?: {
    requestedVersion?: string;
    activeVersion?: string | null;
    targetVersion?: string | null;
    targetAvailable?: boolean;
    targetStatus?: string | null;
    source?: string;
    itemCount?: number;
    active?: Record<string, unknown> | null;
    target?: Record<string, unknown> | null;
    targetResult?: AgentGovernanceDebugResult;
    changedManifestVersion?: boolean;
    changedCapability?: boolean;
    changedOutputShape?: boolean;
    changedEvidence?: boolean;
    addedCapabilities?: string[];
    removedCapabilities?: string[];
    reason?: string | null;
    note?: string;
  } | null;
  verdict?: {
    localDryRunStable?: boolean;
    canJudgeNewArchitectureMoreStable?: boolean;
    reasons?: string[];
    productionEvidenceRequired?: string;
  };
}

export interface AgentGovernanceManifestSimulation {
  activeManifestVersion?: string | null;
  temporaryOnly?: boolean;
  applied?: boolean;
  capabilityId?: string | null;
  baseSelectedCapabilityId?: string | null;
  simulatedSelectedCapabilityId?: string | null;
  changedFields?: string[];
  patch?: {
    enabled?: boolean;
    triggerKeywords?: string[];
    negativeExamples?: string[];
    outputKinds?: string[];
    [key: string]: unknown;
  };
  triggerMatched?: boolean;
  negativeMatched?: boolean;
  effect?: string;
  reason?: string;
  formalEditUrl?: string;
  note?: string;
}

export interface AgentGovernanceDebugResult {
  question: string;
  dryRun?: boolean;
  grayMode?: string;
  debugContext?: AgentGovernanceDebugContext;
  selectedCapabilityId?: string | null;
  confidence?: number;
  reason?: string;
  plan?: unknown;
  decision?: unknown;
  strategy?: unknown;
  intentTrace?: Record<string, unknown> | null;
  graphTrace?: AgentGovernanceGraphTrace;
  llmTrace?: {
    available: boolean;
    source?: string;
    fallbackReason?: string | null;
    prompt?: Record<string, unknown> | null;
    response?: Record<string, unknown> | null;
    reason?: string;
  };
  policyTrace?: AgentGovernancePolicyTrace;
  replay?: Record<string, unknown>;
  current?: AgentGovernanceDebugResult;
  legacyRegex?: AgentGovernanceDebugResult;
  modes?: Record<string, AgentGovernanceDebugResult>;
  comparison?: AgentGovernanceDebugComparison;
  differences?: Record<string, unknown>;
  simulation?: AgentGovernanceManifestSimulation;
  safety?: {
    dryRun: boolean;
    toolExecution: boolean;
    readOnlyToolReplay?: boolean;
    writeExecution: boolean;
    note?: string;
  };
  toolReplay?: {
    requested: boolean;
    executed: boolean;
    mode?: string;
    allowedTools?: string[];
    skipped?: Array<Record<string, unknown>>;
    results?: Array<Record<string, unknown>>;
    note?: string;
  };
  queryReplay?: AgentGovernanceQueryReplay;
  contractReplay?: {
    requested: boolean;
    executed: boolean;
    reason?: string;
    answer?: string | null;
    renderedBlocks?: Array<Record<string, unknown>>;
    answerContract?: {
      valid: boolean;
      errors: string[];
      warnings: string[];
    } | null;
    phaseOutputs?: Array<Record<string, unknown>>;
    note?: string;
  };
  note?: string;
}

export interface AgentGovernanceDebugRequest {
  question: string;
  storeId?: number;
  role?: 'manager' | 'reception' | 'beautician' | string;
  entrypoint?: string;
  grayMode?: string;
  toolReplay?: boolean;
  compareManifestVersion?: string;
  capabilityId?: string;
  enabled?: boolean;
  triggerKeywords?: string[];
  negativeExamples?: string[];
  outputKinds?: string[];
}
