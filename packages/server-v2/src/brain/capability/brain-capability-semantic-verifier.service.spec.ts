import { createHash } from 'node:crypto';
import {
  canonicalizeBusinessDefinition,
  createBusinessDefinitionProjectionFingerprint,
  createBusinessDefinitionProjectionV2Payload,
} from '../../semantic-data/business-definition-projection-compiler.service.js';
import { createBusinessDefinitionFingerprint } from '../../semantic-data/business-definition-registry.service.js';
import type {
  BrainBusinessDefinitionSnapshot,
  BrainCapabilityGenerationProposal,
} from './brain-capability-codegen.service.js';
import { validSnapshot } from './brain-capability-codegen.service.js';
import { BrainCapabilitySemanticVerifierService } from './brain-capability-semantic-verifier.service.js';

describe('BrainCapabilitySemanticVerifierService', () => {
  it('accepts a proposal only when proposal, manifest and current published snapshot agree', async () => {
    const current = snapshot();
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(verifier.verifyProposal(proposal(current))).resolves.toMatchObject({
      manifest: expect.objectContaining({ key: 'product_sales_ranking', grounding: 'semantic_query' }),
    });
  });

  it.each([
    ['definitionId', 999],
    ['versionId', 999],
    ['definitionKey', 'metric.forged'],
    ['version', 999],
    ['definitionFingerprint', 'd'.repeat(64)],
    ['sourceFingerprint', 'e'.repeat(64)],
  ] as const)('fails closed when current definition lineage field %s is forged', async (field, value) => {
    const current = snapshot();
    const generated = proposal(current);
    generated.manifest.definitionRefs[0] = { ...generated.manifest.definitionRefs[0], [field]: value };
    generated.businessDefinitions = generated.manifest.definitionRefs.map((item) => ({ ...item }));
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(verifier.verifyProposal(generated)).rejects.toThrow(
      'generated_capability_definition_lineage_mismatch',
    );
  });

  it('rejects rewritten canonical semantics and inconsistent proposal refs', async () => {
    const current = snapshot();
    const rewritten = proposal(current);
    rewritten.manifest.description = '调用者改写的第二套业务语义';
    const inconsistent = proposal(current);
    inconsistent.businessDefinitions = [];
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(verifier.verifyProposal(rewritten)).rejects.toThrow('generated_capability_semantics_mismatch');
    await expect(verifier.verifyProposal(inconsistent)).rejects.toThrow(
      'generated_capability_definition_refs_mismatch',
    );
  });

  it('loads one published snapshot when verifying multiple cards', async () => {
    const current = snapshot();
    const loadPublishedSnapshot = jest.fn().mockResolvedValue(current);
    const verifier = new BrainCapabilitySemanticVerifierService({ loadPublishedSnapshot } as never);
    const generated = proposal(current);

    await expect(
      verifier.verifyCards([
        generated.manifest as never,
        {
          ...generated.manifest,
          definitionRefs: generated.manifest.definitionRefs.map((item) => ({ ...item })),
        } as never,
      ]),
    ).resolves.toBeUndefined();

    expect(loadPublishedSnapshot).toHaveBeenCalledTimes(1);
  });

  it('preserves canonical Date values while cloning a published snapshot', async () => {
    const current = v2Snapshot();
    (current.definitions[0]!.projections[0] as any).generatedAt = new Date('2026-07-14T00:00:00.000Z');
    current.snapshotFingerprint = createHash('sha256')
      .update(canonicalizeBusinessDefinition(current.definitions))
      .digest('hex');
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    const cloned = await verifier.loadVerifiedSnapshot();

    expect(validSnapshot(cloned)).toBe(true);
    expect((cloned.definitions[0]!.projections[0] as any).generatedAt).toBe('2026-07-14T00:00:00.000Z');
  });

  it('loads one published snapshot when verifying multiple stored generated capabilities', async () => {
    const current = snapshot();
    const loadPublishedSnapshot = jest.fn().mockResolvedValue(current);
    const verifier = new BrainCapabilitySemanticVerifierService({ loadPublishedSnapshot } as never);
    const generated = proposal(current);
    const sourceRow = storedSourceRow(generated.manifest);
    const storedSnapshot = {
      ...generated.manifest,
      generatedCapability: true,
      registryVersion: generated.manifest.version,
    };

    await expect(
      verifier.verifyStoredCapabilities([
        { snapshot: storedSnapshot, sourceRow },
        { snapshot: { ...storedSnapshot }, sourceRow: { ...sourceRow } },
      ]),
    ).resolves.toBeUndefined();

    expect(loadPublishedSnapshot).toHaveBeenCalledTimes(1);
  });

  it('rejects coercible stored values instead of trusting Number or enum casts', async () => {
    const current = snapshot();
    const generated = proposal(current);
    const sourceRow = { ...storedSourceRow(generated.manifest), version: '1', riskLevel: 'LOW' };
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(
      verifier.verifyStoredCapability({
        snapshot: { ...generated.manifest, generatedCapability: true, registryVersion: 1 },
        sourceRow,
      }),
    ).rejects.toMatchObject({ name: 'BadRequestException' });
  });

  it.each([
    ['version', '1'],
    ['version', 1.5],
    ['riskLevel', 'unknown'],
    ['grounding', 'database'],
    ['domains', 'sales'],
    ['sourceFingerprint', 'not-a-sha256'],
    ['definitionRefs', [{ definitionId: 1 }]],
  ] as const)('rejects malformed raw manifest field %s with BadRequest', async (field, value) => {
    const current = snapshot();
    const generated = proposal(current);
    (generated.manifest as unknown as Record<string, unknown>)[field] = value;
    if (field === 'sourceFingerprint') generated.sourceFingerprint = String(value);
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(verifier.verifyProposal(generated as never)).rejects.toMatchObject({
      name: 'BadRequestException',
    });
  });

  it('returns a deeply frozen clone so proposal mutation cannot change verified persistence input', async () => {
    const current = snapshot();
    const generated = proposal(current);
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    const verified = await verifier.verifyProposal(generated);
    generated.manifest.name = '被篡改';
    generated.manifest.definitionRefs[0]!.definitionKey = 'metric.tampered';

    expect(verified.manifest.name).toBe('商品销售排行');
    expect(verified.manifest.definitionRefs[0]!.definitionKey).toBe('metric.product_sales_quantity');
    expect(Object.isFrozen(verified.manifest)).toBe(true);
    expect(Object.isFrozen(verified.manifest.definitionRefs)).toBe(true);
    expect(Object.isFrozen(verified.manifest.definitionRefs[0])).toBe(true);
  });

  it('verifies V2 model semantics through definition lineage, bindings and deterministic contracts', async () => {
    const current = v2Snapshot();
    const generated = proposal(current);
    generated.manifest.domains = ['product'];
    generated.manifest.requiredPermissions = ['core:order:products'];
    generated.manifest.description = '模型编译：按统一商品销量口径排序。';
    generated.manifest.grounding = 'semantic_query';
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(verifier.verifyProposal(generated)).resolves.toMatchObject({
      manifest: expect.objectContaining({ description: '模型编译：按统一商品销量口径排序。' }),
    });

    const wrongDomain = structuredClone(generated);
    wrongDomain.manifest.domains = ['finance'];
    await expect(verifier.verifyProposal(wrongDomain)).rejects.toThrow('generated_capability_semantics_mismatch');

    const wrongSchema = structuredClone(generated);
    wrongSchema.manifest.successSchema = { type: 'array' };
    await expect(verifier.verifyProposal(wrongSchema)).rejects.toThrow('generated_capability_semantics_mismatch');
  });

  it('accepts shared V2 dimensions when at least one referenced definition binds the semantic query capability', async () => {
    const current = v2Snapshot();
    const sharedDimension = sharedV2DimensionDefinition();
    current.definitions.push(sharedDimension);
    current.snapshotFingerprint = createHash('sha256')
      .update(canonicalizeBusinessDefinition(current.definitions))
      .digest('hex');
    const generated = proposal(current);
    const sharedRef = {
      definitionId: sharedDimension.definitionId,
      versionId: sharedDimension.versionId,
      definitionKey: sharedDimension.definitionKey,
      version: sharedDimension.version,
      definitionFingerprint: sharedDimension.fingerprint,
      sourceFingerprint: sharedDimension.sourceFingerprint,
    };
    generated.businessDefinitions.push(sharedRef);
    generated.manifest.definitionRefs.push(sharedRef);
    generated.manifest.domains = ['product'];
    generated.manifest.requiredPermissions = ['core:order:products'];
    generated.manifest.description = '模型编译：按统一商品销量口径排序。';
    generated.manifest.grounding = 'semantic_query';
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(verifier.verifyProposal(generated)).resolves.toMatchObject({
      manifest: expect.objectContaining({ key: 'product_sales_ranking' }),
    });

    const unbound = structuredClone(generated);
    unbound.capabilityKey = 'unbound_semantic_query';
    unbound.manifest.key = 'unbound_semantic_query';
    await expect(verifier.verifyProposal(unbound)).rejects.toThrow('generated_capability_semantics_mismatch');
  });

  it('allows an explicit domain-service composite to cite governed definitions without claiming metric executor bindings', async () => {
    const current = v2Snapshot();
    const generated = proposal(current);
    generated.capabilityKey = 'store_operations_overview';
    generated.manifest.key = 'store_operations_overview';
    generated.manifest.name = '店长经营概览';
    generated.manifest.description = '组合已发布经营事实。';
    generated.manifest.domains = ['product'];
    generated.manifest.intents = ['diagnosis', 'query'];
    generated.manifest.grounding = 'domain_service';
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(verifier.verifyProposal(generated)).resolves.toMatchObject({
      manifest: expect.objectContaining({ key: 'store_operations_overview', grounding: 'domain_service' }),
    });
  });

  it('uses a verified domain executor binding as the grounding source of truth', async () => {
    const current = v2Snapshot();
    const generated = proposal(current);
    generated.manifest.domains = ['product'];
    generated.manifest.requiredPermissions = ['core:order:products'];
    generated.manifest.description = '模型编译：按统一商品销量口径排序。';
    generated.manifest.grounding = 'domain_service';
    generated.executorBinding = {
      capabilityKey: generated.manifest.key,
      sourceFingerprint: generated.manifest.sourceFingerprint,
      target: {
        className: 'BrainDomainServiceCapabilityExecutor',
        sourcePath: 'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts',
      },
    } as never;
    const verifier = new BrainCapabilitySemanticVerifierService({
      loadPublishedSnapshot: jest.fn().mockResolvedValue(current),
    } as never);

    await expect(verifier.verifyProposal(generated)).resolves.toMatchObject({
      manifest: expect.objectContaining({ grounding: 'domain_service' }),
    });
  });
});

