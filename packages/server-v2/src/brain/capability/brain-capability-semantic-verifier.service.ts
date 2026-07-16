import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  canonicalizeBusinessDefinition,
  isBusinessDefinitionProjectionV2Payload,
} from '../../semantic-data/business-definition-projection-compiler.service.js';
import {
  BrainCanonicalCapabilityProjectionError,
  deriveCanonicalCapabilityGrounding,
  resolveCanonicalCapabilityProjection,
} from './brain-canonical-capability-projection.js';
import type { BrainCapabilityCard, BrainCapabilityDefinitionRef } from './brain-capability.types.js';
import {
  BRAIN_CAPABILITY_DEFINITION_SNAPSHOT_SOURCE,
  type BrainBusinessDefinitionSnapshot,
  type BrainBusinessDefinitionSnapshotEntry,
  type BrainCapabilityDefinitionSnapshotSource,
  type BrainCapabilityGenerationProposal,
  type BrainPublishedDefinitionRef,
  validSnapshot,
} from './brain-capability-codegen.service.js';

export type BrainVerifiedCapabilityManifest = Omit<BrainCapabilityGenerationProposal['manifest'], 'version'> & {
  version: number;
};

type UnknownRecord = Record<string, unknown>;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RISK_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const GROUNDING_TYPES = new Set(['semantic_query', 'domain_service', 'preview_action']);

function hasV2CapabilitySemanticView(definition: BrainBusinessDefinitionSnapshotEntry): boolean {
  return definition.projections.some(
    (projection) =>
      projection.targetType === 'capability_semantic_view' &&
      isBusinessDefinitionProjectionV2Payload(projection.payload),
  );
}

@Injectable()
export class BrainCapabilitySemanticVerifierService {
  constructor(
    @Inject(BRAIN_CAPABILITY_DEFINITION_SNAPSHOT_SOURCE)
    private readonly definitionSource: BrainCapabilityDefinitionSnapshotSource,
  ) {}

  async verifyProposal(
    proposal: BrainCapabilityGenerationProposal,
  ): Promise<{ manifest: BrainVerifiedCapabilityManifest }> {
    const proposalRecord = this.record(proposal, 'generated_capability_proposal_invalid');
    const manifest = this.parseManifest(proposalRecord.manifest, 'generated_capability_manifest_invalid');
    const capabilityKey = this.nonEmptyString(
      proposalRecord.capabilityKey,
      'generated_capability_proposal_identity_mismatch',
    );
    const sourceFingerprint = this.fingerprint(
      proposalRecord.sourceFingerprint,
      'generated_capability_proposal_identity_mismatch',
    );
    const businessDefinitions = this.definitionRefs(
      proposalRecord.businessDefinitions,
      'generated_capability_definition_refs_mismatch',
    );
    if (
      proposalRecord.status !== 'ready' ||
      capabilityKey !== manifest.key ||
      sourceFingerprint !== manifest.sourceFingerprint
    ) {
      throw new BadRequestException('generated_capability_proposal_identity_mismatch');
    }
    if (
      canonicalizeBusinessDefinition(businessDefinitions) !== canonicalizeBusinessDefinition(manifest.definitionRefs)
    ) {
      throw new BadRequestException('generated_capability_definition_refs_mismatch');
    }
    const snapshot = await this.loadVerifiedSnapshot();
    this.verifyManifestAgainstSnapshot(manifest, snapshot, executorGrounding(proposalRecord.executorBinding, manifest));
    return deepCloneFreeze({ manifest });
  }

  async loadVerifiedSnapshot(): Promise<BrainBusinessDefinitionSnapshot> {
    const snapshot = await this.definitionSource.loadPublishedSnapshot();
    if (!validSnapshot(snapshot)) throw new BadRequestException('generated_capability_snapshot_invalid');
    return deepCloneFreeze(snapshot);
  }

  async verifyCards(cards: readonly BrainCapabilityCard[]): Promise<void> {
    const snapshot = await this.loadVerifiedSnapshot();
    for (const card of cards) await this.verifyCard(card, snapshot);
  }

  async verifyCard(card: BrainCapabilityCard, snapshot?: BrainBusinessDefinitionSnapshot): Promise<void> {
    const manifest = this.parseManifest(card, 'generated_capability_manifest_invalid');
    this.verifyManifestAgainstSnapshot(
      manifest,
      snapshot ?? (await this.loadVerifiedSnapshot()),
      executorGrounding((card as unknown as UnknownRecord).executorBinding, manifest),
    );
  }

  async verifyStoredCapabilities(inputs: readonly { snapshot: unknown; sourceRow: unknown }[]): Promise<void> {
    if (!inputs.length) return;
    const publishedSnapshot = await this.loadVerifiedSnapshot();
    for (const input of inputs) await this.verifyStoredCapability(input, publishedSnapshot);
  }

