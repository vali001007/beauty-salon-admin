import { BrainRuntimeConfigService } from './config/brain-runtime-config.service.js';
import { BrainCapabilityArgsValidatorService } from './capability/brain-capability-args-validator.service.js';
import { BrainCapabilityCatalogService } from './capability/brain-capability-catalog.service.js';
import { BrainCapabilityExecutorRegistryService } from './capability/brain-capability-executor.registry.js';
import { BrainCapabilitySemanticVerifierService } from './capability/brain-capability-semantic-verifier.service.js';
import {
  generatedFourCapabilityProposalsFixture,
  publishedFourCapabilitySnapshotFixture,
} from './capability/brain-generated-capability.test-fixtures.js';
import { BrainGeneratedCapabilityDraftService } from './capability/brain-generated-capability-draft.service.js';
import { BrainDomainServiceCapabilityExecutor } from './capability/executors/brain-domain-service-capability.executor.js';
import { BrainSemanticQueryCapabilityExecutor } from './capability/executors/brain-semantic-query-capability.executor.js';
import { BrainCustomerFactResolverService } from './domain/brain-customer-fact-resolver.service.js';
import { BrainExecutionBudgetService } from './execution/brain-execution-budget.service.js';
import { BrainReleaseService } from './governance/brain-release.service.js';
import { createReleaseFingerprint } from './governance/brain-capability-regeneration-fingerprint.js';
import { BrainExecutionPlanValidatorService } from './planning/brain-execution-plan-validator.service.js';
import { BrainSkillRegistryService } from './skills/brain-skill-registry.service.js';

const integrationContext = {
  userId: 9,
  storeId: 2,
  visibleStoreIds: [2],
  roles: ['store_manager'],
  permissions: [
    'core:order:products',
    'core:project-order-profit:view',
    'core:beautician-performance:view',
    'core:customer:view',
  ],
  deniedPermissions: [],
  requestId: 'model-single-tool-integration',
  timezone: 'Asia/Shanghai',
};

