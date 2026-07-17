import type { BrainCapabilityGenerationProposal } from './brain-capability-codegen.service.js';
import { BrainGeneratedCapabilityDraftService } from './brain-generated-capability-draft.service.js';

describe('BrainGeneratedCapabilityDraftService', () => {
  it('persists the complete verified read-only manifest without governance defaults', async () => {
    const generated = proposal();
    const verifier = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const tx = {
      brainSkillRegistry: { create: jest.fn().mockResolvedValue({ id: 31 }) },
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 41, ...data })),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGeneratedCapabilityDraftService(prisma as never, verifier as never);

    await service.createDraft({ proposal: generated, createdBy: 9 });

    expect(verifier.verify).toHaveBeenCalledWith(expect.objectContaining({ proposal: generated }));
    expect(tx.brainSkillRegistry.create).toHaveBeenCalledWith({
      data: {
        skillKey: generated.manifest.key,
        name: generated.manifest.name,
        description: generated.manifest.description,
        type: 'query',
        domains: generated.manifest.domains,
        intents: generated.manifest.intents,
        inputSchema: generated.manifest.inputSchema,
        outputSchema: generated.manifest.outputSchema,
        permissions: generated.manifest.requiredPermissions,
        allowedRoles: generated.manifest.allowedRoles,
        readOnly: true,
        sideEffect: false,
        riskLevel: generated.manifest.riskLevel,
        requiresConfirmation: false,
        idempotency: 'not_applicable',
        timeoutMs: generated.manifest.timeoutMs,
        grounding: generated.manifest.grounding,
        examples: generated.manifest.examples,
        sourceFingerprint: generated.manifest.sourceFingerprint,
        definitionRefs: generated.manifest.definitionRefs,
        synonyms: generated.manifest.synonyms,
        negativeExamples: generated.manifest.negativeExamples,
        successSchema: generated.manifest.successSchema,
        enabled: false,
        version: 1,
      },
    });
    expect(tx.brainResourceVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resourceType: 'skill',
        resourceKey: generated.manifest.key,
        version: 1,
        status: 'draft',
        sourceResourceId: 31,
        createdBy: 9,
        snapshot: expect.objectContaining({
          generatedCapability: true,
          sourceFingerprint: 'f'.repeat(64),
          executorBinding: generated.executorBinding,
        }),
      }),
    });
  });

  it('falls back to a parameterized registry insert when a stale Prisma client rejects current schema fields', async () => {
    const generated = proposal();
    const verifier = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 35 }]),
      brainSkillRegistry: {
        create: jest.fn().mockRejectedValue(new Error('Unknown argument `description`. Available options are marked with ?.')),
      },
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 45, ...data })),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGeneratedCapabilityDraftService(prisma as never, verifier as never);

    await expect(service.createDraft({ proposal: generated, createdBy: 9 })).resolves.toMatchObject({
      sourceResourceId: 35,
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.brainResourceVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sourceResourceId: 35 }),
    });
  });

  it('creates N+1 without overwriting history and records proposal and registry versions immutably', async () => {
    const generated = proposal();
    const verifier = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const tx = {
      brainSkillRegistry: { create: jest.fn().mockResolvedValue({ id: 32 }) },
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue({ version: 3 }),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 42, ...data })),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGeneratedCapabilityDraftService(prisma as never, verifier as never);

    await service.createDraft({ proposal: generated, createdBy: 9 });

    expect(tx.brainSkillRegistry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ skillKey: generated.capabilityKey, version: 4 }),
    });
    expect(tx.brainResourceVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        version: 4,
        snapshot: expect.objectContaining({
          version: 4,
          sourceProposalVersion: 1,
          registryVersion: 4,
        }),
      }),
    });
    expect(generated.manifest.version).toBe(1);
  });

  it('retries serializable P2034 and P2002 version races and succeeds on the third attempt', async () => {
    const generated = proposal();
    const verifier = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const tx = {
      brainSkillRegistry: { create: jest.fn().mockResolvedValue({ id: 32 }) },
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 42, ...data })),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce({ code: 'P2034' })
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockImplementationOnce((callback) => callback(tx)),
    };
    const service = new BrainGeneratedCapabilityDraftService(prisma as never, verifier as never);

    await expect(service.createDraft({ proposal: generated, createdBy: 9 })).resolves.toMatchObject({ version: 1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 5_000,
      timeout: 30_000,
    });
  });

  it('reuses the latest manual draft when the proposal and source fingerprints are unchanged', async () => {
    const generated = proposal();
    const existing = {
      id: 51,
      version: 4,
      snapshot: {
        sourceProposalFingerprint: generated.proposalFingerprint,
        sourceFingerprint: generated.sourceFingerprint,
      },
    };
    const verifier = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const tx = {
      brainSkillRegistry: { create: jest.fn() },
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new BrainGeneratedCapabilityDraftService(prisma as never, verifier as never);

    await expect(service.createDraft({ proposal: generated, createdBy: 9 })).resolves.toBe(existing);
    expect(tx.brainSkillRegistry.create).not.toHaveBeenCalled();
    expect(tx.brainResourceVersion.create).not.toHaveBeenCalled();
  });

  it.each(['P2034', 'P2002'])('maps exhausted %s version races to ConflictException', async (code) => {
    const generated = proposal();
    const verifier = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const prisma = { $transaction: jest.fn().mockRejectedValue({ code }) };
    const service = new BrainGeneratedCapabilityDraftService(prisma as never, verifier as never);

    await expect(service.createDraft({ proposal: generated, createdBy: 9 })).rejects.toMatchObject({
      name: 'ConflictException',
      message: 'generated_capability_version_conflict',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('returns the existing draft for the same regeneration job after a post-commit retry', async () => {
    const generated = proposal();
    const existing = { id: 88, resourceType: 'skill', resourceKey: generated.capabilityKey, version: 4 };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      brainResourceVersion: { findFirst: jest.fn().mockResolvedValue({
        ...existing,
        snapshot: { sourceProposalFingerprint: generated.proposalFingerprint, sourceFingerprint: generated.sourceFingerprint },
      }) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const verifier = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const service = new BrainGeneratedCapabilityDraftService(prisma as never, verifier as never);

    await expect(
      service.createDraft({ proposal: generated, createdBy: 9, generatedByJobId: 7, leaseOwner: 'worker-a', workspaceRoot: 'D:/workspace' }),
    ).resolves.toMatchObject(existing);
    const leaseSql = tx.$queryRaw.mock.calls[0][0].strings.join(' ');
    expect(leaseSql).toContain('"leaseExpiresAt" > NOW()');
    expect(leaseSql).toContain("INTERVAL '5 minutes'");
  });

  it('binds the created resource version to the regeneration job in the same transaction', async () => {
    const generated = proposal();
    const verifier = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      brainSkillRegistry: { create: jest.fn().mockResolvedValue({ id: 31 }) },
      brainResourceVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 41, ...data })),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = new BrainGeneratedCapabilityDraftService(prisma as never, verifier as never);

    await service.createDraft({ proposal: generated, createdBy: 9, generatedByJobId: 7, leaseOwner: 'worker-a', workspaceRoot: 'D:/workspace' });

    expect(tx.brainResourceVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ generatedByRegenerationJobId: 7 }),
    });
  });

  it('rejects side effects after lease loss and rejects mismatched existing fingerprints', async () => {
    const generated = proposal();
    const gate = { verify: jest.fn().mockResolvedValue({ manifest: generated.manifest }) };
    const lostTx = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const lost = new BrainGeneratedCapabilityDraftService({ $transaction: jest.fn((callback) => callback(lostTx)) } as never, gate as never);
    await expect(lost.createDraft({ proposal: generated, createdBy: 9, generatedByJobId: 7, leaseOwner: 'old', workspaceRoot: 'D:/workspace' }))
      .rejects.toThrow('regeneration_lease_lost');

    const mismatchTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      brainResourceVersion: { findFirst: jest.fn().mockResolvedValue({
        id: 88,
        snapshot: { sourceProposalFingerprint: '0'.repeat(64), sourceFingerprint: generated.sourceFingerprint },
      }) },
    };
    const mismatch = new BrainGeneratedCapabilityDraftService({ $transaction: jest.fn((callback) => callback(mismatchTx)) } as never, gate as never);
    await expect(mismatch.createDraft({ proposal: generated, createdBy: 9, generatedByJobId: 7, leaseOwner: 'worker-a', workspaceRoot: 'D:/workspace' }))
      .rejects.toThrow('generated_capability_existing_fingerprint_mismatch');
  });
});