  async verifyStoredCapability(
    input: { snapshot: unknown; sourceRow: unknown },
    publishedSnapshot?: BrainBusinessDefinitionSnapshot,
  ): Promise<void> {
    const snapshot = this.record(input.snapshot, 'generated_capability_snapshot_invalid');
    const sourceRow = this.record(input.sourceRow, 'generated_capability_source_row_invalid');
    if (snapshot.generatedCapability !== true) {
      throw new BadRequestException('generated_capability_snapshot_marker_missing');
    }
    const manifest = this.manifestFromSourceRow(sourceRow);
    const immutable = this.immutableManifestFields(snapshot);
    if (canonicalizeBusinessDefinition(immutable) !== canonicalizeBusinessDefinition(manifest)) {
      throw new BadRequestException('generated_capability_source_snapshot_mismatch');
    }
    if (snapshot.registryVersion !== manifest.version || snapshot.version !== manifest.version) {
      throw new BadRequestException('generated_capability_source_snapshot_mismatch');
    }
    this.verifyManifestAgainstSnapshot(
      manifest,
      publishedSnapshot ?? (await this.loadVerifiedSnapshot()),
      executorGrounding(snapshot.executorBinding, manifest),
    );
  }

  private verifyManifestAgainstSnapshot(
    manifest: BrainVerifiedCapabilityManifest,
    snapshot: BrainBusinessDefinitionSnapshot,
    executableGrounding?: 'semantic_query' | 'domain_service' | 'preview_action',
  ) {
    if (!validSnapshot(snapshot)) throw new BadRequestException('generated_capability_snapshot_invalid');
    const definitions = this.resolveDefinitions(manifest.definitionRefs, snapshot);
    if (definitions.every(hasV2CapabilitySemanticView)) {
      this.verifyV2ManifestAgainstDefinitions(manifest, definitions, executableGrounding);
      return;
    }
    let canonicalProjection: ReturnType<typeof resolveCanonicalCapabilityProjection>;
    try {
      canonicalProjection = resolveCanonicalCapabilityProjection({
        capabilityKey: manifest.key,
        definitions,
      });
    } catch (error) {
      if (!(error instanceof BrainCanonicalCapabilityProjectionError)) throw error;
      if (error.issues.includes('conflict')) {
        throw new BadRequestException('generated_capability_semantics_conflict');
      }
      throw new BadRequestException('generated_capability_semantics_missing');
    }
    const canonical = canonicalProjection.semantics;
    const expectedSemantics = {
      key: canonical.key,
      name: canonical.name,
      description: canonical.description,
      domains: canonical.domains,
      intents: canonical.intents,
      riskLevel: canonical.riskLevel,
      examples: canonical.examples,
      negativeExamples: canonical.negativeExamples,
      synonyms: canonical.synonyms,
      successSchema: canonical.successSchema,
    };
    const actualSemantics = {
      key: manifest.key,
      name: manifest.name,
      description: manifest.description,
      domains: [...manifest.domains].sort(),
      intents: [...manifest.intents].sort(),
      riskLevel: manifest.riskLevel,
      examples: [...manifest.examples].sort(),
      negativeExamples: [...manifest.negativeExamples].sort(),
      synonyms: [...manifest.synonyms].sort(),
      successSchema: manifest.successSchema,
    };
    if (canonicalizeBusinessDefinition(actualSemantics) !== canonicalizeBusinessDefinition(expectedSemantics)) {
      throw new BadRequestException('generated_capability_semantics_mismatch');
    }
    const actualPermissions = new Set(manifest.requiredPermissions);
    if (canonical.requiredPermissions.some((permission) => !actualPermissions.has(permission))) {
      throw new BadRequestException('generated_capability_permission_minimum_removed');
    }
    if (manifest.grounding !== (executableGrounding ?? canonicalProjection.grounding)) {
      throw new BadRequestException('generated_capability_grounding_mismatch');
    }
  }