describe('Ami Brain model single-tool capability integration', () => {
  const context = integrationContext;
  const timeRange = {
    mentionedTime: true,
    filters: [],
    range: {
      label: '本月',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.999Z'),
      granularity: 'month',
    },
    requiresComparison: false,
    unsupportedExpressions: [],
  };

  it('publishes four generated proposals through Catalog and executes their formal runtime contracts', async () => {
    const { cards, publishedSnapshot, catalog, release, rows } = await publishFourCapabilityCards();
    const byKey = new Map(cards.map((card) => [card.key, card]));
    const productCard = byKey.get('product_sales_ranking')!;
    const projectCard = byKey.get('project_service_ranking')!;
    const staffCard = byKey.get('staff_performance_ranking')!;
    const customerCard = byKey.get('customer_facts')!;

    expect(await catalog.listEnabledCapabilities()).toHaveLength(4);
    expect(release.status).toBe('active');
    expect(rows.filter((row) => row.skillKey === 'product_sales_ranking')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version: 1, enabled: false }),
        expect.objectContaining({ version: 2, enabled: true }),
      ]),
    );
    expect(productCard.version).toBe(2);
    for (const card of cards) {
      expect(card.definitionRefs).toEqual([expect.objectContaining({ definitionKey: expect.any(String), version: expect.any(Number) })]);
      expect(card.inputSchema).toMatchObject({ additionalProperties: false });
      expect(card.requiredPermissions).toHaveLength(1);
      expect(card.grounding).toBe(card.key === 'customer_facts' ? 'domain_service' : 'semantic_query');
    }

    const productFindMany = jest.fn().mockResolvedValue([
      { quantity: 12, product: { name: '补水面膜' } },
      { quantity: 8, product: { name: '舒缓面膜' } },
    ]);
    const projectFindMany = jest.fn().mockResolvedValue([
      { times: 6, project: { name: '补水护理' } },
      { times: 3, project: { name: '舒缓护理' } },
    ]);
    const skillRuntime = {
      buildManagerStaffAnalysis: jest.fn().mockResolvedValue({
        staff: [
          { beauticianId: 1, name: '小美', revenueAmount: 1800 },
          { beauticianId: 2, name: '小丽', revenueAmount: 1200 },
        ],
      }),
    };
    const definitionProvider = runtimeDefinitionProvider(publishedSnapshot);
    const semanticExecutor = new BrainSemanticQueryCapabilityExecutor(
      definitionProvider as never,
      { parse: jest.fn(() => timeRange) } as never,
      {
        orderItem: { findMany: productFindMany },
        cardUsageRecord: { findMany: projectFindMany },
      } as never,
      skillRuntime as never,
    );
    const customerPrisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          {
            name: '李女士', phone: '13800138000', memberLevel: '金卡会员', totalSpent: 1200, visitCount: 3,
            lastVisitDate: new Date('2026-07-10T00:00:00.000Z'), healthProfile: null, customerCards: [], balanceAccounts: [],
            consumptionRecords: [{ consumeTime: new Date('2026-07-10T00:00:00.000Z'), consumeContent: '补水护理', amount: 398 }],
            reservations: [], hasAllergy: false, skinType: null, skinCondition: null, tags: ['补水'], remark: null,
          },
        ]),
      },
    };
    const domainExecutor = new BrainDomainServiceCapabilityExecutor(
      {} as never,
      new BrainCustomerFactResolverService(customerPrisma as never),
      { parse: jest.fn(() => timeRange) } as never,
    );
    const registry = new BrainCapabilityExecutorRegistryService([semanticExecutor, domainExecutor]);
    const execute = jest.spyOn(registry, 'execute');

    const productAnswer = await executeCard(registry, productCard, '本月商品销售排行');
    const projectAnswer = await executeCard(registry, projectCard, '本月项目服务排行');
    const staffAnswer = await executeCard(registry, staffCard, '本月员工业绩排行');
    const customerAnswer = await executeCard(registry, customerCard, '李女士的消费情况，手机尾号8000');

    expect(productFindMany).toHaveBeenCalledTimes(1);
    expect(projectFindMany).toHaveBeenCalledTimes(1);
    expect(productFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          { order: { storeId: 2 } },
          { order: { createdAt: { gte: expect.any(Date), lt: expect.any(Date) } } },
        ]),
      },
    }));
    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          { storeId: 2 },
          { verifiedAt: { gte: expect.any(Date), lt: expect.any(Date) } },
        ]),
      },
    }));
    expect(skillRuntime.buildManagerStaffAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      storeId: 2,
      startDate: expect.any(Date),
      endDate: expect.any(Date),
    }));
    const runtimeDefinitions = await definitionProvider.loadActiveDefinitions();
    expect(runtimeDefinitions.metrics.map((metric: any) => [metric.metricKey, metric.runtimeQuery.timePolicy.field])).toEqual([
      ['product_sales_quantity', 'ProductOrder.createdAt'],
      ['project_service_count', 'CardUsageRecord.verifiedAt'],
      ['staff_performance_score', 'manager_staff_analysis.range'],
    ]);
    expect(customerPrisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 2 }) }));
    expect(productAnswer.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ranking', rows: expect.arrayContaining([expect.objectContaining({ product_name: '补水面膜', product_sales_quantity: 12 })]) })]));
    expect(projectAnswer.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ranking', rows: expect.arrayContaining([expect.objectContaining({ project_name: '补水护理', project_service_count: 6 })]) })]));
    expect(staffAnswer.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'ranking', rows: expect.arrayContaining([expect.objectContaining({ staff_name: '小美', staff_performance_score: 1800 })]) })]));
    expect(customerAnswer).toMatchObject({ status: 'completed', grounding: 'db_skill', answer: expect.stringContaining('客户：李女士') });
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ card: customerCard }));
  });
});

async function executeCard(
  registry: BrainCapabilityExecutorRegistryService,
  card: any,
  question: string,
  argsOverride: Record<string, unknown> = {},
) {
  const plan = new BrainExecutionPlanValidatorService(
    new BrainCapabilityArgsValidatorService(),
    new BrainExecutionBudgetService(),
  ).validate({
    plan: {
      schemaVersion: '1.0', planId: `single:${card.key}:v${card.version}`, objective: card.name, replanCount: 0, budgetMs: 10_000,
      nodes: [{ id: 'capability_1', capabilityKey: card.key, capabilityVersion: card.version, dependsOn: [], previewOnly: false,
        args: { objective: card.name, entities: [], metrics: [], dimensions: [], filters: [], orderBy: [], ...argsOverride } }],
    },
    cards: [card],
    context: integrationContext,
  });
  return registry.execute({ card, context: integrationContext, runId: 77, question, args: plan.nodes[0]!.args });
}

