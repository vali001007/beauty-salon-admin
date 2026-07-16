export const BRAIN_REGISTERED_PERMISSION_CODES = Symbol.for('BRAIN_REGISTERED_PERMISSION_CODES');

export type BrainCapabilityRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type BrainCapabilityIdempotency = 'not_applicable' | 'required';
export type BrainCapabilityGrounding = 'semantic_query' | 'domain_service' | 'model' | 'template';

export interface BrainCapabilityDefinitionRef {
  readonly definitionId: number;
  readonly versionId: number;
  readonly definitionKey: string;
  readonly version: number;
  readonly definitionFingerprint: string;
  readonly sourceFingerprint: string;
}

export type BrainDeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly BrainDeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: BrainDeepReadonly<T[K]> }
      : T;

export interface BrainCapabilityCard {
  readonly generatedCapability?: boolean;
  readonly executorBinding?: BrainDeepReadonly<Record<string, unknown>>;
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly domains: readonly string[];
  readonly intents: readonly string[];
  readonly inputSchema: BrainDeepReadonly<Record<string, unknown>>;
  readonly outputSchema: BrainDeepReadonly<Record<string, unknown>>;
  readonly requiredPermissions: readonly string[];
  readonly allowedRoles: readonly string[];
  readonly readOnly: boolean;
  readonly sideEffect: boolean;
  readonly riskLevel: BrainCapabilityRiskLevel;
  readonly requiresConfirmation: boolean;
  readonly idempotency: BrainCapabilityIdempotency;
  readonly timeoutMs: number;
  readonly grounding: BrainCapabilityGrounding;
  readonly examples: readonly string[];
  readonly sourceFingerprint: string;
  readonly definitionRefs: readonly BrainCapabilityDefinitionRef[];
  readonly synonyms: readonly string[];
  readonly negativeExamples: readonly string[];
  readonly successSchema: BrainDeepReadonly<Record<string, unknown>>;
}

export interface BrainCapabilityCandidate {
  readonly generatedCapability?: unknown;
  readonly executorBinding?: unknown;
  readonly key: unknown;
  readonly version: unknown;
  readonly name: unknown;
  readonly description: unknown;
  readonly skillType: unknown;
  readonly domains: unknown;
  readonly intents: unknown;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  readonly requiredPermissions: unknown;
  readonly allowedRoles: unknown;
  readonly readOnly: unknown;
  readonly sideEffect: unknown;
  readonly riskLevel: unknown;
  readonly requiresConfirmation: unknown;
  readonly idempotency: unknown;
  readonly timeoutMs: unknown;
  readonly grounding: unknown;
  readonly examples: unknown;
  readonly sourceFingerprint: unknown;
  readonly definitionRefs: unknown;
  readonly synonyms: unknown;
  readonly negativeExamples: unknown;
  readonly successSchema: unknown;
}

export type BrainCapabilityValidationIssueCode =
  | 'permission_registry_unavailable'
  | 'invalid_key'
  | 'invalid_version'
  | 'invalid_json_schema'
  | 'unregistered_permission'
  | 'read_only_side_effect_conflict'
  | 'missing_side_effect_declaration'
  | 'write_confirmation_required'
  | 'write_idempotency_required'
  | 'read_only_confirmation_conflict'
  | 'read_only_idempotency_conflict'
  | 'write_risk_too_low'
  | 'invalid_timeout'
  | 'invalid_risk_level'
  | 'invalid_idempotency'
  | 'invalid_grounding'
  | 'invalid_intent'
  | 'invalid_source_fingerprint'
  | 'invalid_definition_refs'
  | 'untrusted_business_definition'
  | 'malformed_field';

export interface BrainCapabilityValidationIssue {
  capabilityKey: string;
  capabilityVersion: number;
  code: BrainCapabilityValidationIssueCode;
  message: string;
  field?: keyof BrainCapabilityCandidate;
  value?: string;
}

export interface BrainCapabilityCatalogValidationReport {
  readonly valid: boolean;
  readonly cards: readonly BrainCapabilityCard[];
  readonly issues: readonly BrainCapabilityValidationIssue[];
}
