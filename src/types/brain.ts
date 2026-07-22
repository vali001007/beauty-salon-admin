export type BrainRoleKey =
  | 'store_manager'
  | 'receptionist'
  | 'beautician'
  | 'marketing'
  | 'finance'
  | 'inventory'
  | 'customer_service';

export type BrainRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type BrainRunStatus = 'queued' | 'running' | 'needs_confirmation' | 'completed' | 'failed' | 'cancelled';
export type BrainActionDecisionStatus =
  | 'pending'
  | 'queued'
  | 'executing'
  | 'succeeded'
  | 'partially_succeeded'
  | 'failed'
  | 'expired'
  | 'rejected';
export type BrainMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface BrainInspectionRepairChange {
  inputKey: string;
  field: string;
  label: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  editable: true;
}

export interface BrainInspectionRepairPreview {
  schemaVersion: 1;
  findingId: number;
  ruleKey: string;
  title: string;
  severity: string;
  target: { objectType: string; objectId: string };
  summary: string;
  entry: string | null;
  changes: BrainInspectionRepairChange[];
  risks: string[];
  policy: {
    mode: 'preview_only';
    autoExecute: false;
    createsBusinessWrite: false;
    requiresSeparateBusinessAction: true;
  };
  previewFingerprint: string;
  existingDecision: Record<string, unknown> | null;
}

export type BrainInspectionRepairDecision = 'approve' | 'modify' | 'reject';

export interface BrainInspectionRepairDecisionResponse {
  findingId: number;
  decision: BrainInspectionRepairDecision;
  status: string;
  repairReview: Record<string, unknown>;
  nextAction: { type: 'open_business_screen'; entry: string | null; autoExecute: false } | null;
}

export interface BrainInspectionInboxItem {
  id: number;
  ruleKey: string;
  domain: string;
  title: string;
  severity: BrainRiskLevel;
  status: string;
  target: { objectType: string; objectId: string };
  evidence: Record<string, unknown>;
  suggestion: {
    action: string;
    entry: string | null;
    planningStatus: string | null;
    actionPreviewCount: number;
  };
  canReview: boolean;
  firstDetectedAt: string;
  lastDetectedAt: string;
}

