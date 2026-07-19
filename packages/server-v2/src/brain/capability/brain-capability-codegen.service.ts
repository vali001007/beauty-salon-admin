import { Inject, Injectable, Optional } from '@nestjs/common';
import { Ajv } from 'ajv';
import { createHash } from 'node:crypto';
import {
  canonicalizeBusinessDefinition,
  createBusinessDefinitionProjectionFingerprint,
  createBusinessDefinitionProjectionV2Payload,
  isBusinessDefinitionProjectionV2Payload,
  type BusinessDefinitionProjectionTypeValue,
} from '../../semantic-data/business-definition-projection-compiler.service.js';
import { createBusinessDefinitionFingerprint } from '../../semantic-data/business-definition-registry.service.js';
import {
  BrainCanonicalCapabilityProjectionError,
  deriveCanonicalCapabilityGrounding,
  resolveCanonicalCapabilityProjection,
  type BrainCanonicalCapabilitySemantics,
} from './brain-canonical-capability-projection.js';
export type { BrainCanonicalCapabilitySemantics } from './brain-canonical-capability-projection.js';
import type {
  BrainCapabilityCandidate,
  BrainCapabilityScanReport,
  BrainCapabilityScanRiskLevel,
} from './brain-capability-scan.types.js';
import { withBrainCapabilityMappingOutputs } from './brain-capability-mapping-output-contract.js';
import {
  BrainCapabilitySemanticCompilationError,
  BrainCapabilitySemanticCompilerService,
} from './brain-capability-semantic-compiler.service.js';
import type { BrainCapabilityGenerationGateReport } from './brain-capability-generation-gate.service.js';
import {
  createGeneratedCapabilityBinding,
  createGeneratedCapabilityProposalFingerprint,
  generatedBindingFingerprint,
  publicCapabilityInputSchema,
  renderGeneratedCapabilityBindingSource,
  renderGeneratedCapabilityContractTestSource,
  resolveGeneratedCapabilityTarget,
  type BrainGeneratedCapabilityExecutorBinding,
} from './brain-generated-capability-binding.js';
export type { BrainGeneratedCapabilityExecutorBinding } from './brain-generated-capability-binding.js';

export interface BrainBusinessDefinitionProjection {
  definitionVersionId: number;
  targetType: BusinessDefinitionProjectionTypeValue;
  targetKey: string;
  definitionKey: string;
  definitionVersion: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
  payload: Record<string, unknown>;
  projectionFingerprint: string;
  readOnly: boolean;
}

export interface BrainBusinessDefinitionSnapshotEntry {
  definitionId: number;
  versionId: number;
  definitionKey: string;
  kind: string;
  domain: string;
  name: string;
  ownerType: string;
  ownerId: string | null;
  version: number;
  schemaVersion: string;
  fingerprint: string;
  sourceFingerprint: string;
  validationStatus: string;
  validationReport: unknown;
  payload: unknown;
  canonicalQueryRef: string | null;
  fixtureSetKey: string | null;
  timezone: string;
  storeScope: unknown;
  evidence: unknown[];
  projections: BrainBusinessDefinitionProjection[];
}

export interface BrainBusinessDefinitionSnapshot {
  snapshotFingerprint: string;
  definitions: BrainBusinessDefinitionSnapshotEntry[];
}

export interface BrainCapabilityDefinitionSnapshotSource {
  loadPublishedSnapshot(): Promise<BrainBusinessDefinitionSnapshot>;
  loadEvaluationSnapshot?(definitionVersionIds: readonly number[]): Promise<BrainBusinessDefinitionSnapshot>;
}

export const BRAIN_CAPABILITY_DEFINITION_SNAPSHOT_SOURCE = Symbol('BRAIN_CAPABILITY_DEFINITION_SNAPSHOT_SOURCE');

export interface BrainPublishedDefinitionRef {
  definitionId: number;
  versionId: number;
  definitionKey: string;
  version: number;
  definitionFingerprint: string;
  sourceFingerprint: string;
}

export interface BrainCapabilityNarrative {
  description: string;
  positiveExamples: string[];
  negativeExamples: string[];
  synonyms: string[];
  successSchema: Record<string, unknown>;
  riskExplanation: string;
}

export interface BrainCapabilityNarrativeGenerator {
  generate(input: {
    capability: BrainCapabilityCandidate;
    businessDefinitions: BrainPublishedDefinitionRef[];
    canonicalSemantics: BrainCanonicalCapabilitySemantics;
  }): Promise<BrainCapabilityNarrative>;
}

