import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalizeBusinessDefinition,
  createBusinessDefinitionProjectionFingerprint,
  createBusinessDefinitionProjectionV2Payload,
} from '../../semantic-data/business-definition-projection-compiler.service.js';
import { createBusinessDefinitionFingerprint } from '../../semantic-data/business-definition-registry.service.js';
import type { BrainCapabilityScanReport } from './brain-capability-scan.types.js';
import { BrainCapabilityScannerService } from './brain-capability-scanner.service.js';
import {
  assertGeneratedCapabilityContract,
  BrainCapabilityCodegenService,
  type BrainBusinessDefinitionSnapshot,
  type BrainCapabilityDefinitionSnapshotSource,
  type BrainCapabilityNarrativeGenerator,
} from './brain-capability-codegen.service.js';

describe('BrainCapabilityCodegenService', () => {
  const narrativeGenerator: jest.Mocked<BrainCapabilityNarrativeGenerator> = {
    generate: jest.fn().mockResolvedValue({
      description: '模型候选：查询客户资料。',
      positiveExamples: ['帮我找客户资料'],
      negativeExamples: ['修改客户手机号'],
      synonyms: ['客户信息检索'],
      successSchema: { type: 'array', items: { type: 'object' } },
      riskExplanation: '模型候选：仅限只读。',
    }),
  };
  let snapshotSource: jest.Mocked<BrainCapabilityDefinitionSnapshotSource>;
  const generationGate = {
    evaluate: jest.fn().mockResolvedValue({
      passed: true,
      gates: ['compile', 'contract', 'security', 'test'].map((gate) => ({
        gate,
        passed: true,
        reasons: [],
        remediation: [],
      })),
    }),
  };
  const createService = (semanticCompiler?: unknown) =>
    new BrainCapabilityCodegenService(
      narrativeGenerator,
      snapshotSource,
      semanticCompiler as never,
      generationGate as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    snapshotSource = { loadPublishedSnapshot: jest.fn().mockResolvedValue(snapshot()) };
  });

  it('builds the manifest only from the published capability semantic view', async () => {
    const service = createService();
    const result = await service.generate({ scan: scanReport() });

    expect(result.blocked).toEqual([]);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      status: 'ready',
      capabilityKey: 'customer_facts',
      manifest: {
        key: 'customer_facts',
        sourceFingerprint: scanReport().capabilities[0]!.sourceFingerprint,
        allowedRoles: ['receptionist'],
        timeoutMs: 10_000,
        grounding: 'domain_service',
        name: '客户事实',
        description: '查询授权门店范围内的客户基础事实。',
        domains: ['customer'],
        intents: ['query'],
        riskLevel: 'low',
        examples: ['查看当前门店客户事实'],
        negativeExamples: ['修改客户资料'],
        synonyms: ['客户资料查询'],
        successSchema: { type: 'array', items: { type: 'object' } },
        definitionRefs: [
          {
            definitionId: 10,
            versionId: 21,
            definitionKey: 'customer.entity',
            version: 3,
            definitionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
            sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        ],
      },
      languageCandidates: {
        description: '模型候选：查询客户资料。',
      },
      businessDefinitions: [
        {
          definitionId: 10,
          versionId: 21,
          definitionKey: 'customer.entity',
          version: 3,
        },
      ],
    });
    expect(result.proposals[0]?.manifest.description).not.toBe(result.proposals[0]?.languageCandidates.description);
    expect(result.proposals[0]).toMatchObject({
      proposalFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      executorBinding: {
        capabilityKey: 'customer_facts',
        sourceFingerprint: scanReport().capabilities[0]!.sourceFingerprint,
        bindingFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        target: {
          kind: 'controller',
          className: 'CustomersController',
          methodName: 'list',
          sourcePath: 'packages/server-v2/src/customers/customers.controller.ts',
        },
        storeScope: 'required',
        requiredPermissions: ['core:customer:view'],
      },
      bindingSource: expect.stringContaining('Pick<CustomersController'),
      gateReport: { passed: true },
    });
    expect(result.proposals[0]?.bindingSource).toContain('import type { CustomersController }');
    expect(result.proposals[0]?.bindingSource).toContain("Pick<CustomersController, 'list'>");
    expect(result.proposals[0]?.bindingSource).toContain('this.target.list(args)');
    expect(result.proposals[0]?.bindingSource).not.toContain('GeneratedCapabilityInvoker');
    expect(result.proposals[0]?.bindingSource).not.toMatch(/\bstoreId\??\s*:/);
    expect(result.proposals[0]?.manifest.inputSchema).toEqual({
      type: 'object',
      properties: { keyword: { type: 'string' } },
      required: [],
      additionalProperties: false,
    });
    expect(snapshotSource.loadPublishedSnapshot).toHaveBeenCalledTimes(1);
  });

  it('preserves explicit executable semantics while keeping governed domains and schemas', async () => {
    const explicit = {
      ...candidate(),
      semanticHints: {
        name: '当前客户事实',
        description: '只查询当前门店授权范围内的客户事实。',
        intents: ['query'],
        examples: ['查看当前客户资料'],
        negativeExamples: ['修改客户手机号'],
        synonyms: ['客户事实'],
      },
    };
    const result = await createService().generate({ scan: scanReport([explicit]) });

    expect(result.proposals[0]?.manifest).toMatchObject({
      name: '当前客户事实',
      description: '只查询当前门店授权范围内的客户事实。',
      examples: ['查看当前客户资料'],
      negativeExamples: ['修改客户手机号'],
      domains: ['customer'],
      successSchema: { type: 'array', items: { type: 'object' } },
    });
  });

  it('emits an independent manifest, scan evidence and proposal contract that detects tampering', async () => {
    const result = await createService().generate({
      scan: scanReport(),
    });
    const generated = result.proposals[0]!;

    expect(() => assertGeneratedCapabilityContract(generated.contractArtifact)).not.toThrow();
    expect(generated.contractTestSource).toContain('assertGeneratedBindingContract');
    expect(generated.contractTestSource).toContain('bindingFingerprint');

    expect(() =>
      assertGeneratedCapabilityContract({
        ...generated.contractArtifact,
        proposal: {
          ...generated.contractArtifact.proposal,
          executorBinding: {
            ...generated.executorBinding,
            target: { ...generated.executorBinding.target, methodName: 'tampered' },
          },
        },
      }),
    ).toThrow('generated_capability_contract_executor_binding_mismatch');

    expect(() =>
      assertGeneratedCapabilityContract({
        ...generated.contractArtifact,
        manifest: { ...generated.manifest, sourceFingerprint: '0'.repeat(64) },
      }),
    ).toThrow('generated_capability_contract_source_fingerprint_mismatch');
  });

  it('derives semantic_query grounding only from a governed canonical query binding', async () => {
    const value = snapshot();
    const definition = value.definitions[0]!;
    definition.canonicalQueryRef = 'semantic_query.customer_facts';
    definition.payload = {
      ...(definition.payload as Record<string, unknown>),
      runtimeQuery: { capabilityKeys: ['customer_facts'] },
    };
    definition.fingerprint = createBusinessDefinitionFingerprint({
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
    definition.projections = definition.projections.map((projection) => {
      const payload = {
        ...projection.payload,
        canonicalQueryRef: definition.canonicalQueryRef,
        definitionRef: {
          definitionKey: definition.definitionKey,
          definitionVersion: definition.version,
          definitionFingerprint: definition.fingerprint,
          sourceFingerprint: definition.sourceFingerprint,
        },
        definition: definition.payload,
      };
      return {
        ...projection,
        definitionFingerprint: definition.fingerprint,
        payload,
        projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
          targetType: projection.targetType,
          targetKey: projection.targetKey,
          definitionVersionId: projection.definitionVersionId,
          definitionRef: payload.definitionRef,
          payload,
          readOnly: true,
        }),
      };
    });
    value.snapshotFingerprint = snapshotFingerprint(value.definitions);
    snapshotSource.loadPublishedSnapshot.mockResolvedValue(value);

    const result = await createService().generate({
      scan: scanReport(),
    });

    expect(result.proposals[0]?.manifest.grounding).toBe('semantic_query');
  });

  it('blocks a tampered registry snapshot before model generation', async () => {
    snapshotSource.loadPublishedSnapshot.mockResolvedValue({ ...snapshot(), snapshotFingerprint: '0'.repeat(64) });
    const service = createService();

    const result = await service.generate({ scan: scanReport() });

    expect(result.proposals).toEqual([]);
    expect(result.blocked[0]?.reasons).toContain('invalid_business_definition_snapshot');
    expect(narrativeGenerator.generate).not.toHaveBeenCalled();
  });

  it('blocks a self-consistent projection whose payload lineage is forged', async () => {
    const value = snapshot();
    const definition = value.definitions[0]!;
    const projection = definition.projections[0]!;
    projection.payload = {
      ...projection.payload,
      preview: true,
      projectionType: 'metric_query_view',
      definitionRef: { definitionKey: 'forged', definitionVersion: 999 },
      definition: { capabilities: [{ ...canonicalCapabilityView(), description: 'Forged semantics' }] },
    };
    projection.projectionFingerprint = createBusinessDefinitionProjectionFingerprint({
      targetType: projection.targetType,
      targetKey: projection.targetKey,
      definitionVersionId: projection.definitionVersionId,
      definitionRef: {
        definitionKey: definition.definitionKey,
        definitionVersion: definition.version,
        definitionFingerprint: definition.fingerprint,
        sourceFingerprint: definition.sourceFingerprint,
      },
      payload: projection.payload,
      readOnly: true,
    });
    value.snapshotFingerprint = snapshotFingerprint(value.definitions);
    snapshotSource.loadPublishedSnapshot.mockResolvedValue(value);
    const service = createService();

    const result = await service.generate({ scan: scanReport() });

    expect(result.proposals).toEqual([]);
    expect(result.blocked[0]?.reasons).toContain('invalid_business_definition_snapshot');
  });

  it('blocks an ambiguous definition key instead of silently choosing a registry row', async () => {
    const value = snapshot();
    const source = value.definitions[0]!;
    const duplicate = {
      ...structuredClone(source),
      definitionId: 11,
      versionId: 22,
      kind: 'field',
      projections: [],
    };
    duplicate.fingerprint = createBusinessDefinitionFingerprint({
      definitionKey: duplicate.definitionKey,
      kind: duplicate.kind,
      domain: duplicate.domain,
      name: duplicate.name,
      ownerType: duplicate.ownerType,
      ownerId: duplicate.ownerId,
      schemaVersion: duplicate.schemaVersion,
      payload: duplicate.payload,
      sourceFingerprint: duplicate.sourceFingerprint,
      canonicalQueryRef: duplicate.canonicalQueryRef,
      fixtureSetKey: duplicate.fixtureSetKey,
      timezone: duplicate.timezone,
      storeScope: duplicate.storeScope,
    });
    value.definitions.push(duplicate);
    value.snapshotFingerprint = snapshotFingerprint(value.definitions);
    snapshotSource.loadPublishedSnapshot.mockResolvedValue(value);
    const service = createService();

    const result = await service.generate({ scan: scanReport() });

    expect(result.proposals).toEqual([]);
    expect(result.blocked[0]?.reasons).toContain('ambiguous_business_definition_key:customer.entity');
  });

  it('blocks when the referenced definition has no matching capability semantic view', async () => {
    const value = snapshot();
    value.definitions[0]!.projections = [];
    value.snapshotFingerprint = snapshotFingerprint(value.definitions);
    snapshotSource.loadPublishedSnapshot.mockResolvedValue(value);
    const service = createService();

    const result = await service.generate({ scan: scanReport() });

    expect(result.proposals).toEqual([]);
    expect(result.blocked[0]?.reasons).toContain('missing_capability_semantic_view:customer_facts');
    expect(narrativeGenerator.generate).not.toHaveBeenCalled();
  });

  it('blocks model language candidates whose success schema conflicts with the canonical view', async () => {
    narrativeGenerator.generate.mockResolvedValueOnce({
      description: '候选文案',
      positiveExamples: ['查客户'],
      negativeExamples: ['改客户'],
      synonyms: [],
      successSchema: { type: 'array', items: { type: 'string' } },
      riskExplanation: '候选风险说明',
    });
    const service = createService();

    const result = await service.generate({ scan: scanReport() });

    expect(result.proposals).toEqual([]);
    expect(result.blocked[0]?.reasons).toContain('model_enrichment_conflicts_with_canonical_semantics');
  });

  it('blocks unmarked, write and scanner-blocked candidates without asking the model', async () => {
    const base = scanReport().capabilities[0]!;
    const service = createService();
    const result = await service.generate({
      scan: scanReport([
        { ...base, key: 'unmarked', explicit: false },
        { ...base, key: 'write', readOnly: false, sideEffect: true, riskLevel: 'high' },
        { ...base, key: 'blocked', status: 'blocked', issues: [{ code: 'missing_permission', message: 'missing' }] },
      ]),
    });

    expect(result.proposals).toEqual([]);
    expect(result.blocked.map((item) => item.capabilityKey)).toEqual(['blocked', 'unmarked', 'write']);
    expect(result.blocked.find((item) => item.capabilityKey === 'unmarked')?.branchProposal).toMatchObject({
      type: 'independent_branch_proposal',
      suggestedBranchName: 'codex/ami-brain-capability-unmarked',
      blockingReasons: expect.arrayContaining(['unmarked_api_codegen_forbidden']),
    });
    expect(result.blocked.find((item) => item.capabilityKey === 'write')?.branchProposal).toMatchObject({
      type: 'independent_branch_proposal',
      suggestedBranchName: 'codex/ami-brain-capability-write',
      blockingReasons: expect.arrayContaining(['write_capability_codegen_forbidden']),
    });
    expect(narrativeGenerator.generate).not.toHaveBeenCalled();
  });

  it('runs a real decorated source through scanner, registry snapshot and proposal generation', async () => {
    const root = await createSourceFixture();
    const scan = await new BrainCapabilityScannerService().scan({ workspaceRoot: root, explicitOnly: true });
    const service = createService();

    const result = await service.generate({ scan });

    expect(scan.summary).toMatchObject({ total: 1, explicit: 1, blocked: 0 });
    expect(result).toMatchObject({
      blocked: [],
      proposals: [expect.objectContaining({ capabilityKey: 'customer_facts', status: 'ready' })],
    });
  });

  it('generates from a V2 semantic compiler and an internal service executor without a fake controller', async () => {
    const definition = v2DefinitionEntry();
    const dimension = v2DimensionEntry();
    snapshotSource.loadPublishedSnapshot.mockResolvedValue({
      snapshotFingerprint: snapshotFingerprint([definition, dimension]),
      definitions: [definition, dimension],
    });
    const semanticCompiler = {
      compile: jest.fn().mockResolvedValue({
        canonicalSemantics: {
          key: 'product_sales_ranking',
          name: '商品销售排行',
          description: '按统一商品销量口径生成排行。',
          domains: ['product'],
          intents: ['ranking'],
          riskLevel: 'low',
          requiredPermissions: ['core:order:products'],
          storeScope: 'required',
          examples: ['本月商品销售排行'],
          negativeExamples: ['修改商品库存'],
          synonyms: ['热销商品榜'],
          successSchema: { type: 'object' },
        },
        narrative: {
          description: '按统一商品销量口径生成排行。',
          positiveExamples: ['本月商品销售排行'],
          negativeExamples: ['修改商品库存'],
          synonyms: ['热销商品榜'],
          successSchema: { type: 'object' },
          riskExplanation: '只读取当前门店授权数据。',
        },
      }),
    };
    const capability = {
      ...candidate(),
      key: 'product_sales_ranking',
      name: 'BrainSemanticQueryCapabilityExecutor.productSalesRanking',
      businessDefinitionKeys: ['metric.product_sales_quantity'],
      requiredPermissions: ['core:order:products'],
      inputContract: { question: 'required:string' },
      outputContract: { return: 'Promise<BrainDomainAnswer>' },
      evidence: [
        {
          sourceType: 'service' as const,
          path: 'packages/server-v2/src/brain/capability/executors/brain-semantic-query-capability.executor.ts',
          line: 1,
          symbol: 'BrainSemanticQueryCapabilityExecutor.productSalesRanking',
          data: {
            serviceClass: 'BrainSemanticQueryCapabilityExecutor',
            executorTarget: {
              kind: 'service',
              className: 'BrainSemanticQueryCapabilityExecutor',
              methodName: 'productSalesRanking',
              sourcePath:
                'packages/server-v2/src/brain/capability/executors/brain-semantic-query-capability.executor.ts',
              exportedClass: true,
              methodAccess: 'public',
              parameterCount: 2,
              parameterTypes: ['BrainCapabilityToolArgs', 'BrainCapabilityExecutionInput'],
              returnType: 'Promise<BrainDomainAnswer>',
            },
          },
        },
      ],
    };

    const result = await createService(semanticCompiler).generate({ scan: scanReport([capability]) });

    expect(result.blocked).toEqual([]);
    expect(result.proposals[0]).toMatchObject({
      capabilityKey: 'product_sales_ranking',
      executorBinding: {
        target: {
          kind: 'service',
          className: 'BrainSemanticQueryCapabilityExecutor',
          methodName: 'productSalesRanking',
          sourcePath:
            'packages/server-v2/src/brain/capability/executors/brain-semantic-query-capability.executor.ts',
        },
      },
      manifest: {
        name: '商品销售排行',
        intents: ['ranking'],
        definitionRefs: expect.arrayContaining([
          expect.objectContaining({ definitionKey: 'metric.product_sales_quantity' }),
          expect.objectContaining({ definitionKey: 'dimension.productName' }),
        ]),
      },
    });
    expect(semanticCompiler.compile).toHaveBeenCalledTimes(1);
    expect(narrativeGenerator.generate).not.toHaveBeenCalled();
  });
});

