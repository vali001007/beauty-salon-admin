import { ForbiddenException } from '@nestjs/common';
import { BusinessSemanticEvidenceService } from '../../semantic-data/business-semantic-evidence.service.js';
import { BrainFeedbackService } from './brain-feedback.service.js';

describe('BrainFeedbackService semantic correction safety', () => {
  const metricRef = {
    definitionType: 'metric',
    definitionKey: 'appointment_count',
    definitionVersion: 5,
    definitionFingerprint: 'c'.repeat(64),
    sourceFingerprint: 'd'.repeat(64),
  };
  const completedRun = () => ({
    id: 77,
    userId: 9,
    storeId: 2,
    status: 'completed',
    input: { message: '看一下到店人数' },
    output: {
      semanticIntent: {
        entities: [],
        metrics: [metricRef],
        dimensions: [],
        filters: [],
        orderBy: [],
      },
    },
  });
  const createPrisma = () => {
    const brainRun = { findFirst: jest.fn() };
    const brainFeedback = { create: jest.fn() };
    const tx = { brainRun, brainFeedback };
    return {
      brainRun,
      brainFeedback,
      tx,
      $transaction: jest.fn((operation) => operation(tx)),
    };
  };

  it('rejects feedback when the run does not belong to the same user and store', async () => {
    const prisma = createPrisma();
    prisma.brainRun.findFirst.mockResolvedValue(null);
    prisma.brainFeedback.create.mockResolvedValue({ id: 1 });
    const service = new (BrainFeedbackService as any)(prisma, { captureStructuredCorrection: jest.fn() });

    await expect(
      service.createFeedback({ runId: 77, userId: 9, storeId: 2, rating: 'helpful' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.brainFeedback.create).not.toHaveBeenCalled();
  });

  it('passes the historical definition ref from the completed run even after the current registry changes', async () => {
    const prisma = createPrisma();
    prisma.brainRun.findFirst.mockResolvedValue(completedRun());
    prisma.brainFeedback.create.mockResolvedValue({ id: 11, status: 'open' });
    const semanticEvidence = {
      captureStructuredCorrectionWithClient: jest.fn().mockResolvedValue({ evidenceId: 5 }),
    };
    const service = new (BrainFeedbackService as any)(prisma, semanticEvidence);

    await service.createFeedback({
      runId: 77,
      userId: 9,
      storeId: 2,
      rating: 'corrected',
      correction: {
        definitionType: 'metric',
        definitionKey: 'appointment_count',
        alias: '到店人数',
        contactEmail: 'owner@example.com',
        contactPhone: '13800138000',
        contactLandline: '0755-12345678',
        wechat: '微信号 wx_Ami2026',
      },
    });

    expect(prisma.brainRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 77, userId: 9, storeId: 2 },
        select: expect.objectContaining({ output: true }),
      }),
    );
    expect(semanticEvidence.captureStructuredCorrectionWithClient).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'feedback_correction',
        runId: 77,
        userId: 9,
        storeId: 2,
        definitionType: 'metric',
        definitionKey: 'appointment_count',
        alias: '到店人数',
        confidence: 0.99,
        question: '看一下到店人数',
        definitionVersion: 5,
        definitionFingerprint: 'c'.repeat(64),
        sourceFingerprint: 'd'.repeat(64),
      }),
      prisma.tx,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const persistedCorrection = JSON.stringify(prisma.brainFeedback.create.mock.calls[0][0].data.correction);
    expect(persistedCorrection).not.toMatch(
      /owner@example\.com|13800138000|0755-12345678|wx_Ami2026/,
    );
  });

  it.each([
    [
      'dimension ref',
      {
        definitionType: 'dimension',
        definitionKey: 'store',
        definitionVersion: 3,
        definitionFingerprint: '3'.repeat(64),
        sourceFingerprint: '4'.repeat(64),
      },
      (ref: object) => ({ entities: [], metrics: [], dimensions: [ref], filters: [], orderBy: [] }),
    ],
    [
      'filter fieldRef',
      {
        definitionType: 'field',
        definitionKey: 'store_id',
        definitionVersion: 4,
        definitionFingerprint: '5'.repeat(64),
        sourceFingerprint: '6'.repeat(64),
      },
      (ref: object) => ({
        entities: [], metrics: [], dimensions: [],
        filters: [{ fieldRef: ref, operator: 'eq', value: 2 }],
        orderBy: [],
      }),
    ],
    [
      'orderBy definitionRef',
      {
        definitionType: 'metric',
        definitionKey: 'paid_amount',
        definitionVersion: 7,
        definitionFingerprint: '7'.repeat(64),
        sourceFingerprint: '8'.repeat(64),
      },
      (ref: object) => ({
        entities: [], metrics: [], dimensions: [], filters: [],
        orderBy: [{ definitionRef: ref, direction: 'desc' }],
      }),
    ],
  ])('resolves a correction ref from %s', async (_label, ref, buildIntent) => {
    const prisma = createPrisma();
    prisma.brainRun.findFirst.mockResolvedValue({
      ...completedRun(),
      output: { semanticIntent: buildIntent(ref) },
    });
    prisma.brainFeedback.create.mockResolvedValue({ id: 11, status: 'open' });
    const semanticEvidence = {
      captureStructuredCorrectionWithClient: jest.fn().mockResolvedValue({ evidenceId: 5 }),
    };
    const service = new (BrainFeedbackService as any)(prisma, semanticEvidence);

    await service.createFeedback({
      runId: 77,
      userId: 9,
      storeId: 2,
      rating: 'corrected',
      correction: {
        definitionType: ref.definitionType,
        definitionKey: ref.definitionKey,
        alias: ref.definitionType === 'entity' ? '张三客户' : '门店口径',
      },
    });

    expect(semanticEvidence.captureStructuredCorrectionWithClient).toHaveBeenCalledWith(
      expect.objectContaining(ref),
      prisma.tx,
    );
  });

  it.each([
    ['customer definition key', 'customer', 'account', '张三客户'],
    ['person entity type', 'front_desk_role', 'receptionist', '李四前台'],
  ])('rejects runtime aliases for person entities identified by %s', async (_label, definitionKey, entityType, alias) => {
    const prisma = createPrisma();
    const definitionRef = {
      definitionType: 'entity',
      definitionKey,
      definitionVersion: 2,
      definitionFingerprint: '1'.repeat(64),
      sourceFingerprint: '2'.repeat(64),
    };
    prisma.brainRun.findFirst.mockResolvedValue({
      ...completedRun(),
      output: {
        semanticIntent: {
          entities: [{ entityType, mention: alias.slice(0, 2), source: 'user', confidence: 0.99, definitionRef }],
          metrics: [], dimensions: [], filters: [], orderBy: [],
        },
      },
    });
    const semanticEvidence = {
      captureStructuredCorrectionWithClient: jest.fn(),
    };
    const service = new (BrainFeedbackService as any)(prisma, semanticEvidence);

    await expect(service.createFeedback({
      runId: 77,
      userId: 9,
      storeId: 2,
      rating: 'corrected',
      correction: {
        definitionType: 'entity',
        definitionKey,
        alias,
      },
    })).rejects.toThrow('person_entity_runtime_alias_forbidden');

    expect(semanticEvidence.captureStructuredCorrectionWithClient).not.toHaveBeenCalled();
    expect(prisma.brainFeedback.create).not.toHaveBeenCalled();
  });

  it('does not write feedback when semantic correction evidence capture fails', async () => {
    const prisma = createPrisma();
    prisma.brainRun.findFirst.mockResolvedValue(completedRun());
    prisma.brainFeedback.create.mockResolvedValue({ id: 11, status: 'open' });
    const semanticEvidence = {
      captureStructuredCorrectionWithClient: jest.fn().mockRejectedValue(new Error('evidence unavailable')),
    };
    const service = new (BrainFeedbackService as any)(prisma, semanticEvidence);

    await expect(
      service.createFeedback({
        runId: 77,
        userId: 9,
        storeId: 2,
        rating: 'corrected',
        correction: {
          definitionType: 'metric',
          definitionKey: 'appointment_count',
          alias: '到店人数',
        },
      }),
    ).rejects.toThrow('evidence unavailable');
    expect(prisma.brainFeedback.create).not.toHaveBeenCalled();
  });

  it('rolls back staged evidence when feedback create fails and uses the same transaction client', async () => {
    const committedEvidence: unknown[] = [];
    const stagedEvidence: unknown[] = [];
    const definitionVersion = {
      id: 32,
      definitionId: 12,
      version: 5,
      fingerprint: 'c'.repeat(64),
      sourceFingerprint: 'd'.repeat(64),
      lifecycleStatus: 'published',
    };
    const definition = {
      id: 12,
      kind: 'metric',
      definitionKey: 'appointment_count',
      currentPublishedVersion: definitionVersion,
      versions: [definitionVersion],
    };
    const run = completedRun();
    const root = {
      brainRun: { findFirst: jest.fn().mockResolvedValue(run) },
      businessDefinitionVersion: {
        findFirst: jest.fn().mockResolvedValue({ ...definitionVersion, definition }),
      },
      businessSemanticEvidence: {
        upsert: jest.fn(({ create }) => {
          committedEvidence.push(create);
          return Promise.resolve({ id: 1, ...create });
        }),
      },
      brainEvalCase: { upsert: jest.fn() },
      brainFeedback: { create: jest.fn().mockRejectedValue(new Error('feedback insert failed')) },
    };
    const tx = {
      brainRun: { findFirst: jest.fn().mockResolvedValue(run) },
      businessDefinitionVersion: {
        findFirst: jest.fn().mockResolvedValue({ ...definitionVersion, definition }),
      },
      businessSemanticEvidence: {
        upsert: jest.fn(({ create }) => {
          stagedEvidence.push(create);
          return Promise.resolve({ id: 1, ...create });
        }),
      },
      brainEvalCase: { upsert: jest.fn() },
      brainFeedback: { create: jest.fn().mockRejectedValue(new Error('feedback insert failed')) },
    };
    const prisma = {
      ...root,
      $transaction: jest.fn(async (operation) => {
        const checkpoint = stagedEvidence.length;
        try {
          return await operation(tx);
        } catch (error) {
          stagedEvidence.splice(checkpoint);
          throw error;
        }
      }),
    };
    const semanticEvidence = new BusinessSemanticEvidenceService(prisma as never);
    const service = new BrainFeedbackService(prisma as never, semanticEvidence);

    await expect(
      service.createFeedback({
        runId: 77,
        userId: 9,
        storeId: 2,
        rating: 'corrected',
        correction: {
          definitionType: 'metric',
          definitionKey: 'appointment_count',
          alias: '到店人数',
        },
      }),
    ).rejects.toThrow('feedback insert failed');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.businessSemanticEvidence.upsert).toHaveBeenCalledTimes(1);
    expect(tx.brainFeedback.create).toHaveBeenCalledTimes(1);
    expect(root.businessSemanticEvidence.upsert).not.toHaveBeenCalled();
    expect(root.brainFeedback.create).not.toHaveBeenCalled();
    expect(stagedEvidence).toEqual([]);
    expect(committedEvidence).toEqual([]);
  });

  it.each([
    [
      'no semantic intent',
      { ...completedRun(), output: {} },
      'brain_feedback_correction_definition_ref_missing',
    ],
    [
      'a missing definition key',
      {
        ...completedRun(),
        output: {
          semanticIntent: {
            entities: [],
            metrics: [{ ...metricRef, definitionKey: 'another_metric' }],
            dimensions: [],
            filters: [],
            orderBy: [],
          },
        },
      },
      'brain_feedback_correction_definition_ref_missing',
    ],
    [
      'incomplete lineage',
      {
        ...completedRun(),
        output: {
          semanticIntent: {
            entities: [],
            metrics: [{
              definitionType: 'metric',
              definitionKey: 'appointment_count',
              definitionVersion: 5,
              definitionFingerprint: 'c'.repeat(64),
            }],
            dimensions: [],
            filters: [],
            orderBy: [],
          },
        },
      },
      'brain_feedback_correction_definition_ref_incomplete',
    ],
    [
      'ambiguous conflicting lineage',
      {
        ...completedRun(),
        output: {
          semanticIntent: {
            entities: [],
            metrics: [metricRef],
            dimensions: [],
            filters: [],
            orderBy: [{
              definitionRef: {
                ...metricRef,
                definitionVersion: 6,
                definitionFingerprint: 'e'.repeat(64),
                sourceFingerprint: 'f'.repeat(64),
              },
              direction: 'desc',
            }],
          },
        },
      },
      'brain_feedback_correction_definition_ref_ambiguous',
    ],
  ])('rejects structured correction when run semantic intent has %s', async (_label, run, errorCode) => {
    const prisma = createPrisma();
    prisma.brainRun.findFirst.mockResolvedValue(run);
    const semanticEvidence = { captureStructuredCorrectionWithClient: jest.fn() };
    const service = new (BrainFeedbackService as any)(prisma, semanticEvidence);

    await expect(service.createFeedback({
      runId: 77,
      userId: 9,
      storeId: 2,
      rating: 'corrected',
      correction: {
        definitionType: 'metric',
        definitionKey: 'appointment_count',
        alias: '到店人数',
      },
    })).rejects.toThrow(errorCode);

    expect(semanticEvidence.captureStructuredCorrectionWithClient).not.toHaveBeenCalled();
    expect(prisma.brainFeedback.create).not.toHaveBeenCalled();
  });

  it('allows ordinary helpful feedback without semantic intent when no correction is provided', async () => {
    const prisma = createPrisma();
    prisma.brainRun.findFirst.mockResolvedValue({ ...completedRun(), output: null });
    prisma.brainFeedback.create.mockResolvedValue({ id: 12, rating: 'helpful' });
    const semanticEvidence = { captureStructuredCorrectionWithClient: jest.fn() };
    const service = new (BrainFeedbackService as any)(prisma, semanticEvidence);

    await expect(service.createFeedback({
      runId: 77,
      userId: 9,
      storeId: 2,
      rating: 'helpful',
    })).resolves.toEqual({ id: 12, rating: 'helpful' });

    expect(semanticEvidence.captureStructuredCorrectionWithClient).not.toHaveBeenCalled();
    expect(prisma.brainFeedback.create).toHaveBeenCalledTimes(1);
  });
});

