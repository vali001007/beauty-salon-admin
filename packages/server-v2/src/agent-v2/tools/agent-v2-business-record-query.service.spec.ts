import type { PrismaService } from '../../prisma/prisma.service.js';
import { AgentV2BusinessRecordQueryService } from './agent-v2-business-record-query.service.js';

describe('AgentV2BusinessRecordQueryService', () => {
  it('queries only occurred scrap stock movements', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        movementNo: 'ADJ-1',
        movementType: 'scrap_out',
        productId: 9,
        quantity: -2,
        unit: '瓶',
        occurredAt: new Date('2026-07-01T02:00:00.000Z'),
        sourceNo: 'SCRAP-1',
        remark: '破损报废',
        product: { id: 9, name: '玻尿酸精华', sku: 'SKU-9', specUnit: '瓶', costPrice: 18, category: { name: '精华' } },
        store: { id: 1, name: 'Ami 全量演示门店' },
        operator: { id: 2, name: '林店长', username: 'manager', role: 'manager' },
        batch: { id: 3, batchNo: 'BATCH-1', expiryDate: new Date('2026-08-01T00:00:00.000Z') },
      },
    ]);
    const service = new AgentV2BusinessRecordQueryService({
      stockMovement: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'inventory.scrap.records.list', timeRange: { preset: 'this_week', label: '本周' }, limit: 10 },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 1, movementType: 'scrap_out' }),
    }));
    expect(result.status).toBe('success');
    expect(result.title).toBe('已发生报废记录');
    expect(result.evidence?.metricDefinition).toContain('scrap_out');
    expect((result.data as any).items[0]).toMatchObject({
      productName: '玻尿酸精华',
      scrapQuantity: 2,
      operatorName: '林店长',
    });
  });

  it('queries project orders from ProductOrder and OrderItem', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 11,
        orderNo: 'PO1781893252477',
        orderKind: 'project',
        customerName: '陈天佑',
        totalAmount: 498,
        netAmount: 458,
        totalDiscountAmount: 40,
        payMethod: 'wechat',
        status: 'completed',
        source: 'admin',
        createdAt: new Date('2026-07-01T02:00:00.000Z'),
        customer: { id: 1, name: '陈天佑', phone: '13800000000' },
        store: { id: 1, name: 'Ami 全量演示门店' },
        orderItems: [{ id: 1, name: '精华导入护理', itemType: 'project', quantity: 1 }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    const service = new AgentV2BusinessRecordQueryService({
      productOrder: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'order.project.records.list', question: '项目订单 PO1781893252477 为什么没有同步', limit: 10 },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 1, orderNo: { contains: 'PO1781893252477' } }),
    }));
    expect(result.status).toBe('success');
    expect((result.data as any).items[0]).toMatchObject({
      orderNo: 'PO1781893252477',
      orderKindLabel: '项目订单',
      customerName: '陈天佑',
      itemSummary: '精华导入护理 x1',
    });
  });

  it('queries card usage records with management terminal source', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 31,
        cardId: 2,
        cardName: '补水护理 10 次卡',
        customerId: 8,
        customerName: '林雨薇',
        projectId: 9,
        projectName: '深层补水护理',
        storeId: 1,
        times: 1,
        remainingTimes: 8,
        recognizedAmount: 268,
        verifiedAt: new Date('2026-07-01T02:00:00.000Z'),
        customer: { id: 8, name: '林雨薇', phone: '13900000000' },
        store: { id: 1, name: 'Ami 全量演示门店' },
        operator: { id: 1, name: '系统管理员', username: 'admin', role: 'super_admin' },
        beautician: null,
        device: null,
        sourceOrder: { id: 7, orderNo: 'CARD-1' },
      },
    ]);
    const service = new AgentV2BusinessRecordQueryService({
      cardUsageRecord: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'card.usage.records.list', timeRange: { preset: 'today', label: '今天' }, limit: 10 },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 1 }),
    }));
    expect((result.data as any).items[0]).toMatchObject({
      operatorName: '系统管理员',
      entrySourceLabel: '管理端',
      recognizedAmount: 268,
    });
  });

  it('looks up card package remaining times and expiry by customer keyword', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 101,
        cardId: 7,
        customerId: 8,
        cardName: '补水护理 10 次卡',
        totalTimes: 10,
        remainingTimes: 3,
        status: 'active',
        createdAt: new Date('2026-07-01T02:00:00.000Z'),
        expiryDate: new Date('2026-08-01T00:00:00.000Z'),
        customer: { id: 8, name: '林雨薇', phone: '13900000000', store: { id: 1, name: 'Ami 全量演示门店' } },
        card: { id: 7, name: '补水护理 10 次卡', totalTimes: 10 },
        operator: { id: 1, name: '系统管理员', username: 'admin' },
      },
    ]);
    const service = new AgentV2BusinessRecordQueryService({
      customerCard: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'card.package.status.lookup', filters: { customerName: '林雨薇' }, limit: 5 },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customer: expect.objectContaining({ storeId: 1, OR: expect.arrayContaining([{ name: { contains: '林雨薇' } }]) }),
      }),
      take: 5,
    }));
    expect(result.status).toBe('success');
    expect((result.data as any).items[0]).toMatchObject({
      customerName: '林雨薇',
      cardName: '补水护理 10 次卡',
      totalTimes: 10,
      remainingTimes: 3,
      usedTimes: 7,
      statusLabel: '可用',
    });
  });

  it('does not expose card package status without customer context', async () => {
    const service = new AgentV2BusinessRecordQueryService({
      customerCard: { findMany: jest.fn() },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'card.package.status.lookup', question: '这个客人的次卡有效期还有多久' },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect(result.summary).toContain('需要提供客户名、手机号或客户 ID');
  });

  it('lists inactive card package customers from real customer cards and usage records', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 201,
        cardId: 7,
        customerId: 8,
        cardName: '补水护理 10 次卡',
        totalTimes: 10,
        remainingTimes: 4,
        status: 'active',
        createdAt: new Date('2026-04-01T02:00:00.000Z'),
        expiryDate: new Date('2026-12-01T00:00:00.000Z'),
        customer: { id: 8, name: '林雨薇', phone: '13900000000', store: { id: 1, name: 'Ami 全量演示门店' } },
        card: { id: 7, name: '补水护理 10 次卡', totalTimes: 10 },
        usageRecords: [{ verifiedAt: new Date('2026-04-15T02:00:00.000Z'), projectName: '深层补水护理' }],
      },
    ]);
    const service = new AgentV2BusinessRecordQueryService({
      customerCard: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'card.package.inactive-customers.list', filters: { inactiveDays: 30 }, limit: 10 },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customer: { storeId: 1 },
        remainingTimes: { gt: 0 },
      }),
    }));
    expect(result.status).toBe('success');
    expect(result.title).toBe('次卡沉睡客户名单');
    expect((result.data as any).items[0]).toMatchObject({
      customerName: '林雨薇',
      cardName: '补水护理 10 次卡',
      remainingTimes: 4,
      lastProjectName: '深层补水护理',
    });
    expect(result.evidence?.source).toContain('CustomerCard');
  });

  it('returns customer coupon status with explicit data gap when no customer context exists', async () => {
    const service = new AgentV2BusinessRecordQueryService({
      customer: { findMany: jest.fn() },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'customer.coupon.status.lookup', question: '这位客人有没有未核销的优惠券' },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(result.status).toBe('no_data');
    expect((result.data as any).dataGap).toBe('missing_customer_context');
    expect(result.summary).toContain('需要提供客户名、手机号或客户 ID');
  });

  it('looks up used promotion orders and available promotion inventory for a customer', async () => {
    const customerFindMany = jest.fn().mockResolvedValue([{ id: 8, name: '林雨薇', phone: '13900000000' }]);
    const productOrderFindMany = jest.fn().mockResolvedValue([
      {
        id: 12,
        orderNo: 'POM001',
        customerId: 8,
        customerName: '林雨薇',
        promotionId: 3,
        couponId: null,
        discountSource: 'promotion',
        createdAt: new Date('2026-07-01T02:00:00.000Z'),
      },
    ]);
    const promotionFindMany = jest.fn().mockResolvedValue([
      { id: 3, name: '回店护理礼遇', issuedCount: 10, usedCount: 6, validDays: 30, endAt: null },
      { id: 4, name: '生日护理券', issuedCount: 5, usedCount: 2, validDays: 14, endAt: null },
    ]);
    const service = new AgentV2BusinessRecordQueryService({
      customer: { findMany: customerFindMany },
      productOrder: { findMany: productOrderFindMany },
      promotion: { findMany: promotionFindMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'customer.coupon.status.lookup', filters: { customerName: '林雨薇' }, limit: 5 },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(customerFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 1, OR: expect.arrayContaining([{ name: { contains: '林雨薇' } }]) }),
    }));
    expect(productOrderFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 1, customerId: { in: [8] } }),
    }));
    expect(result.status).toBe('success');
    expect((result.data as any).dataGap).toBe('customer_coupon_ledger_not_detected');
    expect((result.data as any).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ promotionName: '回店护理礼遇', statusLabel: '已使用' }),
      expect.objectContaining({ promotionName: '生日护理券', statusLabel: '可发放库存' }),
    ]));
  });

  it('queries payment records for cashier reconciliation', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 51,
        paymentNo: 'PAY-1',
        method: 'wechat',
        amount: 628,
        status: 'paid',
        paidAt: new Date('2026-07-01T02:00:00.000Z'),
        createdAt: new Date('2026-07-01T02:00:00.000Z'),
        transactionNo: 'WX-1',
        order: {
          id: 1,
          orderNo: 'POMQPDGTF8',
          orderKind: 'product',
          customerName: '杨紫萱',
          status: 'completed',
          totalAmount: 628,
          netAmount: 590,
          customer: { id: 1, name: '杨紫萱', phone: '13700000000' },
          store: { id: 1, name: 'Ami 全量演示门店' },
        },
      },
    ]);
    const service = new AgentV2BusinessRecordQueryService({
      paymentRecord: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'cashier.payment.records.list', question: '订单 POMQPDGTF8 有没有进财务', limit: 10 },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ order: expect.objectContaining({ storeId: 1, orderNo: { contains: 'POMQPDGTF8' } }) }),
    }));
    expect((result.data as any).items[0]).toMatchObject({
      orderNo: 'POMQPDGTF8',
      methodLabel: '微信',
      amount: 628,
    });
  });

  it('queries staff commission records by staffUserId first', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 61,
        staffUserId: 2,
        sourceType: 'project',
        sourceAmount: 458,
        rate: 0.08,
        amount: 36.64,
        status: 'pending',
        settleMonth: '2026-07',
        createdAt: new Date('2026-07-01T02:00:00.000Z'),
        staffUser: { id: 2, name: '周宁', username: 'beautician_6_2', role: 'beautician' },
        beautician: { id: 3, name: '周宁' },
        order: { id: 4, orderNo: 'PO-1', orderKind: 'project' },
        orderItem: { id: 5, name: '精华导入护理', itemType: 'project' },
        rule: { id: 6, name: '项目通用提成 8%', type: 'project' },
      },
    ]);
    const service = new AgentV2BusinessRecordQueryService({
      commissionRecord: { findMany },
    } as unknown as PrismaService);

    const result = await service.execute(
      { capabilityId: 'finance.staff-commission.records.list', timeRange: { preset: 'today', label: '今天' } },
      { runId: 1, storeId: 1, role: 'manager' },
    );

    expect((result.data as any).items[0]).toMatchObject({
      staffName: '周宁',
      staffUserId: 2,
      amount: 36.64,
    });
  });
});
