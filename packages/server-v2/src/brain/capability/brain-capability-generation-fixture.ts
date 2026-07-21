import { createHash } from 'node:crypto';
import {
  canonicalizeBusinessDefinition,
  createBusinessDefinitionProjectionFingerprint,
  createBusinessDefinitionProjectionV2Payload,
} from '../../semantic-data/business-definition-projection-compiler.service.js';
import { createBusinessDefinitionFingerprint } from '../../semantic-data/business-definition-registry.service.js';
import type { BrainCapabilityScanReport } from './brain-capability-scan.types.js';
import type {
  BrainBusinessDefinitionSnapshot,
  BrainCapabilityDefinitionSnapshotSource,
  BrainCapabilityNarrativeGenerator,
} from './brain-capability-codegen.service.js';

export function createDeterministicCapabilityGenerationFixture(scan: BrainCapabilityScanReport): {
  definitionSource: BrainCapabilityDefinitionSnapshotSource;
  narrativeGenerator: BrainCapabilityNarrativeGenerator;
} {
  const definitionKeys = [
    ...new Set(scan.capabilities.flatMap((capability) => capability.businessDefinitionKeys)),
  ].sort();
  const definitions = definitionKeys.map((definitionKey, index) => {
    const capabilities = scan.capabilities
      .filter((capability) => capability.businessDefinitionKeys.includes(definitionKey))
      .map((capability) => ({
        key: capability.key,
        name: capability.name || capability.key,
        description: `Deterministic fixture for ${capability.key}.`,
        domains: ['fixture'],
        intents: [`execute_${capability.key}`],
        riskLevel: capability.riskLevel,
        requiredPermissions: capability.requiredPermissions,
        storeScope: capability.storeScope,
        examples: [`Execute ${capability.key}`],
        negativeExamples: [`Do not mutate through ${capability.key}`],
        synonyms: [],
        successSchema: outputSchema(capability.outputContract.return),
      }));
    const sourceFingerprint = sha256(`deterministic-fixture:${definitionKey}`);
    const payload = {
      aliases: [],
      description: `Deterministic CI fixture for ${definitionKey}.`,
      capabilities,
      bindings: {
        capability: capabilities.map((item) => item.key),
        executor: capabilities.map((item) => item.key),
      },
    };
    const immutable = {
      definitionKey,
      kind: 'entity',
      domain: 'fixture',
      name: definitionKey,
      ownerType: 'system',
      ownerId: null,
      schemaVersion: '2.0',
      payload,
      sourceFingerprint,
      canonicalQueryRef: null,
      fixtureSetKey: 'ami-brain-capability-deterministic-ci',
      timezone: 'Asia/Shanghai',
      storeScope: { mode: 'current_store' },
    };
    const fingerprint = createBusinessDefinitionFingerprint(immutable);
    const definitionId = index + 1;
    const versionId = index + 10_001;
    const versionRecord = {
      id: versionId,
      definitionId,
      version: 1,
      ...immutable,
      lifecycleStatus: 'published',
      fingerprint,
      validationStatus: 'passed',
      evidence: [],
      definition: {
        id: definitionId,
        definitionKey,
        kind: immutable.kind,
        domain: immutable.domain,
        name: immutable.name,
        ownerType: immutable.ownerType,
        ownerId: immutable.ownerId,
      },
    };
    const projectionPayload = createBusinessDefinitionProjectionV2Payload(
      versionRecord,
      'capability_semantic_view',
      false,
    );
    const projectionInput = {
      targetType: 'capability_semantic_view' as const,
      targetKey: `${definitionKey}@1`,
      definitionVersionId: versionId,
      definitionRef: projectionPayload.definitionRef,
      payload: projectionPayload,
      readOnly: true,
    };
    return {
      definitionId,
      versionId,
      definitionKey,
      kind: immutable.kind,
      domain: immutable.domain,
      name: immutable.name,
      ownerType: immutable.ownerType,
      ownerId: immutable.ownerId,
      version: 1,
      schemaVersion: immutable.schemaVersion,
      fingerprint,
      sourceFingerprint,
      validationStatus: 'passed',
      validationReport: null,
      payload,
      canonicalQueryRef: immutable.canonicalQueryRef,
      fixtureSetKey: immutable.fixtureSetKey,
      timezone: immutable.timezone,
      storeScope: immutable.storeScope,
      evidence: [],
      projections: [
        {
          definitionVersionId: versionId,
          targetType: 'capability_semantic_view' as const,
          targetKey: `${definitionKey}@1`,
          definitionKey,
          definitionVersion: 1,
          definitionFingerprint: fingerprint,
          sourceFingerprint,
          payload: projectionPayload,
          projectionFingerprint: createBusinessDefinitionProjectionFingerprint(projectionInput),
          readOnly: true,
        },
      ],
    };
  });
  const snapshot: BrainBusinessDefinitionSnapshot = {
    snapshotFingerprint: sha256(definitions),
    definitions,
  };
  return {
    definitionSource: { loadPublishedSnapshot: async () => snapshot },
    narrativeGenerator: {
      generate: async ({ canonicalSemantics }) => ({
        description: canonicalSemantics.description,
        positiveExamples: canonicalSemantics.examples,
        negativeExamples: canonicalSemantics.negativeExamples,
        synonyms: canonicalSemantics.synonyms,
        successSchema: canonicalSemantics.successSchema,
        riskExplanation: 'Deterministic fixture: read-only proposal with fixed scanner evidence.',
      }),
    },
  };
}

function outputSchema(returnType?: string): Record<string, unknown> {
  const normalized = String(returnType ?? 'unknown').replace(/^Promise<(.+)>$/, '$1').trim();
  if (normalized.endsWith('[]') || /^Array<.+>$/.test(normalized)) {
    return { type: 'array', items: { type: 'object' } };
  }
  return { type: 'object' };
}

function sha256(value: unknown): string {
  const source = typeof value === 'string' ? value : canonicalizeBusinessDefinition(value);
  return createHash('sha256').update(source).digest('hex');
}