export interface BrainCapabilityCanonicalSemanticsSource {
  resolve(input: {
    capability: BrainCapabilityCandidate;
    definitions: BrainBusinessDefinitionSnapshotEntry[];
    successSchema: Record<string, unknown>;
  }): BrainCanonicalCapabilitySemantics;
}

export const BRAIN_CAPABILITY_NARRATIVE_GENERATOR = Symbol('BRAIN_CAPABILITY_NARRATIVE_GENERATOR');

export interface BrainCapabilityGenerationInput {
  scan: BrainCapabilityScanReport;
  workspaceRoot?: string;
  generationMode?: 'published_registry' | 'synthetic_contract_only';
}

export interface BrainCapabilityGenerationBlock {
  capabilityKey: string;
  reasons: string[];
  gateReport?: BrainCapabilityGenerationGateReport;
  branchProposal?: BrainCapabilityIndependentBranchProposal;
}

export interface BrainCapabilityIndependentBranchProposal {
  type: 'independent_branch_proposal';
  suggestedBranchName: string;
  filesToAdd: string[];
  filesToModify: string[];
  blockingReasons: string[];
}

export interface BrainGeneratedCapabilityManifest {
  key: string;
  version: 1;
  sourceFingerprint: string;
  name: string;
  description: string;
  domains: string[];
  intents: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredPermissions: string[];
  allowedRoles: string[];
  readOnly: boolean;
  sideEffect: boolean;
  riskLevel: BrainCapabilityScanRiskLevel;
  requiresConfirmation: boolean;
  idempotency: 'required' | 'not_applicable';
  timeoutMs: number;
  grounding: 'semantic_query' | 'domain_service' | 'preview_action';
  examples: string[];
  negativeExamples: string[];
  synonyms: string[];
  successSchema: Record<string, unknown>;
  definitionRefs: BrainPublishedDefinitionRef[];
}

export interface BrainGeneratedCapabilityContractArtifact {
  manifest: BrainGeneratedCapabilityManifest;
  scanEvidence: {
    capabilityKey: string;
    sourceFingerprint: string;
    requiredPermissions: string[];
    storeScope: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
    executorBinding: BrainGeneratedCapabilityExecutorBinding;
  };
  proposal: {
    capabilityKey: string;
    sourceFingerprint: string;
    businessDefinitions: BrainPublishedDefinitionRef[];
    storeScope: string;
    executorBinding: BrainGeneratedCapabilityExecutorBinding;
  };
}

export interface BrainCapabilityGenerationProposal {
  status: 'ready' | 'synthetic_contract_only';
  capabilityKey: string;
  sourceFingerprint: string;
  proposalFingerprint: string;
  businessDefinitions: BrainPublishedDefinitionRef[];
  manifest: BrainGeneratedCapabilityManifest;
  languageCandidates: BrainCapabilityNarrative;
  executorBinding: BrainGeneratedCapabilityExecutorBinding;
  bindingSource: string;
  contractArtifact: BrainGeneratedCapabilityContractArtifact;
  contractTestSource: string;
  gateReport: BrainCapabilityGenerationGateReport;
  governanceOverlay?: {
    verified: true;
    baseRequiredPermissions: string[];
    additionalPermissions: string[];
    allowedRoles: string[];
  };
}

export interface BrainCapabilityGenerationResult {
  proposals: BrainCapabilityGenerationProposal[];
  blocked: BrainCapabilityGenerationBlock[];
}

@Injectable()
export class BrainCapabilityCodegenService {
  private readonly ajv = new Ajv({ allErrors: true, strict: true });

  constructor(
    @Inject(BRAIN_CAPABILITY_NARRATIVE_GENERATOR)
    private readonly narrativeGenerator: BrainCapabilityNarrativeGenerator,
    @Inject(BRAIN_CAPABILITY_DEFINITION_SNAPSHOT_SOURCE)
    private readonly definitionSource: BrainCapabilityDefinitionSnapshotSource,
    @Optional() private readonly semanticCompiler?: BrainCapabilitySemanticCompilerService,
    @Optional()
    private readonly generationGate?: {
      evaluate(input: {
        capability: BrainCapabilityCandidate;
        proposal: BrainCapabilityGenerationProposal;
        workspaceRoot?: string;
      }): Promise<BrainCapabilityGenerationGateReport>;
    },
    @Optional() private readonly canonicalSemanticsSource?: BrainCapabilityCanonicalSemanticsSource,
  ) {}