async function createSourceFixture() {
  const root = await mkdtemp(join(tmpdir(), 'ami-brain-codegen-integration-'));
  const write = async (path: string, content: string) => {
    const target = join(root, path);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content, 'utf8');
  };
  await write(
    'packages/server-v2/src/customers/customer-query.dto.ts',
    'export class CustomerQueryDto { storeId!: number; keyword?: string; }',
  );
  await write(
    'packages/server-v2/src/customers/customers.service.ts',
    'export class CustomersService { list(input: CustomerQueryDto) { return this.prisma.customer.findMany({ where: { storeId: input.storeId } }); } }',
  );
  await write(
    'packages/server-v2/src/customers/customers.controller.ts',
    `@Controller('customers') export class CustomersController {
      constructor(private readonly customers: CustomersService) {}
      @Get() @Permissions('core:customer:view')
      @BrainCapability({
        key: 'customer_facts',
        businessDefinitionKeys: ['customer.entity'],
        readOnly: true,
        storeScope: 'required',
        permissions: ['core:customer:view'],
        requiresConfirmation: false,
        idempotency: 'not_applicable'
      })
      list(@Query() input: CustomerQueryDto): Promise<Customer[]> { return this.customers.list(input); }
    }`,
  );
  await write('src/config/permissions.ts', "export const PERMISSION_CATALOG = [{ code: 'core:customer:view' }];");
  await write('packages/server-v2/prisma/schema.prisma', 'model Customer { id Int @id storeId Int name String }');
  return root;
}

