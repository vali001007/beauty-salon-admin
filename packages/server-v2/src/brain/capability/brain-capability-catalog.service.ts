import { Inject, Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { Ajv } from 'ajv';
import addFormatsImport from 'ajv-formats';
import { BRAIN_SEMANTIC_INTENTS } from '../cognition/brain-semantic-intent.types.js';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';
import { BrainSkillRegistryService } from '../skills/brain-skill-registry.service.js';
import { BrainCapabilitySemanticVerifierService } from './brain-capability-semantic-verifier.service.js';
import {
  BRAIN_REGISTERED_PERMISSION_CODES,
  type BrainCapabilityCandidate,
  type BrainCapabilityCard,
  type BrainCapabilityCatalogValidationReport,
  type BrainCapabilityDefinitionRef,
  type BrainCapabilityValidationIssue,
} from './brain-capability.types.js';

const applyAjvFormats = addFormatsImport as unknown as (ajv: Ajv) => Ajv;
const CAPABILITY_KEY_PATTERN = /^[a-z][a-z0-9_]{1,127}$/;
const RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const IDEMPOTENCY_POLICIES = new Set(['not_applicable', 'required']);
const GROUNDING_TYPES = new Set(['semantic_query', 'domain_service', 'preview_action', 'model', 'template']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SEMANTIC_INTENTS = new Set<string>(BRAIN_SEMANTIC_INTENTS);

export class BrainCapabilityCatalogValidationError extends Error {
  constructor(readonly report: BrainCapabilityCatalogValidationReport) {
    super(`brain_capability_catalog_invalid:${report.issues.map((issue) => issue.code).join(',')}`);
    this.name = 'BrainCapabilityCatalogValidationError';
  }
}

@Injectable()
export class BrainCapabilityCatalogService implements OnModuleInit {
  private readonly ajv = applyAjvFormats(new Ajv({ allErrors: true, strict: true }));
  private readonly schemaValidatorCache = new Map<string, { valid: boolean; error?: string }>();
  private readonly validatedCatalogCache = new Map<string, BrainCapabilityCatalogValidationReport>();

  constructor(
    private readonly registry: BrainSkillRegistryService,
    private readonly runtimeConfig: BrainRuntimeConfigService,
    @Optional()
    @Inject(BRAIN_REGISTERED_PERMISSION_CODES)
    private readonly registeredPermissionCodes?: ReadonlySet<string>,
    private readonly semanticVerifier?: BrainCapabilitySemanticVerifierService,
  ) {}

  async onModuleInit(): Promise<void> {
    const { cognitionMode, plannerMode } = this.runtimeConfig.runtime;
    if (process.env.NODE_ENV === 'production' && (cognitionMode !== 'rules' || plannerMode !== 'rules')) {
      await this.assertEnabledCapabilitiesValid();
    }
  }

  async listEnabledCapabilities(
    releaseCandidates?: readonly BrainCapabilityCandidate[],
  ): Promise<readonly BrainCapabilityCard[]> {
    const report = await this.validateEnabledCapabilities(releaseCandidates);
    if (!report.valid) throw new BrainCapabilityCatalogValidationError(report);
    return report.cards;
  }

  async validateEnabledCapabilities(
    releaseCandidates?: readonly BrainCapabilityCandidate[],
  ): Promise<BrainCapabilityCatalogValidationReport> {
    const candidates = releaseCandidates === undefined
      ? await this.registry.listLatestEnabledCapabilityCandidates()
      : [...releaseCandidates];
    const catalogCacheKey = stableStringify(candidates);
    const cachedReport = this.validatedCatalogCache.get(catalogCacheKey);
    if (cachedReport) return cachedReport;
    const structurallyValidCards: BrainCapabilityCard[] = [];
    const issues: BrainCapabilityValidationIssue[] = [];

    if (!this.registeredPermissionCodes) {
      issues.push({
        capabilityKey: '*',
        capabilityVersion: 0,
        code: 'permission_registry_unavailable',
        message: 'Registered permission codes provider is required.',
      });
    }

    for (const candidate of candidates) {
      const result = this.validateCandidate(candidate);
      issues.push(...result.issues);
      if (result.card) structurallyValidCards.push(result.card);
    }

    const cards: BrainCapabilityCard[] = [];
    if (structurallyValidCards.length > 0) {
      if (!this.semanticVerifier) {
        for (const card of structurallyValidCards) {
          issues.push(this.semanticIssue(card, 'Published capability semantic verifier is required.'));
        }
      } else {
        let snapshot: Awaited<ReturnType<BrainCapabilitySemanticVerifierService['loadVerifiedSnapshot']>> | undefined;
        try {
          snapshot = await this.semanticVerifier.loadVerifiedSnapshot();
        } catch (error) {
          for (const card of structurallyValidCards) {
            issues.push(
              this.semanticIssue(
                card,
                error instanceof Error ? error.message : 'Capability business definition verification failed.',
              ),
            );
          }
        }
        if (snapshot) {
          for (const card of structurallyValidCards) {
            try {
              await this.semanticVerifier.verifyCard(card, snapshot);
              cards.push(card);
            } catch (error) {
              issues.push(
                this.semanticIssue(
                  card,
                  error instanceof Error ? error.message : 'Capability business definition verification failed.',
                ),
              );
            }
          }
        }
      }
    }

    const report = Object.freeze({
      valid: issues.length === 0,
      cards: Object.freeze(cards),
      issues: Object.freeze(issues.map((issue) => Object.freeze({ ...issue }))),
    });
    if (report.valid) this.validatedCatalogCache.set(catalogCacheKey, report);
    return report;
  }

  async assertEnabledCapabilitiesValid(): Promise<void> {
    const report = await this.validateEnabledCapabilities();
    if (!report.valid) throw new BrainCapabilityCatalogValidationError(report);
  }

  private validateCandidate(candidate: BrainCapabilityCandidate): {
    card?: BrainCapabilityCard;
    issues: BrainCapabilityValidationIssue[];
  } {
    const issues: BrainCapabilityValidationIssue[] = [];
    const capabilityKey = typeof candidate.key === 'string' ? candidate.key : '<invalid>';
    const capabilityVersion = typeof candidate.version === 'number' ? candidate.version : 0;
    const add = (
      code: BrainCapabilityValidationIssue['code'],
      message: string,
      extra: Pick<BrainCapabilityValidationIssue, 'field' | 'value'> = {},
    ) => {
      issues.push({
        capabilityKey,
        capabilityVersion,
        code,
        message,
        ...extra,
      });
    };

    if (typeof candidate.key !== 'string' || !CAPABILITY_KEY_PATTERN.test(candidate.key)) {
      add('invalid_key', 'Capability key must use lower snake_case.');
    }
    if (typeof candidate.version !== 'number' || !Number.isInteger(candidate.version) || candidate.version < 1) {
      add('invalid_version', 'Capability version must be a positive integer.');
    }

    const name = this.readString(candidate, 'name', add);
    const description = this.readString(candidate, 'description', add);
    const domains = this.readStringArray(candidate, 'domains', add);
    const intents = this.readStringArray(candidate, 'intents', add);
    const requiredPermissions = this.readStringArray(candidate, 'requiredPermissions', add);
    const allowedRoles = this.readStringArray(candidate, 'allowedRoles', add);
    const examples = this.readStringArray(candidate, 'examples', add);
    const synonyms = this.readStringArray(candidate, 'synonyms', add);
    const negativeExamples = this.readStringArray(candidate, 'negativeExamples', add);
    const sourceFingerprint = this.readSourceFingerprint(candidate, add);
    const definitionRefs = this.readDefinitionRefs(candidate, add);
    const inputSchema = this.readSchema(candidate, 'inputSchema', add);
    const outputSchema = this.readSchema(candidate, 'outputSchema', add);
    const successSchema = this.readSchema(candidate, 'successSchema', add);
    const readOnly = this.readBoolean(candidate, 'readOnly', add);
    const sideEffect = this.readBoolean(candidate, 'sideEffect', add);
    const requiresConfirmation = this.readBoolean(candidate, 'requiresConfirmation', add);
    const executorBinding = this.optionalRecord(candidate.executorBinding);

    if (this.registeredPermissionCodes && requiredPermissions) {
      for (const permission of new Set(requiredPermissions)) {
        if (!this.registeredPermissionCodes.has(permission)) {
          add('unregistered_permission', `Permission is not registered: ${permission}`, { value: permission });
        }
      }
    }
    for (const intent of intents ?? []) {
      if (!SEMANTIC_INTENTS.has(intent)) {
        add('invalid_intent', `Capability intent is not canonical: ${intent}`, { field: 'intents', value: intent });
      }
    }

    if (typeof candidate.riskLevel !== 'string' || !RISK_LEVELS.has(candidate.riskLevel)) {
      add('invalid_risk_level', `Unsupported risk level: ${String(candidate.riskLevel)}`);
    }
    if (typeof candidate.idempotency !== 'string' || !IDEMPOTENCY_POLICIES.has(candidate.idempotency)) {
      add('invalid_idempotency', `Unsupported idempotency policy: ${String(candidate.idempotency)}`);
    }
    if (typeof candidate.grounding !== 'string' || !GROUNDING_TYPES.has(candidate.grounding)) {
      add('invalid_grounding', `Unsupported grounding: ${String(candidate.grounding)}`);
    }
    if (
      typeof candidate.timeoutMs !== 'number' ||
      !Number.isInteger(candidate.timeoutMs) ||
      candidate.timeoutMs < 1 ||
      candidate.timeoutMs > 20_000
    ) {
      add('invalid_timeout', 'Capability timeoutMs must be an integer between 1 and 20000.');
    }

    if (readOnly === true && sideEffect === true) {
      add('read_only_side_effect_conflict', 'A read-only capability cannot declare side effects.');
    }
    if (readOnly === false && sideEffect === false) {
      add('missing_side_effect_declaration', 'A non-read-only capability must declare side effects.');
    }
    if (sideEffect === true && requiresConfirmation === false) {
      add('write_confirmation_required', 'A side-effect capability requires user confirmation.');
    }
    if (sideEffect === true && candidate.idempotency !== 'required') {
      add('write_idempotency_required', 'A side-effect capability requires idempotency.');
    }
    if (readOnly === true && requiresConfirmation === true) {
      add('read_only_confirmation_conflict', 'A read-only capability cannot require action confirmation.');
    }
    if (readOnly === true && candidate.idempotency !== 'not_applicable') {
      add('read_only_idempotency_conflict', 'A read-only capability must use not_applicable idempotency.');
    }
    if (sideEffect === true && candidate.riskLevel === 'low') {
      add('write_risk_too_low', 'A side-effect capability must be at least medium risk.');
    }

    if (issues.length > 0) return { issues };

    const card = deepCloneFreeze({
      ...(candidate.generatedCapability === true ? { generatedCapability: true } : {}),
      ...(executorBinding ? { executorBinding } : {}),
      key: candidate.key as string,
      version: candidate.version as number,
      name: name as string,
      description: description as string,
      domains: domains as string[],
      intents: intents as string[],
      inputSchema: inputSchema as Record<string, unknown>,
      outputSchema: outputSchema as Record<string, unknown>,
      requiredPermissions: requiredPermissions as string[],
      allowedRoles: allowedRoles as string[],
      readOnly: readOnly as boolean,
      sideEffect: sideEffect as boolean,
      riskLevel: candidate.riskLevel as BrainCapabilityCard['riskLevel'],
      requiresConfirmation: requiresConfirmation as boolean,
      idempotency: candidate.idempotency as BrainCapabilityCard['idempotency'],
      timeoutMs: candidate.timeoutMs as number,
      grounding: candidate.grounding as BrainCapabilityCard['grounding'],
      examples: examples as string[],
      sourceFingerprint: sourceFingerprint as string,
      definitionRefs: definitionRefs as BrainCapabilityDefinitionRef[],
      synonyms: synonyms as string[],
      negativeExamples: negativeExamples as string[],
      successSchema: successSchema as Record<string, unknown>,
    }) as BrainCapabilityCard;

    return { card, issues };
  }

  private optionalRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? JSON.parse(JSON.stringify(value)) as Record<string, unknown>
      : undefined;
  }

  private semanticIssue(card: BrainCapabilityCard, message: string): BrainCapabilityValidationIssue {
    return {
      capabilityKey: card.key,
      capabilityVersion: card.version,
      code: 'untrusted_business_definition',
      message,
    };
  }

  private readString(
    candidate: BrainCapabilityCandidate,
    field: 'name' | 'description',
    add: (
      code: BrainCapabilityValidationIssue['code'],
      message: string,
      extra?: Pick<BrainCapabilityValidationIssue, 'field'>,
    ) => void,
  ): string | undefined {
    const value = candidate[field];
    if (typeof value === 'string') return value;
    add('malformed_field', `${field} must be a string.`, { field });
    return undefined;
  }

  private readBoolean(
    candidate: BrainCapabilityCandidate,
    field: 'readOnly' | 'sideEffect' | 'requiresConfirmation',
    add: (
      code: BrainCapabilityValidationIssue['code'],
      message: string,
      extra?: Pick<BrainCapabilityValidationIssue, 'field'>,
    ) => void,
  ): boolean | undefined {
    const value = candidate[field];
    if (typeof value === 'boolean') return value;
    add('malformed_field', `${field} must be a boolean.`, { field });
    return undefined;
  }

  private readStringArray(
    candidate: BrainCapabilityCandidate,
    field:
      | 'domains'
      | 'intents'
      | 'requiredPermissions'
      | 'allowedRoles'
      | 'examples'
      | 'synonyms'
      | 'negativeExamples',
    add: (
      code: BrainCapabilityValidationIssue['code'],
      message: string,
      extra?: Pick<BrainCapabilityValidationIssue, 'field'>,
    ) => void,
  ): string[] | undefined {
    const value = candidate[field];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return [...value];
    add('malformed_field', `${field} must be an array of strings.`, { field });
    return undefined;
  }

  private readSourceFingerprint(
    candidate: BrainCapabilityCandidate,
    add: (
      code: BrainCapabilityValidationIssue['code'],
      message: string,
      extra?: Pick<BrainCapabilityValidationIssue, 'field'>,
    ) => void,
  ): string | undefined {
    if (typeof candidate.sourceFingerprint === 'string' && SHA256_PATTERN.test(candidate.sourceFingerprint)) {
      return candidate.sourceFingerprint;
    }
    add('invalid_source_fingerprint', 'sourceFingerprint must be a lowercase SHA-256 hex digest.', {
      field: 'sourceFingerprint',
    });
    return undefined;
  }

  private readDefinitionRefs(
    candidate: BrainCapabilityCandidate,
    add: (
      code: BrainCapabilityValidationIssue['code'],
      message: string,
      extra?: Pick<BrainCapabilityValidationIssue, 'field'>,
    ) => void,
  ): BrainCapabilityDefinitionRef[] | undefined {
    if (!Array.isArray(candidate.definitionRefs) || !candidate.definitionRefs.length) {
      add('invalid_definition_refs', 'definitionRefs must be a non-empty array.', { field: 'definitionRefs' });
      return undefined;
    }
    const refs: BrainCapabilityDefinitionRef[] = [];
    for (const value of candidate.definitionRefs) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        add('invalid_definition_refs', 'definitionRefs contains a malformed item.', { field: 'definitionRefs' });
        return undefined;
      }
      const ref = value as Record<string, unknown>;
      if (
        !this.positiveInteger(ref.definitionId) ||
        !this.positiveInteger(ref.versionId) ||
        !this.positiveInteger(ref.version) ||
        typeof ref.definitionKey !== 'string' ||
        !ref.definitionKey.trim() ||
        typeof ref.definitionFingerprint !== 'string' ||
        !SHA256_PATTERN.test(ref.definitionFingerprint) ||
        typeof ref.sourceFingerprint !== 'string' ||
        !SHA256_PATTERN.test(ref.sourceFingerprint)
      ) {
        add('invalid_definition_refs', 'definitionRefs contains invalid lineage.', { field: 'definitionRefs' });
        return undefined;
      }
      refs.push({
        definitionId: ref.definitionId,
        versionId: ref.versionId,
        definitionKey: ref.definitionKey.trim(),
        version: ref.version,
        definitionFingerprint: ref.definitionFingerprint,
        sourceFingerprint: ref.sourceFingerprint,
      } as BrainCapabilityDefinitionRef);
    }
    return refs;
  }

  private positiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  private readSchema(
    candidate: BrainCapabilityCandidate,
    field: 'inputSchema' | 'outputSchema' | 'successSchema',
    add: (
      code: BrainCapabilityValidationIssue['code'],
      message: string,
      extra?: Pick<BrainCapabilityValidationIssue, 'field'>,
    ) => void,
  ): Record<string, unknown> | undefined {
    const value = candidate[field];
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      add('malformed_field', `${field} must be a JSON Schema object.`, { field });
      return undefined;
    }

    const schema = value as Record<string, unknown>;
    const cacheKey = stableStringify(schema);
    const cached = this.schemaValidatorCache.get(cacheKey);
    if (cached) {
      if (!cached.valid) add('invalid_json_schema', cached.error ?? `Invalid ${field}.`, { field });
      return cached.valid ? schema : undefined;
    }

    try {
      this.ajv.compile(schema);
      this.schemaValidatorCache.set(cacheKey, { valid: true });
      return schema;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Invalid ${field}.`;
      this.schemaValidatorCache.set(cacheKey, { valid: false, error: message });
      add('invalid_json_schema', message, { field });
      return undefined;
    }
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value != null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepCloneFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => deepCloneFreeze(item))) as T;
  }
  if (value != null && typeof value === 'object') {
    const clone = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, deepCloneFreeze(item)]),
    );
    return Object.freeze(clone) as T;
  }
  return value;
}
