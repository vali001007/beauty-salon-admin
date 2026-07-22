import { BrainSkillRegistryService } from './brain-skill-registry.service.js';

describe('BrainSkillRegistryService', () => {
  const row = (override: Record<string, unknown> = {}) => ({
    id: 1,
    skillKey: 'query_revenue',
    name: '查询实收流水',
    type: 'query',
    inputSchema: {},
    outputSchema: {},
    permissions: ['core:finance:view'],
    sourceFingerprint: 'a'.repeat(64),
    definitionRefs: [
      {
        definitionId: 11,
        versionId: 21,
        definitionKey: 'finance.paid_revenue',
        version: 3,
        definitionFingerprint: 'b'.repeat(64),
        sourceFingerprint: 'c'.repeat(64),
      },
    ],
    synonyms: ['门店实收'],
    negativeExamples: ['员工销售排行'],
    riskLevel: 'low',
    enabled: true,
    version: 1,
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
    updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    ...override,
  });

  it('returns only the highest enabled version for each capability key', async () => {
    const tx = {
      brainSkillRegistry: {
        groupBy: jest.fn().mockResolvedValue([
          { skillKey: 'query_revenue', _max: { version: 2 } },
          { skillKey: 'query_stock', _max: { version: 3 } },
        ]),
        findMany: jest
          .fn()
          .mockResolvedValue([row({ id: 2, version: 2 }), row({ id: 4, skillKey: 'query_stock', version: 3 })]),
      },
    };
    const prisma = { brainSkillRegistry: tx.brainSkillRegistry, $transaction: jest.fn() };
    const service = new BrainSkillRegistryService(prisma as any);

    const result = await service.listLatestEnabledSkills();

    expect(result.map((item) => [item.skillKey, item.version])).toEqual([
      ['query_revenue', 2],
      ['query_stock', 3],
    ]);
    expect(tx.brainSkillRegistry.findMany).toHaveBeenCalledWith({
      where: { enabled: true },
      orderBy: [{ skillKey: 'asc' }, { version: 'desc' }],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('maps a legacy read skill to conservative read-only capability defaults', async () => {
    const tx = {
      brainSkillRegistry: {
        groupBy: jest.fn().mockResolvedValue([{ skillKey: 'query_revenue', _max: { version: 1 } }]),
        findMany: jest.fn().mockResolvedValue([row()]),
      },
    };
    const prisma = { brainSkillRegistry: tx.brainSkillRegistry, $transaction: jest.fn() };
    const service = new BrainSkillRegistryService(prisma as any);

    await expect(service.listLatestEnabledCapabilityCandidates()).resolves.toEqual([
      expect.objectContaining({
        key: 'query_revenue',
        description: '',
        domains: [],
        intents: [],
        allowedRoles: [],
        readOnly: true,
        sideEffect: false,
        requiresConfirmation: false,
        idempotency: 'not_applicable',
        timeoutMs: 10_000,
        grounding: 'domain_service',
        examples: [],
        sourceFingerprint: 'a'.repeat(64),
        definitionRefs: [expect.objectContaining({ definitionKey: 'finance.paid_revenue', version: 3 })],
        synonyms: ['门店实收'],
        negativeExamples: ['员工销售排行'],
        successSchema: {},
      }),
    ]);
  });

  it('loads discovery candidates only from generated rows with a source fingerprint marker', async () => {
    const tx = {
      brainSkillRegistry: {
        groupBy: jest.fn().mockResolvedValue([{ skillKey: 'query_revenue', _max: { version: 1 } }]),
        findMany: jest.fn().mockResolvedValue([row()]),
      },
    };
    const prisma = { brainSkillRegistry: tx.brainSkillRegistry, $transaction: jest.fn() };
    const service = new BrainSkillRegistryService(prisma as any);

    await service.listLatestEnabledCapabilityCandidates();

    expect(tx.brainSkillRegistry.findMany).toHaveBeenCalledWith({
      where: { enabled: true, sourceFingerprint: { not: null } },
      orderBy: [{ skillKey: 'asc' }, { version: 'desc' }],
    });
  });

  it('maps a legacy action skill to confirmation, idempotency and medium-risk defaults', async () => {
    const tx = {
      brainSkillRegistry: {
        groupBy: jest.fn().mockResolvedValue([{ skillKey: 'preview_purchase_order', _max: { version: 1 } }]),
        findMany: jest.fn().mockResolvedValue([
          row({
            skillKey: 'preview_purchase_order',
            type: 'action',
            permissions: ['core:inventory:purchase'],
          }),
        ]),
      },
    };
    const prisma = { brainSkillRegistry: tx.brainSkillRegistry, $transaction: jest.fn() };
    const service = new BrainSkillRegistryService(prisma as any);

    await expect(service.listLatestEnabledCapabilityCandidates()).resolves.toEqual([
      expect.objectContaining({
        key: 'preview_purchase_order',
        readOnly: false,
        sideEffect: true,
        requiresConfirmation: true,
        idempotency: 'required',
        riskLevel: 'medium',
      }),
    ]);
  });

  it('keeps listEnabledSkills backward compatible while returning latest enabled versions', async () => {
    const tx = {
      brainSkillRegistry: {
        groupBy: jest.fn().mockResolvedValue([{ skillKey: 'query_revenue', _max: { version: 2 } }]),
        findMany: jest.fn().mockResolvedValue([row({ version: 2 })]),
      },
    };
    const prisma = { brainSkillRegistry: tx.brainSkillRegistry, $transaction: jest.fn() };
    const service = new BrainSkillRegistryService(prisma as any);

    const result = await service.listEnabledSkills();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ skillKey: 'query_revenue', version: 2 });
  });

  it('returns lightweight latest-version rows for governance list screens', async () => {
    const findMany = jest.fn().mockResolvedValue([
      row({ id: 2, version: 2 }),
      row({ id: 1, version: 1 }),
      row({ id: 4, skillKey: 'query_stock', version: 3 }),
    ]);
    const service = new BrainSkillRegistryService({ brainSkillRegistry: { findMany } } as any);

    const result = await service.listEnabledSkillSummaries();

    expect(result.map((item) => [item.skillKey, item.version])).toEqual([
      ['query_revenue', 2],
      ['query_stock', 3],
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { enabled: true },
      select: expect.objectContaining({
        skillKey: true,
        name: true,
        version: true,
        updatedAt: true,
      }),
    }));
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('inputSchema');
    expect(findMany.mock.calls[0][0].select).not.toHaveProperty('outputSchema');
  });

  it('preserves malformed JSON and arrays so the catalog can reject them', async () => {
    const malformed = row({
      skillKey: 'preview_purchase_order',
      type: 'action',
      permissions: 'core:inventory:purchase',
      inputSchema: [],
      domains: 'inventory',
      examples: { question: '采购' },
      definitionRefs: { definitionKey: 'inventory.stock' },
      synonyms: '采购建议',
      negativeExamples: { question: '销售排行' },
      readOnly: false,
      sideEffect: true,
      requiresConfirmation: true,
      idempotency: 'required',
    });
    const tx = {
      brainSkillRegistry: {
        groupBy: jest.fn().mockResolvedValue([{ skillKey: 'preview_purchase_order', _max: { version: 1 } }]),
        findMany: jest.fn().mockResolvedValue([malformed]),
      },
    };
    const prisma = { brainSkillRegistry: tx.brainSkillRegistry, $transaction: jest.fn() };
    const service = new BrainSkillRegistryService(prisma as any);

    const [candidate] = await service.listLatestEnabledCapabilityCandidates();

    expect(candidate.requiredPermissions).toBe('core:inventory:purchase');
    expect(candidate.inputSchema).toEqual([]);
    expect(candidate.domains).toBe('inventory');
    expect(candidate.examples).toEqual({ question: '采购' });
    expect(candidate.definitionRefs).toEqual({ definitionKey: 'inventory.stock' });
    expect(candidate.synonyms).toBe('采购建议');
    expect(candidate.negativeExamples).toEqual({ question: '销售排行' });
  });

  it('does not query all history when no enabled capability exists', async () => {
    const tx = {
      brainSkillRegistry: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const prisma = { brainSkillRegistry: tx.brainSkillRegistry, $transaction: jest.fn() };
    const service = new BrainSkillRegistryService(prisma as any);

    await expect(service.listLatestEnabledSkills()).resolves.toEqual([]);
    expect(tx.brainSkillRegistry.findMany).toHaveBeenCalledTimes(1);
  });
});
