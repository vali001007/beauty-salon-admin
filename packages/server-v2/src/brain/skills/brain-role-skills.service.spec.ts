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

  it('queries an afternoon request by the whole business date instead of using noon as the date lower bound', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BrainReceptionSkillsService({ reservation: { findMany } } as any);

    await service.listReservationSchedule({
      storeId: 6,
      startDate: new Date('2026-07-18T04:00:00.000Z'),
      endDate: new Date('2026-07-18T15:59:59.999Z'),
      timezone: 'Asia/Shanghai',
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: 6,
        date: {
          gte: new Date('2026-07-17T16:00:00.000Z'),
          lt: new Date('2026-07-18T16:00:00.000Z'),
        },
      }),
    }));
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

  it('ranks inventory aging candidates from batch age and outbound velocity', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, sku: 'P1', name: '慢动销精华', currentStock: 120, safetyStock: 30, costPrice: 20 },
          { id: 2, sku: 'P2', name: '正常面膜', currentStock: 20, safetyStock: 10, costPrice: 10 },
        ]),
      },
      stockBatch: {
        findMany: jest.fn().mockResolvedValue([
          { productId: 1, createdAt: new Date('2026-05-01T00:00:00.000Z') },
          { productId: 2, createdAt: new Date('2026-05-01T00:00:00.000Z') },
        ]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          { productId: 1, movementType: 'sale_out', quantity: -2, occurredAt: new Date('2026-06-01T00:00:00.000Z') },
          { productId: 2, movementType: 'sale_out', quantity: -30, occurredAt: new Date('2026-07-15T00:00:00.000Z') },
        ]),
      },
    };
    const result = await new BrainInventorySkillsService(prisma as any).buildInventoryAgingAnalysis({
      storeId: 6,
      asOf: new Date('2026-07-18T23:59:59.999Z'),
      observationDays: 90,
    });

    expect(result).toMatchObject({
      totalProductCount: 2,
      batchCoveredProductCount: 2,
      candidateCount: 1,
      products: [expect.objectContaining({ productId: 1, name: '慢动销精华', oldestBatchAgeDays: 78 })],
    });
    expect(result.products[0]!.coverageDays).toBeGreaterThanOrEqual(180);
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

  it('separates member-balance recharge and consumption flows with gift amounts', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { type: 'recharge', amount: 1000, giftAmount: 200 },
      { type: 'open', amount: 500, giftAmount: 50 },
      { type: 'consume', amount: 180, giftAmount: 20 },
      { type: 'deduct', amount: 70, giftAmount: 10 },
    ]);
    const service = new BrainFinanceSkillsService({ customerBalanceTransaction: { findMany } } as any);

    await expect(service.buildMemberBalanceFlowSummary({ storeId: 6, startDate, endDate })).resolves.toEqual({
      rechargeAmount: 1500,
      rechargeGiftAmount: 250,
      rechargeCount: 2,
      consumedAmount: 250,
      consumedGiftAmount: 30,
      consumedCount: 2,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        storeId: 6,
        createdAt: { gte: startDate, lte: endDate },
        type: { in: ['recharge', 'open', 'deduct', 'consume'] },
      },
      select: { type: true, amount: true, giftAmount: true },
    });
  });

  it('builds beautician service summary and follow-up advice', async () => {
    const prisma = {
      beautician: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
      serviceTask: { findMany: jest.fn().mockResolvedValue([]) },
      projectBomItem: { findMany: jest.fn().mockResolvedValue([]) },
      customerCard: { findMany: jest.fn().mockResolvedValue([]) },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            customerId: 21,
            projectId: 1,
            date: new Date('2026-07-10T09:00:00.000Z'),
            startTime: '10:00',
            endTime: '11:00',
            status: 'confirmed',
            checkedInAt: null,
            customer: { id: 21, name: '李女士', memberLevel: '银卡', visitCount: 3 },
            project: { name: '补水护理' },
          },
        ]),
      },
    };
    const service = new BrainBeauticianSkillsService(prisma as any);

    const result = await service.buildTodayServiceSummary({ storeId: 6, userId: 18, startDate, endDate, timezone: 'UTC' });

    expect(result).toMatchObject({
      serviceCount: 1,
      cancelledCount: 0,
      scheduledMinutes: 60,
      nextTasks: [{ customerName: '李女士', projectName: '补水护理', appointmentTime: '2026-07-10 10:00', endTime: '11:00' }],
    });
    expect(service.composeFollowUpAdvice({ customerName: '李女士', projectName: '补水护理' })).toContain('7 天内安排一次跟进');
  });

  it('fails closed when the current user is not linked to an active beautician profile', async () => {
    const prisma = {
      beautician: { findFirst: jest.fn().mockResolvedValue(null) },
      reservation: { findMany: jest.fn() },
    };
    const service = new BrainBeauticianSkillsService(prisma as any);

    await expect(service.buildTodayServiceSummary({ storeId: 6, userId: 1, startDate, endDate }))
      .rejects.toThrow('beautician_identity_not_linked');
    expect(prisma.reservation.findMany).not.toHaveBeenCalled();
  });

  it('builds beautician gaps, cancellation, first-visit and previous-service facts from existing records', async () => {
    const prisma = {
      beautician: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 201, customerId: 31, projectId: 1, date: new Date('2026-07-17T16:00:00.000Z'), startTime: '10:00', endTime: '11:00', status: 'confirmed', checkedInAt: new Date('2026-07-18T01:50:00.000Z'),
            customer: { id: 31, name: '王女士', memberLevel: '普通会员', visitCount: 0 }, project: { name: '补水护理' },
          },
          {
            id: 202, customerId: 32, projectId: 2, date: new Date('2026-07-17T16:00:00.000Z'), startTime: '12:00', endTime: '13:30', status: 'confirmed', checkedInAt: null,
            customer: { id: 32, name: '李女士', memberLevel: '银卡', visitCount: 5 }, project: { name: '射频护理' },
          },
          {
            id: 203, customerId: 33, projectId: 3, date: new Date('2026-07-17T16:00:00.000Z'), startTime: '14:00', endTime: '15:00', status: 'cancelled', checkedInAt: null,
            customer: { id: 33, name: '赵女士', memberLevel: '金卡', visitCount: 8 }, project: { name: '亮肤护理' },
          },
        ]),
      },
      serviceTask: {
        findMany: jest.fn().mockResolvedValue([
          { customerId: 32, appointmentTime: new Date('2026-07-01T02:00:00.000Z'), remark: '注意肩颈', project: { name: '肩颈护理' } },
        ]),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([
          { projectId: 1, standardQty: 5, unit: 'ml', project: { name: '补水护理' }, product: { id: 101, name: '补水精华' } },
          { projectId: 2, standardQty: 1, unit: '片', project: { name: '射频护理' }, product: { id: 102, name: '一次性面巾' } },
        ]),
      },
      customerCard: {
        findMany: jest.fn().mockResolvedValue([
          { customerId: 32, cardName: '射频护理10次卡', totalTimes: 10, remainingTimes: 3, expiryDate: new Date('2026-09-01T00:00:00.000Z'), status: 'active' },
        ]),
      },
    };
    const service = new BrainBeauticianSkillsService(prisma as any);

    const result = await service.buildTodayServiceSummary({
      storeId: 6,
      userId: 18,
      startDate: new Date('2026-07-17T16:00:00.000Z'),
      endDate: new Date('2026-07-18T15:59:59.999Z'),
      timezone: 'Asia/Shanghai',
      includeMaterialPlan: true,
      includeCustomerCards: true,
    });

    expect(result).toMatchObject({
      serviceCount: 2,
      cancelledCount: 1,
      scheduledMinutes: 150,
      gaps: [{ date: '2026-07-18', startTime: '11:00', endTime: '12:00', minutes: 60 }],
      materialPlan: [
        { productId: 101, productName: '补水精华', requiredQty: 5, unit: 'ml', projectNames: ['补水护理'] },
        { productId: 102, productName: '一次性面巾', requiredQty: 1, unit: '片', projectNames: ['射频护理'] },
      ],
      bomCoveredReservationCount: 2,
    });
    expect(result.nextTasks[0]).toMatchObject({ customerName: '王女士', isFirstVisit: true, arrivedEarly: true });
    expect(result.nextTasks[1]).toMatchObject({
      customerName: '李女士',
      previousService: { projectName: '肩颈护理' },
      cards: [{ cardName: '射频护理10次卡', totalTimes: 10, usedTimes: 7, remainingTimes: 3 }],
    });
    expect(result.cancelledTasks).toEqual([expect.objectContaining({ customerName: '赵女士', status: 'cancelled' })]);
  });

  it('exposes six role skills through runtime', async () => {
    const runtime = new BrainSkillRuntimeService(
      { listEnabledSkills: jest.fn().mockResolvedValue([]) } as any,
      { runMetricQuery: jest.fn(), runMetricQueries: jest.fn() } as unknown as BrainQuerySkillsService,
      { buildDailyOverview: jest.fn().mockResolvedValue({ revenue: 1 }) } as any,
      { countReservations: jest.fn().mockResolvedValue(2), previewReservationAction: jest.fn().mockReturnValue({ actionType: 'create_reservation' }) } as any,
      { draftAppointmentReminder: jest.fn().mockReturnValue('reminder'), draftCustomerRecall: jest.fn().mockReturnValue('recall') } as any,
      {
        buildInventoryRiskSummary: jest.fn().mockResolvedValue({ stockoutSkuCount: 0 }),
        buildInventoryAgingAnalysis: jest.fn().mockResolvedValue({ candidateCount: 1 }),
      } as any,
      {
        buildFinanceRiskSummary: jest.fn().mockResolvedValue({ refundAmount: 0 }),
        buildMemberBalanceFlowSummary: jest.fn().mockResolvedValue({ rechargeAmount: 100, consumedAmount: 50 }),
      } as any,
      { buildTodayServiceSummary: jest.fn().mockResolvedValue({ serviceCount: 0 }), composeFollowUpAdvice: jest.fn().mockReturnValue('advice') } as any,
    );

    await expect(runtime.buildManagerDailyOverview({ storeId: 6, startDate, endDate })).resolves.toMatchObject({ revenue: 1 });
    await expect(runtime.countReceptionReservations({ storeId: 6, startDate, endDate })).resolves.toBe(2);
    expect(runtime.draftAppointmentReminder({})).toBe('reminder');
    await expect(runtime.buildInventoryRiskSummary({ storeId: 6, expiringBefore: endDate })).resolves.toMatchObject({ stockoutSkuCount: 0 });
    await expect(runtime.buildInventoryAgingAnalysis({ storeId: 6, asOf: endDate })).resolves.toMatchObject({ candidateCount: 1 });
    await expect(runtime.buildFinanceRiskSummary({ storeId: 6, startDate, endDate })).resolves.toMatchObject({ refundAmount: 0 });
    await expect(runtime.buildFinanceMemberBalanceFlowSummary({ storeId: 6, startDate, endDate })).resolves.toMatchObject({ rechargeAmount: 100, consumedAmount: 50 });
    await expect(runtime.buildBeauticianServiceSummary({ storeId: 6, startDate, endDate })).resolves.toMatchObject({ serviceCount: 0 });
  });
});
