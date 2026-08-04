import { BrainPredictionSkillsService } from './skills/brain-prediction-skills.service.js';

describe('BrainPredictionSkillsService', () => {
  it('labels prediction confidence and does not present prediction as fact', () => {
    const service = new BrainPredictionSkillsService({} as never);
    const result = service.composeChurnInsight({ customerName: '王女士', churnScore: 0.82, churnLevel: 'high' });

    expect(result.conclusion).toContain('预测');
    expect(result.confidence).toBe(0.82);
    expect(result.action).toContain('挽回');
  });

  it('loads the latest store-scoped prediction and lifecycle snapshot with model provenance', async () => {
    const prisma = {
      customerPredictionSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          id: 31,
          customerId: 7,
          storeId: 6,
          modelVersion: 'customer-value-v3',
          churnScore: 82,
          churnLevel: 'high',
          repurchase30dScore: 64,
          marketingResponseScore: 57,
          ltv6m: 6800,
          ltv12m: 12000,
          ltvTier: 'A',
          featureJson: { daysSinceLastVisit: 75, visitCount: 9 },
          reasonJson: ['距上次到店 75 天', '历史消费较高'],
          recommendedActionsJson: ['一对一回访'],
          createdAt: new Date('2026-07-10T08:00:00.000Z'),
          customer: { name: '张女士' },
          run: { id: 9, status: 'completed', startedAt: new Date('2026-07-10T07:50:00.000Z'), finishedAt: new Date('2026-07-10T08:00:00.000Z') },
          lifecycleSnapshots: [{ lifecycleStage: 'at_risk', churnRiskLevel: 'high', computedAt: new Date('2026-07-10T08:00:00.000Z'), evidenceJson: { source: 'lifecycle-v2' } }],
        }),
      },
    };
    const service = new BrainPredictionSkillsService(prisma as never);

    const result = await service.getCustomerPrediction({ storeId: 6, customerId: 7, now: new Date('2026-07-11T08:00:00.000Z') });

    expect(prisma.customerPredictionSnapshot.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 6, customerId: 7 } }));
    expect(result).toMatchObject({
      status: 'available',
      customerName: '张女士',
      modelVersion: 'customer-value-v3',
      churn: { score: 0.82, level: 'high' },
      repurchase30d: { score: 0.64 },
      marketingResponse: { score: 0.57 },
      lifecycleStage: 'at_risk',
    });
  });

  it('marks old prediction snapshots stale instead of presenting them as current facts', async () => {
    const prisma = {
      customerPredictionSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          id: 31,
          customerId: 7,
          storeId: 6,
          modelVersion: 'v1',
          churnScore: 70,
          churnLevel: 'high',
          repurchase30dScore: 20,
          marketingResponseScore: 10,
          ltv6m: 0,
          ltv12m: 0,
          ltvTier: 'C',
          featureJson: {},
          reasonJson: [],
          recommendedActionsJson: [],
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          customer: { name: '张女士' },
          run: { id: 9, status: 'completed', startedAt: new Date('2026-05-01T00:00:00.000Z'), finishedAt: new Date('2026-05-01T00:01:00.000Z') },
          lifecycleSnapshots: [],
        }),
      },
    };
    const service = new BrainPredictionSkillsService(prisma as never);

    await expect(service.getCustomerPrediction({ storeId: 6, customerId: 7, now: new Date('2026-07-11T00:00:00.000Z') })).resolves.toMatchObject({
      status: 'stale',
      staleAfterDays: 30,
    });
  });

  it.each([
    ['repurchase30d' as const, 'repurchase30dScore'],
    ['marketingResponse' as const, 'marketingResponseScore'],
  ])('ranks the latest completed prediction run by %s', async (metric, orderField) => {
    const prisma = {
      predictionRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 80,
          modelVersion: 'rules-v2.1',
          businessDate: new Date('2026-08-04T00:00:00.000Z'),
          customerCount: 1253,
          startedAt: new Date('2026-08-04T01:00:00.000Z'),
          finishedAt: new Date('2026-08-04T01:10:00.000Z'),
        }),
      },
      customerPredictionSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 801,
            repurchase30dScore: 91,
            marketingResponseScore: 88,
            ltv12m: 12800,
            ltvTier: 'A',
            customer: { id: 7, name: '张女士', phone: '13800121234' },
          },
        ]),
      },
    };
    const service = new BrainPredictionSkillsService(prisma as never);

    const result = await service.rankLatestCustomerPredictions({ storeId: 6, metric });

    expect(prisma.customerPredictionSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 6, runId: 80 }),
        orderBy: [{ [orderField]: 'desc' }, { ltv12m: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(result).toMatchObject({
      status: 'available',
      predictionRun: { id: 80, modelVersion: 'rules-v2.1', customerCount: 1253 },
      rows: [
        {
          rank: 1,
          customerName: '张女士',
          maskedPhone: '***1234',
          repurchase30dScore: 91,
          marketingResponseScore: 88,
          ltv12m: 12800,
        },
      ],
    });
  });

  it('returns masked identity candidates instead of guessing an LTV for same-name customers', async () => {
    const prisma = {
      predictionRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 80,
          modelVersion: 'rules-v2.1',
          businessDate: new Date('2026-08-04T00:00:00.000Z'),
          customerCount: 1253,
          startedAt: new Date('2026-08-04T01:00:00.000Z'),
          finishedAt: new Date('2026-08-04T01:10:00.000Z'),
        }),
      },
      customerPredictionSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 801,
            ltv12m: 12800,
            ltvTier: 'A',
            customer: { id: 7, name: '黄婉清', phone: '13800121234', memberLevel: '金卡' },
          },
          {
            id: 802,
            ltv12m: 5600,
            ltvTier: 'B',
            customer: { id: 8, name: '黄婉清', phone: '13900125678', memberLevel: '银卡' },
          },
        ]),
      },
    };
    const service = new BrainPredictionSkillsService(prisma as never);

    const result = await service.getLatestCustomerLtv12m({ storeId: 6, customerName: '黄婉清' });

    expect(result).toMatchObject({
      status: 'ambiguous',
      candidates: [
        { customerName: '黄婉清', maskedPhone: '***1234', memberLevel: '金卡' },
        { customerName: '黄婉清', maskedPhone: '***5678', memberLevel: '银卡' },
      ],
    });
    expect(result).not.toHaveProperty('ltv12m');
  });

  it('returns the latest completed-run LTV after identity is unique', async () => {
    const prisma = {
      predictionRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 80,
          modelVersion: 'rules-v2.1',
          businessDate: new Date('2026-08-04T00:00:00.000Z'),
          customerCount: 1253,
          startedAt: new Date('2026-08-04T01:00:00.000Z'),
          finishedAt: new Date('2026-08-04T01:10:00.000Z'),
        }),
      },
      customerPredictionSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 801,
            ltv12m: 12800,
            ltvTier: 'A',
            customer: { id: 7, name: '黄婉清', phone: '13800121234', memberLevel: '金卡' },
          },
        ]),
      },
    };
    const service = new BrainPredictionSkillsService(prisma as never);

    await expect(
      service.getLatestCustomerLtv12m({ storeId: 6, customerName: '黄婉清', phoneTail: '1234' }),
    ).resolves.toMatchObject({
      status: 'available',
      snapshotId: 801,
      customerName: '黄婉清',
      maskedPhone: '***1234',
      ltv12m: 12800,
      ltvTier: 'A',
      predictionRun: { id: 80, modelVersion: 'rules-v2.1' },
    });
  });
});