function proposal(): BrainCapabilityGenerationProposal {
  const definitionRef = {
    definitionId: 11,
    versionId: 21,
    definitionKey: 'metric.product_sales_quantity',
    version: 3,
    definitionFingerprint: 'b'.repeat(64),
    sourceFingerprint: 'c'.repeat(64),
  };
  return {
    status: 'ready',
    capabilityKey: 'product_sales_ranking',
    sourceFingerprint: 'f'.repeat(64),
    proposalFingerprint: 'e'.repeat(64),
    businessDefinitions: [definitionRef],
    manifest: {
      key: 'product_sales_ranking',
      version: 1,
      sourceFingerprint: 'f'.repeat(64),
      name: '商品销售排行',
      description: '按商品销量排序。',
      domains: ['sales'],
      intents: ['ranking'],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      requiredPermissions: ['core:metric:view'],
      allowedRoles: ['store_manager'],
      readOnly: true,
      sideEffect: false,
      riskLevel: 'low',
      requiresConfirmation: false,
      idempotency: 'not_applicable',
      timeoutMs: 8_000,
      grounding: 'semantic_query',
      examples: ['本月商品销售排行'],
      negativeExamples: ['员工排行'],
      synonyms: ['商品销量榜'],
      successSchema: { type: 'object' },
      definitionRefs: [definitionRef],
    },
    languageCandidates: {
      description: '候选',
      positiveExamples: ['销量'],
      negativeExamples: ['员工'],
      synonyms: ['销量榜'],
      successSchema: { type: 'object' },
      riskExplanation: '只读',
    },
    executorBinding: {
      controller: 'ProductsController',
      httpMethod: 'GET',
      path: '/ranking',
      serviceCalls: [],
    } as unknown as BrainCapabilityGenerationProposal['executorBinding'],
    bindingSource: '',
    contractArtifact: {} as BrainCapabilityGenerationProposal['contractArtifact'],
    contractTestSource: '',
    gateReport: { passed: true, gates: [] },
  };
}