async function publishFourCapabilityCards() {
  const rows: Array<Record<string, any>> = [
    {
      id: 1,
      skillKey: 'product_sales_ranking',
      version: 1,
      enabled: true,
      sourceFingerprint: 'f'.repeat(64),
      name: '旧商品销售排行',
      description: '旧版本',
      type: 'query',
      domains: ['sales'],
      intents: ['ranking'],
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'object' },
      permissions: ['core:order:products'],
      allowedRoles: [],
      readOnly: true,
      sideEffect: false,
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotency: 'not_applicable',
      timeoutMs: 10_000,
      grounding: 'semantic_query',
      examples: [],
      definitionRefs: [],
      synonyms: [],
      negativeExamples: [],
      successSchema: {},
    },
  ];
  const resourceVersions: Array<Record<string, any>> = [
    {
      id: 1,
      resourceType: 'skill',
      resourceKey: 'product_sales_ranking',
      version: 1,
      status: 'active',
      sourceResourceId: 1,
      snapshot: { generatedCapability: true },
    },
  ];
  const release = { id: 51, status: 'draft', scope: 'global', items: [] as Array<Record<string, any>> };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    brainSkillRegistry: {
      create: jest.fn(async ({ data }) => { const row = { id: rows.length + 1, ...data, createdAt: new Date(), updatedAt: new Date() }; rows.push(row); return row; }),
      groupBy: jest.fn(async ({ where }) => {
        const latest = new Map<string, number>();
        for (const row of rows) {
          if (where?.enabled !== undefined && row.enabled !== where.enabled) continue;
          if (where?.sourceFingerprint?.not === null && row.sourceFingerprint == null) continue;
          latest.set(row.skillKey, Math.max(latest.get(row.skillKey) ?? 0, row.version));
        }
        return [...latest].map(([skillKey, version]) => ({ skillKey, _max: { version } }));
      }),
      findMany: jest.fn(async ({ where }) => rows.filter((row) => {
        if (where?.id?.in && !where.id.in.includes(row.id)) return false;
        if (where?.enabled !== undefined && row.enabled !== where.enabled) return false;
        if (where?.sourceFingerprint?.not === null && row.sourceFingerprint == null) return false;
        if (where?.OR && !where.OR.some((item: any) => item.skillKey === row.skillKey && item.version === row.version)) return false;
        return true;
      })),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of rows) {
          if (where.skillKey !== undefined && row.skillKey !== where.skillKey) continue;
          if (where.enabled !== undefined && row.enabled !== where.enabled) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
      update: jest.fn(async ({ where, data }) => { const row = rows.find((item) => item.id === where.id)!; Object.assign(row, data); return row; }),
    },
    brainResourceVersion: {
      findFirst: jest.fn(async ({ where }) =>
        resourceVersions
          .filter((item) => item.resourceType === where.resourceType && item.resourceKey === where.resourceKey)
          .sort((left, right) => right.version - left.version)[0] ?? null),
      create: jest.fn(async ({ data }) => { const row = { id: resourceVersions.length + 1, ...data }; resourceVersions.push(row); return row; }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const row of resourceVersions) {
          if (where.resourceType !== undefined && row.resourceType !== where.resourceType) continue;
          if (where.resourceKey !== undefined && row.resourceKey !== where.resourceKey) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          if (where.id?.not !== undefined && row.id === where.id.not) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
      update: jest.fn(async ({ where, data }) => { const row = resourceVersions.find((item) => item.id === where.id)!; Object.assign(row, data); return row; }),
    },
    brainRelease: {
      findUnique: jest.fn(async () => release),
      updateMany: jest.fn(async ({ where, data }) => { if (where.id === release.id && release.status === where.status) { Object.assign(release, data); return { count: 1 }; } return { count: 0 }; }),
      update: jest.fn(async ({ data }) => ({ ...release, ...data })),
    },
    brainEvalRun: { findFirst: jest.fn(async () => ({ summary: passingEvalSummary(release.items) })) },
    brainCapabilityRegenerationJob: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const publishedSnapshot = publishedFourCapabilitySnapshotFixture();
  const snapshotSource = { loadPublishedSnapshot: jest.fn().mockResolvedValue(publishedSnapshot) };
  const semanticVerifier = new BrainCapabilitySemanticVerifierService(snapshotSource as never);
  const publishedGate = {
    verify: jest.fn(async ({ proposal }) => semanticVerifier.verifyProposal(proposal)),
  };
  const prisma = {
    $transaction: jest.fn(async (callback) => callback(tx)),
    brainRelease: { findUnique: jest.fn(async () => release) },
    brainEvalRun: { findFirst: jest.fn(async () => ({ summary: passingEvalSummary(release.items) })) },
    role: { findMany: jest.fn().mockResolvedValue([{ permissions: integrationContext.permissions }]) },
    brainSkillRegistry: { findMany: jest.fn(async ({ where }) => where.id?.in ? rows.filter((row) => where.id.in.includes(row.id)) : rows.filter((row) => row.enabled)) },
  };
  const draft = new BrainGeneratedCapabilityDraftService(prisma as never, publishedGate as never);
  for (const proposal of generatedFourCapabilityProposalsFixture(publishedSnapshot)) await draft.createDraft({ proposal, createdBy: 9 });
  release.items = resourceVersions
    .filter((resourceVersion) => resourceVersion.status === 'draft')
    .map((resourceVersion, index) => ({ id: 61 + index, resourceVersionId: resourceVersion.id, resourceType: 'skill', resourceKey: resourceVersion.resourceKey, resourceVersion }));
  await new BrainReleaseService(prisma as never, semanticVerifier).activateRelease({ releaseId: release.id, activatedBy: 9 });
  const catalog = new BrainCapabilityCatalogService(
    new BrainSkillRegistryService(prisma as never),
    { runtime: { cognitionMode: 'model', plannerMode: 'model', capabilityTopK: 5, capabilityMinConfidence: 0.3 } } as BrainRuntimeConfigService,
    new Set(integrationContext.permissions),
    semanticVerifier as never,
  );
  return { cards: await catalog.listEnabledCapabilities(), publishedSnapshot, catalog, release, rows };
}