function proposal(snapshotValue: BrainBusinessDefinitionSnapshot): BrainCapabilityGenerationProposal {
  const definition = snapshotValue.definitions[0]!;
  const definitionRef = {
    definitionId: definition.definitionId,
    versionId: definition.versionId,
    definitionKey: definition.definitionKey,
    version: definition.version,
    definitionFingerprint: definition.fingerprint,
    sourceFingerprint: definition.sourceFingerprint,
  };
  return {
    status: 'ready',
    capabilityKey: 'product_sales_ranking',
    sourceFingerprint: 'f'.repeat(64),
    proposalFingerprint: 'e'.repeat(64),
    businessDefinitions: [{ ...definitionRef }],
    manifest: {
      key: 'product_sales_ranking',
      version: 1,
      sourceFingerprint: 'f'.repeat(64),
      name: '商品销售排行',
      description: '按已发布商品销量口径排序。',
      domains: ['sales'],
      intents: ['ranking'],
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'object' },
      requiredPermissions: ['core:metric:view'],
      allowedRoles: [],
      readOnly: true,
      sideEffect: false,
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotency: 'not_applicable',
      timeoutMs: 10_000,
      grounding: 'semantic_query',
      examples: ['本月商品销售排行'],
      negativeExamples: ['员工表现排行'],
      synonyms: ['商品销量榜'],
      successSchema: { type: 'object' },
      definitionRefs: [{ ...definitionRef }],
    },
    languageCandidates: {
      description: '候选文案',
      positiveExamples: ['商品销量'],
      negativeExamples: ['员工表现'],
      synonyms: ['销量榜'],
      successSchema: { type: 'object' },
      riskExplanation: '只读',
    },
    executorBinding: {
      controller: 'ProductsController',
      httpMethod: 'GET',
      path: '/products/ranking',
      serviceCalls: ['ProductsService.ranking'],
    } as unknown as BrainCapabilityGenerationProposal['executorBinding'],
    bindingSource: '',
    contractArtifact: {} as BrainCapabilityGenerationProposal['contractArtifact'],
    contractTestSource: '',
    gateReport: { passed: true, gates: [] },
  };
}