  async generate(input: BrainCapabilityGenerationInput): Promise<BrainCapabilityGenerationResult> {
    let snapshot: BrainBusinessDefinitionSnapshot;
    try {
      snapshot = await this.definitionSource.loadPublishedSnapshot();
    } catch {
      return blockAll(input.scan, 'business_definition_snapshot_unavailable');
    }
    if (!validSnapshot(snapshot)) return blockAll(input.scan, 'invalid_business_definition_snapshot');

    const definitions = new Map<string, BrainBusinessDefinitionSnapshotEntry[]>();
    for (const definition of snapshot.definitions) {
      definitions.set(definition.definitionKey, [...(definitions.get(definition.definitionKey) ?? []), definition]);
    }
    const proposals: BrainCapabilityGenerationProposal[] = [];
    const blocked: BrainCapabilityGenerationBlock[] = [];

    for (const capability of [...input.scan.capabilities].sort((left, right) => left.key.localeCompare(right.key))) {
      const reasons = eligibilityIssues(capability);
      const resolvedDefinitions = capability.businessDefinitionKeys.flatMap((definitionKey) => {
        const matches = definitions.get(definitionKey) ?? [];
        if (matches.length > 1) {
          reasons.push(`ambiguous_business_definition_key:${definitionKey}`);
          return [];
        }
        return matches;
      });
      for (const definitionKey of capability.businessDefinitionKeys) {
        if (!definitions.has(definitionKey)) reasons.push(`missing_published_business_definition:${definitionKey}`);
      }
      const technicalOutputSchema = withBrainCapabilityMappingOutputs(
        outputSchema(capability.outputContract.return),
        capability.mappingOutputs,
      );
      let canonicalSemantics: BrainCanonicalCapabilitySemantics | undefined;
      let narrative: BrainCapabilityNarrative | undefined;
      let grounding: 'semantic_query' | 'domain_service' | 'preview_action' | undefined;
      const useV2SemanticCompiler =
        Boolean(this.semanticCompiler) &&
        resolvedDefinitions.length === capability.businessDefinitionKeys.length &&
        resolvedDefinitions.every(hasV2CapabilitySemanticView);

      if (useV2SemanticCompiler) {
        try {
          const compiled = await this.semanticCompiler!.compile({
            capability,
            definitions: resolvedDefinitions,
            successSchema: technicalOutputSchema,
          });
          canonicalSemantics = compiled.canonicalSemantics;
          narrative = compiled.narrative;
          grounding = deriveExecutableCapabilityGrounding(capability, resolvedDefinitions);
        } catch (error) {
          if (!(error instanceof BrainCapabilitySemanticCompilationError)) throw error;
          reasons.push(...error.reasons);
        }
      } else {
        try {
          const canonicalProjection = resolveCanonicalCapabilityProjection({
            capabilityKey: capability.key,
            definitions: resolvedDefinitions,
          });
          canonicalSemantics = canonicalProjection.semantics;
          grounding = deriveExecutableCapabilityGrounding(capability, resolvedDefinitions);
          validateCanonicalSemantics(capability, resolvedDefinitions, canonicalSemantics, reasons);
        } catch (error) {
          if (!(error instanceof BrainCanonicalCapabilityProjectionError)) throw error;
          if (this.canonicalSemanticsSource) {
            try {
              canonicalSemantics = this.canonicalSemanticsSource.resolve({
                capability,
                definitions: resolvedDefinitions,
                successSchema: technicalOutputSchema,
              });
              grounding = deriveExecutableCapabilityGrounding(capability, resolvedDefinitions);
              validateCanonicalSemantics(capability, resolvedDefinitions, canonicalSemantics, reasons);
            } catch {
              reasons.push(`contract_refresh_semantics_invalid:${capability.key}`);
            }
          } else {
            for (const issue of error.issues) {
              reasons.push(`${issue === 'conflict' ? 'conflicting' : issue}_capability_semantic_view:${capability.key}`);
            }
          }
        }
      }
      if (canonicalSemantics) canonicalSemantics = applyExplicitSemanticContract(capability, canonicalSemantics);
      if (
        canonicalSemantics &&
        canonicalizeBusinessDefinition(canonicalSemantics.successSchema) !==
          canonicalizeBusinessDefinition(technicalOutputSchema)
      ) {
        reasons.push('canonical_success_schema_contract_mismatch');
      }
      const referenceDefinitions = grounding === 'semantic_query'
        ? expandSemanticQueryDefinitionRefs(resolvedDefinitions, definitions, reasons)
        : resolvedDefinitions;
      if (reasons.length > 0 || !canonicalSemantics || !grounding) {
        const uniqueReasons = uniqueSorted(reasons);
        blocked.push({
          capabilityKey: capability.key,
          reasons: uniqueReasons,
          ...(needsIndependentBranchProposal(uniqueReasons)
            ? { branchProposal: independentBranchProposal(capability, uniqueReasons) }
            : {}),
        });
        continue;
      }

      const definitionRefs = referenceDefinitions
        .map(toDefinitionRef)
        .sort((left, right) => left.definitionKey.localeCompare(right.definitionKey));
      if (!narrative) {
        try {
          narrative = await this.narrativeGenerator.generate({
            capability,
            businessDefinitions: definitionRefs,
            canonicalSemantics,
          });
        } catch {
          blocked.push({ capabilityKey: capability.key, reasons: ['model_enrichment_failed'] });
          continue;
        }
      }
      if (!this.validNarrative(narrative)) {
        blocked.push({ capabilityKey: capability.key, reasons: ['invalid_model_enrichment'] });
        continue;
      }
      if (
        canonicalizeBusinessDefinition(narrative.successSchema) !==
        canonicalizeBusinessDefinition(canonicalSemantics.successSchema)
      ) {
        blocked.push({
          capabilityKey: capability.key,
          reasons: ['model_enrichment_conflicts_with_canonical_semantics'],
        });
        continue;
      }
      const proposal = await this.buildProposal(
        capability,
        definitionRefs,
        canonicalSemantics,
        narrative,
        technicalOutputSchema,
        grounding,
        input.workspaceRoot,
        input.generationMode ?? 'published_registry',
      );
      if (!proposal.gateReport.passed) {
        const gateReasons = proposal.gateReport.gates
          .filter((gate) => !gate.passed)
          .flatMap((gate) => gate.reasons.map((reason) => `gate_${gate.gate}_failed:${reason}`));
        blocked.push({
          capabilityKey: capability.key,
          reasons: uniqueSorted(gateReasons),
          gateReport: proposal.gateReport,
          branchProposal: independentBranchProposal(capability, uniqueSorted(gateReasons)),
        });
        continue;
      }
      proposals.push(proposal);
    }
    return { proposals, blocked };
  }

