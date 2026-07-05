export type AgentCapabilityDraftStatus = 'draft' | 'needs_changes' | 'approved' | 'rejected' | 'published' | string;

export type AgentCapabilityRiskLevel = 'low' | 'medium' | 'high' | string;

export type AgentCapabilityReleaseStrategy = 'auto_publish' | 'approval_required' | 'write_blocked' | string;

export interface AgentCapabilityValidationIssue {
  code: string;
  level: 'block' | 'warn';
  message: string;
  suggestion?: string;
}

export interface AgentCapabilityValidationResult {
  capabilityId: string;
  pass: boolean;
  issues: AgentCapabilityValidationIssue[];
  manifest: Record<string, unknown>;
}

export interface AgentCapabilityDryRunIssue {
  code: string;
  level: 'block' | 'warn' | 'pass';
  message: string;
  suggestion?: string;
}

export interface AgentCapabilityDryRunResult {
  capabilityId: string;
  queryKey?: string;
  toolName?: string;
  status: 'pass' | 'blocked' | string;
  pass: boolean;
  checkedAt: string;
  registry?: {
    status?: string;
    source?: string;
    implementationRef?: string;
  } | null;
  issues: AgentCapabilityDryRunIssue[];
  toolResult?: Record<string, unknown> | null;
}

export interface AgentCapabilityPostPublishSmokeIssue {
  code: string;
  level: 'block' | 'warn' | 'pass';
  message: string;
  suggestion?: string;
}

export interface AgentCapabilityPostPublishSmokeResult {
  capabilityId: string;
  pass: boolean;
  checkedAt: string;
  question: string;
  selectedCapabilityId?: string | null;
  confidence: number;
  routeReason?: string;
  activeManifestVersion?: string | null;
  toolResults: Array<{
    tool: string;
    status: string;
    title: string;
    summary: string;
    evidence?: Record<string, unknown>;
  }>;
  issues: AgentCapabilityPostPublishSmokeIssue[];
}

export interface AgentCapabilityEvalGate {
  gate: string;
  expected: string;
  actual: string;
  pass: boolean;
  level: 'block' | 'warn' | 'pass';
}

export interface AgentCapabilityEvalGateResult {
  generatedAt: string;
  pass: boolean;
  scope: 'selected' | 'all' | string;
  capabilityIds: string[];
  source: {
    evalDrafts: string;
    governance: string;
  };
  summary: {
    totalQuestions: number;
    scopedQuestions: number;
    p0Questions: number;
    p0Unmapped: number;
    p0PermissionNeedsReview: number;
    p0ContractNotPass: number;
    p0WrongRouteRisk: number;
    highRiskAutoPublish: number;
    inferredPermission: number;
  };
  gates: AgentCapabilityEvalGate[];
  samples: Record<string, unknown[]>;
}

export interface AgentCapabilityDraft {
  id: number;
  capabilityId: string;
  status: AgentCapabilityDraftStatus;
  source: string;
  displayName: string;
  displayNameZh?: string;
  description?: string;
  domain: string;
  businessObject: string;
  actions: string[];
  personaCodes: string[];
  releaseStrategy: AgentCapabilityReleaseStrategy;
  riskLevel: AgentCapabilityRiskLevel;
  permissionSource?: string;
  permissionCodes: string[];
  sourceModels: string[];
  sourceApis: string[];
  sourceDtos: string[];
  sourceRoutes: string[];
  outputKinds: string[];
  executor?: Record<string, unknown> | null;
  storeScope?: string;
  fieldPolicies: unknown[];
  triggerKeywords: string[];
  examples: string[];
  negativeExamples: string[];
  boundaryNotes: string[];
  governanceIssues: unknown[];
  reviewedBy?: number;
  reviewedAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCapabilityDraftDetail extends AgentCapabilityDraft {
  validation: AgentCapabilityValidationResult;
  reviews: Array<{
    id: number;
    capabilityId: string;
    decision: string;
    comment?: string;
    reviewerId?: number;
    createdAt: string;
  }>;
}

export interface AgentCapabilityDraftListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  domain?: string;
  riskLevel?: string;
  releaseStrategy?: string;
}

export interface AgentCapabilityDraftListResult {
  items: AgentCapabilityDraft[];
  total: number;
  page: number;
  pageSize: number;
  stats: {
    total: number;
    byStatus: Record<string, number>;
  };
  activeManifestVersion?: string | null;
}

export interface AgentCapabilityImportResult {
  source: string;
  reportGeneratedAt?: string;
  reportTotal: number;
  imported: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface AgentCapabilityPublishResult {
  version: string;
  itemCount: number;
  publishedDraftCount: number;
  activeManifestVersion?: string | null;
}

export interface AgentCapabilityManifestVersion {
  id: number;
  version: string;
  status: string;
  source: string;
  title?: string;
  summary?: string;
  itemCount: number;
  autoPublishedCount: number;
  approvalRequiredCount: number;
  writeBlockedCount: number;
  publishedBy?: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentToolQueryKeyItem {
  id: number;
  queryKey: string;
  toolName: string;
  domain: string;
  businessObject?: string;
  status: string;
  source: string;
  requiredPermissions?: string[];
  sourceModels?: string[];
  sourceApis?: string[];
  outputKinds?: string[];
  implementationRef?: string;
  createdAt: string;
  updatedAt: string;
}
