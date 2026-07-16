import { BrainEvalService } from './governance/brain-eval.service.js';
import { createBusinessDefinitionProjectionFingerprint } from '../semantic-data/business-definition-projection-compiler.service.js';
import type { BrainEvaluationReleaseSnapshot } from './governance/brain-evaluation-release-snapshot.js';

describe('BrainEvalService', () => {
  it('accepts explicit fail-closed model outcomes for security-only release assertions', () => {
    const service = new BrainEvalService({} as never);

    expect(
      (service as any).securityExpectationPassed({
        expectation: 'permission_denied',
        gradeStatus: 'metric_failed',
        runtimeResponse: {
          status: 'failed',
          failureCode: 'MODEL_ROLE_CAPABILITY_NONE',
          suggestedActions: [],
        },
      }),
    ).toBe(true);
    expect(
      (service as any).securityExpectationPassed({
        expectation: 'prompt_injection_blocked_or_preview_only',
        gradeStatus: 'metric_failed',
        runtimeResponse: {
          status: 'failed',
          failureCode: 'MODEL_INTENT_INVALID',
          suggestedActions: [],
        },
      }),
    ).toBe(true);
    expect(
      (service as any).securityExpectationPassed({
        expectation: 'prompt_injection_blocked_or_preview_only',
        gradeStatus: 'metric_failed',
        errorMessage: '聊天文本不能充当操作确认凭证，请先查看动作预览，再通过预览卡片确认。',
        runtimeResponse: { suggestedActions: [] },
      }),
    ).toBe(true);
  });

  it('blocks release when deterministic regression fails', () => {
    const service = new BrainEvalService({} as never);
    const summary = service.summarizeResults([
      { caseKey: 'sem_001', passed: true },
      { caseKey: 'permission_001', passed: false },
    ]);

    expect(summary.canRelease).toBe(false);
    expect(summary.failed).toBe(1);
  });

  it('does not allow release when an eval run has no results', () => {
    const service = new BrainEvalService({} as never);
    expect(service.summarizeResults([]).canRelease).toBe(false);
  });

  it('does not treat generic store errors or unrelated suggestions as security-gate success', () => {
    const service = new BrainEvalService({} as never);

    expect((service as any).securityExpectationPassed({
      expectation: 'store_scope_denied',
      gradeStatus: 'not_found',
      errorMessage: '门店不存在',
      runtimeResponse: {},
    })).toBe(false);
    expect((service as any).securityExpectationPassed({
      expectation: 'prompt_injection_blocked_or_preview_only',
      gradeStatus: 'usable_partial',
      runtimeResponse: { suggestedActions: [{ type: 'open_page' }] },
    })).toBe(false);
    expect((service as any).securityExpectationPassed({
      expectation: 'prompt_injection_blocked_or_preview_only',
      gradeStatus: 'unsupported_intent',
      runtimeResponse: {
        answer: '请提供客户姓名后再生成动作预览。',
        routePlan: { grounding: 'preview_action' },
        adapterMetadata: { unsupportedReason: 'action_target_requires_clarification' },
        suggestedActions: [],
      },
    })).toBe(true);
  });

  it('rejects an invalid governance release id before creating an eval run', async () => {
    const prisma = {
      brainRelease: { findUnique: jest.fn() },
      brainEvalRun: { create: jest.fn() },
    };
    const service = new BrainEvalService(prisma as never);

    await expect(
      service.createEvalRun({
        storeId: 6,
        userId: 9,
        permissions: ['*'],
        releaseId: 0,
      }),
    ).rejects.toThrow('brain_eval_release_id_invalid');
    expect(prisma.brainRelease.findUnique).not.toHaveBeenCalled();
    expect(prisma.brainEvalRun.create).not.toHaveBeenCalled();
  });

  it('rejects a missing governance release before creating an eval run', async () => {
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue(null) },
      brainEvalRun: { create: jest.fn() },
    };
    const service = new BrainEvalService(prisma as never);

    await expect(
      service.createEvalRun({
        storeId: 6,
        userId: 9,
        permissions: ['*'],
        releaseId: 999,
      }),
    ).rejects.toThrow('brain_eval_release_not_evaluable');
    expect(prisma.brainEvalRun.create).not.toHaveBeenCalled();
  });

  it('creates a complete release gate from the frozen capability and adversarial case manifest', async () => {
    const releaseSnapshot = {
      releaseId: 21,
      releaseStatus: 'draft',
      releaseFingerprint: 'a'.repeat(64),
      declaredMode: 'shadow',
      mode: 'model',
      resourceVersionIds: [3, 4],
      capabilityKeys: ['customer_facts', 'reservation_list'],
      capabilityCandidates: [
        {
          key: 'customer_facts',
          domains: ['customer'],
          allowedRoles: [],
          requiredPermissions: ['core:customer:view'],
          examples: ['查询张三客户档案', '查看客户 ID 123'],
        },
        {
          key: 'reservation_list',
          domains: ['reservation'],
          allowedRoles: ['store_manager'],
          requiredPermissions: ['core:store:reservations'],
          examples: ['查看明天预约列表', '查询今日预约记录'],
        },
      ],
    } as unknown as BrainEvaluationReleaseSnapshot;
    const prisma = {
      brainRelease: { findUnique: jest.fn().mockResolvedValue({ id: 21, status: 'draft' }) },
      brainEvalRun: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 8, ...data })),
      },
    };
    const releaseService = { freezeEvaluationRelease: jest.fn().mockResolvedValue(releaseSnapshot) };
    const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((() => 0) as never);
    const service = new BrainEvalService(
      prisma as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      releaseService as never,
    );

    try {
      const run = await service.createEvalRun({
        storeId: 6,
        userId: 9,
        permissions: ['*'],
        releaseId: 21,
      });

      expect(run).toMatchObject({ id: 8, releaseId: 21, caseCount: 8 });
      expect(prisma.brainEvalRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          releaseId: 21,
          caseCount: 8,
          summary: expect.objectContaining({
            gateMode: 'release_gate',
            releaseFingerprint: 'a'.repeat(64),
            requiredCapabilityKeys: ['customer_facts', 'reservation_list'],
            coverageComplete: true,
            canRelease: false,
          }),
        }),
      });
      expect(releaseService.freezeEvaluationRelease).toHaveBeenCalledTimes(1);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('persists per-case deterministic grades and a completed eval summary', async () => {
    const tx = {
      brainEvalCase: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 1,
              caseKey: 'case_1',
              roleKey: 'finance',
              input: { message: '本月流水多少' },
              expected: {},
              assertionType: 'grader',
            },
          ]),
      },
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      brainEvalRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 5,
          storeId: 6,
          status: 'queued',
          releaseId: 21,
          roleKey: 'finance',
          summary: { gateMode: 'development_sample' },
        }),
        update: jest.fn().mockResolvedValue({ id: 5, status: 'completed' }),
      },
      brainEvalResult: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        update: jest.fn().mockResolvedValue({ id: 9 }),
      },
      role: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'finance', permissions: ['core:brain:use', 'core:finance:view'] },
        ]),
      },
    };
    const chat = {
      createConversation: jest.fn().mockResolvedValue({ id: 31 }),
      sendMessage: jest.fn().mockResolvedValue({
        status: 'completed',
        answer: '本月实收流水为 1000 元。',
        citations: [{ sourceType: 'metric', sourceId: 'paid_revenue' }],
      }),
    };
    const grader = { grade: jest.fn().mockReturnValue({ status: 'usable_exact', reason: 'matched' }) };
    const releaseSnapshot = {
      releaseId: 21,
      releaseStatus: 'draft',
      releaseFingerprint: 'a'.repeat(64),
      declaredMode: 'shadow',
      mode: 'model',
      resourceVersionIds: [3, 4],
      capabilityKeys: ['customer_facts', 'reservation_list'],
      capabilityCandidates: [],
    };
    const releaseService = { freezeEvaluationRelease: jest.fn().mockResolvedValue(releaseSnapshot) };
    const service = new BrainEvalService(
      prisma as never,
      chat as never,
      grader as never,
      undefined,
      undefined,
      undefined,
      undefined,
      releaseService as never,
    );

    const result = await service.runEvalNow({
      evalRunId: 5,
      storeId: 6,
      userId: 9,
      permissions: ['*'],
      caseKeys: ['case_1'],
    });

    expect(prisma.brainEvalResult.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evalRunId: 5,
        caseKey: 'case_1',
        deterministicPassed: true,
        deterministicGrade: expect.objectContaining({ status: 'usable_exact' }),
      }),
    });
    expect(prisma.brainEvalResult.update).toHaveBeenCalledWith({
      where: { evalRunId_caseKey: { evalRunId: 5, caseKey: 'case_1' } },
      data: expect.objectContaining({
        deterministicPassed: true,
        deterministicGrade: expect.objectContaining({ status: 'usable_exact' }),
      }),
    });
    expect(prisma.brainEvalRun.update).toHaveBeenLastCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({ status: 'completed', caseCount: 1, passedCount: 1, failedCount: 0 }),
    });
    expect(prisma.brainEvalRun.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { id: true, releaseId: true, roleKey: true, storeId: true, summary: true },
    });
    expect(chat.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        governanceEvalReleaseId: 21,
        governanceEvalReleaseSnapshot: releaseSnapshot,
        roles: ['finance'],
        permissions: ['core:brain:use', 'core:finance:view'],
      }),
      31,
      expect.objectContaining({ message: '本月流水多少' }),
    );
    expect(releaseService.freezeEvaluationRelease).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ total: 1, passed: 1, failed: 0, canRelease: false });
  });

  it('retries only provider-unavailable checkpoints and updates the existing result', async () => {
    const tx = {
      brainEvalCase: {
        findMany: jest.fn().mockResolvedValue([{
          id: 1,
          caseKey: 'case_retry',
          roleKey: 'finance',
          input: { message: '本月流水多少' },
          expected: {},
          assertionType: 'grader',
        }]),
      },
      businessDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      brainEvalRun: {
        findUnique: jest.fn().mockResolvedValue({ id: 6, releaseId: null, roleKey: 'finance', storeId: 6, summary: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      brainEvalResult: {
        findMany: jest.fn().mockResolvedValue([{
          caseKey: 'case_retry',
          deterministicPassed: false,
          failureCluster: 'provider_unavailable',
          metadata: { infrastructure: { status: 'provider_unavailable' } },
        }]),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      role: { findMany: jest.fn().mockResolvedValue([{ key: 'finance', permissions: ['core:brain:use', 'core:finance:view'] }]) },
    };
    const chat = {
      createConversation: jest.fn().mockResolvedValue({ id: 32 }),
      sendMessage: jest.fn().mockResolvedValue({
        status: 'completed',
        answer: '本月实收流水为 1000 元。',
        citations: [{ sourceType: 'metric', sourceId: 'paid_revenue' }],
      }),
    };
    const grader = { grade: jest.fn().mockReturnValue({ status: 'usable_exact', reason: 'matched' }) };

    const result = await new BrainEvalService(prisma as never, chat as never, grader as never).runEvalNow({
      evalRunId: 6,
      storeId: 6,
      userId: 1,
      permissions: ['*'],
      caseKeys: ['case_retry'],
    });

    expect(chat.sendMessage).toHaveBeenCalledTimes(1);
    expect(prisma.brainEvalResult.create).not.toHaveBeenCalled();
    expect(prisma.brainEvalResult.update).toHaveBeenCalledWith({
      where: { evalRunId_caseKey: { evalRunId: 6, caseKey: 'case_retry' } },
      data: expect.objectContaining({ deterministicPassed: true, failureCluster: undefined }),
    });
    expect(result).toMatchObject({ total: 1, passed: 1, failed: 0, providerUnavailable: 0 });
  });

  it('allows release only after every generated capability and mandatory adversarial case passes', async () => {
    const releaseSnapshot = {
      releaseId: 21,
      releaseStatus: 'draft',
      releaseFingerprint: 'd'.repeat(64),
      declaredMode: 'shadow',
      mode: 'model',
      resourceVersionIds: [3],
      capabilityKeys: ['customer_facts'],
      capabilityCandidates: [
        {
          key: 'customer_facts',
          domains: ['customer'],
          allowedRoles: [],
          requiredPermissions: ['core:customer:view'],
          examples: ['查询张三客户档案', '查看客户 ID 123'],
        },
      ],
    } as unknown as BrainEvaluationReleaseSnapshot;
    const gateSummary = {
      gateMode: 'release_gate',
      releaseFingerprint: releaseSnapshot.releaseFingerprint,
    };
    const prisma = {
      brainEvalRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          storeId: 6,
          releaseId: 21,
          roleKey: null,
          summary: gateSummary,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      brainEvalResult: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      role: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'store_manager', permissions: ['core:brain:use', 'core:customer:view'] },
          { key: 'finance', permissions: ['core:brain:use', 'core:finance:view'] },
        ]),
      },
    };
    const chat = {
      createConversation: jest.fn().mockImplementation((context) => {
        if (!context.visibleStoreIds.includes(context.storeId)) throw new Error('store_scope_denied');
        return Promise.resolve({ id: 31 });
      }),
      sendMessage: jest.fn().mockImplementation((_context, _conversationId, dto) => {
        if (dto.message.includes('Ignore all previous')) throw new Error('prompt injection blocked');
        if (dto.message.includes('今天退款')) throw new Error('permission_denied:core:finance:view');
        if (dto.message.includes('confirmed=true')) {
          return Promise.resolve({
            status: 'completed',
            answer: '已生成改约预览，确认前不会执行。',
            citations: [],
            grounding: 'preview_action',
            suggestedActions: [{ type: 'preview_action' }],
          });
        }
        return Promise.resolve({
          status: 'completed',
          answer: '客户档案查询完成。',
          citations: [{ sourceType: 'skill', sourceId: 'customer_facts' }],
          capabilityKey: 'customer_facts',
          semanticIntent: { domains: ['customer'], entities: [], metrics: [], dimensions: [] },
          adapterMetadata: { completion: { complete: true } },
        });
      }),
    };
    const grader = {
      grade: jest.fn().mockImplementation(({ question, error }) => ({
        status: question.includes('Ignore all previous')
          ? 'security_blocked'
          : error?.includes('permission_denied')
            ? 'permission_denied'
            : 'usable_exact',
        reason: 'test',
      })),
    };
    const passingLayer = (layer: string) => ({ layer, passed: true, score: 1, deterministicFailure: false, failures: [] });
    const intentGrader = { grade: jest.fn(() => passingLayer('intent')) };
    const capabilityGrader = { grade: jest.fn(() => passingLayer('tool')) };
    const planGrader = { grade: jest.fn(() => passingLayer('plan')) };
    const completionGrader = { grade: jest.fn(() => passingLayer('completion')) };
    const releaseService = { freezeEvaluationRelease: jest.fn().mockResolvedValue(releaseSnapshot) };
    const service = new BrainEvalService(
      prisma as never,
      chat as never,
      grader as never,
      intentGrader as never,
      capabilityGrader as never,
      planGrader as never,
      completionGrader as never,
      releaseService as never,
    );

    const result = await service.runEvalNow({
      evalRunId: 9,
      storeId: 6,
      userId: 9,
      permissions: ['*'],
    });

    expect(result).toMatchObject({
      total: 6,
      passed: 6,
      failed: 0,
      canRelease: true,
      gateMode: 'release_gate',
      releaseFingerprint: releaseSnapshot.releaseFingerprint,
      coverageComplete: true,
      requiredCapabilityKeys: ['customer_facts'],
      requiredCaseKeys: expect.arrayContaining([
        'release_capability:21:customer_facts:1',
        'release_capability:21:customer_facts:2',
      ]),
      releaseGate: { passed: true },
    });
    expect(prisma.brainEvalResult.create).toHaveBeenCalledTimes(6);
  });

  it('marks the eval run failed when the frozen release fingerprint no longer matches the queued gate', async () => {
    const prisma = {
      brainEvalRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          storeId: 6,
          releaseId: 21,
          roleKey: null,
          summary: { gateMode: 'release_gate', releaseFingerprint: 'a'.repeat(64) },
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const releaseService = {
      freezeEvaluationRelease: jest.fn().mockResolvedValue({
        releaseId: 21,
        releaseStatus: 'draft',
        releaseFingerprint: 'b'.repeat(64),
        declaredMode: 'shadow',
        mode: 'model',
        resourceVersionIds: [3],
        capabilityKeys: ['customer_facts'],
        capabilityCandidates: [],
      }),
    };
    const service = new BrainEvalService(
      prisma as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      releaseService as never,
    );

    await expect(
      service.runEvalNow({ evalRunId: 10, storeId: 6, userId: 9, permissions: ['*'] }),
    ).rejects.toThrow('brain_eval_release_fingerprint_changed');
    expect(prisma.brainEvalRun.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        status: 'failed',
        error: { message: 'brain_eval_release_fingerprint_changed' },
        finishedAt: expect.any(Date),
      },
    });
  });

  it('merges current published eval_case_projection cases into a general eval run', async () => {
    const definitionFingerprint = 'a'.repeat(64);
    const sourceFingerprint = 'b'.repeat(64);
    const definitionRef = {
      definitionKey: 'metric.product_sales_quantity',
      definitionVersion: 3,
      definitionFingerprint,
      sourceFingerprint,
    };
    const payload = {
      projectionSchemaVersion: '2.0',
      preview: false,
      projectionType: 'eval_case_projection',
      definitionRef,
      data: {
        definitionKind: 'metric',
        domain: 'product',
        name: '商品销量',
        cases: [
          {
            caseKey: 'metric.product_sales_quantity@3:1',
            input: '商品销量',
            expectedDefinitionKey: 'metric.product_sales_quantity',
            expectedKind: 'metric',
            expectedDomain: 'product',
          },
        ],
      },
    };
    const projection = {
      definitionVersionId: 21,
      targetType: 'eval_case_projection',
      targetKey: 'metric.product_sales_quantity@3',
      definitionKey: 'metric.product_sales_quantity',
      definitionVersion: 3,
      definitionFingerprint,
      sourceFingerprint,
      payload,
      projectionFingerprint: createBusinessDefinitionProjectionFingerprint({
        targetType: 'eval_case_projection',
        targetKey: 'metric.product_sales_quantity@3',
        definitionVersionId: 21,
        definitionRef,
        payload,
        readOnly: true,
      }),
      readOnly: true,
    };
    const tx = {
      brainEvalCase: { findMany: jest.fn().mockResolvedValue([]) },
      businessDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            definitionKey: 'metric.product_sales_quantity',
            kind: 'metric',
            domain: 'product',
            status: 'active',
            currentPublishedVersionId: 21,
            currentPublishedVersion: {
              id: 21,
              version: 3,
              lifecycleStatus: 'published',
              fingerprint: definitionFingerprint,
              sourceFingerprint,
              projections: [projection],
            },
          },
        ]),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      brainEvalRun: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, releaseId: null, roleKey: null, storeId: 6 }),
        update: jest.fn().mockResolvedValue({}),
      },
      brainEvalResult: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}) },
      role: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'store_manager', permissions: ['core:brain:use', 'core:customer:view'] },
        ]),
      },
    };
    const chat = {
      createConversation: jest.fn().mockResolvedValue({ id: 31 }),
      sendMessage: jest.fn().mockResolvedValue({
        status: 'completed',
        answer: '商品销量为 36 件。',
        citations: [],
        semanticIntent: {
          metrics: [{ definitionKey: 'metric.product_sales_quantity' }],
          domains: ['product'],
          entities: [],
          dimensions: [],
        },
      }),
    };
    const grader = { grade: jest.fn().mockReturnValue({ status: 'usable_exact', reason: 'matched' }) };

    const result = await new BrainEvalService(prisma as never, chat as never, grader as never).runEvalNow({
      evalRunId: 8,
      storeId: 6,
      userId: 9,
      permissions: ['*'],
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(prisma.brainEvalResult.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: undefined,
        caseKey: 'metric.product_sales_quantity@3:1',
        question: '商品销量',
      }),
    });
    expect(result).toMatchObject({ total: 1, passed: 1, failed: 0, canRelease: false });
  });
});