  private validNarrative(value: BrainCapabilityNarrative): boolean {
    if (!nonEmpty(value.description) || !nonEmpty(value.riskExplanation)) return false;
    if (!nonEmptyStrings(value.positiveExamples) || !nonEmptyStrings(value.negativeExamples)) return false;
    if (!Array.isArray(value.synonyms) || value.synonyms.some((item) => !nonEmpty(item))) return false;
    if (!isRecord(value.successSchema)) return false;
    try {
      this.ajv.compile(value.successSchema);
      return true;
    } catch {
      return false;
    }
  }

  private async buildProposal(
    capability: BrainCapabilityCandidate,
    definitionRefs: BrainPublishedDefinitionRef[],
    semantics: BrainCanonicalCapabilitySemantics,
    narrative: BrainCapabilityNarrative,
    technicalOutputSchema: Record<string, unknown>,
    grounding: 'semantic_query' | 'domain_service' | 'preview_action',
    workspaceRoot: string | undefined,
    generationMode: 'published_registry' | 'synthetic_contract_only',
  ): Promise<BrainCapabilityGenerationProposal> {
    const callerInputSchema = publicCapabilityInputSchema(inputSchema(capability.inputContract));
    const executorBinding = createGeneratedCapabilityBinding({
      capability,
      inputSchema: callerInputSchema,
      outputSchema: technicalOutputSchema,
    });
    const manifest: BrainGeneratedCapabilityManifest = {
      key: capability.key,
      version: 1 as const,
      sourceFingerprint: capability.sourceFingerprint,
      name: semantics.name,
      description: semantics.description,
      domains: semantics.domains,
      intents: semantics.intents,
      inputSchema: callerInputSchema,
      outputSchema: technicalOutputSchema,
      requiredPermissions: capability.requiredPermissions,
      allowedRoles: uniqueSorted(capability.allowedRoles ?? []),
      readOnly: capability.readOnly,
      sideEffect: capability.sideEffect,
      riskLevel: semantics.riskLevel,
      requiresConfirmation: capability.requiresConfirmation,
      idempotency: capability.idempotency === 'required' ? 'required' : 'not_applicable',
      timeoutMs: 10_000,
      grounding,
      examples: semantics.examples,
      negativeExamples: semantics.negativeExamples,
      synonyms: semantics.synonyms,
      successSchema: semantics.successSchema,
      definitionRefs,
    };
    const contractArtifact = deepCloneFreeze<BrainGeneratedCapabilityContractArtifact>({
      manifest: cloneJson(manifest),
      scanEvidence: {
        capabilityKey: capability.key,
        sourceFingerprint: capability.sourceFingerprint,
        requiredPermissions: [...capability.requiredPermissions],
        storeScope: capability.storeScope,
        inputSchema: cloneJson(callerInputSchema),
        outputSchema: cloneJson(technicalOutputSchema),
        executorBinding: cloneJson(executorBinding),
      },
      proposal: {
        capabilityKey: capability.key,
        sourceFingerprint: capability.sourceFingerprint,
        businessDefinitions: cloneJson(definitionRefs),
        storeScope: capability.storeScope,
        executorBinding: cloneJson(executorBinding),
      },
    });
    assertGeneratedCapabilityContract(contractArtifact);
    const bindingSource = renderGeneratedCapabilityBindingSource(executorBinding);
    const contractTestSource = renderGeneratedCapabilityContractTestSource(executorBinding);
    const proposalFingerprint = createGeneratedCapabilityProposalFingerprint({
      sourceFingerprint: capability.sourceFingerprint,
      manifest,
      executorBinding,
      bindingSource,
      contractTestSource,
    });
    const proposal: BrainCapabilityGenerationProposal = {
      status: generationMode === 'synthetic_contract_only' ? 'synthetic_contract_only' : 'ready',
      capabilityKey: capability.key,
      sourceFingerprint: capability.sourceFingerprint,
      proposalFingerprint,
      businessDefinitions: definitionRefs,
      manifest,
      languageCandidates: narrative,
      executorBinding,
      bindingSource,
      contractArtifact,
      contractTestSource,
      gateReport: { passed: false, gates: [] },
    };
    const gate =
      this.generationGate ??
      new (await import('./brain-capability-generation-gate.service.js')).BrainCapabilityGenerationGateService();
    proposal.gateReport = await gate.evaluate({ capability, proposal, workspaceRoot });
    return proposal;
  }
}