function snapshot(): BrainBusinessDefinitionSnapshot {
  const definitionPayload = {
    capabilities: [
      {
        key: 'product_sales_ranking',
        name: '商品销售排行',
        description: '按已发布商品销量口径排序。',
        domains: ['sales'],
        intents: ['ranking'],
        riskLevel: 'low',
        requiredPermissions: ['core:metric:view'],
        storeScope: 'required',
        examples: ['本月商品销售排行'],
        negativeExamples: ['员工表现排行'],
        synonyms: ['商品销量榜'],
        successSchema: { type: 'object' },
      },
    ],
    runtimeQuery: { capabilityKeys: ['product_sales_ranking'] },
  };
  const immutable = {
    definitionKey: 'metric.product_sales_quantity',
    kind: 'metric',
    domain: 'sales',
    name: '商品销售数量',
    ownerType: 'system',
    ownerId: null,
    schemaVersion: '1.0',
    payload: definitionPayload,
    sourceFingerprint: 'a'.repeat(64),
    canonicalQueryRef: 'semantic_query.product_sales_quantity',
    fixtureSetKey: 'fixture.product_sales',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  };
  const fingerprint = createBusinessDefinitionFingerprint(immutable);
  const definitionRef = {
    definitionKey: immutable.definitionKey,
    definitionVersion: 3,
    definitionFingerprint: fingerprint,
    sourceFingerprint: immutable.sourceFingerprint,
  };
  const payload = {
    preview: false,
    projectionType: 'capability_semantic_view',
    definitionRef,
    kind: immutable.kind,
    domain: immutable.domain,
    name: immutable.name,
    schemaVersion: immutable.schemaVersion,
    timezone: immutable.timezone,
    storeScope: immutable.storeScope,
    canonicalQueryRef: immutable.canonicalQueryRef,
    fixtureSetKey: immutable.fixtureSetKey,
    definition: definitionPayload,
  };
  const definition = {
    definitionId: 11,
    versionId: 21,
    ...immutable,
    version: 3,
    fingerprint,
    validationStatus: 'passed',
    validationReport: null,
    evidence: [],
    projections: [
      {
        definitionVersionId: 21,
        targetType: 'capability_semantic_view' as const,
        targetKey: `${immutable.definitionKey}@3`,
        definitionKey: immutable.definitionKey,
        definitionVersion: 3,
        definitionFingerprint: fingerprint,
        sourceFingerprint: immutable.sourceFingerprint,
        payload,
        projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
          targetType: 'capability_semantic_view',
          targetKey: `${immutable.definitionKey}@3`,
          definitionVersionId: 21,
          definitionRef,
          payload,
          readOnly: true,
        }),
        readOnly: true,
      },
    ],
  };
  return {
    definitions: [definition],
    snapshotFingerprint: createHash('sha256')
      .update(canonicalizeBusinessDefinition([definition]))
      .digest('hex'),
  };
}

