import { BrainGovernanceResourceService } from './brain-governance-resource.service.js';

describe('BrainGovernanceResourceService', () => {
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
