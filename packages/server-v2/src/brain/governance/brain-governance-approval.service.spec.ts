import { BrainGovernanceApprovalService } from './brain-governance-approval.service.js';

describe('BrainGovernanceApprovalService', () => {
  it('routes metric, status, time and relation changes to the Ami Core business definition center', async () => {
    const release = { id: 21, releaseKey: 'brain-r1', status: 'draft', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'revenue', resourceVersion: { checksum: 'a', snapshot: { name: '实收' } } }] };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainResourceVersion: { create: jest.fn().mockImplementation(({ data }) => ({ id: 401, ...data })) },
      brainCapabilityRegenerationJob: { create: jest.fn().mockImplementation(({ data }) => ({ id: 501, ...data })) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainCapabilityRegenerationJob: { update: jest.fn().mockResolvedValue({ id: 501 }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const definitions = { createOrReuseDraft: jest.fn().mockResolvedValue({ id: 301, definitionKey: 'change_request.brain.release_21.1' }) };
    const publicJob = publicJobDto({ status: 'blocked', errorCode: 'business_definition_change_pending' });
    const regeneration = { getPublicJob: jest.fn().mockResolvedValue(publicJob), toPublicJob: jest.fn() };
    const service = new BrainGovernanceApprovalService(prisma as never, definitions as never, {} as never, regeneration as never);

    const result = await service.submitModificationRequirement({
      releaseId: 21,
      requirement: '实收指标要排除已退款订单，并统一本月时间口径',
      createdBy: 9,
    });

    expect(definitions.createOrReuseDraft).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'query_definition',
      lifecycleStatus: 'candidate',
      payload: expect.objectContaining({ requestType: 'business_definition_change_request' }),
    }));
    expect(tx.brainCapabilityRegenerationJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      releaseFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), status: 'blocked', errorCode: 'business_definition_change_pending',
    }) });
    expect(prisma.brainCapabilityRegenerationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ report: expect.objectContaining({
        businessDefinition: expect.objectContaining({ definitionDraftId: 301 }),
      }) }),
    }));
    expect(result).toMatchObject({ requestType: 'business_definition', job: publicJob, redirectTo: expect.stringContaining('/system/business-definitions') });
  });

  it('retains and reports the fingerprint blocker when Registry draft creation fails', async () => {
    const release = { id: 21, releaseKey: 'brain-r1', status: 'draft', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'revenue', resourceVersion: { checksum: 'a', snapshot: { name: '实收' } } }] };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]), brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainResourceVersion: { create: jest.fn().mockImplementation(({ data }) => ({ id: 401, ...data })) },
      brainCapabilityRegenerationJob: { create: jest.fn().mockImplementation(({ data }) => ({ id: 501, ...data })) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainCapabilityRegenerationJob: { update: jest.fn().mockResolvedValue({ id: 501 }) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const publicJob = publicJobDto({ status: 'blocked', errorCode: 'business_definition_registry_failed', errorMessage: '业务口径草稿创建失败，请处理后重试。' });
    const service = new BrainGovernanceApprovalService(
      prisma as never,
      { createOrReuseDraft: jest.fn().mockRejectedValue(new Error('internal stack')) } as never,
      {} as never,
      { getPublicJob: jest.fn().mockResolvedValue(publicJob) } as never,
    );

    await expect(service.submitModificationRequirement({ releaseId: 21, requirement: '实收指标排除退款', createdBy: 9 }))
      .resolves.toMatchObject({ requestType: 'business_definition', draft: null, job: publicJob });
    expect(prisma.brainCapabilityRegenerationJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ errorCode: 'business_definition_registry_failed' }),
    }));
  });

  it('creates a natural-language capability regeneration request without exposing a JSON editor', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue({ id: 22, releaseKey: 'brain-r2', status: 'draft', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: { checksum: 'b', snapshot: { name: '客户事实' } } }] }) },
      brainResourceVersion: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 401, ...data })) },
      brainCapabilityRegenerationJob: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 501, ...data })) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue({ id: 22, releaseKey: 'brain-r2', status: 'draft', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: { checksum: 'b', snapshot: { name: '客户事实' } } }] }) },
      brainCapabilityRegenerationJob: { findUnique: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const interpreter = { interpret: jest.fn().mockResolvedValue({
      confidence: 0.96, ambiguous: false, allowedRoles: ['store_manager', 'receptionist'], additionalPermissions: [],
      redaction: 'require', readOnly: 'unchanged', confirmation: 'unchanged', rolloutPercentage: 5,
    }) };
    const publicJob = publicJobDto({ status: 'queued' });
    const regeneration = { toPublicJob: jest.fn().mockReturnValue(publicJob) };
    const service = new BrainGovernanceApprovalService(prisma as never, {} as never, interpreter as never, regeneration as never);

    const result = await service.submitModificationRequirement({
      releaseId: 22,
      requirement: '只允许店长和前台使用，客户手机号必须脱敏，先走 5% 灰度',
      createdBy: 9,
    });

    expect(tx.brainResourceVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resourceType: 'capability_change_request',
        status: 'draft',
        snapshot: expect.objectContaining({
          naturalLanguageOnly: true,
          inferredChanges: expect.objectContaining({ allowedRoles: ['store_manager', 'receptionist'], redaction: 'require', rolloutPercentage: 5 }),
        }),
      }),
    });
    expect(tx.brainCapabilityRegenerationJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        releaseId: 22,
        requestVersionId: 401,
        requirement: '只允许店长和前台使用,客户手机号必须脱敏,先走 5% 灰度',
        affectedCapabilities: ['customer_facts'],
        status: 'queued',
      }),
    });
    expect(regeneration.toPublicJob).toHaveBeenCalledWith(expect.objectContaining({ id: 501 }));
    expect(result).toMatchObject({ requestType: 'capability_regeneration', status: 'queued', job: publicJob });
    if (result.requestType !== 'capability_regeneration') throw new Error('expected capability regeneration response');
    expect(Object.keys(result.job).sort()).toEqual(Object.keys(publicJob).sort());
  });

  it('normalizes requirements and returns the same request/job after a concurrent P2002', async () => {
    const existing = {
      id: 502,
      releaseId: 22,
      requestVersionId: 402,
      status: 'queued',
      affectedCapabilities: ['customer_facts'],
      generatedResourceVersionIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      availableAt: new Date(),
      leasedAt: null,
      errorCode: null,
      errorMessage: null,
      report: null,
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue({ id: 22, releaseKey: 'brain-r2', status: 'draft', items: [{ resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: { checksum: 'b', snapshot: { name: '客户事实' } } }] }) },
      $transaction: jest.fn().mockRejectedValue({ code: 'P2002' }),
      brainCapabilityRegenerationJob: {
        findUnique: jest.fn().mockResolvedValue({ ...existing, requestVersion: { id: 402, resourceType: 'capability_change_request', resourceKey: 'regeneration.same', version: 1, status: 'draft', createdAt: new Date() } }),
      },
    };
    const interpreter = { interpret: jest.fn().mockResolvedValue({
      confidence: 0.96, ambiguous: false, allowedRoles: ['store_manager'], additionalPermissions: [],
      redaction: 'require', readOnly: 'unchanged', confirmation: 'unchanged', rolloutPercentage: null,
    }) };
    const service = new BrainGovernanceApprovalService(prisma as never, {} as never, interpreter as never, {
      toPublicJob: jest.fn().mockReturnValue(publicJobDto({ id: 502, status: 'queued' })),
    } as never);

    const result = await service.submitModificationRequirement({
      releaseId: 22,
      requirement: '  只允许店长使用\n并脱敏手机号  ',
      createdBy: 9,
    });

    expect(prisma.brainCapabilityRegenerationJob.findUnique).toHaveBeenCalledWith({
      where: { idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/) },
      include: { requestVersion: true },
    });
    expect(result).toMatchObject({ requestType: 'capability_regeneration', job: { id: 502 }, request: { id: 402 } });
  });

  it('creates a blocked review job when multiple release capabilities cannot be uniquely selected', async () => {
    const items = [
      { resourceVersionId: 11, resourceType: 'skill', resourceKey: 'customer_facts', resourceVersion: { checksum: 'a', snapshot: { name: '客户事实' } } },
      { resourceVersionId: 12, resourceType: 'skill', resourceKey: 'product_sales_ranking', resourceVersion: { checksum: 'b', snapshot: { name: '商品销售排行' } } },
    ];
    const release = { id: 22, releaseKey: 'brain-r2', status: 'draft', items };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainResourceVersion: { create: jest.fn().mockImplementation(({ data }) => ({ id: 401, ...data })) },
      brainCapabilityRegenerationJob: { create: jest.fn().mockImplementation(({ data }) => ({ id: 501, ...data })) },
    };
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(release) },
      brainCapabilityRegenerationJob: { findUnique: jest.fn() },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const publicJob = publicJobDto({ status: 'blocked', errorCode: 'affected_capability_ambiguous', errorMessage: '无法唯一确定需要修改的能力。' });
    const service = new BrainGovernanceApprovalService(prisma as never, {} as never, {
      interpret: jest.fn().mockResolvedValue({ confidence: 0.99, ambiguous: false, allowedRoles: ['store_manager'], additionalPermissions: [], redaction: 'unchanged', readOnly: 'unchanged', confirmation: 'unchanged', rolloutPercentage: null }),
    } as never, { toPublicJob: jest.fn().mockReturnValue(publicJob) } as never);

    const result = await service.submitModificationRequirement({ releaseId: 22, requirement: '只允许店长使用', createdBy: 9 });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.brainCapabilityRegenerationJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      releaseFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      affectedCapabilities: [], status: 'blocked', errorCode: 'affected_capability_ambiguous',
    }) });
    expect(result).toMatchObject({ status: 'blocked', job: publicJob });
  });
});

function publicJobDto(overrides: Record<string, unknown> = {}) {
  return {
    id: 501, releaseId: 22, status: 'queued', progress: 0, affectedCapabilities: ['customer_facts'],
    staticGatesPassed: 0, contractCompileSecurity: [], risk: {}, blockingReasons: [], generatedResourceVersionIds: [],
    errorCode: null, errorMessage: null, availableAt: null, leasedAt: null, completedAt: null, createdAt: null, updatedAt: null,
    retryable: false, nextAction: 'none',
    ...overrides,
  };
}
