import type {
  AgentPersonaCode,
  AgentRiskLevel,
  AgentRole,
  AgentRunResultV2,
  AgentRunStatus,
  AgentToolPlanItem,
} from '@ami/agent-core';

export type {
  AgentAppendMessageRequest,
  AgentApprovalSummary,
  AgentCreateRunRequest,
  AgentEvidence,
  AgentFeedbackRequest,
  AgentPersonaCode,
  AgentPersonaSummary,
  AgentPlan,
  AgentRouteDecision,
  AgentRiskLevel,
  AgentRole,
  AgentRunStatus,
  AgentRunResultV2,
  AgentSuggestedAction,
  AgentToolPlanItem,
  AgentToolResult,
  AuraBlockAction,
  AuraResponseBlock,
} from '@ami/agent-core';

export interface AgentApprovalDecisionRequest {
  role?: AgentRole;
  operatorId?: number | null;
  comment?: string;
  args?: Record<string, unknown>;
}

export interface AgentCompileBusinessTaskRequest {
  message: string;
  role?: AgentRole;
  context?: Record<string, unknown>;
}

export interface BusinessTimeRange {
  preset: string;
  startDate?: string;
  endDate?: string;
  label: string;
}

export interface BusinessTask {
  taskType: string;
  domain: string;
  objective: string;
  entities: Array<{ type: string; value: string; confidence: number }>;
  metrics: string[];
  filters: Record<string, unknown>;
  timeRange?: BusinessTimeRange;
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit?: number;
  outputMode: string;
  riskLevel: AgentRiskLevel;
  requiresApproval: boolean;
  missingSlots: string[];
  confidence: number;
  actorRole?: AgentRole;
}

export interface SemanticSqlCandidate {
  status: 'allowed' | 'rejected' | 'not_candidate' | string;
  allowed: boolean;
  reason: string;
  metricKeys: string[];
  dimensions: string[];
  timeRange?: BusinessTimeRange;
  limit?: number;
  rejectedRules: string[];
  fallbackCapability?: string;
}

export interface AgentBusinessTaskValidation {
  valid: boolean;
  confidence: number;
  missingSlots: string[];
  warnings: string[];
  clarificationQuestion?: string | null;
}

export interface AgentBusinessTaskCompileResult {
  task: BusinessTask;
  preParsed: unknown;
  llmDraft: unknown;
  validation: AgentBusinessTaskValidation;
  capabilityMatches: Array<{
    capabilityId: string;
    reason: string;
    toolPlan: AgentToolPlanItem[];
  }>;
  metricMatches: Array<Record<string, unknown>>;
  semanticSqlCandidate: SemanticSqlCandidate;
}

export interface AgentPhaseOutput {
  phase: 'core_conclusion' | 'details' | 'recommendations' | 'action_draft';
  title: string;
  summary: string;
  blockKinds?: string[];
  actionLabels?: string[];
}

export interface AgentRunResult extends AgentRunResultV2 {
  phaseOutputs?: AgentPhaseOutput[];
}

export interface AgentToolCatalogItem {
  name: string;
  description: string;
  riskLevel: AgentRiskLevel;
  allowedRoles: AgentRole[];
  requiredPermissions: string[];
  requiresApproval: boolean;
  consumedSlots?: string[];
  maxRows?: number;
  timeoutMs: number;
}

export interface AgentEvalCaseResult {
  id: string;
  scenario: string;
  passed: boolean;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  errors: string[];
}

export interface AgentEvalSummary {
  total: number;
  passed: number;
  failed: number;
  results: AgentEvalCaseResult[];
}

export interface AgentRunRecord {
  id: number;
  runNo: string;
  storeId: number;
  userId?: number | null;
  deviceId?: number | null;
  role: AgentRole | string;
  entrypoint: string;
  agentCode: string;
  personaCode?: string | null;
  status: AgentRunStatus | string;
  userInput: string;
  planJson?: unknown;
  contextJson?: unknown;
  evidenceJson?: unknown;
  resultJson?: unknown;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  toolCallCount?: number;
  approvalCount?: number;
}

export interface AgentMessageRecord {
  id: number;
  runId: number;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  metadata?: unknown;
  createdAt: string;
}

export interface AgentStepRecord {
  id: number;
  runId: number;
  stepType: string;
  name: string;
  status: string;
  inputJson?: unknown;
  outputJson?: unknown;
  startedAt: string;
  endedAt?: string | null;
}