function snapshot(): BrainBusinessDefinitionSnapshot {
  const definition = definitionEntry();
  return { snapshotFingerprint: snapshotFingerprint([definition]), definitions: [definition] };
}

function definitionEntry(): BrainBusinessDefinitionSnapshot['definitions'][number] {
  const immutable = {
    definitionKey: 'customer.entity',
    kind: 'entity',
    domain: 'customer',
    name: '客户',
    ownerType: 'system',
    ownerId: 'customer-center',
    schemaVersion: '1.0',
    payload: {
      summary: '门店授权范围内的客户基础事实。',
      capabilities: [canonicalCapabilityView()],
    },
    sourceFingerprint: 'c'.repeat(64),
    canonicalQueryRef: null,
    fixtureSetKey: null,
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  };
  const fingerprint = createBusinessDefinitionFingerprint(immutable);
  const projectionPayload = {
    preview: false,
    projectionType: 'capability_semantic_view',
    definitionRef: {
      definitionKey: immutable.definitionKey,
      definitionVersion: 3,
      definitionFingerprint: fingerprint,
      sourceFingerprint: immutable.sourceFingerprint,
    },
    kind: immutable.kind,
    domain: immutable.domain,
    name: immutable.name,
    schemaVersion: immutable.schemaVersion,
    timezone: immutable.timezone,
    storeScope: immutable.storeScope,
    canonicalQueryRef: null,
    fixtureSetKey: null,
    definition: immutable.payload,
  };
  const projection = {
    definitionVersionId: 21,
    targetType: 'capability_semantic_view' as const,
    targetKey: 'customer.entity@3',
    definitionKey: immutable.definitionKey,
    definitionVersion: 3,
    definitionFingerprint: fingerprint,
    sourceFingerprint: immutable.sourceFingerprint,
    payload: projectionPayload,
    readOnly: true,
    projectionFingerprint: '',
  };
  projection.projectionFingerprint = createBusinessDefinitionProjectionFingerprint({
    targetType: projection.targetType,
    targetKey: projection.targetKey,
    definitionVersionId: projection.definitionVersionId,
    definitionRef: projectionPayload.definitionRef,
    payload: projectionPayload,
    readOnly: true,
  });
  return {
    definitionId: 10,
    versionId: 21,
    ...immutable,
    version: 3,
    fingerprint,
    validationStatus: 'passed',
    validationReport: null,
    evidence: [],
    projections: [projection],
  };
}