  private verifyV2ManifestAgainstDefinitions(
    manifest: BrainVerifiedCapabilityManifest,
    definitions: BrainBusinessDefinitionSnapshotEntry[],
    executableGrounding?: 'semantic_query' | 'domain_service' | 'preview_action',
  ) {
    const definitionDomains = new Set(definitions.map((definition) => definition.domain));
    if (manifest.domains.some((domain) => !definitionDomains.has(domain))) {
      throw new BadRequestException('generated_capability_semantics_mismatch');
    }
    for (const definition of definitions) {
      const projection = definition.projections.find((item) => item.targetType === 'capability_semantic_view');
      const payload =
        projection && isBusinessDefinitionProjectionV2Payload(projection.payload) ? projection.payload : undefined;
      const data = payload ? this.record(payload.data, 'generated_capability_semantics_missing') : undefined;
      const bindings = data
        ? this.stringArray(data.capabilityBindings, 'generated_capability_semantics_missing', true)
        : [];
      if (manifest.grounding === 'semantic_query' && bindings.length > 0 && !bindings.includes(manifest.key)) {
        throw new BadRequestException('generated_capability_semantics_mismatch');
      }
    }
    if (
      canonicalizeBusinessDefinition(manifest.successSchema) !== canonicalizeBusinessDefinition(manifest.outputSchema)
    ) {
      throw new BadRequestException('generated_capability_semantics_mismatch');
    }
    if (manifest.readOnly && manifest.riskLevel !== 'low') {
      throw new BadRequestException('generated_capability_semantics_mismatch');
    }
    if (!manifest.readOnly && !['medium', 'high', 'critical'].includes(manifest.riskLevel)) {
      throw new BadRequestException('generated_capability_semantics_mismatch');
    }
    if (manifest.grounding !== (executableGrounding ?? deriveCanonicalCapabilityGrounding(manifest.key, definitions))) {
      throw new BadRequestException('generated_capability_grounding_mismatch');
    }
  }

  private resolveDefinitions(
    refs: readonly BrainCapabilityDefinitionRef[] | readonly BrainPublishedDefinitionRef[],
    snapshot: BrainBusinessDefinitionSnapshot,
  ): BrainBusinessDefinitionSnapshotEntry[] {
    if (!refs.length) throw new BadRequestException('generated_capability_definition_lineage_mismatch');
    return refs.map((ref) => {
      const definition = snapshot.definitions.find(
        (candidate) =>
          candidate.definitionId === ref.definitionId &&
          candidate.versionId === ref.versionId &&
          candidate.definitionKey === ref.definitionKey &&
          candidate.version === ref.version &&
          candidate.fingerprint === ref.definitionFingerprint &&
          candidate.sourceFingerprint === ref.sourceFingerprint,
      );
      if (!definition) throw new BadRequestException('generated_capability_definition_lineage_mismatch');
      return definition;
    });
  }

  private manifestFromSourceRow(row: UnknownRecord): BrainVerifiedCapabilityManifest {
    return this.parseManifest(
      {
        key: row.skillKey,
        version: row.version,
        sourceFingerprint: row.sourceFingerprint,
        name: row.name,
        description: row.description,
        domains: row.domains,
        intents: row.intents,
        inputSchema: row.inputSchema,
        outputSchema: row.outputSchema,
        requiredPermissions: row.permissions,
        allowedRoles: row.allowedRoles,
        readOnly: row.readOnly,
        sideEffect: row.sideEffect,
        riskLevel: row.riskLevel,
        requiresConfirmation: row.requiresConfirmation,
        idempotency: row.idempotency,
        timeoutMs: row.timeoutMs,
        grounding: row.grounding,
        examples: row.examples,
        negativeExamples: row.negativeExamples,
        synonyms: row.synonyms,
        successSchema: row.successSchema,
        definitionRefs: row.definitionRefs,
      },
      'generated_capability_source_row_invalid',
    );
  }

  private immutableManifestFields(snapshot: UnknownRecord): BrainVerifiedCapabilityManifest {
    return this.parseManifest(snapshot, 'generated_capability_snapshot_invalid');
  }

