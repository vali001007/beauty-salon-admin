import { MarketingAttributionService } from './marketing-attribution.service';
import { MarketingEffectFactService } from './marketing-effect-fact.service';
import { MarketingFeatureFlagsService } from '../marketing-feature-flags.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('MarketingAttributionService', () => {
  const prisma = {
    marketingEffectFact: { findFirst: jest.fn(), updateMany: jest.fn() },
    marketingAutomationTouch: { findMany: jest.fn(), update: jest.fn() },
    marketingAttribution: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    marketingPageLead: { findMany: jest.fn(), update: jest.fn() },
    marketingPageAttribution: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
  } as any;
  const facts = { recordFact: jest.fn() } as any;
  const flags = { effectFactWrite: true } as any;
  let service: MarketingAttributionService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.marketingEffectFact.findFirst.mockResolvedValue(null);
    prisma.marketingAttribution.findFirst.mockResolvedValue(null);
    prisma.marketingPageAttribution.findFirst.mockResolvedValue(null);
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([]);
    prisma.marketingPageLead.findMany.mockResolvedValue([]);
    prisma.marketingAttribution.findMany.mockResolvedValue([]);
    prisma.marketingPageAttribution.findMany.mockResolvedValue([]);
    facts.recordFact.mockResolvedValue({ id: 1 });
    service = new MarketingAttributionService(
      prisma as PrismaService,
      facts as MarketingEffectFactService,
      flags as MarketingFeatureFlagsService,
    );
  });

  it.each(['queued', 'failed', 'reached'])('does not attribute an order from %s touch', async (status) => {
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([
      {
        id: 10,
        status,
        touchedAt: new Date('2026-07-13T02:00:00.000Z'),
        attributionWindowDays: 30,
      },
    ]);

    await service.attributeOrder({ storeId: 6, orderId: 100, customerId: 8, netRevenue: 680 });

    expect(prisma.marketingAttribution.create).not.toHaveBeenCalled();
    expect(facts.recordFact).not.toHaveBeenCalledWith(
      expect.objectContaining({ factType: 'revenue' }),
      expect.anything(),
    );
  });

  it('selects one primary last touch across page and automation and records the other as assist only', async () => {
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([
      {
        id: 10,
        status: 'delivered',
        strategyId: 12,
        executionId: 90,
        customerId: 8,
        channel: 'terminal',
        touchedAt: new Date('2026-07-13T02:00:00.000Z'),
        attributionWindowDays: 30,
        strategy: { recommendationInstanceId: 'r1', adoptionId: 70, actions: [] },
      },
    ]);
    prisma.marketingPageLead.findMany.mockResolvedValue([
      {
        id: 20,
        pageId: 30,
        customerId: 8,
        status: 'new',
        createdAt: new Date('2026-07-13T02:30:00.000Z'),
        page: { activityId: 40, recommendationInstanceId: 'r1', adoptionId: 70, snapshotJson: {} },
      },
    ]);

    const result = await service.attributeOrder({
      storeId: 6,
      orderId: 100,
      customerId: 8,
      netRevenue: 680,
      occurredAt: new Date('2026-07-13T03:00:00.000Z'),
    });

    expect(result.primarySource).toBe('page');
    expect(prisma.marketingPageAttribution.create).toHaveBeenCalledTimes(1);
    expect(prisma.marketingAttribution.create).not.toHaveBeenCalled();
    expect(facts.recordFact).toHaveBeenCalledWith(
      expect.objectContaining({
        factType: 'revenue',
        amountValue: 680,
        sourceEventId: 'order:100',
        dimensions: expect.objectContaining({
          pageId: 30,
          activityId: 40,
          recommendationInstanceId: 'r1',
          orderId: 100,
        }),
      }),
      prisma,
    );
    expect(facts.recordFact).toHaveBeenCalledWith(
      expect.objectContaining({
        factType: 'conversion',
        sourceEventId: 'order:100:assist:automation:10',
        isPrimary: false,
        dimensions: expect.objectContaining({ strategyId: 12, touchId: 10 }),
      }),
      prisma,
    );
  });

  it('demotes a pre-order terminal conversion when the same touch receives an order attribution', async () => {
    prisma.marketingAutomationTouch.findMany.mockResolvedValue([
      {
        id: 10,
        status: 'converted',
        strategyId: 12,
        executionId: 90,
        customerId: 8,
        channel: 'terminal',
        touchedAt: new Date('2026-07-13T02:00:00.000Z'),
        attributionWindowDays: 30,
        strategy: { recommendationInstanceId: 'r1', adoptionId: 70, actions: [] },
      },
    ]);

    await service.attributeOrder({
      storeId: 6,
      orderId: 100,
      customerId: 8,
      netRevenue: 680,
      occurredAt: new Date('2026-07-13T03:00:00.000Z'),
    });

    expect(prisma.marketingEffectFact.updateMany).toHaveBeenCalledWith({
      where: {
        storeId: 6,
        factType: 'conversion',
        sourceSystem: 'terminal_follow_up',
        touchId: 10,
        orderId: null,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
  });

  it('creates a negative revenue fact and reduces both legacy projections after refund', async () => {
    prisma.marketingAttribution.findMany.mockResolvedValue([
      {
        id: 1,
        touchId: 10,
        attributedRevenue: 680,
        touch: { actualRevenue: 680, strategyId: 12, executionId: 90, channel: 'terminal' },
      },
    ]);
    prisma.marketingPageAttribution.findMany.mockResolvedValue([
      {
        id: 2,
        pageId: 30,
        attributedRevenue: 680,
        page: { activityId: 40, recommendationInstanceId: 'r1', adoptionId: 70 },
      },
    ]);

    await service.reverseOrder({ storeId: 6, orderId: 100, refundId: 20, refundAmount: 200 }, prisma);

    expect(prisma.marketingAttribution.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { attributedRevenue: 480 },
    });
    expect(prisma.marketingPageAttribution.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { attributedRevenue: 480 },
    });
    expect(facts.recordFact).toHaveBeenCalledWith(
      expect.objectContaining({
        factType: 'revenue_refund',
        amountValue: -200,
        sourceEventId: 'refund:20',
        dimensions: expect.objectContaining({ orderId: 100, refundId: 20 }),
      }),
      prisma,
    );
  });
});