export interface AgentToolCallRecord {
  id: number;
  runId: number;
  toolName: string;
  riskLevel: AgentRiskLevel | string;
  status: string;
  argsJson: unknown;
  resultJson?: unknown;
  approvalId?: number | null;
  idempotencyKey?: string | null;
  latencyMs?: number | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface AgentApprovalRecord {
  id: number;
  runId: number;
  toolCallId?: number | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  requestedBy?: number | null;
  approvedBy?: number | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  comment?: string | null;
  createdAt: string;
  decidedAt?: string | null;
}

export interface AgentApprovalListItem extends AgentApprovalRecord {
  run?: Pick<AgentRunRecord, 'id' | 'runNo' | 'userInput' | 'status' | 'role' | 'entrypoint' | 'agentCode'> | null;
  toolCall?: Pick<AgentToolCallRecord, 'id' | 'toolName' | 'riskLevel' | 'status' | 'argsJson' | 'resultJson'> | null;
}

export interface AgentRunDetail {
  run: AgentRunRecord | null;
  messages: AgentMessageRecord[];
  steps: AgentStepRecord[];
  toolCalls: AgentToolCallRecord[];
  approvals: AgentApprovalRecord[];
}

export interface AgentRunListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  role?: string;
  personaCode?: string;
  entrypoint?: string;
  keyword?: string;
}

export interface AgentApprovalListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
}

// ─── Persona（六大角色 Agent 配置）──────────────────────────────────────────

export interface UpdateAgentPersonaRequest {
  toolGroups?: string[];
  suggestedQuestions?: string[];
}

// AuraResponseBlock、AgentRunResultV2、AgentFeedbackRequest 由 @ami/agent-core 统一导出。

export interface AgentMemoryItem {
  id: number;
  storeId: number;
  userId?: number | null;
  personaCode?: AgentPersonaCode | string | null;
  memoryType: string;
  title: string;
  content: string;
  summary?: string | null;
  importance: number;
  sourceRunId?: number | null;
  status: string;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentDailyArchiveItem {
  id: number;
  storeId: number;
  archiveDate: string;
  personaCode?: AgentPersonaCode | string | null;
  title: string;
  summary: string;
  metricsJson?: unknown;
  highlightsJson?: unknown;
  risksJson?: unknown;
  actionsJson?: unknown;
  sourceRunIds?: unknown;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentQualityReport {
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };
  kpis: {
    runCount: number;
    completed: number;
    failed: number;
    successRate: number;
    feedbackCount: number;
    adopted: number;
    rejected: number;
    adoptionRate: number;
    avgRating?: number | null;
    avgLatencyMs?: number | null;
    evalRunCount?: number;
    evalPassed?: number;
    evalPassRate?: number | null;
  };
  questionBank?: {
    totalQuestions: number;
    structuredQuestions: number;
    coverageRate: number;
    p0Cases: number;
    conversationCases: number;
    conversationTurns: number;
    priorityPassRates: Array<{
      priority: 'P0' | 'P1' | 'P2' | string;
      total: number;
      passed: number;
      failed: number;
      passRate?: number | null;
    }>;
  };
  personaBreakdown: Array<{
    name: string;
    runCount: number;
    completed: number;
    failed: number;
    successRate: number;
  }>;
  entrypointBreakdown: Array<{
    name: string;
    runCount: number;
    completed: number;
    failed: number;
    successRate: number;
  }>;
  toolBreakdown: Array<{
    toolName: string;
    callCount: number;
    failed: number;
    failureRate: number;
    avgLatencyMs?: number | null;
  }>;
  recentNegativeFeedback: Array<{
    runId: number;
    rating?: number | null;
    adopted?: boolean | null;
    comment?: string | null;
    createdAt: string;
  }>;
  recommendations: string[];
}

export interface AgentFeedbackFailureReport {
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };
  kpis: {
    negativeFeedbackCount: number;
    affectedSkillCount: number;
  };
  bySkill: Array<{
    skillId: string;
    capabilityId: string;
    count: number;
    latestAt?: string;
    reasons: string[];
  }>;
  items: Array<{
    feedbackId: number;
    runId: number;
    role: string;
    personaCode?: string | null;
    rating?: number | null;
    adopted?: boolean | null;
    reason: string;
    question: string;
    answer: string;
    skillId: string;
    capabilityId: string;
    toolNames: string[];
    createdAt: string;
  }>;
}

export interface AgentFeedbackFailureImportResult {
  dryRun: boolean;
  created: number;
  candidates: Array<{
    scenario: string;
    input: string;
    role: string;
    expectedTool?: string | null;
    expectedOutcome: unknown;
    status: string;
  }>;
}

export interface AgentSchemaReadinessGroup {
  code: 'memory_archive' | 'automation_engine' | string;
  name: string;
  migration: string;
  requiredTables: string[];
  ready: boolean;
  migrationApplied: boolean;
  missingTables: string[];
}

export interface AgentSchemaReadiness {
  ready: boolean;
  checkedAt: string;
  groups: AgentSchemaReadinessGroup[];
  missingTables: string[];
  missingMigrations: string[];
}

