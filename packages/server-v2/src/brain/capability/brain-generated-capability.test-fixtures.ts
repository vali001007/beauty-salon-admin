import { createHash } from 'node:crypto';
import {
  canonicalizeBusinessDefinition,
  createBusinessDefinitionProjectionFingerprint,
} from '../../semantic-data/business-definition-projection-compiler.service.js';
import { createBusinessDefinitionFingerprint } from '../../semantic-data/business-definition-registry.service.js';
import type {
  BrainBusinessDefinitionSnapshot,
  BrainCapabilityGenerationProposal,
} from './brain-capability-codegen.service.js';
import {
  createGeneratedCapabilityBinding,
  createGeneratedCapabilityProposalFingerprint,
  renderGeneratedCapabilityBindingSource,
  renderGeneratedCapabilityContractTestSource,
} from './brain-generated-capability-binding.js';

export function generatedProposalFixture(
  snapshotValue: BrainBusinessDefinitionSnapshot = publishedSnapshotFixture(),
): BrainCapabilityGenerationProposal {
  const definition = snapshotValue.definitions[0]!;
  const definitionRef = {
    definitionId: definition.definitionId,
    versionId: definition.versionId,
    definitionKey: definition.definitionKey,
    version: definition.version,
    definitionFingerprint: definition.fingerprint,
    sourceFingerprint: definition.sourceFingerprint,
  };
  const manifest: BrainCapabilityGenerationProposal['manifest'] = {
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
  };
  const generated = generatedBindingFixture(manifest);
  return {
    status: 'ready',
    capabilityKey: 'product_sales_ranking',
    sourceFingerprint: 'f'.repeat(64),
    proposalFingerprint: generated.proposalFingerprint,
    businessDefinitions: [{ ...definitionRef }],
    manifest,
    languageCandidates: {
      description: '候选文案',
      positiveExamples: ['商品销量'],
      negativeExamples: ['员工表现'],
      synonyms: ['销量榜'],
      successSchema: { type: 'object' },
      riskExplanation: '只读',
    },
    executorBinding: generated.executorBinding,
    bindingSource: generated.bindingSource,
    contractArtifact: {
      manifest,
      scanEvidence: {
        capabilityKey: manifest.key,
        sourceFingerprint: manifest.sourceFingerprint,
        requiredPermissions: manifest.requiredPermissions,
        storeScope: 'required',
        inputSchema: manifest.inputSchema,
        outputSchema: manifest.outputSchema,
        executorBinding: generated.executorBinding,
      },
      proposal: {
        capabilityKey: manifest.key,
        sourceFingerprint: manifest.sourceFingerprint,
        businessDefinitions: [{ ...definitionRef }],
        storeScope: 'required',
        executorBinding: generated.executorBinding,
      },
    },
    contractTestSource: generated.contractTestSource,
    gateReport: { passed: true, gates: [] },
  };
}