function v2Snapshot(): BrainBusinessDefinitionSnapshot {
  const immutable = {
    definitionKey: 'metric.product_sales_quantity',
    kind: 'metric',
    domain: 'product',
    name: '商品销量',
    ownerType: 'system',
    ownerId: null,
    schemaVersion: '1.0',
    payload: {
      metricKey: 'product_sales_quantity',
      aliases: ['商品销售数量'],
      bindings: {
        capability: ['product_sales_ranking'],
        executor: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
      },
      runtimeQuery: { capabilityKeys: ['product_sales_ranking'] },
    },
    sourceFingerprint: 'b'.repeat(64),
    canonicalQueryRef: 'semantic_query.product_sales_quantity',
    fixtureSetKey: 'fixture.product_sales',
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  };
  const fingerprint = createBusinessDefinitionFingerprint(immutable);
  const version = {
    id: 41,
    definitionId: 40,
    version: 1,
    ...immutable,
    lifecycleStatus: 'published',
    fingerprint,
    validationStatus: 'passed',
    evidence: [],
    definition: {
      id: 40,
      definitionKey: immutable.definitionKey,
      kind: immutable.kind,
      domain: immutable.domain,
      name: immutable.name,
      ownerType: immutable.ownerType,
      ownerId: immutable.ownerId,
    },
  };
  const payload = createBusinessDefinitionProjectionV2Payload(version, 'capability_semantic_view', false);
  const projection = {
    definitionVersionId: 41,
    targetType: 'capability_semantic_view' as const,
    targetKey: `${immutable.definitionKey}@1`,
    definitionKey: immutable.definitionKey,
    definitionVersion: 1,
    definitionFingerprint: fingerprint,
    sourceFingerprint: immutable.sourceFingerprint,
    payload,
    projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
      targetType: 'capability_semantic_view',
      targetKey: `${immutable.definitionKey}@1`,
      definitionVersionId: 41,
      definitionRef: payload.definitionRef,
      payload,
      readOnly: true,
    }),
    readOnly: true,
  };
  const definition = {
    definitionId: 40,
    versionId: 41,
    ...immutable,
    version: 1,
    fingerprint,
    validationStatus: 'passed',
    validationReport: null,
    evidence: [],
    projections: [projection],
  };
  return {
    definitions: [definition],
    snapshotFingerprint: createHash('sha256')
      .update(canonicalizeBusinessDefinition([definition]))
      .digest('hex'),
  };
}

