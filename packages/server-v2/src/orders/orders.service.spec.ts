import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrdersService marketing page attribution', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService({} as PrismaService);
  });

  function createTx() {
    return {
      marketingPageAttribution: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      marketingPageLead: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
  }

  it('creates a last-touch page attribution from the newest eligible lead', async () => {
    const tx = createTx();
    const lead = {
      id: 31,
      pageId: 12,
      customerId: 7,
      createdAt: new Date(Date.now() - 3 * 86400000),
    };
    tx.marketingPageAttribution.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    tx.marketingPageLead.findMany.mockResolvedValue([lead]);

    await (service as any).applyMarketingPageAttribution(tx, { id: 88, customerId: 7 }, 680);

    expect(tx.marketingPageLead.findMany).toHaveBeenCalledWith({
      where: {
        customerId: 7,
        status: { not: 'expired' },
        createdAt: { gte: expect.any(Date) },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(tx.marketingPageAttribution.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 31,
        pageId: 12,
        customerId: 7,
        orderId: 88,
        attributionType: 'last_touch',
        attributedRevenue: 680,
        attributionWindowDays: 30,
        touchedAt: lead.createdAt,
        convertedAt: expect.any(Date),
      }),
    });
    expect(tx.marketingPageLead.update).toHaveBeenCalledWith({
      where: { id: 31 },
      data: { status: 'converted', convertedAt: expect.any(Date) },
    });
  });

  it('does not create duplicate attribution for an already attributed order', async () => {
    const tx = createTx();
    tx.marketingPageAttribution.findFirst.mockResolvedValue({ id: 1 });

    await (service as any).applyMarketingPageAttribution(tx, { id: 88, customerId: 7 }, 680);

    expect(tx.marketingPageLead.findMany).not.toHaveBeenCalled();
    expect(tx.marketingPageAttribution.create).not.toHaveBeenCalled();
  });

  it('does not create attribution when the customer has no lead in the attribution window', async () => {
    const tx = createTx();
    tx.marketingPageAttribution.findFirst.mockResolvedValueOnce(null);
    tx.marketingPageLead.findMany.mockResolvedValue([]);

    await (service as any).applyMarketingPageAttribution(tx, { id: 88, customerId: 7 }, 680);

    expect(tx.marketingPageAttribution.create).not.toHaveBeenCalled();
    expect(tx.marketingPageLead.update).not.toHaveBeenCalled();
  });

  it('uses a 30-day attribution window when querying eligible leads', async () => {
    const tx = createTx();
    const systemNow = new Date('2026-06-07T09:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);

    try {
      tx.marketingPageAttribution.findFirst.mockResolvedValueOnce(null);
      tx.marketingPageLead.findMany.mockResolvedValue([]);

      await (service as any).applyMarketingPageAttribution(tx, { id: 88, customerId: 7 }, 680);

      expect(tx.marketingPageLead.findMany).toHaveBeenCalledWith({
        where: {
          customerId: 7,
          status: { not: 'expired' },
          createdAt: { gte: new Date('2026-05-08T09:00:00.000Z') },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