export function publishedSnapshotFixture(): BrainBusinessDefinitionSnapshot {
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

export function publishedFourCapabilitySnapshotFixture(): BrainBusinessDefinitionSnapshot {
  const definitions = [
    publishedCapabilityDefinitionFixture({
      definitionId: 101,
      versionId: 201,
      definitionKey: 'metric.product_sales_quantity',
      version: 3,
      sourceFingerprint: '1'.repeat(64),
      capabilityKey: 'product_sales_ranking',
      name: '商品销售排行',
      description: '按订单明细、订单和商品的已发布销量口径排序。',
      domain: 'sales',
      permissions: ['core:order:products'],
      grounding: 'semantic_query',
      example: '本月商品销售排行',
      negativeExample: '本月项目服务排行',
    }),
    publishedCapabilityDefinitionFixture({
      definitionId: 102,
      versionId: 202,
      definitionKey: 'metric.project_service_count',
      version: 2,
      sourceFingerprint: '2'.repeat(64),
      capabilityKey: 'project_service_ranking',
      name: '项目服务排行',
      description: '按订单明细、疗程消耗和项目的已发布服务次数口径排序。',
      domain: 'service',
      permissions: ['core:project-order-profit:view'],
      grounding: 'semantic_query',
      example: '本月项目服务排行',
      negativeExample: '本月商品销售排行',
    }),
    publishedCapabilityDefinitionFixture({
      definitionId: 103,
      versionId: 203,
      definitionKey: 'metric.staff_performance_score',
      version: 4,
      sourceFingerprint: '3'.repeat(64),
      capabilityKey: 'staff_performance_ranking',
      name: '员工业绩排行',
      description: '按管理端员工绩效分析的已发布口径排序。',
      domain: 'staff',
      permissions: ['core:beautician-performance:view'],
      grounding: 'semantic_query',
      example: '本月员工业绩排行',
      negativeExample: '本月客户消费事实',
    }),
    publishedCapabilityDefinitionFixture({
      definitionId: 104,
      versionId: 204,
      definitionKey: 'entity.customer',
      version: 5,
      sourceFingerprint: '4'.repeat(64),
      capabilityKey: 'customer_facts',
      name: '客户事实查询',
      description: '按客户档案和消费记录返回已授权的精确事实。',
      domain: 'customer',
      permissions: ['core:customer:view'],
      grounding: 'domain_service',
      example: '李女士的消费情况',
      negativeExample: '本月员工绩效排行',
    }),
  ];
  return {
    definitions,
    snapshotFingerprint: createHash('sha256').update(canonicalizeBusinessDefinition(definitions)).digest('hex'),
  };
}

export function generatedFourCapabilityProposalsFixture(
  snapshot: BrainBusinessDefinitionSnapshot = publishedFourCapabilitySnapshotFixture(),
): BrainCapabilityGenerationProposal[] {
  return snapshot.definitions.map((definition) => {
    const capability = (definition.payload as { capabilities: Array<Record<string, unknown>> }).capabilities[0]!;
    const definitionRef = {
      definitionId: definition.definitionId,
      versionId: definition.versionId,
      definitionKey: definition.definitionKey,
      version: definition.version,
      definitionFingerprint: definition.fingerprint,
      sourceFingerprint: definition.sourceFingerprint,
    };
    const key = String(capability.key);
    const manifest: BrainCapabilityGenerationProposal['manifest'] = {
      key,
      version: 1,
      sourceFingerprint: createHash('sha256').update(`proposal:${key}`).digest('hex'),
      name: String(capability.name),
      description: String(capability.description),
      domains: [...(capability.domains as string[])],
      intents: [...(capability.intents as string[])],
      inputSchema: strictCapabilityInputSchema(),
      outputSchema: strictCapabilityOutputSchema(),
      requiredPermissions: [...(capability.requiredPermissions as string[])],
      allowedRoles: ['store_manager'],
      readOnly: true,
      sideEffect: false,
      riskLevel: capability.riskLevel as 'low',
      requiresConfirmation: false,
      idempotency: 'not_applicable',
      timeoutMs: 10_000,
      grounding: key === 'customer_facts' ? 'domain_service' : 'semantic_query',
      examples: [...(capability.examples as string[])],
      negativeExamples: [...(capability.negativeExamples as string[])],
      synonyms: [`${key}_同义词`],
      successSchema: strictCapabilityOutputSchema(),
      definitionRefs: [definitionRef],
    };
    const generated = generatedBindingFixture(manifest);
    return {
      status: 'ready',
      capabilityKey: key,
      sourceFingerprint: manifest.sourceFingerprint,
      proposalFingerprint: generated.proposalFingerprint,
      businessDefinitions: [definitionRef],
      manifest,
      languageCandidates: {
        description: manifest.description,
        positiveExamples: [...manifest.examples],
        negativeExamples: [...manifest.negativeExamples],
        synonyms: [...manifest.synonyms],
        successSchema: manifest.successSchema,
        riskExplanation: '只读',
      },
      executorBinding: generated.executorBinding,
      bindingSource: generated.bindingSource,
      contractArtifact: {
        manifest,
        scanEvidence: {
          capabilityKey: key,
          sourceFingerprint: manifest.sourceFingerprint,
          requiredPermissions: manifest.requiredPermissions,
          storeScope: 'required',
          inputSchema: manifest.inputSchema,
          outputSchema: manifest.outputSchema,
          executorBinding: generated.executorBinding,
        },
        proposal: {
          capabilityKey: key,
          sourceFingerprint: manifest.sourceFingerprint,
          businessDefinitions: [definitionRef],
          storeScope: 'required',
          executorBinding: generated.executorBinding,
        },
      },
      contractTestSource: generated.contractTestSource,
      gateReport: { passed: true, gates: [] },
    };
  });
}

function publishedCapabilityDefinitionFixture(input: {
  definitionId: number;
  versionId: number;
  definitionKey: string;
  version: number;
  sourceFingerprint: string;
  capabilityKey: string;
  name: string;
  description: string;
  domain: string;
  permissions: string[];
  grounding: 'semantic_query' | 'domain_service';
  example: string;
  negativeExample: string;
}) {
  const definitionPayload = {
    capabilities: [
      {
        key: input.capabilityKey,
        name: input.name,
        description: input.description,
        domains: [input.domain],
        intents: ['ranking'],
        riskLevel: 'low',
        requiredPermissions: input.permissions,
        storeScope: 'required',
        examples: [input.example],
        negativeExamples: [input.negativeExample],
        synonyms: [`${input.capabilityKey}_同义词`],
        successSchema: strictCapabilityOutputSchema(),
      },
    ],
    runtimeQuery: { capabilityKeys: input.grounding === 'semantic_query' ? [input.capabilityKey] : [] },
  };
  const immutable = {
    definitionKey: input.definitionKey,
    kind: input.definitionKey.startsWith('entity.') ? 'entity' : 'metric',
    domain: input.domain,
    name: input.name,
    ownerType: 'system',
    ownerId: null,
    schemaVersion: '1.0',
    payload: definitionPayload,
    sourceFingerprint: input.sourceFingerprint,
    canonicalQueryRef: input.grounding === 'semantic_query' ? `semantic_query.${input.capabilityKey}` : null,
    fixtureSetKey: `fixture.${input.capabilityKey}`,
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  };
  const fingerprint = createBusinessDefinitionFingerprint(immutable);
  const definitionRef = {
    definitionKey: immutable.definitionKey,
    definitionVersion: input.version,
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
  return {
    definitionId: input.definitionId,
    versionId: input.versionId,
    ...immutable,
    version: input.version,
    fingerprint,
    validationStatus: 'passed',
    validationReport: null,
    evidence: [],
    projections: [
      {
        definitionVersionId: input.versionId,
        targetType: 'capability_semantic_view' as const,
        targetKey: `${immutable.definitionKey}@${input.version}`,
        definitionKey: immutable.definitionKey,
        definitionVersion: input.version,
        definitionFingerprint: fingerprint,
        sourceFingerprint: immutable.sourceFingerprint,
        payload,
        projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
          targetType: 'capability_semantic_view',
          targetKey: `${immutable.definitionKey}@${input.version}`,
          definitionVersionId: input.versionId,
          definitionRef,
          payload,
          readOnly: true,
        }),
        readOnly: true,
      },
    ],
  };
}

function strictCapabilityInputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['objective', 'entities', 'metrics', 'dimensions', 'filters', 'orderBy'],
    properties: {
      objective: { type: 'string', minLength: 1 },
      entities: { type: 'array', items: { type: 'object' } },
      metrics: { type: 'array', items: { type: 'object' } },
      dimensions: { type: 'array', items: { type: 'object' } },
      filters: { type: 'array', items: { type: 'object' } },
      orderBy: { type: 'array', items: { type: 'object' } },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
  };
}

function strictCapabilityOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'answer', 'citations', 'grounding'],
    properties: {
      status: { type: 'string', enum: ['completed', 'failed'] },
      answer: { type: 'string' },
      citations: { type: 'array' },
      grounding: { type: 'string' },
    },
  };
}

function generatedBindingFixture(manifest: BrainCapabilityGenerationProposal['manifest']) {
  const executorBinding = createGeneratedCapabilityBinding({
    capability: {
      key: manifest.key,
      name: `${manifest.key}.execute`,
      businessDefinitionKeys: manifest.definitionRefs.map((item) => item.definitionKey),
      status: 'draft',
      enabled: false,
      explicit: true,
      readOnly: manifest.readOnly,
      sideEffect: manifest.sideEffect,
      riskLevel: manifest.riskLevel,
      storeScope: 'required',
      requiredPermissions: [...manifest.requiredPermissions],
      requiresConfirmation: manifest.requiresConfirmation,
      idempotency: manifest.idempotency,
      inputContract: {},
      outputContract: { return: 'unknown' },
      sourceFingerprint: manifest.sourceFingerprint,
      evidence: [
        {
          sourceType: 'service',
          path: `packages/server-v2/src/brain/capability/executors/${manifest.key}.executor.ts`,
          line: 1,
          symbol: `GeneratedFixtureExecutor.${manifest.key}`,
          data: {
            executorTarget: {
              kind: 'service',
              className: 'GeneratedFixtureExecutor',
              methodName: manifest.key,
              sourcePath: `packages/server-v2/src/brain/capability/executors/${manifest.key}.executor.ts`,
              exportedClass: true,
              methodAccess: 'public',
              parameterCount: 1,
              parameterTypes: ['Record<string, unknown>'],
              returnType: 'Promise<unknown>',
            },
          },
        },
      ],
      issues: [],
    },
    inputSchema: manifest.inputSchema,
    outputSchema: manifest.outputSchema,
  });
  const bindingSource = renderGeneratedCapabilityBindingSource(executorBinding);
  const contractTestSource = renderGeneratedCapabilityContractTestSource(executorBinding);
  return {
    executorBinding,
    bindingSource,
    contractTestSource,
    proposalFingerprint: createGeneratedCapabilityProposalFingerprint({
      sourceFingerprint: manifest.sourceFingerprint,
      manifest,
      executorBinding,
      bindingSource,
      contractTestSource,
    }),
  };
}