describe('BrainFeedbackService governance reads', () => {
  it('returns only the current user and store needs-improvement feedback with its original run content', async () => {
    const prisma = {
      brainFeedback: {
        findMany: jest.fn().mockResolvedValue([
          { id: 31, runId: 77, status: 'open', createdAt: new Date('2026-07-22T01:00:00.000Z') },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      brainRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 77,
            conversationId: 42,
            status: 'completed',
            input: { message: '本周营业额' },
            output: { answer: '当前能力未返回营业额。' },
          },
        ]),
      },
    };
    const service = new BrainFeedbackService(prisma as never, {} as never);

    await expect(
      service.listUserIssues({ storeId: 6, userId: 9, page: 2, pageSize: 10 }),
    ).resolves.toMatchObject({
      items: [
        {
          feedbackId: 31,
          runId: 77,
          conversationId: 42,
          question: '本周营业额',
          answer: '当前能力未返回营业额。',
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
      storeId: 6,
    });
    expect(prisma.brainFeedback.findMany).toHaveBeenCalledWith({
      where: { storeId: 6, userId: 9, rating: 'needs_improvement' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
      select: { id: true, runId: true, status: true, createdAt: true },
    });
    expect(prisma.brainRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [77] }, storeId: 6, userId: 9 },
      }),
    );
  });

  it('uses bounded lightweight reads for dashboard metrics', async () => {
    const prisma = {
      brainRun: { findMany: jest.fn().mockResolvedValue([{ status: 'completed', latencyMs: 120 }]) },
      brainFeedback: { findMany: jest.fn().mockResolvedValue([{ rating: 'helpful' }]) },
      brainActionExecution: { findMany: jest.fn().mockResolvedValue([{ status: 'succeeded' }]) },
      brainInspectionFinding: { findMany: jest.fn().mockResolvedValue([{ status: 'closed', disposition: 'adopted', feedback: null }]) },
      brainEvalRun: { findFirst: jest.fn().mockResolvedValue({ summary: { canRelease: true } }) },
    };
    const service = new BrainFeedbackService(prisma as never, {} as never);

    await expect(service.getDashboard({ storeId: 6 })).resolves.toMatchObject({
      runCount: 1,
      helpfulRate: 1,
      actionSuccessRate: 1,
      latestEvalSummary: { canRelease: true },
    });
    expect(prisma.brainRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { status: true, latencyMs: true },
      take: 1000,
    }));
    expect(prisma.brainEvalRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: { summary: true },
    }));
  });

  it('bounds the feedback list shown by the management console', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainFeedbackService({ brainFeedback: { findMany } } as never, {} as never);

    await service.listFeedback({ storeId: 6 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });
});