function validateCanonicalSemantics(
  capability: BrainCapabilityCandidate,
  definitions: BrainBusinessDefinitionSnapshotEntry[],
  value: BrainCanonicalCapabilitySemantics,
  reasons: string[],
): void {
  const definitionDomains = new Set(definitions.map((item) => item.domain));
  if (value.domains.some((domain) => !definitionDomains.has(domain))) {
    reasons.push(`capability_domain_not_in_business_definitions:${capability.key}`);
  }
  if (
    canonicalizeBusinessDefinition(value.requiredPermissions) !==
    canonicalizeBusinessDefinition(capability.requiredPermissions)
  ) {
    reasons.push(`capability_permission_projection_mismatch:${capability.key}`);
  }
  if (value.storeScope !== capability.storeScope) {
    reasons.push(`capability_store_scope_projection_mismatch:${capability.key}`);
  }
}

export function validSnapshot(snapshot: BrainBusinessDefinitionSnapshot): boolean {
  try {
    if (!/^[0-9a-f]{64}$/.test(snapshot.snapshotFingerprint)) return false;
    if (snapshotFingerprint(snapshot.definitions) !== snapshot.snapshotFingerprint) return false;
    return snapshot.definitions.every(validDefinition);
  } catch {
    return false;
  }
}

function validDefinition(definition: BrainBusinessDefinitionSnapshotEntry): boolean {
  if (
    !positiveInteger(definition.definitionId) ||
    !positiveInteger(definition.versionId) ||
    !positiveInteger(definition.version) ||
    !nonEmpty(definition.definitionKey) ||
    !/^[0-9a-f]{64}$/.test(definition.fingerprint) ||
    !/^[0-9a-f]{64}$/.test(definition.sourceFingerprint) ||
    definition.validationStatus !== 'passed'
  ) {
    return false;
  }
  const expected = createBusinessDefinitionFingerprint({
    definitionKey: definition.definitionKey,
    kind: definition.kind,
    domain: definition.domain,
    name: definition.name,
    ownerType: definition.ownerType,
    ownerId: definition.ownerId,
    schemaVersion: definition.schemaVersion,
    payload: definition.payload,
    sourceFingerprint: definition.sourceFingerprint,
    canonicalQueryRef: definition.canonicalQueryRef,
    fixtureSetKey: definition.fixtureSetKey,
    timezone: definition.timezone,
    storeScope: definition.storeScope,
  });
  if (expected !== definition.fingerprint) return false;
  return definition.projections.every((projection) => validProjection(definition, projection));
}