function passingEvalSummary(items: Array<Record<string, any>>) {
  return {
    canRelease: true,
    total: items.length,
    gateMode: 'release_gate',
    coverageComplete: true,
    releaseFingerprint: createReleaseFingerprint(items as never),
    requiredCapabilityKeys: items.map((item) => item.resourceKey).sort(),
    requiredCaseKeys: ['release_gate_case'],
    releaseGate: { passed: true },
  };
}

function runtimeDefinitionProvider(snapshot: ReturnType<typeof publishedFourCapabilitySnapshotFixture>) {
  const ref = (key: string) => snapshot.definitions.find((definition) => definition.definitionKey === key)!;
  const runtimeMetric = (definitionKey: string, metricKey: string, dimensionKey: string, source: unknown[], runtimeQuery: Record<string, unknown>) => {
    const definition = ref(definitionKey);
    return { definitionKey, version: definition.version, definitionFingerprint: definition.fingerprint, sourceFingerprint: definition.sourceFingerprint,
      metricKey, name: definition.name, domain: definition.domain, formula: runtimeQuery.formula, source, defaultFilters: [], permissions: (definition.payload as any).capabilities[0].requiredPermissions,
      allowedTaskTypes: ['query', 'ranking'],
      description: definition.name, runtimeQuery: { ...runtimeQuery, aggregation: (runtimeQuery.formula as any).type, dimensions: [dimensionKey], capabilityKeys: [(definition.payload as any).capabilities[0].key], executorKeys: ['BusinessDefinitionRuntimeQueryExecutor.execute'], outputFields: [metricKey], timePolicy: { mode: 'event_time', field: runtimeQuery.timeField, boundary: '[start,end)', timezone: 'Asia/Shanghai' } } };
  };
  const product = runtimeMetric('metric.product_sales_quantity', 'product_sales_quantity', 'product_name',
    [{ model: 'OrderItem', field: 'quantity' }, { model: 'ProductOrder', field: 'createdAt' }, { model: 'ProductOrder', field: 'storeId' }, { model: 'Product', field: 'name' }],
    { formula: { type: 'sum', model: 'OrderItem', field: 'quantity' }, joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }, { fromModel: 'OrderItem', relationField: 'product', toModel: 'Product' }], filters: [], sort: { outputField: 'product_sales_quantity', direction: 'desc', missing: 'error' }, storeScope: { mode: 'current_store', model: 'ProductOrder', field: 'storeId', joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }] }, timeField: 'ProductOrder.createdAt' });
  const project = runtimeMetric('metric.project_service_count', 'project_service_count', 'project_name',
    [{ model: 'CardUsageRecord', field: 'times' }, { model: 'CardUsageRecord', field: 'verifiedAt' }, { model: 'CardUsageRecord', field: 'storeId' }, { model: 'Project', field: 'name' }],
    { formula: { type: 'sum', model: 'CardUsageRecord', field: 'times' }, joinPath: [{ fromModel: 'CardUsageRecord', relationField: 'project', toModel: 'Project' }], filters: [], sort: { outputField: 'project_service_count', direction: 'desc', missing: 'error' }, storeScope: { mode: 'current_store', model: 'CardUsageRecord', field: 'storeId', joinPath: [] }, timeField: 'CardUsageRecord.verifiedAt' });
  const staff = runtimeMetric('metric.staff_performance_score', 'staff_performance_score', 'staff_name',
    [{ model: 'Beautician', field: 'storeId' }],
    { formula: { type: 'sum', model: 'Beautician', field: 'revenueAmount' }, joinPath: [], filters: [], sort: { outputField: 'staff_performance_score', direction: 'desc', missing: 'error' }, storeScope: { mode: 'current_store', model: 'Beautician', field: 'storeId', joinPath: [] }, timeField: 'manager_staff_analysis.range', resolver: { kind: 'domain_service', key: 'manager_staff_analysis', dimensionFields: { staff_name: 'name' }, expression: { op: 'field', field: 'revenueAmount' }, overallAggregation: 'sum' } });
  return {
    loadActiveDefinitions: jest.fn().mockResolvedValue({
      entities: [], relations: [], metrics: [product, project, staff],
      dimensions: [
        { definitionKey: 'dimension.product_name', version: 1, definitionFingerprint: '5'.repeat(64), sourceFingerprint: '6'.repeat(64), dimensionKey: 'product_name', name: '商品', domain: 'sales', source: { model: 'Product', field: 'name' }, permissions: ['core:order:products'] },
        { definitionKey: 'dimension.project_name', version: 1, definitionFingerprint: '7'.repeat(64), sourceFingerprint: '8'.repeat(64), dimensionKey: 'project_name', name: '项目', domain: 'service', source: { model: 'Project', field: 'name' }, permissions: ['core:project-order-profit:view'] },
        { definitionKey: 'dimension.staff_name', version: 1, definitionFingerprint: '9'.repeat(64), sourceFingerprint: 'a'.repeat(64), dimensionKey: 'staff_name', name: '员工', domain: 'staff', source: { model: 'Beautician', field: 'name' }, permissions: ['core:beautician-performance:view'] },
      ],
    }),
    getRuntimeDataModel: jest.fn().mockReturnValue({ models: {
      OrderItem: { fields: [{ name: 'quantity', kind: 'scalar', type: 'Decimal', isList: false }, { name: 'order', kind: 'object', type: 'ProductOrder', isList: false }, { name: 'product', kind: 'object', type: 'Product', isList: false }] },
      ProductOrder: { fields: [{ name: 'storeId', kind: 'scalar', type: 'Int', isList: false }, { name: 'createdAt', kind: 'scalar', type: 'DateTime', isList: false }] },
      Product: { fields: [{ name: 'name', kind: 'scalar', type: 'String', isList: false }, { name: 'storeId', kind: 'scalar', type: 'Int', isList: false }, { name: 'createdAt', kind: 'scalar', type: 'DateTime', isList: false }] },
      CardUsageRecord: { fields: [{ name: 'times', kind: 'scalar', type: 'Int', isList: false }, { name: 'storeId', kind: 'scalar', type: 'Int', isList: false }, { name: 'verifiedAt', kind: 'scalar', type: 'DateTime', isList: false }, { name: 'project', kind: 'object', type: 'Project', isList: false }] },
      Project: { fields: [{ name: 'name', kind: 'scalar', type: 'String', isList: false }, { name: 'storeId', kind: 'scalar', type: 'Int', isList: false }, { name: 'createdAt', kind: 'scalar', type: 'DateTime', isList: false }] },
      Beautician: { fields: [{ name: 'storeId', kind: 'scalar', type: 'Int', isList: false }] },
    } }),
  };
}
