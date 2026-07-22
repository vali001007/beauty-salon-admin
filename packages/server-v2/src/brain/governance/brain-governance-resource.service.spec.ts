import { BrainGovernanceResourceService } from './brain-governance-resource.service.js';

describe('BrainGovernanceResourceService', () => {
  it('builds a semantic graph only from published definitions and their declared models', async () => {
    const service = new BrainGovernanceResourceService({
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          { definitionKey: 'entity.customer', kind: 'entity', name: 'Customer', status: 'active', currentPublishedVersion: { version: 1, payload: { model: 'Customer', aliases: ['客户'] } } },
          { definitionKey: 'entity.product_order', kind: 'entity', name: 'ProductOrder', status: 'active', currentPublishedVersion: { version: 1, payload: { model: 'ProductOrder', aliases: ['订单'] } } },
          { definitionKey: 'relation.product_order.customer', kind: 'relation', name: '订单客户', status: 'active', currentPublishedVersion: { version: 1, payload: { fromModel: 'ProductOrder', toModel: 'Customer' } } },
          { definitionKey: 'metric.paid_amount', kind: 'metric', name: '实收金额', status: 'active', currentPublishedVersion: { version: 2, payload: { sourceTables: ['ProductOrder'], aliases: ['实收'] } } },
        ]),
      },
    } as never);

    const graph = await service.getSemanticGraph();

    expect(graph.summary).toMatchObject({ entities: 2, relations: 1, metrics: 1, tables: 2 });
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'entity.customer', label: '客户', kind: 'entity' }),
      expect.objectContaining({ id: 'metric.paid_amount', kind: 'metric', version: 2 }),
      expect.objectContaining({ id: 'table:ProductOrder', kind: 'table' }),
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'entity.product_order', target: 'relation.product_order.customer', kind: 'relation_from' }),
      expect.objectContaining({ source: 'relation.product_order.customer', target: 'entity.customer', kind: 'relation_to' }),
      expect.objectContaining({ source: 'metric.paid_amount', target: 'entity.product_order', kind: 'metric_entity' }),
    ]));
  });

  it('builds a lightweight semantic summary with governed metadata and real 30-day hit rate', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{
        id: 14,
        resourceKey: 'card',
        name: '会员卡',
        version: 2,
        sourceStatus: 'active',
        sourceDescription: null,
        sourceMetadata: { table: 'MemberCard' },
        sourceFuzzyTerms: ['卡项', '储值卡'],
        definitionId: 81,
        definitionKey: 'card',
        definitionStatus: 'active',
        currentPublishedVersionId: 91,
        definitionVersionId: 91,
        definitionLifecycleStatus: 'published',
        definitionPayload: { description: '会员持有的储值与次卡账户', aliases: ['会员卡', '卡账户'] },
        updatedAt: new Date('2026-07-21T10:00:00.000Z'),
        historyCount: 2,
      }])
      .mockResolvedValueOnce([{ definitionKey: 'card', hitCount: 3 }]);
    const service = new BrainGovernanceResourceService({
      $queryRaw: queryRaw,
      brainRun: { count: jest.fn().mockResolvedValue(12) },
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    await expect(
      service.listSemanticGovernanceSummaries({ resourceType: 'ontology_entity', storeId: 2 }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 14,
        resourceKey: 'card',
        semanticDescription: '会员持有的储值与次卡账户',
        dataTables: ['MemberCard'],
        fuzzyTerms: ['卡项', '储值卡', '会员卡', '卡账户'],
        hitCount: 3,
        sampleCount: 12,
        hitRate: 0.25,
        enabled: true,
        managed: true,
        historyCount: 2,
      }),
    ]);

    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('shows no semantic hit rate when the store has no completed run sample', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{
        id: 15,
        resourceKey: 'bom',
        name: 'BOM',
        version: 1,
        sourceStatus: 'active',
        sourceDescription: null,
        sourceMetadata: { strategy: 'semantic_layer_mapping_required' },
        sourceFuzzyTerms: [],
        definitionId: null,
        definitionKey: null,
        definitionStatus: null,
        currentPublishedVersionId: null,
        definitionVersionId: null,
        definitionLifecycleStatus: null,
        definitionPayload: null,
        updatedAt: new Date('2026-07-21T10:00:00.000Z'),
        historyCount: 1,
      }])
      .mockResolvedValueOnce([]);
    const service = new BrainGovernanceResourceService({
      $queryRaw: queryRaw,
      brainRun: { count: jest.fn().mockResolvedValue(0) },
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    const result = await service.listSemanticGovernanceSummaries({
      resourceType: 'ontology_entity',
      storeId: 2,
    });

    expect(result[0]).toMatchObject({ hitRate: null, hitCount: 0, sampleCount: 0, managed: false });
  });

  it('uses published business definitions as the governed semantic source and hides duplicate legacy rows', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{
        id: 14,
        resourceKey: 'customer',
        name: '客户旧投影',
        version: 1,
        sourceStatus: 'active',
        sourceDescription: null,
        sourceMetadata: {},
        sourceFuzzyTerms: ['客户'],
        definitionId: null,
        definitionKey: null,
        definitionStatus: null,
        currentPublishedVersionId: null,
        definitionVersionId: null,
        definitionLifecycleStatus: null,
        definitionPayload: null,
        updatedAt: new Date('2026-07-20T10:00:00.000Z'),
        historyCount: 1,
      }])
      .mockResolvedValueOnce([{ definitionKey: 'entity.customer', hitCount: 4 }]);
    const service = new BrainGovernanceResourceService({
      $queryRaw: queryRaw,
      brainRun: { count: jest.fn().mockResolvedValue(10) },
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([{
          id: 43,
          definitionKey: 'entity.customer',
          name: 'Customer',
          status: 'active',
          currentPublishedVersionId: 43,
          updatedAt: new Date('2026-07-21T10:00:00.000Z'),
          currentPublishedVersion: {
            id: 43,
            version: 1,
            payload: { model: 'Customer', aliases: ['客户'] },
            lifecycleStatus: 'published',
            publishedAt: new Date('2026-07-21T10:00:00.000Z'),
            createdAt: new Date('2026-07-21T09:00:00.000Z'),
          },
          _count: { versions: 1 },
        }]),
      },
    } as never);

    const result = await service.listSemanticGovernanceSummaries({
      resourceType: 'ontology_entity',
      storeId: 2,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 43,
      resourceKey: 'entity.customer',
      dataTables: ['Customer'],
      fuzzyTerms: ['客户'],
      hitCount: 4,
      hitRate: 0.4,
      managed: true,
      enabled: true,
    });
  });

  it('loads semantic history without calculating run statistics', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{
      id: 33,
      resourceKey: 'paid_amount',
      name: '实收金额',
      version: 3,
      sourceStatus: 'active',
      sourceDescription: '支付成功后的实收金额',
      sourceMetadata: ['Order'],
      sourceFuzzyTerms: [],
      definitionId: 41,
      definitionKey: 'paid_amount',
      definitionStatus: 'active',
      currentPublishedVersionId: 51,
      definitionVersionId: 51,
      definitionLifecycleStatus: 'published',
      definitionPayload: { aliases: ['实收'] },
      updatedAt: new Date('2026-07-21T10:00:00.000Z'),
      historyCount: 3,
    }]);
    const service = new BrainGovernanceResourceService({
      $queryRaw: queryRaw,
      businessDefinition: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(service.listSemanticGovernanceHistory({
      resourceType: 'metric',
      resourceKey: 'paid_amount',
    })).resolves.toEqual([
      expect.objectContaining({ id: 33, version: 3, dataTables: ['Order'], fuzzyTerms: ['实收'] }),
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('toggles the current published business definition instead of mutating a legacy projection', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 41,
      definitionKey: 'paid_amount',
      kind: 'metric',
      name: '实收金额',
      status: 'archived',
      currentPublishedVersionId: 51,
      updatedAt: new Date('2026-07-21T10:00:00.000Z'),
    });
    const service = new BrainGovernanceResourceService({
      businessDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: 41, currentPublishedVersionId: 51 }),
        update,
      },
      businessDefinitionVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 51,
          definitionId: 41,
          lifecycleStatus: 'published',
          definition: { currentPublishedVersionId: 51 },
        }),
      },
    } as never);

    await expect(service.setPublishedSemanticEnabled({
      resourceType: 'metric',
      resourceKey: 'paid_amount',
      enabled: false,
    })).resolves.toMatchObject({ status: 'archived', enabled: false });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 41 },
      data: { status: 'archived' },
    }));
  });

  it('rejects semantic toggles for ungoverned legacy projections', async () => {
    const update = jest.fn();
    const service = new BrainGovernanceResourceService({
      businessDefinition: { findUnique: jest.fn().mockResolvedValue(null), update },
    } as never);

    await expect(service.setPublishedSemanticEnabled({
      resourceType: 'ontology_entity',
      resourceKey: 'card',
      enabled: false,
    })).rejects.toThrow('semantic_enable_requires_governed_published_version');
    expect(update).not.toHaveBeenCalled();
  });

  it('loads one lightweight latest row per skill for the governance table', async () => {
    const rows = [{
      versionId: 1053,
      skillId: 1053,
      skillKey: 'appointment_gap_list',
      name: '预约空档查询',
      description: '查询指定日期的预约空档',
      domains: ['reservation', 'staff'],
      definitionRefs: [
        { definitionKey: 'entity.reservation' },
        { definitionKey: 'entity.beautician' },
        { definitionKey: 'metric.appointment_count' },
        { definitionKey: 'dimension.beauticianName' },
      ],
      version: 17,
      status: 'draft',
      activeVersionId: 986,
      activeVersion: 15,
      enabled: true,
      historyCount: 17,
      updatedAt: new Date('2026-07-21T05:33:51.889Z'),
    }];
    const queryRaw = jest.fn().mockResolvedValue(rows);
    const service = new BrainGovernanceResourceService({ $queryRaw: queryRaw } as never);

    await expect(service.listSkillGovernanceSummaries({ take: 100 })).resolves.toEqual([{
      versionId: 1053,
      skillId: 1053,
      skillKey: 'appointment_gap_list',
      name: '预约空档查询',
      description: '查询指定日期的预约空档',
      version: 17,
      status: 'draft',
      activeVersionId: 986,
      activeVersion: 15,
      enabled: true,
      historyCount: 17,
      updatedAt: new Date('2026-07-21T05:33:51.889Z'),
      domains: ['reservation', 'staff'],
      entities: ['reservation', 'beautician'],
      metrics: ['appointment_count'],
    }]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('loads bounded version history for one skill key', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ versionId: 1053, version: 17 }]);
    const service = new BrainGovernanceResourceService({ $queryRaw: queryRaw } as never);

    await expect(
      service.listSkillGovernanceHistory({ skillKey: 'appointment_gap_list', take: 500 }),
    ).resolves.toEqual([{ versionId: 1053, version: 17 }]);

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('toggles only the already published skill source row', async () => {
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 986, version: 15, sourceResourceId: 986 }),
      },
      brainSkillRegistry: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({
          id: 986,
          skillKey: 'appointment_gap_list',
          name: '预约空档查询',
          version: 15,
          enabled: true,
          updatedAt: new Date('2026-07-21T05:33:51.889Z'),
        }),
      },
    };
    const service = new BrainGovernanceResourceService({
      $transaction: jest.fn((operation) => operation(tx)),
    } as never);

    await expect(
      service.setPublishedSkillEnabled({ skillKey: 'appointment_gap_list', enabled: true }),
    ).resolves.toMatchObject({ enabled: true, activeVersionId: 986, activeVersion: 15 });

    expect(tx.brainResourceVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'active', resourceKey: 'appointment_gap_list' }),
    }));
    expect(tx.brainSkillRegistry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 986 },
      data: { enabled: true },
    }));
  });

  it('supports lightweight version lists without loading JSON snapshots', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainGovernanceResourceService({
      brainResourceVersion: { findMany },
    } as never);

    await service.listVersions({ includeSnapshot: false, take: 100 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 100,
      select: {
        id: true,
        resourceType: true,
        resourceKey: true,
        version: true,
        status: true,
        createdAt: true,
      },
    }));
  });

  it.each([
    [
      'metric',
      'new_customer_count',
      {
        name: '新客数',
        domain: 'customer',
        formula: { operation: 'count' },
        sourceTables: ['Customer'],
        permissions: ['core:customer:view'],
        description: '统计周期内新建客户数',
      },
    ],
    [
      'ontology_entity',
      'customer',
      {
        name: '客户',
        domain: 'customer',
        synonyms: [],
        attributes: {},
        tableMap: { table: 'Customer' },
      },
    ],
    [
      'ontology_relation',
      'customer_has_order',
      {
        name: '客户拥有订单',
        fromEntityKey: 'customer',
        toEntityKey: 'order',
        joinPath: { from: 'Customer.id', to: 'Order.customerId' },
      },
    ],
  ] as const)(
    'rejects legacy semantic resource %s before opening a transaction',
    async (resourceType, resourceKey, payload) => {
      const tx = {
        brainResourceVersion: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn(),
        },
        brainMetric: { create: jest.fn().mockResolvedValue({ id: 17 }) },
        brainOntologyEntity: { create: jest.fn().mockResolvedValue({ id: 18 }) },
        brainOntologyRelation: { create: jest.fn().mockResolvedValue({ id: 19 }) },
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
      const service = new BrainGovernanceResourceService(prisma as never);

      await expect(
        service.createDraft({
          resourceType,
          resourceKey,
          payload,
          createdBy: 9,
        }),
      ).rejects.toThrow(`business_definition_registry_required:${resourceType}`);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.brainMetric.create).not.toHaveBeenCalled();
      expect(tx.brainOntologyEntity.create).not.toHaveBeenCalled();
      expect(tx.brainOntologyRelation.create).not.toHaveBeenCalled();
      expect(tx.brainResourceVersion.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'agent_profile',
      'store_manager',
      {
        name: '店长',
        systemPrompt: '负责门店经营分析',
        allowedSkills: [],
        dataScopeRules: {},
      },
      'brainAgentProfile',
    ],
    [
      'skill',
      'customer_query',
      {
        name: '客户查询',
        type: 'query',
        inputSchema: {},
        outputSchema: {},
        permissions: [],
        riskLevel: 'low',
      },
      'brainSkillRegistry',
    ],
    [
      'inspection_rule',
      'inactive_customer',
      {
        name: '沉睡客户检查',
        domain: 'customer',
        condition: {},
        suggestionTpl: {},
        riskLevel: 'medium',
      },
      'brainInspectionRule',
    ],
  ] as const)('keeps existing create behavior for %s', async (resourceType, resourceKey, payload, sourceModel) => {
    const sourceCreate = jest.fn().mockResolvedValue({ id: 17 });
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 41, ...data })),
      },
      [sourceModel]: { create: sourceCreate },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);

    const result = await service.createDraft({
      resourceType,
      resourceKey,
      payload,
      createdBy: 9,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(sourceCreate).toHaveBeenCalledTimes(1);
    expect(tx.brainResourceVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ resourceType, resourceKey, version: 1, status: 'draft', sourceResourceId: 17 }),
    });
    expect(result).toMatchObject({ id: 41, version: 1, status: 'draft' });
  });

  it.each([
    'sourceFingerprint',
    'definitionRefs',
    'synonyms',
    'negativeExamples',
    'examples',
    'domains',
    'intents',
    'description',
    'successSchema',
  ])('rejects caller-controlled generated skill field %s before opening a transaction', async (field) => {
    const sourceCreate = jest.fn().mockResolvedValue({ id: 17 });
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 41, ...data })),
      },
      brainSkillRegistry: { create: sourceCreate },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);
    await expect(
      service.createDraft({
        resourceType: 'skill',
        resourceKey: 'customer_facts',
        payload: {
          name: '客户事实',
          type: 'query',
          inputSchema: {},
          outputSchema: {},
          permissions: ['core:customer:view'],
          riskLevel: 'low',
          [field]: field.includes('Fingerprint') ? 'a'.repeat(64) : [],
        },
        createdBy: 9,
      }),
    ).rejects.toThrow(`generated_capability_field_forbidden:${field}`);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sourceCreate).not.toHaveBeenCalled();
  });

  it('rejects legacy governance updates for an existing generated capability key inside the transaction', async () => {
    const sourceCreate = jest.fn().mockResolvedValue({ id: 18 });
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue({
          version: 3,
          snapshot: { generatedCapability: true, key: 'customer_facts', version: 3 },
        }),
        create: jest.fn(),
      },
      brainSkillRegistry: { create: sourceCreate },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(
      service.createDraft({
        resourceType: 'skill',
        resourceKey: 'customer_facts',
        payload: { allowedRoles: ['finance'], riskLevel: 'medium' },
        createdBy: 9,
      }),
    ).rejects.toThrow('generated_capability_governance_pipeline_required');

    expect(tx.brainResourceVersion.findFirst).toHaveBeenCalledTimes(1);
    expect(sourceCreate).not.toHaveBeenCalled();
    expect(tx.brainResourceVersion.create).not.toHaveBeenCalled();
  });

  it('updates an agent profile by creating version 2 and does not mutate version 1', async () => {
    const previous = {
      id: 41,
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      version: 1,
      snapshot: {
        name: '店长',
        systemPrompt: '旧提示词',
        allowedSkills: [],
        dataScopeRules: {},
      },
    };
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(previous),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 42, ...data })),
      },
      brainAgentProfile: { create: jest.fn().mockResolvedValue({ id: 18 }), update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGovernanceResourceService(prisma as never);

    const result = await service.createDraft({
      resourceType: 'agent_profile',
      resourceKey: 'store_manager',
      payload: { systemPrompt: '新提示词' },
      createdBy: 9,
    });

    expect(tx.brainAgentProfile.update).not.toHaveBeenCalled();
    expect(tx.brainAgentProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roleKey: 'store_manager', version: 2, systemPrompt: '新提示词' }),
    });
    expect(result).toMatchObject({ version: 2 });
  });

  it('retries serializable P2034 and P2002 draft version races and succeeds on the third attempt', async () => {
    const tx = {
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 42, ...data })),
      },
      brainAgentProfile: { create: jest.fn().mockResolvedValue({ id: 18 }) },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockImplementationOnce((callback) => callback(tx)),
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(
      service.createDraft({
        resourceType: 'agent_profile',
        resourceKey: 'store_manager',
        payload: { name: '店长', systemPrompt: '负责门店经营', allowedSkills: [], dataScopeRules: {} },
        createdBy: 9,
      }),
    ).resolves.toMatchObject({ version: 1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it.each(['P2034', 'P2002'])('maps exhausted %s draft version races to ConflictException', async (code) => {
    const prisma = { $transaction: jest.fn().mockRejectedValue({ code }) };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(
      service.createDraft({
        resourceType: 'agent_profile',
        resourceKey: 'store_manager',
        payload: { name: '店长', systemPrompt: '负责门店经营', allowedSkills: [], dataScopeRules: {} },
        createdBy: 9,
      }),
    ).rejects.toMatchObject({ name: 'ConflictException', message: 'brain_resource_version_conflict' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each(
    (['metric', 'ontology_entity', 'ontology_relation'] as const).flatMap((resourceType) =>
      (['draft', 'active', 'disabled', 'archived'] as const).map((status) => [resourceType, status] as const),
    ),
  )('rejects %s status change to %s before any write', async (resourceType, status) => {
    const prisma = {
      brainResourceVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 41, resourceType, status: 'draft' }),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(service.changeStatus({ id: 41, status })).rejects.toMatchObject({
      message: `business_definition_registry_required:${resourceType}`,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.brainResourceVersion.update).not.toHaveBeenCalled();
  });

  it('does not allow a non-semantic draft to bypass the release gate and become active directly', async () => {
    const prisma = {
      brainResourceVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 41, resourceType: 'agent_profile', status: 'draft' }),
        update: jest.fn(),
      },
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(service.changeStatus({ id: 41, status: 'active' })).rejects.toMatchObject({
      message: 'brain_resource_activation_requires_release',
    });
    expect(prisma.brainResourceVersion.update).not.toHaveBeenCalled();
  });

  it('keeps existing status update behavior for non-semantic resources', async () => {
    const current = {
      id: 41,
      resourceType: 'skill',
      status: 'draft',
      activatedAt: null,
      archivedAt: null,
    };
    const prisma = {
      brainResourceVersion: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({ ...current, status: 'disabled' }),
      },
    };
    const service = new BrainGovernanceResourceService(prisma as never);

    await expect(service.changeStatus({ id: 41, status: 'disabled' })).resolves.toMatchObject({ status: 'disabled' });
    expect(prisma.brainResourceVersion.update).toHaveBeenCalledTimes(1);
  });
});