function validProjection(
  definition: BrainBusinessDefinitionSnapshotEntry,
  projection: BrainBusinessDefinitionProjection,
): boolean {
  if (
    projection.definitionVersionId !== definition.versionId ||
    projection.definitionKey !== definition.definitionKey ||
    projection.definitionVersion !== definition.version ||
    projection.definitionFingerprint !== definition.fingerprint ||
    projection.sourceFingerprint !== definition.sourceFingerprint ||
    projection.targetKey !== `${definition.definitionKey}@${definition.version}` ||
    projection.readOnly !== true ||
    !/^[0-9a-f]{64}$/.test(projection.projectionFingerprint)
  ) {
    return false;
  }
  const definitionRef = {
    definitionKey: definition.definitionKey,
    definitionVersion: definition.version,
    definitionFingerprint: definition.fingerprint,
    sourceFingerprint: definition.sourceFingerprint,
  };
  const payload = projection.payload;
  if (isBusinessDefinitionProjectionV2Payload(payload)) {
    const expectedPayload = createBusinessDefinitionProjectionV2Payload(
      {
        id: definition.versionId,
        definitionId: definition.definitionId,
        version: definition.version,
        schemaVersion: definition.schemaVersion,
        payload: definition.payload,
        lifecycleStatus: 'published',
        fingerprint: definition.fingerprint,
        sourceFingerprint: definition.sourceFingerprint,
        validationStatus: definition.validationStatus,
        validationReport: definition.validationReport,
        canonicalQueryRef: definition.canonicalQueryRef,
        fixtureSetKey: definition.fixtureSetKey,
        timezone: definition.timezone,
        storeScope: definition.storeScope,
        definition: {
          id: definition.definitionId,
          definitionKey: definition.definitionKey,
          kind: definition.kind,
          domain: definition.domain,
          name: definition.name,
          ownerType: definition.ownerType,
          ownerId: definition.ownerId,
        },
        evidence: definition.evidence,
      },
      projection.targetType as never,
      false,
    );
    if (canonicalizeBusinessDefinition(payload) !== canonicalizeBusinessDefinition(expectedPayload)) return false;
    return (
      createBusinessDefinitionProjectionFingerprint({
        targetType: projection.targetType,
        targetKey: projection.targetKey,
        definitionVersionId: projection.definitionVersionId,
        definitionRef,
        payload,
        readOnly: true,
      }) === projection.projectionFingerprint
    );
  }
  if (
    payload.preview !== false ||
    payload.projectionType !== projection.targetType ||
    canonicalizeBusinessDefinition(payload.definitionRef) !== canonicalizeBusinessDefinition(definitionRef) ||
    payload.kind !== definition.kind ||
    payload.domain !== definition.domain ||
    payload.name !== definition.name ||
    payload.schemaVersion !== definition.schemaVersion ||
    payload.timezone !== definition.timezone ||
    canonicalizeBusinessDefinition(payload.storeScope) !== canonicalizeBusinessDefinition(definition.storeScope) ||
    (payload.canonicalQueryRef ?? null) !== definition.canonicalQueryRef ||
    (payload.fixtureSetKey ?? null) !== definition.fixtureSetKey ||
    canonicalizeBusinessDefinition(payload.definition) !== canonicalizeBusinessDefinition(definition.payload)
  ) {
    return false;
  }
  return (
    createBusinessDefinitionProjectionFingerprint({
      targetType: projection.targetType,
      targetKey: projection.targetKey,
      definitionVersionId: projection.definitionVersionId,
      definitionRef,
      payload: projection.payload,
      readOnly: true,
    }) === projection.projectionFingerprint
  );
}

function toDefinitionRef(definition: BrainBusinessDefinitionSnapshotEntry): BrainPublishedDefinitionRef {
  return {
    definitionId: definition.definitionId,
    versionId: definition.versionId,
    definitionKey: definition.definitionKey,
    version: definition.version,
    definitionFingerprint: definition.fingerprint,
    sourceFingerprint: definition.sourceFingerprint,
  };
}

function eligibilityIssues(capability: BrainCapabilityCandidate): string[] {
  const reasons: string[] = [];
  if (capability.status !== 'draft' || capability.issues.length > 0) reasons.push('scanner_candidate_blocked');
  if (!capability.explicit) reasons.push('unmarked_api_codegen_forbidden');
  if (!capability.readOnly || capability.sideEffect) {
    const governedPreviewAction =
      capability.explicit &&
      capability.readOnly === false &&
      capability.sideEffect === true &&
      capability.requiresConfirmation === true &&
      capability.idempotency === 'required';
    if (!governedPreviewAction) reasons.push('write_capability_codegen_forbidden');
  }
  if (!capability.businessDefinitionKeys.length) reasons.push('missing_business_definition_reference');
  if (!capability.evidence.some((item) => ['controller', 'service'].includes(item.sourceType))) {
    reasons.push('missing_executor_binding');
  } else {
    try {
      const target = resolveGeneratedCapabilityTarget(capability);
      if (!target.exportedClass) reasons.push('generated_capability_target_class_not_exported');
      if (target.methodAccess !== 'public') reasons.push('generated_capability_target_method_not_public');
      if (target.parameterCount < 0 || target.parameterCount > 2) {
        reasons.push('generated_capability_target_signature_unsupported');
      }
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : 'missing_structured_executor_target');
    }
  }
  return reasons;
}

