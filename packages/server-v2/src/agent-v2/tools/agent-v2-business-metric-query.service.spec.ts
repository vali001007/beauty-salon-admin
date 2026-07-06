import type { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2BusinessMetricQueryService } from './agent-v2-business-metric-query.service.js';

describe('AgentV2BusinessMetricQueryService', () => {
  it('summarizes daily settlement metrics by current store', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        storeId: 6,
        settleDate: new Date('2026-07-02T00:00:00.000Z'),
        status: 'confirmed',
        totalRevenue: 1200,
        refundAmount: 100,
        orderCount: 8,
        customerCount: 6,
        grossProfit: 760,
        commissionTotal: 120,
        store: { id: 6, name: 'Ami 全量演示门店' },
      },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      dailySettlement: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.daily-settlement.metric', timeRange: { preset: 'this_month', label: '本月' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 6 }),
        orderBy: { settleDate: 'desc' },
        take: 60,
      }),
    );
    expect(result.status).toBe('success');
    expect(result.title).toBe('日结报表指标');
    expect(result.evidence?.source).toContain('DailySettlement');
    expect((result.data as any).metrics).toMatchObject({
      totalRevenue: 1200,
      refundAmount: 100,
      netRevenue: 1100,
      orderCount: 8,
      customerCount: 6,
    });
  });

  it('summarizes payment records by payment method', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, orderId: 11, method: 'wechat', amount: 120, status: 'success', paidAt: new Date('2026-07-02T03:00:00.000Z'), createdAt: new Date('2026-07-02T03:00:00.000Z') },
      { id: 2, orderId: 12, method: 'cash', amount: 80, status: 'success', paidAt: new Date('2026-07-02T04:00:00.000Z'), createdAt: new Date('2026-07-02T04:00:00.000Z') },
      { id: 3, orderId: 13, method: 'wechat', amount: 30, status: 'success', paidAt: new Date('2026-07-02T05:00:00.000Z'), createdAt: new Date('2026-07-02T05:00:00.000Z') },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      paymentRecord: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.payment-method-breakdown.metric', timeRange: { preset: 'today', label: '今天' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ order: { storeId: 6 } }),
        take: 2000,
      }),
    );
    expect(result.status).toBe('success');
    expect(result.title).toBe('支付方式收款拆分');
    expect((result.data as any).metrics).toMatchObject({
      totalRevenue: 230,
      totalPaymentCount: 3,
      totalOrderCount: 3,
      methodCount: 2,
    });
    expect((result.data as any).items[0]).toMatchObject({ methodLabel: '微信', revenue: 150, paymentCount: 2 });
  });

  it('resolves metric query targets from manifest queryKey', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, orderId: 11, method: 'alipay', amount: 88, status: 'success', paidAt: new Date('2026-07-02T03:00:00.000Z'), createdAt: new Date('2026-07-02T03:00:00.000Z') },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      paymentRecord: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { queryKey: 'finance.payment-method-breakdown.metric', timeRange: { preset: 'today', label: '今天' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('支付方式收款拆分');
    expect((result.data as any).metricManifest).toMatchObject({
      capabilityId: 'finance.payment-method-breakdown.metric',
      queryKey: 'finance.payment-method-breakdown.metric',
      sourceModels: expect.arrayContaining(['PaymentRecord', 'ProductOrder']),
    });
    expect((result.data as any).metrics).toMatchObject({ totalRevenue: 88, totalPaymentCount: 1 });
  });

  it('delegates migrated metric capabilities to GenericQueryEngine when available', async () => {
    const findMany = jest.fn();
    const genericQueryEngine = {
      canExecute: jest.fn().mockReturnValue(true),
      tryExecute: jest.fn().mockResolvedValue({
        status: 'success',
        title: '支付方式收款拆分',
        summary: '通用引擎返回支付方式拆分。',
        data: {
          metrics: { totalRevenue: 99 },
          queryTrace: { engine: 'generic_query_engine', queryKey: 'finance.payment-method-breakdown.metric' },
        },
        evidence: { source: ['PaymentRecord'], sourceTables: ['PaymentRecord'], metricDefinition: '通用指标执行器。', filters: [], sampleSize: 1 },
        actions: [],
      }),
    };
    const service = new AgentV2BusinessMetricQueryService({
      paymentRecord: { findMany },
    } as unknown as PrismaService, genericQueryEngine as any);

    const result = await service.execute(
      { queryKey: 'finance.payment-method-breakdown.metric', timeRange: { preset: 'today', label: '今天' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(genericQueryEngine.canExecute).toHaveBeenCalledWith(expect.objectContaining({
      capabilityId: 'finance.payment-method-breakdown.metric',
      executor: expect.objectContaining({ queryKey: 'finance.payment-method-breakdown.metric' }),
    }));
    expect(genericQueryEngine.tryExecute).toHaveBeenCalledWith(expect.objectContaining({
      manifest: expect.objectContaining({ capabilityId: 'finance.payment-method-breakdown.metric' }),
      args: expect.objectContaining({
        capabilityId: 'finance.payment-method-breakdown.metric',
        queryKey: 'finance.payment-method-breakdown.metric',
      }),
      context: expect.objectContaining({ storeId: 6 }),
    }));
    expect(findMany).not.toHaveBeenCalled();
    expect(result.status).toBe('success');
    expect((result.data as any).queryTrace).toMatchObject({ engine: 'generic_query_engine' });
    expect((result.data as any).metricManifest).toMatchObject({
      capabilityId: 'finance.payment-method-breakdown.metric',
      queryKey: 'finance.payment-method-breakdown.metric',
    });
  });

  it('summarizes refund count and amount', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        refundNo: 'RF001',
        amount: 68,
        status: 'completed',
        reason: '客户退款',
        refundedAt: new Date('2026-07-02T06:00:00.000Z'),
        createdAt: new Date('2026-07-02T06:00:00.000Z'),
        order: { id: 11, orderNo: 'POM001', customerName: '王宁', customer: { id: 1, name: '王宁' } },
      },
      {
        id: 2,
        refundNo: 'RF002',
        amount: 32,
        status: 'completed',
        reason: '重复支付',
        refundedAt: new Date('2026-07-02T07:00:00.000Z'),
        createdAt: new Date('2026-07-02T07:00:00.000Z'),
        order: { id: 12, orderNo: 'POM002', customerName: '林雅', customer: { id: 2, name: '林雅' } },
      },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      refundRecord: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.refund.metric', timeRange: { preset: 'today', label: '今天' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ order: { storeId: 6 } }),
        take: 500,
      }),
    );
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({ refundCount: 2, refundAmount: 100 });
    expect(result.evidence?.source).toContain('RefundRecord');
  });

  it('summarizes staff commissions by system user', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        storeId: 6,
        staffUserId: 100,
        beauticianId: null,
        amount: 120,
        sourceAmount: 1000,
        createdAt: new Date('2026-07-02T01:00:00.000Z'),
        staffUser: { id: 100, name: '周宁', username: 'zhouning', role: 'beautician' },
      },
      {
        id: 2,
        storeId: 6,
        staffUserId: 101,
        beauticianId: null,
        amount: 180,
        sourceAmount: 1500,
        createdAt: new Date('2026-07-02T02:00:00.000Z'),
        staffUser: { id: 101, name: '林雅', username: 'linya', role: 'beautician' },
      },
      {
        id: 3,
        storeId: 6,
        staffUserId: 101,
        beauticianId: null,
        amount: 20,
        sourceAmount: 200,
        createdAt: new Date('2026-07-02T03:00:00.000Z'),
        staffUser: { id: 101, name: '林雅', username: 'linya', role: 'beautician' },
      },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      commissionRecord: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.staff-commission.metric', timeRange: { preset: 'this_month', label: '本月' }, question: '这个月提成最高的是谁，大概多少' },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 6 }),
        take: 3000,
      }),
    );
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      totalCommissionAmount: 320,
      totalRecordCount: 3,
      staffCount: 2,
      topStaffName: '林雅',
      topStaffAmount: 200,
    });
  });

  it('summarizes staff efficiency from orders, service tasks, reservations, card usage and commissions', async () => {
    const beauticianFindMany = jest.fn().mockResolvedValue([
      { id: 10, userId: 100, name: '林雅', status: 'active', level: { name: '高级美容师' } },
      { id: 11, userId: 101, name: '周宁', status: 'active', level: { name: '美容师' } },
    ]);
    const orderItemFindMany = jest.fn().mockResolvedValue([
      {
        id: 101,
        orderId: 201,
        beauticianId: 10,
        itemType: 'project',
        quantity: 2,
        netAmount: 800,
        subtotal: 900,
        order: { id: 201, customerId: 301, createdAt: new Date('2026-07-02T01:00:00.000Z'), status: 'paid' },
      },
      {
        id: 102,
        orderId: 202,
        beauticianId: 11,
        itemType: 'project',
        quantity: 1,
        netAmount: 260,
        subtotal: 260,
        order: { id: 202, customerId: 302, createdAt: new Date('2026-07-02T02:00:00.000Z'), status: 'completed' },
      },
    ]);
    const commissionFindMany = jest.fn().mockResolvedValue([
      { id: 1, beauticianId: 10, staffUserId: 100, amount: 120, status: 'confirmed', type: 'project', createdAt: new Date('2026-07-02T03:00:00.000Z') },
      { id: 2, beauticianId: 11, staffUserId: 101, amount: 30, status: 'confirmed', type: 'project', createdAt: new Date('2026-07-02T04:00:00.000Z') },
    ]);
    const reservationFindMany = jest.fn().mockResolvedValue([
      { id: 1, beauticianId: 10, customerId: 301, status: 'completed', date: new Date('2026-07-03T01:00:00.000Z') },
      { id: 2, beauticianId: 10, customerId: 303, status: 'scheduled', date: new Date('2026-07-03T02:00:00.000Z') },
      { id: 3, beauticianId: 11, customerId: 302, status: 'completed', date: new Date('2026-07-03T03:00:00.000Z') },
    ]);
    const serviceTaskFindMany = jest.fn().mockResolvedValue([
      { id: 1, beauticianId: 10, status: 'completed', completedAt: new Date('2026-07-04T01:00:00.000Z') },
      { id: 2, beauticianId: 11, status: 'pending', completedAt: null },
    ]);
    const cardUsageFindMany = jest.fn().mockResolvedValue([
      { id: 1, beauticianId: 10, customerId: 301, times: 3, verifiedAt: new Date('2026-07-04T02:00:00.000Z') },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      beautician: { findMany: beauticianFindMany },
      orderItem: { findMany: orderItemFindMany },
      commissionRecord: { findMany: commissionFindMany },
      reservation: { findMany: reservationFindMany },
      serviceTask: { findMany: serviceTaskFindMany },
      cardUsageRecord: { findMany: cardUsageFindMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.staff-efficiency.metric', timeRange: { preset: 'this_month', label: '本月' }, question: '这个月人效怎么样' },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(beauticianFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, status: 'active' }),
    }));
    expect(orderItemFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ beauticianId: { not: null } }),
      take: 3000,
    }));
    expect(cardUsageFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ beauticianId: { not: null } }),
    }));
    expect(result.status).toBe('success');
    expect(result.title).toBe('员工人效指标');
    expect(result.evidence?.source).toEqual(expect.arrayContaining(['Beautician', 'OrderItem', 'ServiceTask', 'CardUsageRecord']));
    expect((result.data as any).items[0]).toMatchObject({
      staffName: '林雅',
      performanceLevel: '稳定发挥',
      serviceCount: 2,
      cardUsageTimes: 3,
      salesAmount: 800,
      commissionAmount: 120,
    });
    expect((result.data as any).metrics).toMatchObject({
      staffCount: 2,
      topStaffName: '林雅',
      totalSales: 1060,
      totalCommission: 150,
      totalServiceCount: 6,
    });
    expect((result.data as any).metricManifest).toMatchObject({
      capabilityId: 'finance.staff-efficiency.metric',
      queryKey: 'finance.staff-efficiency.metric',
    });
  });

  it('summarizes product gross profit from order items and product cost', async () => {
    const productOrderFindMany = jest.fn().mockResolvedValue([
      {
        id: 11,
        createdAt: new Date('2026-07-02T03:00:00.000Z'),
        orderItems: [
          { id: 101, itemType: 'product', itemId: 1, name: '玻尿酸保湿精华', quantity: 2, netAmount: 560 },
          { id: 102, itemType: 'product', itemId: 2, name: '抗衰紧致眼霜', quantity: 1, netAmount: 498 },
        ],
      },
    ]);
    const productFindMany = jest.fn().mockResolvedValue([
      { id: 1, sku: 'SKU-HYA', name: '玻尿酸保湿精华', costPrice: 120, retailPrice: 281 },
      { id: 2, sku: 'SKU-EYE', name: '抗衰紧致眼霜', costPrice: 200, retailPrice: 498 },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      productOrder: { findMany: productOrderFindMany },
      product: { findMany: productFindMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.product-gross-profit.metric', timeRange: { preset: 'this_month', label: '本月' }, question: '哪些产品毛利率最高' },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(productOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 6 }),
        include: { orderItems: true },
      }),
    );
    expect(productFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 6, id: { in: [1, 2] } }) }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      revenue: 1058,
      grossProfit: 618,
      itemCount: 2,
    });
    expect((result.data as any).items[0]).toMatchObject({ productName: '抗衰紧致眼霜', grossMargin: 59.8 });
  });

  it('summarizes project gross profit from project orders, BOM and commission records', async () => {
    const productOrderFindMany = jest.fn().mockResolvedValue([
      {
        id: 12,
        createdAt: new Date('2026-07-02T03:00:00.000Z'),
        orderItems: [
          { id: 201, itemType: 'project', itemId: 10, name: '水氧清洁焕肤', quantity: 2, netAmount: 736 },
        ],
      },
    ]);
    const projectFindMany = jest.fn().mockResolvedValue([
      {
        id: 10,
        name: '水氧清洁焕肤',
        bomItems: [
          { standardQty: 1, product: { id: 1, name: '一次性护理巾', costPrice: 8 } },
          { standardQty: 2, product: { id: 2, name: '水氧护理精华液', costPrice: 26 } },
        ],
      },
    ]);
    const commissionFindMany = jest.fn().mockResolvedValue([{ orderItemId: 201, amount: 60 }]);
    const service = new AgentV2BusinessMetricQueryService({
      productOrder: { findMany: productOrderFindMany },
      project: { findMany: projectFindMany },
      commissionRecord: { findMany: commissionFindMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.project-gross-profit.metric', timeRange: { preset: 'this_month', label: '本月' }, question: '帮我看一下各项目的毛利情况' },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(projectFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 6, id: { in: [10] } }) }));
    expect(commissionFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 6, orderItemId: { in: [201] } }) }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      revenue: 736,
      grossProfit: 556,
      itemCount: 1,
    });
    expect((result.data as any).items[0]).toMatchObject({
      projectName: '水氧清洁焕肤',
      serviceCount: 2,
      materialCost: 120,
      commissionCost: 60,
      grossProfit: 556,
    });
  });

  it('summarizes overall gross margin from generated daily settlements', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        settleDate: new Date('2026-07-02T00:00:00.000Z'),
        totalRevenue: 2000,
        refundAmount: 100,
        materialCost: 300,
        commissionTotal: 180,
        grossProfit: 1420,
        grossMargin: 74.7,
      },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      dailySettlement: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.overall-gross-margin.metric', timeRange: { preset: 'this_month', label: '本月' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 6 }) }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      revenue: 1900,
      materialCost: 300,
      commissionCost: 180,
      grossProfit: 1420,
      grossMargin: 74.7,
    });
  });

  it('summarizes card package sales from customer cards', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        cardName: '补水护理 10 次卡',
        paidAmount: 2680,
        discountAmount: 300,
        giftTimes: 2,
        totalTimes: 12,
        remainingTimes: 12,
        createdAt: new Date('2026-07-02T03:00:00.000Z'),
        customer: { id: 1, name: '王晓雯', phone: '13800000000' },
        card: { id: 10, name: '补水护理 10 次卡' },
        sourceOrder: { id: 100, orderNo: 'PO100' },
      },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      customerCard: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.card-package-sales.metric', timeRange: { preset: 'this_month', label: '本月' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customer: { storeId: 6 } }) }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      totalPaidAmount: 2680,
      cardCount: 1,
      totalTimes: 12,
      totalGiftTimes: 2,
    });
  });

  it('estimates payment channel fees from payment records', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, orderId: 11, method: 'wechat', amount: 1000, paidAt: new Date('2026-07-02T03:00:00.000Z'), createdAt: new Date('2026-07-02T03:00:00.000Z') },
      { id: 2, orderId: 12, method: 'alipay', amount: 500, paidAt: new Date('2026-07-02T04:00:00.000Z'), createdAt: new Date('2026-07-02T04:00:00.000Z') },
      { id: 3, orderId: 13, method: 'cash', amount: 300, paidAt: new Date('2026-07-02T05:00:00.000Z'), createdAt: new Date('2026-07-02T05:00:00.000Z') },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      paymentRecord: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.payment-channel-fee.metric', timeRange: { preset: 'today', label: '今天' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ order: { storeId: 6 } }) }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      totalAmount: 1800,
      totalEstimatedFee: 9,
      methodCount: 3,
      paymentCount: 3,
    });
    expect(result.evidence?.limitations?.[0]).toContain('预估手续费');
  });

  it('summarizes coupon redemption metrics from promotions and orders', async () => {
    const promotionFindMany = jest.fn().mockResolvedValue([
      {
        id: 3,
        name: '回店护理礼遇',
        type: 'amount_off',
        discountText: '满300减100',
        issuedCount: 10,
        usedCount: 4,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        status: 'active',
      },
    ]);
    const productOrderFindMany = jest.fn().mockResolvedValue([
      { id: 11, orderNo: 'POM001', promotionId: 3, couponId: null, createdAt: new Date('2026-07-02T03:00:00.000Z') },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      promotion: { findMany: promotionFindMany },
      productOrder: { findMany: productOrderFindMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'marketing.coupon-redemption.metric', timeRange: { preset: 'this_month', label: '本月' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(promotionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ storeId: 6 }, { storeId: null }] }),
    }));
    expect(productOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, OR: [{ couponId: { not: null } }, { promotionId: { not: null } }] }),
    }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      issuedTotal: 10,
      usedTotal: 4,
      unusedTotal: 6,
      periodUsedCount: 1,
    });
    expect((result.data as any).items[0]).toMatchObject({
      promotionName: '回店护理礼遇',
      redemptionRateText: '40.0%',
    });
  });

  it('detects discount permission risk from manual or unlinked discounts', async () => {
    const productOrderFindMany = jest.fn().mockResolvedValue([
      {
        id: 21,
        orderNo: 'POM002',
        customerName: '王宁',
        totalDiscountAmount: 38,
        orderDiscountAmount: 0,
        itemDiscountAmount: 0,
        discountSource: 'manual',
        promotionId: null,
        couponId: null,
        createdAt: new Date('2026-07-02T03:00:00.000Z'),
        customer: { id: 1, name: '王宁', phone: '13800000000' },
        orderItems: [],
      },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      productOrder: { findMany: productOrderFindMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.discount-permission-risk.metric', timeRange: { preset: 'this_month', label: '本月' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(productOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6 }),
    }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      discountOrderCount: 1,
      riskOrderCount: 1,
      riskAmount: 38,
    });
    expect((result.data as any).items[0]).toMatchObject({
      orderNo: 'POM002',
      riskLabel: '需复核',
      reason: '存在手工/额外折扣或未关联权益资产',
    });
  });

  it('returns commission cost optimization advice without writing rules', async () => {
    const commissionFindMany = jest.fn().mockResolvedValue([
      {
        id: 31,
        staffUserId: 100,
        beauticianId: null,
        amount: 120,
        createdAt: new Date('2026-07-02T03:00:00.000Z'),
        staffUser: { id: 100, name: '周宁', username: 'zhouning', role: 'beautician' },
        rule: { id: 1, name: '项目通用提成 8%', type: 'project' },
      },
    ]);
    const productOrderFindMany = jest.fn().mockResolvedValue([
      { id: 41, netAmount: 2000, totalAmount: 2200 },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      commissionRecord: { findMany: commissionFindMany },
      productOrder: { findMany: productOrderFindMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.commission-cost-optimization.advice', timeRange: { preset: 'this_month', label: '本月' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(commissionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6 }),
    }));
    expect(productOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6 }),
    }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({
      totalCommission: 120,
      totalRevenue: 2000,
      commissionRate: 6,
    });
    expect((result.data as any).advice[0]).toContain('财务提成规则统一维护');
    expect(result.evidence?.limitations?.[0]).toContain('不自动修改提成规则');
  });

  it('compares free card package customers with paid card package customers', async () => {
    const customerCardFindMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        customerId: 10,
        paidAmount: 0,
        discountAmount: 0,
        usageRecords: [{ id: 101, verifiedAt: new Date('2026-07-01T02:00:00.000Z'), recognizedAmount: 120 }],
        customer: { id: 10, name: '免费客户', phone: '13800000001' },
      },
      {
        id: 2,
        customerId: 11,
        paidAmount: 2680,
        discountAmount: 200,
        usageRecords: [{ id: 102, verifiedAt: new Date('2026-07-01T03:00:00.000Z'), recognizedAmount: 268 }],
        customer: { id: 11, name: '付费客户', phone: '13800000002' },
      },
    ]);
    const productOrderFindMany = jest.fn().mockResolvedValue([
      { customerId: 10, netAmount: 300, totalAmount: 300 },
      { customerId: 11, netAmount: 1200, totalAmount: 1300 },
    ]);
    const service = new AgentV2BusinessMetricQueryService({
      customerCard: { findMany: customerCardFindMany },
      productOrder: { findMany: productOrderFindMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'card.package.free-vs-paid.behavior.metric', timeRange: { preset: 'this_month', label: '本月' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(customerCardFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ customer: { storeId: 6 } }),
    }));
    expect(productOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 6, customerId: { in: [10, 11] } }),
    }));
    expect(result.status).toBe('success');
    expect((result.data as any).metrics).toMatchObject({ segmentCount: 2 });
    expect((result.data as any).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ segmentLabel: '免费/赠送次卡客户', customerCount: 1, revenue: 300 }),
      expect.objectContaining({ segmentLabel: '付费次卡客户', customerCount: 1, revenue: 1200 }),
    ]));
  });

  it('diagnoses finance risks from revenue, refunds, settlements, commissions and approvals', async () => {
    const service = new AgentV2BusinessMetricQueryService({
      productOrder: { findMany: jest.fn().mockResolvedValue([{ id: 1, netAmount: 1000, totalAmount: 1200, status: 'completed' }]) },
      refundRecord: { findMany: jest.fn().mockResolvedValue([{ id: 2, amount: 80, status: 'pending', createdAt: new Date('2026-07-01T02:00:00.000Z'), refundedAt: null }]) },
      dailySettlement: { findMany: jest.fn().mockResolvedValue([]) },
      commissionRecord: { findMany: jest.fn().mockResolvedValue([{ id: 3, amount: 120, staffUserId: 100 }]) },
      agentApproval: { findMany: jest.fn().mockResolvedValue([{ id: 4, status: 'pending', createdAt: new Date('2026-07-01T03:00:00.000Z'), decidedAt: null }]) },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.risk-diagnostics.metric', timeRange: { preset: 'this_month', label: '本月' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('财务异常与经营压力诊断');
    expect((result.data as any).metrics).toMatchObject({
      revenue: 1000,
      refundAmount: 80,
      commissionAmount: 120,
      settlementCount: 0,
    });
    expect((result.data as any).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ riskType: '日结覆盖', riskLevel: '需复核' }),
      expect.objectContaining({ riskType: '审批/报销线索', riskLevel: '待处理' }),
    ]));
    expect(result.evidence?.source).toContain('DailySettlement');
  });

  it('returns a multi-domain summary without executing write operations', async () => {
    const service = new AgentV2BusinessMetricQueryService({
      productOrder: { findMany: jest.fn().mockResolvedValue([{ id: 1, netAmount: 628, totalAmount: 666 }]) },
      dailySettlement: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'agent.multi-domain.summary', timeRange: { preset: 'today', label: '今天' } },
      { runId: 1, storeId: 6, role: 'manager' },
    );

    expect(result.status).toBe('success');
    expect(result.title).toBe('多域经营摘要');
    expect(result.actions).toEqual([]);
    expect((result.data as any).metrics).toMatchObject({ revenue: 628, orderCount: 1 });
    expect((result.data as any).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: '今日营收' }),
      expect.objectContaining({ section: '库存' }),
      expect.objectContaining({ section: '月报' }),
    ]));
  });
});