function v2DefinitionEntry(): BrainBusinessDefinitionSnapshot['definitions'][number] {
  return v2ProjectedDefinition({
    definitionId: 30,
    versionId: 31,
    definitionKey: 'metric.product_sales_quantity',
    kind: 'metric',
    domain: 'product',
    name: '商品销量',
    payload: {
      metricKey: 'product_sales_quantity',
      aliases: ['商品销售数量'],
      dimensions: ['productName'],
      bindings: {
        capability: ['product_sales_ranking'],
        executor: ['BusinessDefinitionRuntimeQueryExecutor.execute'],
      },
    },
    canonicalQueryRef: 'semantic.product_sales_quantity',
    fixtureSetKey: 'product-sales-v1',
    sourceFingerprint: 'd'.repeat(64),
  });
}

function v2DimensionEntry(): BrainBusinessDefinitionSnapshot['definitions'][number] {
  return v2ProjectedDefinition({
    definitionId: 32,
    versionId: 33,
    definitionKey: 'dimension.productName',
    kind: 'dimension',
    domain: 'product',
    name: '商品名称',
    payload: { dimensionKey: 'productName', aliases: ['商品名称', '产品名称'] },
    canonicalQueryRef: null,
    fixtureSetKey: null,
    sourceFingerprint: 'e'.repeat(64),
  });
}