export interface AgentKnowledgeGovernance {
  schemaGraph: {
    nodeCount: number;
    relationCount: number;
    storeScopedCount: number;
    objects: Array<{
      modelName: string;
      objectType: string;
      displayName: string;
      storeScoped: boolean;
      relationCount: number;
      queryableFieldCount: number;
    }>;
  };
  capabilityCatalog: {
    total: number;
    filtered: number;
    items: Array<{
      capabilityId: string;
      businessQueryCapabilityId?: string;
      displayName: string;
      personaCodes: string[];
      objectTypes: string[];
      actions: string[];
      outputKinds: string[];
      riskLevel: string;
      examples: string[];
    }>;
  };
  evalReport?: {
    generatedAt: string;
    summary: {
      total: number;
      passed: number;
      failed: number;
      passRate: number;
      routingAccuracy: number;
      entityAccuracy: number;
      actionAccuracy: number;
      capabilityAccuracy: number;
      outputContractAccuracy: number;
      topFailureReasons: Array<{ reason: string; count: number }>;
    };
    gate?: {
      level: 'p0' | 'p1' | 'p2' | string;
      passed: boolean;
      evaluatedTotal: number;
      violations: string[];
      actual: {
        passRate: number;
        failed: number;
        routingAccuracy: number;
        baselinePassRate?: number;
      };
    } | null;
    failures: Array<{
      id: string;
      input: string;
      failureReasons: string[];
      expected: { capabilityId: string; personaCode: string; outputKinds: string[] };
      actual: { capabilityId?: string; personaCodes: string[]; outputKinds: string[] };
    }>;
    improvementBacklog: Array<{
      id: string;
      input: string;
      priority: string;
      failureReasons: string[];
      expectedCapabilityId: string;
      actualCapabilityId?: string;
      recommendation: string;
    }>;
  } | null;
  entityDebug?: {
    status: string;
    query: string;
    clarificationQuestion?: string | null;
    candidates: Array<{
      objectType: string;
      entityId: string;
      displayName: string;
      confidence: number;
      matchStrategy: string;
      sourceModel: string;
      evidence: string[];
    }>;
    entity?: {
      objectType: string;
      entityId: string;
      displayName: string;
      confidence: number;
      matchStrategy: string;
      sourceModel: string;
    };
  } | null;
  legacyRules: {
    scannedRuns: number;
    legacyFallbackRuns: number;
    usageByReason: Array<{ reason: string; count: number }>;
    samples: Array<{
      runId: number;
      runNo: string;
      question: string;
      fallbackReason: string;
      createdAt: string;
    }>;
    deprecationWindows?: {
      latest: { label: string; runCount: number; legacyFallbackRuns: number };
      previous: { label: string; runCount: number; legacyFallbackRuns: number };
    };
    retainedReasons?: Array<{ reason: string; latestCount: number; previousCount: number }>;
    deprecationCandidates?: Array<{
      reason: string;
      latestCount: number;
      previousCount: number;
      candidate: boolean;
      action: string;
    }>;
    deprecationPolicy: string[];
  };
}

export interface AgentAutomationTriggerTemplate {
  code: string;
  name: string;
  domain: string;
  riskLevel: AgentRiskLevel;
  defaultConfig: Record<string, unknown>;
  defaultActionPlan: Record<string, unknown>;
  approvalPolicy: Record<string, unknown>;
}

export interface AgentAutomationDefinitionItem {
  id: number;
  storeId: number;
  personaCode?: AgentPersonaCode | string | null;
  name: string;
  description?: string | null;
  triggerType: string;
  triggerConfigJson: unknown;
  actionPlanJson: unknown;
  approvalPolicyJson?: unknown;
  scheduleJson?: unknown;
  riskLevel: AgentRiskLevel | string;
  status: string;
  sourceRunId?: number | null;
  createdBy?: number | null;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentAutomationRunItem {
  id: number;
  definitionId?: number | null;
  storeId: number;
  personaCode?: AgentPersonaCode | string | null;
  triggerType: string;
  mode: string;
  status: string;
  triggeredBy?: number | null;
  inputJson?: unknown;
  outputJson?: unknown;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface AgentAutomationEffectItem {
  id: number;
  definitionId?: number | null;
  runId?: number | null;
  storeId: number;
  effectType: string;
  objectType?: string | null;
  objectId?: number | null;
  customerId?: number | null;
  metricKey?: string | null;
  impactJson?: unknown;
  status: string;
  occurredAt: string;
  createdAt: string;
}

export interface AgentAutomationDraftRequest {
  personaCode?: string;
  goal?: string;
  name?: string;
  description?: string;
  triggerType?: string;
  triggerConfig?: unknown;
  actionPlan?: unknown;
  approvalPolicy?: unknown;
  schedule?: unknown;
  riskLevel?: AgentRiskLevel | string;
  sourceRunId?: number;
}

export interface AgentAutomationRunResult {
  run: AgentAutomationRunItem;
  effect: AgentAutomationEffectItem;
  definition: AgentAutomationDefinitionItem;
  approvalRequired: boolean;
}

export interface AgentAutomationDueRunResult {
  checkedCount: number;
  triggeredCount: number;
  skippedCount: number;
  results: AgentAutomationRunResult[];
}

export interface AgentAutomationEventEvaluateResult {
  eventType: string;
  checkedCount: number;
  matchedCount: number;
  results: AgentAutomationRunResult[];
}
