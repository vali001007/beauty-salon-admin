import { BrainBeauticianSkillsService } from './brain-beautician-skills.service.js';
import { BrainFinanceSkillsService } from './brain-finance-skills.service.js';
import { BrainInventorySkillsService } from './brain-inventory-skills.service.js';
import { BrainManagerSkillsService } from './brain-manager-skills.service.js';
import { BrainMarketingSkillsService } from './brain-marketing-skills.service.js';
import { BrainQuerySkillsService } from './brain-query-skills.service.js';
import { BrainReceptionSkillsService } from './brain-reception-skills.service.js';
import { BrainSkillRuntimeService } from './brain-skill-runtime.service.js';

describe('Brain role skills', () => {
  const startDate = new Date('2026-07-10T00:00:00.000Z');
  const endDate = new Date('2026-07-10T23:59:59.999Z');

  it('builds manager daily overview from real business tables', async () => {
    const prisma = {
      dailySettlement: { findMany: jest.fn().mockResolvedValue([{ totalRevenue: 1000, grossProfit: 600 }]) },
      reservation: { count: jest.fn().mockResolvedValue(8) },
      productOrder: { findMany: jest.fn().mockResolvedValue([{ customerId: 1 }, { customerId: 1 }, { customerId: 2 }]) },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { name: '补水面膜', currentStock: 2, safetyStock: 5 },
          { name: '精华液', currentStock: 9, safetyStock: 5 },
        ]),
      },
    };

    const result = await new BrainManagerSkillsService(prisma as any).buildDailyOverview({ storeId: 6, startDate, endDate });

    expect(result).toMatchObject({
      revenue: 1000,
      appointmentCount: 8,
      activeCustomerCount: 2,
      grossMarginRate: 0.6,
      riskItems: ['低库存：补水面膜'],
    });
    expect(prisma.dailySettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 6 }) }));
  });

  it('keeps reception actions as confirmation previews', async () => {
    const prisma = {
      reservation: { count: jest.fn().mockResolvedValue(3) },
    };
    const service = new BrainReceptionSkillsService(prisma as any);

    await expect(service.countReservations({ storeId: 6, startDate, endDate })).resolves.toBe(3);
    expect(service.previewReservationAction({ actionType: 'reschedule_reservation', customerName: '张美丽', targetTime: '明天下午' })).toMatchObject({
      actionType: 'reschedule_reservation',
      riskLevel: 'high',
      requiresConfirmation: true,
      summary: expect.stringContaining('确认前不会写入预约'),
    });
  });

  it('generates marketing copy without pretending to query facts', () => {
    const service = new BrainMarketingSkillsService();

    expect(service.draftAppointmentReminder({ customerName: '王女士', timeWindow: '明天下午' })).toContain('王女士您好');
    expect(service.draftCustomerRecall({ offer: '老客护理权益' })).toContain('老客护理权益');
  });

  it('summarizes inventory risks from product and stock batch data', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: '补水面膜', currentStock: 2, safetyStock: 5 },
          { id: 2, name: '精华液', currentStock: 10, safetyStock: 5 },
        ]),
      },
      stockBatch: {
        findMany: jest.fn().mockResolvedValue([
          { stock: 2, unitCost: 30, totalAmount: 0 },
          { stock: 1, unitCost: 20, totalAmount: 80 },
        ]),
      },
    };

    const result = await new BrainInventorySkillsService(prisma as any).buildInventoryRiskSummary({
      storeId: 6,
      expiringBefore: endDate,
    });

    expect(result.stockoutSkuCount).toBe(1);
    expect(result.expiringStockValue).toBe(140);
    expect(result.lowStockProducts[0]).toMatchObject({ productId: 1, name: '补水面膜' });
  });

  it('summarizes finance risks from refunds, discounts and settlement margin', async () => {
    const prisma = {
      refundRecord: { findMany: jest.fn().mockResolvedValue([{ amount: 120 }, { amount: 80 }]) },
      productOrder: { findMany: jest.fn().mockResolvedValue([{ totalDiscountAmount: 30 }, { totalDiscountAmount: 20 }]) },
      dailySettlement: { findMany: jest.fn().mockResolvedValue([{ totalRevenue: 1000, grossProfit: 350 }]) },
    };

    const result = await new BrainFinanceSkillsService(prisma as any).buildFinanceRiskSummary({ storeId: 6, startDate, endDate });

    expect(result).toMatchObject({
      refundAmount: 200,
      refundCount: 2,
      discountAmount: 50,
      grossMarginRate: 0.35,
    });
    expect(result.riskItems).toEqual(expect.arrayContaining([expect.stringContaining('退款金额'), expect.stringContaining('毛利率')]));
  });

  it('builds beautician service summary and follow-up advice', async () => {
    const prisma = {
      beautician: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            date: new Date('2026-07-10T09:00:00.000Z'),
            startTime: '10:00',
            customer: { name: '李女士' },
            project: { name: '补水护理' },
          },
        ]),
      },
    };
    const service = new BrainBeauticianSkillsService(prisma as any);

    const result = await service.buildTodayServiceSummary({ storeId: 6, userId: 18, startDate, endDate });

    expect(result).toMatchObject({
      serviceCount: 1,
      nextTasks: [{ customerName: '李女士', projectName: '补水护理', appointmentTime: '2026-07-10 10:00' }],
    });
    expect(service.composeFollowUpAdvice({ customerName: '李女士', projectName: '补水护理' })).toContain('7 天内安排一次跟进');
  });

  it('exposes six role skills through runtime', async () => {
    const runtime = new BrainSkillRuntimeService(
      { listEnabledSkills: jest.fn().mockResolvedValue([]) } as any,
      { runMetricQuery: jest.fn(), runMetricQueries: jest.fn() } as unknown as BrainQuerySkillsService,
      { buildDailyOverview: jest.fn().mockResolvedValue({ revenue: 1 }) } as any,
      { countReservations: jest.fn().mockResolvedValue(2), previewReservationAction: jest.fn().mockReturnValue({ actionType: 'create_reservation' }) } as any,
      { draftAppointmentReminder: jest.fn().mockReturnValue('reminder'), draftCustomerRecall: jest.fn().mockReturnValue('recall') } as any,
      { buildInventoryRiskSummary: jest.fn().mockResolvedValue({ stockoutSkuCount: 0 }) } as any,
      { buildFinanceRiskSummary: jest.fn().mockResolvedValue({ refundAmount: 0 }) } as any,
      { buildTodayServiceSummary: jest.fn().mockResolvedValue({ serviceCount: 0 }), composeFollowUpAdvice: jest.fn().mockReturnValue('advice') } as any,
    );

    await expect(runtime.buildManagerDailyOverview({ storeId: 6, startDate, endDate })).resolves.toMatchObject({ revenue: 1 });
    await expect(runtime.countReceptionReservations({ storeId: 6, startDate, endDate })).resolves.toBe(2);
    expect(runtime.draftAppointmentReminder({})).toBe('reminder');
    await expect(runtime.buildInventoryRiskSummary({ storeId: 6, expiringBefore: endDate })).resolves.toMatchObject({ stockoutSkuCount: 0 });
    await expect(runtime.buildFinanceRiskSummary({ storeId: 6, startDate, endDate })).resolves.toMatchObject({ refundAmount: 0 });
    await expect(runtime.buildBeauticianServiceSummary({ storeId: 6, startDate, endDate })).resolves.toMatchObject({ serviceCount: 0 });
  });
});