function v2ProjectedDefinition(input: {
  definitionId: number;
  versionId: number;
  definitionKey: string;
  kind: string;
  domain: string;
  name: string;
  payload: Record<string, unknown>;
  canonicalQueryRef: string | null;
  fixtureSetKey: string | null;
  sourceFingerprint: string;
}): BrainBusinessDefinitionSnapshot['definitions'][number] {
  const immutable = {
    definitionKey: input.definitionKey,
    kind: input.kind,
    domain: input.domain,
    name: input.name,
    ownerType: 'system',
    ownerId: 'semantic-data',
    schemaVersion: '1.0',
    payload: input.payload,
    sourceFingerprint: input.sourceFingerprint,
    canonicalQueryRef: input.canonicalQueryRef,
    fixtureSetKey: input.fixtureSetKey,
    timezone: 'Asia/Shanghai',
    storeScope: { mode: 'current_store' },
  };
  const fingerprint = createBusinessDefinitionFingerprint(immutable);
  const version = {
    id: input.versionId,
    definitionId: input.definitionId,
    version: 1,
    ...immutable,
    lifecycleStatus: 'published',
    fingerprint,
    validationStatus: 'passed',
    evidence: [],
    definition: {
      id: input.definitionId,
      definitionKey: immutable.definitionKey,
      kind: immutable.kind,
      domain: immutable.domain,
      name: immutable.name,
      ownerType: immutable.ownerType,
      ownerId: immutable.ownerId,
    },
  };
  const projectionPayload = createBusinessDefinitionProjectionV2Payload(version, 'capability_semantic_view', false);
  const projection = {
    definitionVersionId: input.versionId,
    targetType: 'capability_semantic_view' as const,
    targetKey: `${input.definitionKey}@1`,
    definitionKey: immutable.definitionKey,
    definitionVersion: 1,
    definitionFingerprint: fingerprint,
    sourceFingerprint: immutable.sourceFingerprint,
    payload: projectionPayload,
    readOnly: true,
    projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
      targetType: 'capability_semantic_view',
      targetKey: `${input.definitionKey}@1`,
      definitionVersionId: input.versionId,
      definitionRef: projectionPayload.definitionRef,
      payload: projectionPayload,
      readOnly: true,
    }),
  };
  return {
    definitionId: input.definitionId,
    versionId: input.versionId,
    ...immutable,
    version: 1,
    fingerprint,
    validationStatus: 'passed',
    validationReport: null,
    evidence: [],
    projections: [projection],
  };
}