function sharedV2DimensionDefinition(): BrainBusinessDefinitionSnapshot['definitions'][number] {
  const immutable = {
    definitionKey: 'dimension.productName',
    kind: 'dimension',
    domain: 'product',
    name: '商品名称',
    ownerType: 'system',
    ownerId: null,
    schemaVersion: '1.0',
    payload: {
      dimensionKey: 'productName',
      aliases: ['商品'],
      bindings: { capability: ['inventory_risk_ranking'] },
    },
    sourceFingerprint: 'c'.repeat(64),
    canonicalQueryRef: null,
    fixtureSetKey: null,
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  };
  const fingerprint = createBusinessDefinitionFingerprint(immutable);
  const version = {
    id: 43,
    definitionId: 42,
    version: 1,
    ...immutable,
    lifecycleStatus: 'published',
    fingerprint,
    validationStatus: 'passed',
    validationReport: null,
    evidence: [],
    definition: {
      id: 42,
      definitionKey: immutable.definitionKey,
      kind: immutable.kind,
      domain: immutable.domain,
      name: immutable.name,
      ownerType: immutable.ownerType,
      ownerId: immutable.ownerId,
    },
  };
  const payload = createBusinessDefinitionProjectionV2Payload(version, 'capability_semantic_view', false);
  const projection = {
    definitionVersionId: version.id,
    targetType: 'capability_semantic_view' as const,
    targetKey: `${immutable.definitionKey}@${version.version}`,
    definitionKey: immutable.definitionKey,
    definitionVersion: version.version,
    definitionFingerprint: fingerprint,
    sourceFingerprint: immutable.sourceFingerprint,
    payload,
    projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
      targetType: 'capability_semantic_view',
      targetKey: `${immutable.definitionKey}@${version.version}`,
      definitionVersionId: version.id,
      definitionRef: payload.definitionRef,
      payload,
      readOnly: true,
    }),
    readOnly: true,
  };
  return {
    definitionId: version.definitionId,
    versionId: version.id,
    ...immutable,
    version: version.version,
    fingerprint,
    validationStatus: 'passed',
    validationReport: null,
    evidence: [],
    projections: [projection],
  };
}

function storedSourceRow(manifest: BrainCapabilityGenerationProposal['manifest']) {
  return {
    skillKey: manifest.key,
    version: manifest.version,
    sourceFingerprint: manifest.sourceFingerprint,
    name: manifest.name,
    description: manifest.description,
    domains: manifest.domains,
    intents: manifest.intents,
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
    permissions: manifest.requiredPermissions,
    allowedRoles: manifest.allowedRoles,
    readOnly: manifest.readOnly,
    sideEffect: manifest.sideEffect,
    riskLevel: manifest.riskLevel,
    requiresConfirmation: manifest.requiresConfirmation,
    idempotency: manifest.idempotency,
    timeoutMs: manifest.timeoutMs,
    grounding: manifest.grounding,
    examples: manifest.examples,
    negativeExamples: manifest.negativeExamples,
    synonyms: manifest.synonyms,
    successSchema: manifest.successSchema,
    definitionRefs: manifest.definitionRefs,
  };
}