  private parseManifest(value: unknown, code: string): BrainVerifiedCapabilityManifest {
    const manifest = this.record(value, code);
    const readOnlyCapability =
      manifest.readOnly === true &&
      manifest.sideEffect === false &&
      manifest.requiresConfirmation === false &&
      manifest.idempotency === 'not_applicable';
    const governedPreviewAction =
      manifest.readOnly === false &&
      manifest.sideEffect === true &&
      manifest.requiresConfirmation === true &&
      manifest.idempotency === 'required' &&
      manifest.grounding === 'preview_action';
    if (!readOnlyCapability && !governedPreviewAction) {
      throw new BadRequestException('generated_capability_read_only_policy_mismatch');
    }
    const riskLevel = this.enumValue(manifest.riskLevel, RISK_LEVELS, code);
    const grounding = this.enumValue(manifest.grounding, GROUNDING_TYPES, code);
    return deepCloneFreeze({
      key: this.nonEmptyString(manifest.key, code),
      version: this.positiveInteger(manifest.version, code),
      sourceFingerprint: this.fingerprint(manifest.sourceFingerprint, code),
      name: this.nonEmptyString(manifest.name, code),
      description: this.nonEmptyString(manifest.description, code),
      domains: this.stringArray(manifest.domains, code),
      intents: this.stringArray(manifest.intents, code),
      inputSchema: this.recordClone(manifest.inputSchema, code),
      outputSchema: this.recordClone(manifest.outputSchema, code),
      requiredPermissions: this.stringArray(manifest.requiredPermissions, code),
      allowedRoles: this.stringArray(manifest.allowedRoles, code, true),
      readOnly: manifest.readOnly as boolean,
      sideEffect: manifest.sideEffect as boolean,
      riskLevel: riskLevel as BrainVerifiedCapabilityManifest['riskLevel'],
      requiresConfirmation: manifest.requiresConfirmation as boolean,
      idempotency: manifest.idempotency as 'required' | 'not_applicable',
      timeoutMs: this.timeout(manifest.timeoutMs, code),
      grounding: grounding as BrainVerifiedCapabilityManifest['grounding'],
      examples: this.stringArray(manifest.examples, code),
      negativeExamples: this.stringArray(manifest.negativeExamples, code),
      synonyms: this.stringArray(manifest.synonyms, code, true),
      successSchema: this.recordClone(manifest.successSchema, code),
      definitionRefs: this.definitionRefs(manifest.definitionRefs, code),
    });
  }

  private definitionRefs(value: unknown, code: string): BrainPublishedDefinitionRef[] {
    if (!Array.isArray(value) || value.length === 0) throw new BadRequestException(code);
    return value.map((item) => {
      const ref = this.record(item, code);
      return deepCloneFreeze({
        definitionId: this.positiveInteger(ref.definitionId, code),
        versionId: this.positiveInteger(ref.versionId, code),
        definitionKey: this.nonEmptyString(ref.definitionKey, code),
        version: this.positiveInteger(ref.version, code),
        definitionFingerprint: this.fingerprint(ref.definitionFingerprint, code),
        sourceFingerprint: this.fingerprint(ref.sourceFingerprint, code),
      });
    });
  }

  private stringArray(value: unknown, code: string, allowEmpty = false): string[] {
    if (
      !Array.isArray(value) ||
      (!allowEmpty && value.length === 0) ||
      value.some((item) => typeof item !== 'string' || !item.trim())
    ) {
      throw new BadRequestException(code);
    }
    return value.map((item) => String(item));
  }

  private positiveInteger(value: unknown, code: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new BadRequestException(code);
    return value;
  }

  private timeout(value: unknown, code: string): number {
    const timeoutMs = this.positiveInteger(value, code);
    if (timeoutMs > 20_000) throw new BadRequestException(code);
    return timeoutMs;
  }

  private fingerprint(value: unknown, code: string): string {
    if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new BadRequestException(code);
    return value;
  }

  private nonEmptyString(value: unknown, code: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(code);
    return value;
  }

  private enumValue(value: unknown, allowed: ReadonlySet<string>, code: string): string {
    if (typeof value !== 'string' || !allowed.has(value)) throw new BadRequestException(code);
    return value;
  }

  private recordClone(value: unknown, code: string): UnknownRecord {
    return deepCloneFreeze(this.record(value, code));
  }

  private record(value: unknown, code: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(code);
    return value as UnknownRecord;
  }
}

function executorGrounding(
  value: unknown,
  manifest: Pick<BrainVerifiedCapabilityManifest, 'key' | 'sourceFingerprint'>,
): 'semantic_query' | 'domain_service' | 'preview_action' | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const binding = value as UnknownRecord;
  if (binding.capabilityKey !== manifest.key || binding.sourceFingerprint !== manifest.sourceFingerprint) return undefined;
  const target = binding.target;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return undefined;
  const targetRecord = target as UnknownRecord;
  const className = targetRecord.className;
  const sourcePath = targetRecord.sourcePath;
  if (
    className === 'BrainDomainServiceCapabilityExecutor' &&
    sourcePath === 'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts'
  ) {
    return 'domain_service';
  }
  if (
    className === 'BrainSemanticQueryCapabilityExecutor' &&
    sourcePath === 'packages/server-v2/src/brain/capability/executors/brain-semantic-query-capability.executor.ts'
  ) {
    return 'semantic_query';
  }
  if (
    className === 'BrainActionCapabilityExecutor' &&
    sourcePath === 'packages/server-v2/src/brain/capability/executors/brain-action-capability.executor.ts'
  ) {
    return 'preview_action';
  }
  return undefined;
}

function deepCloneFreeze<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as T;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => deepCloneFreeze(item))) as T;
  if (value != null && typeof value === 'object') {
    const clone = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, deepCloneFreeze(item)]),
    );
    return Object.freeze(clone) as T;
  }
  return value;
}