function hasV2CapabilitySemanticView(definition: BrainBusinessDefinitionSnapshotEntry): boolean {
  return definition.projections.some(
    (projection) =>
      projection.targetType === 'capability_semantic_view' &&
      isBusinessDefinitionProjectionV2Payload(projection.payload),
  );
}

function inputSchema(contract: Record<string, string>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [field, descriptor] of Object.entries(contract).sort(([left], [right]) => left.localeCompare(right))) {
    const [presence, typeName = 'unknown'] = descriptor.split(':', 2);
    properties[field] = jsonTypeSchema(typeName);
    if (presence === 'required') required.push(field);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

function outputSchema(returnType?: string): Record<string, unknown> {
  const normalized = String(returnType ?? 'unknown')
    .replace(/^Promise<(.+)>$/, '$1')
    .trim();
  if (normalized.endsWith('[]') || /^Array<.+>$/.test(normalized)) {
    return { type: 'array', items: { type: 'object' } };
  }
  return jsonTypeSchema(normalized);
}

function jsonTypeSchema(typeName: string): Record<string, unknown> {
  const source = typeName.replace(/\s*\|\s*null/g, '').trim();
  const arrayItem = source.endsWith('[]') ? source.slice(0, -2) : /^Array<(.+)>$/.exec(source)?.[1];
  if (arrayItem) return { type: 'array', items: jsonTypeSchema(arrayItem) };
  const normalized = source.toLowerCase();
  if (normalized === 'string' || normalized === 'date') return { type: 'string' };
  if (normalized === 'number' || normalized === 'decimal') return { type: 'number' };
  if (normalized === 'integer' || normalized === 'int') return { type: 'integer' };
  if (normalized === 'boolean') return { type: 'boolean' };
  if (normalized.startsWith('record<') || normalized === 'object' || normalized === 'unknown') {
    return { type: 'object' };
  }
  return { type: 'object' };
}

export function assertGeneratedCapabilityContract(artifact: BrainGeneratedCapabilityContractArtifact): void {
  const canonical = (value: unknown) => canonicalizeBusinessDefinition(value);
  if (
    !/^[0-9a-f]{64}$/.test(artifact.scanEvidence.sourceFingerprint) ||
    artifact.manifest.sourceFingerprint !== artifact.scanEvidence.sourceFingerprint ||
    artifact.proposal.sourceFingerprint !== artifact.scanEvidence.sourceFingerprint
  ) {
    throw new Error('generated_capability_contract_source_fingerprint_mismatch');
  }
  if (
    artifact.manifest.key !== artifact.scanEvidence.capabilityKey ||
    artifact.proposal.capabilityKey !== artifact.scanEvidence.capabilityKey
  ) {
    throw new Error('generated_capability_contract_identity_mismatch');
  }
  if (
    canonical(artifact.manifest.requiredPermissions) !== canonical(artifact.scanEvidence.requiredPermissions) ||
    canonical(artifact.manifest.inputSchema) !== canonical(artifact.scanEvidence.inputSchema) ||
    canonical(artifact.manifest.outputSchema) !== canonical(artifact.scanEvidence.outputSchema) ||
    canonical(artifact.manifest.definitionRefs) !== canonical(artifact.proposal.businessDefinitions) ||
    artifact.proposal.storeScope !== artifact.scanEvidence.storeScope
  ) {
    throw new Error('generated_capability_contract_manifest_mismatch');
  }
  if (canonical(artifact.proposal.executorBinding) !== canonical(artifact.scanEvidence.executorBinding)) {
    throw new Error('generated_capability_contract_executor_binding_mismatch');
  }
  const binding = artifact.proposal.executorBinding;
  if (
    binding.sourceFingerprint !== artifact.scanEvidence.sourceFingerprint ||
    binding.capabilityKey !== artifact.scanEvidence.capabilityKey ||
    canonical(binding.requiredPermissions) !== canonical(artifact.scanEvidence.requiredPermissions) ||
    binding.storeScope !== artifact.scanEvidence.storeScope ||
    canonical(binding.inputSchema) !== canonical(artifact.scanEvidence.inputSchema) ||
    canonical(binding.outputSchema) !== canonical(artifact.scanEvidence.outputSchema) ||
    binding.readOnly !== artifact.manifest.readOnly ||
    binding.sideEffect !== artifact.manifest.sideEffect ||
    binding.requiresConfirmation !== artifact.manifest.requiresConfirmation ||
    binding.idempotency !== artifact.manifest.idempotency ||
    generatedBindingFingerprint(binding) !== binding.bindingFingerprint
  ) {
    throw new Error('generated_capability_contract_binding_policy_mismatch');
  }
}

function blockAll(scan: BrainCapabilityScanReport, reason: string): BrainCapabilityGenerationResult {
  return {
    proposals: [],
    blocked: [...scan.capabilities]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((item) => ({ capabilityKey: item.key, reasons: [reason] })),
  };
}

function needsIndependentBranchProposal(reasons: string[]): boolean {
  return reasons.some(
    (reason) =>
      reason === 'unmarked_api_codegen_forbidden' ||
      reason === 'write_capability_codegen_forbidden' ||
      reason === 'missing_executor_binding' ||
      reason.includes('executor_target'),
  );
}

function independentBranchProposal(
  capability: BrainCapabilityCandidate,
  reasons: string[],
): BrainCapabilityIndependentBranchProposal {
  const key = capability.key
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'candidate';
  const sourceFiles = uniqueSorted(
    capability.evidence
      .filter((item) => ['controller', 'service', 'decorator'].includes(item.sourceType))
      .map((item) => item.path),
  );
  const filesToAdd = reasons.some((reason) => reason.includes('missing_executor') || reason.includes('executor_target'))
    ? [`packages/server-v2/src/brain/capability/executors/${key}.executor.ts`]
    : [];
  return {
    type: 'independent_branch_proposal',
    suggestedBranchName: `codex/ami-brain-capability-${key}`,
    filesToAdd,
    filesToModify: sourceFiles,
    blockingReasons: uniqueSorted(reasons),
  };
}

function deriveExecutableCapabilityGrounding(
  capability: BrainCapabilityCandidate,
  definitions: BrainBusinessDefinitionSnapshotEntry[],
): 'semantic_query' | 'domain_service' | 'preview_action' {
  const executorIdentity = capability.evidence
    .filter((item) => item.sourceType === 'decorator')
    .map((item) => `${item.path}#${item.symbol}`)
    .join('\n');
  if (executorIdentity.includes('BrainDomainServiceCapabilityExecutor')) return 'domain_service';
  if (executorIdentity.includes('BrainSemanticQueryCapabilityExecutor')) return 'semantic_query';
  if (executorIdentity.includes('BrainActionCapabilityExecutor')) return 'preview_action';
  return deriveCanonicalCapabilityGrounding(capability.key, definitions);
}

function expandSemanticQueryDefinitionRefs(
  resolvedDefinitions: BrainBusinessDefinitionSnapshotEntry[],
  definitions: Map<string, BrainBusinessDefinitionSnapshotEntry[]>,
  reasons: string[],
) {
  const expanded = new Map(resolvedDefinitions.map((definition) => [definition.definitionKey, definition]));
  for (const metric of resolvedDefinitions.filter((definition) => definition.kind === 'metric')) {
    const payload = isRecord(metric.payload) ? metric.payload : {};
    const dimensions = Array.isArray(payload.dimensions)
      ? payload.dimensions.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    for (const dimension of dimensions) {
      const definitionKey = dimension.startsWith('dimension.') ? dimension : `dimension.${dimension}`;
      const matches = definitions.get(definitionKey) ?? [];
      if (matches.length === 0) {
        reasons.push(`missing_published_business_definition:${definitionKey}`);
        continue;
      }
      if (matches.length > 1) {
        reasons.push(`ambiguous_business_definition_key:${definitionKey}`);
        continue;
      }
      expanded.set(definitionKey, matches[0]!);
    }
  }
  return [...expanded.values()];
}

function applyExplicitSemanticContract(
  capability: BrainCapabilityCandidate,
  semantics: BrainCanonicalCapabilitySemantics,
): BrainCanonicalCapabilitySemantics {
  const hints = capability.semanticHints;
  if (!capability.explicit || !hints) return semantics;
  return {
    ...semantics,
    name: hints.name.trim(),
    description: hints.description.trim(),
    intents: uniqueSorted(hints.intents),
    examples: uniqueSorted(hints.examples),
    negativeExamples: uniqueSorted(hints.negativeExamples),
    synonyms: uniqueSorted(hints.synonyms),
  };
}

function snapshotFingerprint(definitions: BrainBusinessDefinitionSnapshotEntry[]) {
  return createHash('sha256').update(canonicalizeBusinessDefinition(definitions)).digest('hex');
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepCloneFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => deepCloneFreeze(item))) as T;
  if (value != null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, deepCloneFreeze(item)]),
      ),
    ) as T;
  }
  return value;
}
