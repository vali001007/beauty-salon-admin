import { BrainFinanceSkillsService } from './skills/brain-finance-skills.service.js';

describe('BrainFinanceSkillsService', () => {
  it('does not report 0% gross margin when no settlement rows exist', async () => {
    const prisma = {
      refundRecord: { findMany: jest.fn().mockResolvedValue([]) },
      productOrder: { findMany: jest.fn().mockResolvedValue([]) },
      dailySettlement: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainFinanceSkillsService(prisma as never);

    const summary = await service.buildFinanceRiskSummary({
      storeId: 2,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-10'),
    });

    expect(summary.grossMarginRate).toBeUndefined();
    expect(summary.riskItems.join('')).not.toContain('毛利率 0.0%');
  });

  it('returns one rounded point per Shanghai calendar day for income trends', async () => {
    const prisma = {
      dailySettlement: {
        findMany: jest.fn().mockResolvedValue([
          {
            settleDate: new Date('2026-07-01T00:00:00.000Z'),
            totalRevenue: 25553.27000000001,
            cashRevenue: 0,
            wechatRevenue: 25553.27000000001,
            alipayRevenue: 0,
            cardRevenue: 0,
            balanceRevenue: 0,
            rechargeIncome: 0,
            orderCount: 5,
            customerCount: 4,
            avgTransaction: 0,
            status: 'confirmed',
            reconciliationStatus: 'passed',
            confirmedAt: new Date('2026-07-04T00:00:00.000Z'),
            updatedAt: new Date('2026-07-04T00:00:00.000Z'),
          },
          {
            settleDate: new Date('2026-07-01T08:00:00.000Z'),
            totalRevenue: 3407,
            cashRevenue: 0,
            wechatRevenue: 3407,
            alipayRevenue: 0,
            cardRevenue: 0,
            balanceRevenue: 0,
            rechargeIncome: 0,
            orderCount: 1,
            customerCount: 1,
            avgTransaction: 0,
            status: 'draft',
            reconciliationStatus: 'pending',
            confirmedAt: null,
            updatedAt: new Date('2026-07-02T00:00:00.000Z'),
          },
          {
            settleDate: new Date('2026-07-03T00:00:00.000Z'),
            totalRevenue: 100,
            cashRevenue: 0,
            wechatRevenue: 100,
            alipayRevenue: 0,
            cardRevenue: 0,
            balanceRevenue: 0,
            rechargeIncome: 0,
            orderCount: 1,
            customerCount: 1,
            avgTransaction: 0,
            status: 'confirmed',
            reconciliationStatus: 'passed',
            confirmedAt: new Date('2026-07-04T00:00:00.000Z'),
            updatedAt: new Date('2026-07-04T00:00:00.000Z'),
          },
        ]),
      },
      paymentRecord: { findMany: jest.fn().mockResolvedValue([]) },
      productOrder: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainFinanceSkillsService(prisma as never);

    const result = await service.buildIncomeAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00+08:00'),
      endDate: new Date('2026-07-03T23:59:59+08:00'),
    });

    expect(result.totalCollected).toBe(25653.27);
    expect(result.paymentBreakdown).toEqual([{ method: 'wechat', amount: 25653.27, count: 0 }]);
    expect(result.dailyTrend).toEqual([
      { date: '2026-07-01', revenue: 25553.27, orderCount: 5, customerCount: 4, avgTransaction: 5110.65 },
      { date: '2026-07-02', revenue: 0, orderCount: 0, customerCount: 0, avgTransaction: 0 },
      { date: '2026-07-03', revenue: 100, orderCount: 1, customerCount: 1, avgTransaction: 100 },
    ]);
  });

  it('uses the authoritative settlement once for risk and cost calculations', async () => {
    const confirmed = {
      settleDate: new Date('2026-07-01T00:00:00.000Z'),
      totalRevenue: 1000,
      grossProfit: 600,
      materialCost: 200,
      commissionTotal: 100,
      status: 'confirmed',
      reconciliationStatus: 'passed',
      confirmedAt: new Date('2026-07-02T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z'),
    };
    const draft = {
      ...confirmed,
      totalRevenue: 900,
      grossProfit: 300,
      materialCost: 400,
      commissionTotal: 200,
      status: 'draft',
      reconciliationStatus: 'pending',
      confirmedAt: null,
      updatedAt: new Date('2026-07-01T12:00:00.000Z'),
    };
    const prisma = {
      refundRecord: { findMany: jest.fn().mockResolvedValue([]) },
      productOrder: { findMany: jest.fn().mockResolvedValue([]) },
      dailySettlement: { findMany: jest.fn().mockResolvedValue([draft, confirmed]) },
      operatingCost: { findMany: jest.fn().mockResolvedValue([]) },
      commissionRecord: { findMany: jest.fn().mockResolvedValue([]) },
      customerCard: { findMany: jest.fn().mockResolvedValue([]) },
      customerBalanceAccount: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BrainFinanceSkillsService(prisma as never);
    const input = {
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00+08:00'),
      endDate: new Date('2026-07-01T23:59:59+08:00'),
    };

    const [risk, cost] = await Promise.all([service.buildFinanceRiskSummary(input), service.buildCostAnalysis(input)]);

    expect(risk.grossMarginRate).toBe(0.6);
    expect(cost).toMatchObject({
      revenue: 1000,
      grossProfit: 600,
      materialCost: 200,
      commissionCost: 100,
      grossMarginRate: 0.6,
    });
  });

  it('groups refund reasons from scoped successful refund records', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        refundNo: 'R-2',
        amount: 300,
        reason: '客户不适',
        refundedAt: new Date('2026-07-10T08:00:00.000Z'),
        order: { orderNo: 'O-2', customerName: '李女士' },
      },
      {
        refundNo: 'R-1',
        amount: 100,
        reason: '客户不适',
        refundedAt: new Date('2026-07-09T08:00:00.000Z'),
        order: { orderNo: 'O-1', customerName: '王女士' },
      },
      {
        refundNo: 'R-0',
        amount: 50,
        reason: null,
        refundedAt: new Date('2026-07-08T08:00:00.000Z'),
        order: { orderNo: 'O-0', customerName: null },
      },
    ]);
    const service = new BrainFinanceSkillsService({ refundRecord: { findMany } } as never);

    const result = await service.buildRefundReasonAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ order: { storeId: 6 }, status: { notIn: ['cancelled', 'rejected'] } }),
      }),
    );
    expect(result).toMatchObject({ refundAmount: 450, refundCount: 3 });
    expect(result.reasons).toEqual([
      { reason: '客户不适', amount: 400, count: 2 },
      { reason: '未填写原因', amount: 50, count: 1 },
    ]);
    expect(result.records[0]).toMatchObject({ refundNo: 'R-2', orderNo: 'O-2', reason: '客户不适', amount: 300 });
  });

  it('calculates product margin from order snapshots and refund offsets', async () => {
    const orderItemFindMany = jest.fn().mockResolvedValue([
      {
        itemId: 1,
        name: '眼霜',
        quantity: 2,
        netAmount: 300,
        payload: { costPrice: 100 },
        isGift: false,
        refundItems: [{ quantity: 1, refundAmount: 150 }],
      },
      {
        itemId: 2,
        name: '精华',
        quantity: 1,
        netAmount: 80,
        payload: {},
        isGift: false,
        refundItems: [],
      },
      {
        itemId: 3,
        name: '面膜赠品',
        quantity: 1,
        netAmount: 0,
        payload: { costPrice: 20 },
        isGift: true,
        refundItems: [],
      },
    ]);
    const productFindMany = jest.fn().mockResolvedValue([
      { id: 1, name: '眼霜', costPrice: 120 },
      { id: 2, name: '精华', costPrice: 100 },
      { id: 3, name: '面膜赠品', costPrice: 20 },
    ]);
    const service = new BrainFinanceSkillsService({
      orderItem: { findMany: orderItemFindMany },
      product: { findMany: productFindMany },
    } as never);

    const result = await service.buildProductMarginAnalysis({
      storeId: 6,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-07-31T23:59:59.999Z'),
    });

    expect(orderItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ order: expect.objectContaining({ storeId: 6 }) }),
      }),
    );
    expect(result).toMatchObject({ totalProductCount: 3, belowCostProductCount: 1, incompleteCostProductCount: 0 });
    expect(result.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productName: '眼霜',
          quantity: 1,
          netRevenue: 150,
          costAmount: 100,
          grossProfit: 50,
          grossMarginRate: 1 / 3,
          belowCostSaleCount: 0,
          costSources: ['order_snapshot'],
        }),
        expect.objectContaining({
          productName: '精华',
          netRevenue: 80,
          costAmount: 100,
          grossProfit: -20,
          grossMarginRate: -0.25,
          belowCostSaleCount: 1,
          costSources: ['product_master_fallback'],
        }),
        expect.objectContaining({ productName: '面膜赠品', belowCostSaleCount: 0 }),
      ]),
    );
  });

  it('returns governed card recognition rows using recognized amount before the unit-value fallback', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        customerId: 11,
        customerCardId: 21,
        projectId: 31,
        cardName: '综合养护 20 次卡',
        times: 2,
        recognizedUnitValue: 100,
        recognizedAmount: 0,
        verifiedAt: new Date('2026-06-30T04:00:00.000Z'),
      },
      {
        id: 2,
        customerId: 12,
        customerCardId: 22,
        projectId: 32,
        cardName: '综合养护 20 次卡',
        times: 1,
        recognizedUnitValue: 100,
        recognizedAmount: 1285,
        verifiedAt: new Date('2026-06-30T06:00:00.000Z'),
      },
    ]);
    const service = new BrainFinanceSkillsService({ cardUsageRecord: { findMany } } as never);

    const rows = await service.buildCardRecognitionRows({
      storeId: 6,
      startDate: new Date('2026-06-29T16:00:00.000Z'),
      endDate: new Date('2026-06-30T15:59:59.999Z'),
    });

    expect(rows.map((row) => row.recognizedAmount)).toEqual([200, 1285]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 6 }),
      }),
    );
  });

  it('calculates order-level gross profit from fulfillment items, cost snapshots and valid commissions', async () => {
    const productOrderFindMany = jest.fn().mockResolvedValue([
      {
        id: 1045,
        orderNo: 'O-1045',
        orderKind: 'product',
        netAmount: 300,
        totalAmount: 300,
        refundRecords: [],
        orderItems: [
          {
            id: 501,
            itemType: 'product',
            itemId: 10,
            quantity: 2,
            subtotal: 300,
            netAmount: 300,
            payload: { costPrice: 100 },
            commissionRecords: [{ amount: 20 }],
          },
        ],
        commissionRecords: [{ amount: 10 }],
      },
      {
        id: 1047,
        orderNo: 'O-1047',
        orderKind: 'member_card_open',
        netAmount: 2000,
        totalAmount: 2000,
        refundRecords: [],
        orderItems: [
          {
            id: 502,
            itemType: 'card_sale',
            itemId: 20,
            quantity: 1,
            subtotal: 2000,
            netAmount: 2000,
            payload: {},
            commissionRecords: [],
          },
        ],
        commissionRecords: [],
      },
    ]);
    const service = new BrainFinanceSkillsService({
      productOrder: { findMany: productOrderFindMany },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 10, costPrice: 120 }]) },
      projectBomItem: { findMany: jest.fn().mockResolvedValue([]) },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            movementType: 'sale_out',
            productId: 10,
            orderItemId: 501,
            sourceId: 1045,
            quantity: -2,
            unitCost: 90,
            costAmount: 180,
            product: { costPrice: 120 },
          },
        ]),
      },
    } as never);

    const rows = await service.buildOrderProfitRows({
      storeId: 6,
      startDate: new Date('2026-06-29T16:00:00.000Z'),
      endDate: new Date('2026-06-30T15:59:59.999Z'),
      scope: 'all',
    });

    expect(rows).toEqual([
      expect.objectContaining({ orderId: 1045, businessType: 'product', totalCost: 210, grossProfit: 90 }),
      expect.objectContaining({ orderId: 1047, businessType: 'prepaid', totalCost: 0, grossProfit: 0 }),
    ]);
  });

  it('groups valid commission records by controlled beautician id and commission type', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { beauticianId: 19, type: 'project', amount: 100, beautician: { name: '顾然' } },
      { beauticianId: 19, type: 'project', amount: 52.91, beautician: { name: '顾然' } },
      { beauticianId: 19, type: 'product', amount: 45.3, beautician: { name: '顾然' } },
    ]);
    const service = new BrainFinanceSkillsService({ commissionRecord: { findMany } } as never);

    const rows = await service.buildStaffCommissionRows({
      storeId: 6,
      beauticianId: 19,
      startDate: new Date('2026-06-21T16:00:00.000Z'),
      endDate: new Date('2026-06-28T15:59:59.999Z'),
    });

    expect(rows).toEqual([
      { beauticianId: 19, beauticianName: '顾然', commissionType: 'project', amount: 152.91 },
      { beauticianId: 19, beauticianName: '顾然', commissionType: 'product', amount: 45.3 },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 6, beauticianId: 19, beautician: { storeId: 6 } }),
      }),
    );
  });
});