function canonicalCapabilityView() {
  return {
    key: 'customer_facts',
    name: '客户事实',
    description: '查询授权门店范围内的客户基础事实。',
    domains: ['customer'],
    intents: ['query'],
    riskLevel: 'low',
    requiredPermissions: ['core:customer:view'],
    allowedRoles: ['receptionist'],
    storeScope: 'required',
    examples: ['查看当前门店客户事实'],
    negativeExamples: ['修改客户资料'],
    synonyms: ['客户资料查询'],
    successSchema: { type: 'array', items: { type: 'object' } },
  };
}

function snapshotFingerprint(definitions: BrainBusinessDefinitionSnapshot['definitions']) {
  return createHash('sha256').update(canonicalizeBusinessDefinition(definitions)).digest('hex');
}

function scanReport(capabilities = [candidate()]): BrainCapabilityScanReport {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-12T00:00:00.000Z',
    capabilities,
    summary: {
      total: capabilities.length,
      draft: capabilities.filter((item) => item.status === 'draft').length,
      blocked: capabilities.filter((item) => item.status === 'blocked').length,
      explicit: capabilities.filter((item) => item.explicit).length,
    },
  };
}

function candidate(): BrainCapabilityScanReport['capabilities'][number] {
  return {
    key: 'customer_facts',
    name: 'CustomersController.list',
    businessDefinitionKeys: ['customer.entity'],
    status: 'draft',
    enabled: false,
    explicit: true,
    readOnly: true,
    sideEffect: false,
    riskLevel: 'low',
    storeScope: 'required',
    requiredPermissions: ['core:customer:view'],
    allowedRoles: ['receptionist'],
    requiresConfirmation: false,
    idempotency: 'not_applicable',
    inputContract: { keyword: 'optional:string', storeId: 'required:number' },
    outputContract: { return: 'Promise<Customer[]>' },
    sourceFingerprint: 'a'.repeat(64),
    evidence: [
      {
        sourceType: 'controller',
        path: 'packages/server-v2/src/customers/customers.controller.ts',
        line: 10,
        symbol: 'CustomersController.list',
        data: {
          controllerPath: 'customers',
          methodPath: '',
          httpMethod: 'GET',
          serviceCalls: ['this.customers.list'],
          executorTarget: {
            kind: 'controller',
            className: 'CustomersController',
            methodName: 'list',
            sourcePath: 'packages/server-v2/src/customers/customers.controller.ts',
            exportedClass: true,
            methodAccess: 'public',
            parameterCount: 1,
            parameterTypes: ['CustomerQueryDto'],
            returnType: 'Promise<Customer[]>',
          },
        },
      },
    ],
    issues: [],
  };
}