export interface BrainInspectionInboxResponse {
  items: BrainInspectionInboxItem[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
  storeId: number;
}

export interface BrainChatRequest {
  conversationId?: number;
  message: string;
  roleHint?: BrainRoleKey;
  timezone: string;
  guidanceSelection?: BrainGuidanceSelection;
}

export interface BrainGuidanceSelection {
  kind: 'clarification' | 'follow_up';
  sourceRunId: number;
  optionId: string;
}

export interface BrainCitation {
  sourceType: 'metric' | 'table' | 'memory' | 'skill' | 'prediction' | string;
  sourceId: string;
  label?: string;
  definition?: string;
}

export type BrainResponseBlock =
  | { kind: 'text'; text: string; citationIds?: string[] }
  | { kind: 'kpi'; items: Array<{ label: string; value: string; hint?: string }>; citationIds?: string[] }
  | { kind: 'ranking'; rows: Array<Record<string, unknown>>; columns: string[]; citationIds?: string[] }
  | { kind: 'table'; rows: Array<Record<string, unknown>>; columns: string[]; citationIds?: string[] }
  | {
      kind: 'chart';
      chartType: 'bar' | 'line';
      rows: Array<Record<string, unknown>>;
      xKey: string;
      yKeys: string[];
      citationIds?: string[];
    }
  | {
      kind: 'comparison';
      items: Array<{ label: string; current: string; previous: string; delta?: string }>;
      citationIds?: string[];
    }
  | {
      kind: 'diagnosis';
      findings: Array<{ title: string; detail: string; severity: 'info' | 'warning' | 'critical' }>;
      citationIds?: string[];
    }
  | { kind: 'clarification'; question: string; options: Array<{ id: string; label: string; value: unknown }> }
  | { kind: 'follow_up_questions'; questions: Array<{ id: string; label: string; value: string }> }
  | { kind: 'action_preview'; actions: unknown[] }
  | { kind: 'limitations'; items: string[] }
  | { kind: 'evidence'; citations: BrainCitation[] };

export interface BrainActionPreview {
  actionId: string;
  skillKey?: string;
  actionType?: string;
  riskLevel: BrainRiskLevel;
  summary: string;
  impactItems?: Array<{ objectType: string; objectId: string; label: string }>;
  requiresConfirmation: boolean;
}

export interface BrainConversation {
  id: number;
  storeId: number;
  userId: number;
  title?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface BrainConversationListResponse {
  items: BrainConversation[];
  total: number;
  page: number;
  pageSize: number;
  storeId: number;
}

export interface BrainMessageMetadata {
  requestId?: string;
  timezone?: string;
  roleHint?: BrainRoleKey;
  guidanceSelection?: BrainGuidanceSelection;
  runId?: number;
  status?: BrainRunStatus;
  streamPhase?: string;
  citations?: BrainCitation[];
  suggestedActions?: BrainActionPreview[];
  blocks?: BrainResponseBlock[];
  routePlan?: Record<string, unknown>;
  adapterKey?: string;
  grounding?: string;
  adapterMetadata?: Record<string, unknown>;
}

export interface BrainMessage {
  id: number;
  conversationId: number;
  role: BrainMessageRole;
  content: string;
  metadata?: BrainMessageMetadata | null;
  createdAt: string;
}

export interface BrainMessageListResponse {
  conversationId: number;
  items: BrainMessage[];
  total: number;
  storeId: number;
}

export interface BrainRunEvent {
  id: number;
  runId: number;
  stepKey: string;
  layer: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  status: string;
  latencyMs?: number | null;
  durationMs?: number | null;
  durationSource?: 'recorded' | 'timeline_estimate' | 'unavailable';
  error?: Record<string, unknown> | null;
  createdAt: string;
}

export interface BrainRunEventsResponse {
  runId: number;
  events: BrainRunEvent[];
  storeId: number;
}

export interface BrainRunContextResponse {
  runId: number;
  conversationId: number;
  status: BrainRunStatus;
  storeId: number;
}

export interface BrainActionDecisionResponse {
  actionId: string;
  runId: number;
  status: BrainActionDecisionStatus;
  storeId: number;
  executionId?: number;
  duplicated?: boolean;
  retried?: boolean;
  retryable?: boolean;
  recovery?: 'safe_replay' | 'manual_reconcile';
  receipt?: {
    businessObjectType?: string;
    businessObjectId?: string | number;
    message?: string;
    [key: string]: unknown;
  } | null;
  error?: { code?: string; message?: string };
}

export interface BrainActionStatusListResponse {
  runId: number;
  storeId: number;
  items: BrainActionDecisionResponse[];
}

export interface BrainFeedbackResponse {
  id?: number;
  runId: number;
  storeId: number;
  rating: string;
  status?: string;
}

export interface BrainFeedbackIssue {
  feedbackId: number;
  runId: number;
  conversationId: number | null;
  question: string;
  answer: string;
  feedbackStatus: string;
  runStatus: string;
  createdAt: string;
}

export interface BrainFeedbackIssueListResponse {
  items: BrainFeedbackIssue[];
  total: number;
  page: number;
  pageSize: number;
  storeId: number;
}

export type BrainMemoryType = 'working' | 'session' | 'episodic' | 'semantic' | 'procedural';

export interface BrainMemoryRecord {
  id: number;
  storeId: number;
  userId?: number | null;
  type: BrainMemoryType;
  subjectKey: string;
  content: Record<string, unknown>;
  confidence: number;
  validFrom: string;
  expiresAt?: string | null;
  sourceRunId?: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  scope?: 'user' | 'store';
  state?: 'active' | 'expired' | 'deleted';
}

export interface BrainMemoryListResponse {
  items: BrainMemoryRecord[];
  total: number;
}

export interface BrainMemoryRevision {
  id: number;
  memoryId: number;
  previousMemoryId?: number | null;
  revisionType: string;
  previousContent?: Record<string, unknown> | null;
  nextContent?: Record<string, unknown> | null;
  changedByUserId?: number | null;
  reason?: string | null;
  createdAt: string;
}

export interface BrainMemoryRevisionListResponse {
  items: BrainMemoryRevision[];
  total: number;
}

export type BrainStreamEventType =
  | 'run_started'
  | 'progress'
  | 'step'
  | 'answer_delta'
  | 'block_delta'
  | 'block_completed'
  | 'action_preview'
  | 'completed'
  | 'failed';

export interface BrainStreamEvent {
  type: BrainStreamEventType;
  data: Record<string, unknown>;
}

export interface BrainChatResponse {
  conversationId: number;
  runId: number;
  status: BrainRunStatus;
  answer: string;
  citations: BrainCitation[];
  suggestedActions: BrainActionPreview[];
  blocks: BrainResponseBlock[];
  clarification?: {
    question: string;
    options: Array<{ id: string; label: string; value: unknown }>;
  };
}

export type BrainGovernanceRuntimeMode = 'rules' | 'shadow' | 'model';
export type BrainCapabilityRegenerationJobStatus =
  | 'queued'
  | 'leased'
  | 'retry_scheduled'
  | 'completed'
  | 'blocked'
  | 'dead_letter';

export interface BrainCapabilityRegenerationJob {
  id: number;
  releaseId: number;
  status: BrainCapabilityRegenerationJobStatus;
  progress: number;
  affectedCapabilities: string[];
  staticGatesPassed: number;
  contractCompileSecurity: string[];
  risk: { overall?: string; summary?: string; items?: unknown[] };
  blockingReasons: string[];
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  nextAction: 'retry' | 'modify_requirement' | 'complete_business_definition' | 'none';
  generatedResourceVersionIds: number[];
  availableAt: string | null;
  leasedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BrainCapabilityRegenerationJobListResponse {
  items: BrainCapabilityRegenerationJob[];
}

export interface BrainGovernanceRuntimeConfigResponse {
  configured: {
    cognitionMode: BrainGovernanceRuntimeMode;
    plannerMode: BrainGovernanceRuntimeMode;
    modelShadowPercent: number;
    modelCanaryPercent: number;
    minConfidence: number;
    capabilityTopK: number;
    capabilityMinConfidence: number;
    maxPlanNodes: number;
    maxReplans: number;
    totalTimeoutMs: number;
    modelTimeoutMs: number;
    singleToolFastPath: boolean;
  } | null;
  effective: {
    mode: BrainGovernanceRuntimeMode;
    releaseId: number | null;
    releaseKey: string | null;
    stage: string | null;
    userPercentage: number | null;
  };
  catalogValidation: {
    valid: boolean;
    capabilityCount: number;
    cardCount: number;
    issueCount: number;
    issues: Array<{
      capabilityKey: string;
      capabilityVersion: number;
      code: string;
      message: string;
      field?: string;
      value?: string;
    }>;
  } | null;
}

export interface BrainGovernanceSkill {
  id: number;
  skillKey: string;
  name: string;
  description?: string;
  version: number;
  enabled: boolean;
  domains?: string[];
  intents?: string[];
  permissions?: string[];
  allowedRoles?: string[];
  readOnly?: boolean;
  sideEffect?: boolean;
  riskLevel?: BrainRiskLevel;
  requiresConfirmation?: boolean;
  grounding?: string;
  definitionRefs?: unknown[];
  tests?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BrainSkillGovernanceSummary {
  versionId: number;
  skillId: number | null;
  skillKey: string;
  name: string;
  description: string;
  version: number;
  status: string;
  updatedAt: string;
  activeVersionId: number | null;
  activeVersion: number | null;
  enabled: boolean;
  historyCount: number;
  managed: boolean;
  domains: string[];
  entities: string[];
  metrics: string[];
}

export interface BrainSkillGovernanceHistoryItem {
  versionId: number;
  skillId: number | null;
  skillKey: string;
  name: string;
  description: string;
  version: number;
  status: string;
  enabled: boolean;
  type: string | null;
  riskLevel: string | null;
  permissions: string[] | null;
  updatedAt: string;
  activatedAt: string | null;
  archivedAt: string | null;
}

export interface BrainSkillGovernanceSummaryListResponse {
  items: BrainSkillGovernanceSummary[];
}

export interface BrainSkillGovernanceHistoryListResponse {
  items: BrainSkillGovernanceHistoryItem[];
}

export type BrainSemanticGovernanceResource = 'metrics' | 'entities' | 'relations';

export interface BrainSemanticGovernanceSummary {
  id: number;
  resourceType: 'metric' | 'ontology_entity' | 'ontology_relation';
  resourceKey: string;
  name: string;
  version: number;
  status: string;
  semanticDescription: string;
  dataTables: string[];
  fuzzyTerms: string[];
  hitCount: number;
  sampleCount: number;
  hitRate: number | null;
  updatedAt: string;
  managed: boolean;
  enabled: boolean;
  definitionId: number | null;
  definitionKey: string | null;
  definitionVersionId: number | null;
  historyCount: number;
}

export type BrainSemanticGovernanceHistoryItem = Omit<
  BrainSemanticGovernanceSummary,
  'hitCount' | 'sampleCount' | 'hitRate' | 'historyCount'
>;

export interface BrainSemanticGovernanceSummaryListResponse {
  items: BrainSemanticGovernanceSummary[];
}

export interface BrainSemanticGovernanceHistoryListResponse {
  items: BrainSemanticGovernanceHistoryItem[];
}

export interface BrainSemanticGraphNode {
  id: string;
  key: string;
  label: string;
  kind: 'entity' | 'relation' | 'metric' | 'table';
  status: string;
  version: number | null;
  description: string;
  dataTables: string[];
  fuzzyTerms: string[];
}

export interface BrainSemanticGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: 'relation_from' | 'relation_to' | 'metric_entity' | 'backed_by';
  label: string;
}

export interface BrainSemanticGraphResponse {
  nodes: BrainSemanticGraphNode[];
  edges: BrainSemanticGraphEdge[];
  summary: {
    entities: number;
    relations: number;
    metrics: number;
    tables: number;
    edges: number;
  };
}

export interface BrainEvalCatalogBase {
  questionId: string;
  question: string;
  questionType: string;
  intentType: string;
  persona: string;
  passed: boolean | null;
  status: string;
  hitRate: number | null;
  runId: number | null;
  failureReason: string | null;
  diagnosis: string;
  improvementSuggestion: string;
}

export interface BrainEvalCatalogItem extends BrainEvalCatalogBase {
  averageLatencyMs: number | null;
}

export interface BrainEvalCatalogLayerResult {
  layer: string;
  passed: boolean | null;
  score: number | null;
  checked: number | null;
  failures: string[];
}

export interface BrainEvalCatalogTestHistoryItem {
  releaseId: number | null;
  generatedAt: string | null;
  runId: number | null;
  status: string;
  brainStatus: string | null;
  passed: boolean | null;
  latencyMs: number | null;
  answer: string;
  graderReason: string | null;
  expectedIntent: string | null;
  actualIntent: string | null;
  expectedShape: string | null;
  actualShape: string | null;
  capabilityKeys: string[];
  citations: Array<{ sourceType: string; sourceId: string; label: string }>;
  layers: BrainEvalCatalogLayerResult[];
}

export interface BrainEvalCatalogDetail extends BrainEvalCatalogBase {
  semanticKeys: string[];
  dataTables: string[];
  testHistory: BrainEvalCatalogTestHistoryItem[];
}

export interface BrainEvalCatalogResponse {
  metadata: {
    generatedAt: string;
    sourceGeneratedAt: string | null;
    releaseId: number | null;
    storeId: number | null;
    total: number;
    passed: number;
    failed: number;
    unavailable: number;
    passRate: number | null;
    averageHitRate: number | null;
    sourceQuestionFile: string;
    sourceResultFile: string;
  } | null;
  types: Array<{ value: string; count: number }>;
  items: BrainEvalCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BrainEvalSuite {
  id: number | null;
  suiteKey: string;
  suiteLabel: string;
  stage: string;
  status: string;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  deterministicPassRate: number | null;
  judgePassRate: number | null;
  manualReview: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface BrainFullDomainEvalCatalogParams {
  page?: number;
  pageSize?: number;
  search?: string;
  domain?: string;
  role?: string;
  type?: string;
  difficulty?: string;
  deterministic?: 'passed' | 'failed';
  judge?: 'pass' | 'fail' | 'insufficient_evidence';
}

export interface BrainFullDomainEvalCatalogItem {
  questionId: string;
  question: string;
  questionType: string;
  domain: string;
  role: string;
  difficulty: string;
  expectedTarget: string;
  diagnosis: string;
  improvementSuggestion: string;
  deterministicPassed: boolean;
  judgeVerdict: string;
  judgeReason: string | null;
  latencyMs: number | null;
  failureCluster: string | null;
  answer?: string;
  citations?: unknown;
  deterministicGrade?: unknown;
  llmJudge?: unknown;
  notes?: string;
  turns?: string[];
  completedTurns?: number;
  error?: unknown;
}

export interface BrainFullDomainEvalCatalogResponse {
  run: Record<string, unknown>;
  filters: { domains: string[]; roles: string[]; types: string[]; difficulties: string[] };
  total: number;
  page: number;
  pageSize: number;
  items: BrainFullDomainEvalCatalogItem[];
}

export interface BrainGovernanceResourceVersion {
  id: number;
  resourceType: string;
  resourceKey: string;
  version: number;
  status: string;
  snapshot: Record<string, unknown>;
  checksum?: string;
  createdAt?: string;
}

export interface BrainGovernanceReleaseItem {
  id: number;
  resourceType: string;
  resourceKey: string;
  version: number;
  snapshot: Record<string, unknown>;
}

export interface BrainGovernanceRelease {
  id: number;
  releaseKey: string;
  scope: string;
  rollout?: Record<string, unknown>;
  status: string;
  previousReleaseId?: number | null;
  failureReason?: string | null;
  items?: BrainGovernanceReleaseItem[];
  itemCount?: number;
  createdAt: string;
  activatedAt?: string | null;
  rolledBackAt?: string | null;
}

export interface BrainGovernanceTraceStep {
  id: number;
  runId: number;
  stepKey: string;
  layer: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  status: string;
  latencyMs?: number | null;
  error?: Record<string, unknown> | null;
  createdAt: string;
}

export interface BrainGovernanceTrace {
  id: number;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  createdAt: string;
  latencyMs?: number | null;
  steps?: BrainGovernanceTraceStep[];
}

export interface BrainGovernanceTraceListResponse {
  items: BrainGovernanceTrace[];
  total: number;
}

export interface BrainGovernanceSkillListResponse {
  items: BrainGovernanceSkill[];
}

export interface BrainGovernanceResourceVersionListResponse {
  items: BrainGovernanceResourceVersion[];
}

export interface BrainGovernanceReleaseListResponse {
  items: BrainGovernanceRelease[];
}

export interface BrainRolloutSequenceResponse {
  items: BrainGovernanceRelease[];
  stages: string[];
}

export type BrainReleaseModificationResponse =
  | {
      requestType: 'business_definition';
      status: 'blocked';
      redirectTo: string;
      draft: Record<string, unknown> | null;
      request: Pick<
        BrainGovernanceResourceVersion,
        'id' | 'resourceType' | 'resourceKey' | 'version' | 'status' | 'createdAt'
      >;
      job: BrainCapabilityRegenerationJob;
    }
  | {
      requestType: 'capability_regeneration';
      status: BrainCapabilityRegenerationJobStatus;
      request: Pick<
        BrainGovernanceResourceVersion,
        'id' | 'resourceType' | 'resourceKey' | 'version' | 'status' | 'createdAt'
      >;
      job: BrainCapabilityRegenerationJob;
    };
