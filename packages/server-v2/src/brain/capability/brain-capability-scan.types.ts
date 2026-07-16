export type BrainCapabilitySourceType =
  | 'decorator'
  | 'controller'
  | 'dto'
  | 'service'
  | 'route'
  | 'menu'
  | 'real_facade'
  | 'facade'
  | 'permission'
  | 'prisma'
  | 'approval'
  | 'idempotency'
  | 'event'
  | 'parser';

export type BrainCapabilityCandidateStatus = 'draft' | 'blocked';
export type BrainCapabilityStoreScope = 'required' | 'optional' | 'none' | 'unknown';
export type BrainCapabilityScanRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface BrainCapabilitySourceEvidence {
  sourceType: BrainCapabilitySourceType;
  path: string;
  line: number;
  symbol: string;
  data: Record<string, unknown>;
}

export interface BrainCapabilityScanIssue {
  code:
    | 'missing_permission'
    | 'unregistered_permission'
    | 'missing_store_scope'
    | 'missing_confirmation'
    | 'missing_idempotency'
    | 'read_only_write_conflict'
    | 'unconstrained_contract'
    | 'missing_anchor_evidence'
    | 'parse_failure';
  message: string;
}

export interface BrainCapabilityCandidate {
  key: string;
  name: string;
  businessDefinitionKeys: string[];
  status: BrainCapabilityCandidateStatus;
  enabled: boolean;
  explicit: boolean;
  readOnly: boolean;
  sideEffect: boolean;
  riskLevel: BrainCapabilityScanRiskLevel;
  storeScope: BrainCapabilityStoreScope;
  requiredPermissions: string[];
  allowedRoles?: string[];
  requiresConfirmation: boolean;
  idempotency: 'required' | 'not_applicable' | 'unknown';
  inputContract: Record<string, string>;
  outputContract: Record<string, string>;
  sourceFingerprint: string;
  evidence: BrainCapabilitySourceEvidence[];
  issues: BrainCapabilityScanIssue[];
  semanticHints?: {
    name: string;
    description: string;
    intents: string[];
    examples: string[];
    negativeExamples: string[];
    synonyms: string[];
  };
}

export interface BrainCapabilityScanReport {
  schemaVersion: 1;
  generatedAt: string;
  capabilities: BrainCapabilityCandidate[];
  summary: {
    total: number;
    draft: number;
    blocked: number;
    explicit: number;
  };
}

export type BrainCapabilityDriftType = 'added' | 'changed' | 'removed' | 'stale' | 'blocked';

export interface BrainCapabilityDriftItem {
  key: string;
  type: BrainCapabilityDriftType;
  highRisk: boolean;
  reasons: string[];
  beforeFingerprint?: string;
  afterFingerprint?: string;
}

export interface BrainCapabilityDriftReport {
  items: BrainCapabilityDriftItem[];
  summary: Record<BrainCapabilityDriftType, number>;
}

export interface BrainCapabilityDecoratorMetadata {
  key: string;
  businessDefinitionKeys: string[];
  readOnly: boolean;
  storeScope: Exclude<BrainCapabilityStoreScope, 'unknown'>;
  permissions: string[];
  allowedRoles?: string[];
  requiresConfirmation: boolean;
  idempotency: 'required' | 'not_applicable';
  enabled?: boolean;
  name?: string;
  description?: string;
  intents?: string[];
  examples?: string[];
  negativeExamples?: string[];
  synonyms?: string[];
}
