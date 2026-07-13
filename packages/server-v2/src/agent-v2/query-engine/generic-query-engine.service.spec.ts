import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AgentV2CapabilityManifest } from '../capability/agent-v2-capability.types.js';
import { listAgentV2CapabilityManifests } from '../capability/agent-v2-capability-manifest.js';
import { GenericQueryEngineService } from './generic-query-engine.service.js';

const manifest = (capabilityId: string) => {
  const item = listAgentV2CapabilityManifests().find((capability) => capability.capabilityId === capabilityId);
  if (!item) throw new Error(`missing manifest: ${capabilityId}`);
  return item;
};

const genericRecordManifest = (override: Partial<AgentV2CapabilityManifest> = {}): AgentV2CapabilityManifest => ({
  ...manifest('order.product.records.list'),
  capabilityId: 'generic.payment.records.list',
  displayName: '通用支付流水',
  sourceModels: ['PaymentRecord', 'ProductOrder'],
  executor: { type: 'business_record_query', tool: 'business.record.query', queryKey: 'generic.record.query' },
  fieldPolicies: [
    { field: 'paymentNo', label: '支付单号', visibility: 'allow', reason: '通用记录展示字段' },
    { field: 'method', label: '支付方式', visibility: 'allow', reason: '通用记录展示字段' },
    { field: 'amount', label: '金额', visibility: 'allow', reason: '通用记录展示字段' },
    { field: 'rawPayload', label: '原始载荷', visibility: 'deny', reason: '不暴露原始支付载荷' },
  ],
  ...override,
});

const genericDetailManifest = (override: Partial<AgentV2CapabilityManifest> = {}): AgentV2CapabilityManifest => ({
  ...manifest('order.product.records.list'),
  capabilityId: 'customer.customers.id.detail',
  displayName: '客户详情',
  sourceModels: ['Customer', 'CustomerHealthProfile'],
  executor: { type: 'business_detail_query', tool: 'business.detail.query', queryKey: 'auto.detail' },
  actions: ['lookup'],
  fieldPolicies: [
    { field: 'name', label: '客户姓名', visibility: 'allow', reason: '详情展示字段' },
    { field: 'phone', label: '手机号', visibility: 'mask', reason: '详情脱敏字段' },
    { field: 'internalNote', label: '内部备注', visibility: 'deny', reason: '内部字段不出站' },
  ],
  ...override,
});

describe('GenericQueryEngineService', () => {
  it('blocks store-scoped queries when runtime context has no storeId', async () => {
    const findMany = jest.fn();
    const service = new GenericQueryEngineService({ productOrder: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('order.product.records.list'),
      args: { capabilityId: 'order.product.records.list', limit: 10 },
      context: { runId: 1, storeId: undefined as unknown as number, role: 'manager' },
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'failed',
      data: {
        reason: 'query_plan_failed',
      },
    });
    expect(result?.evidence?.filters).toContain('storeScope=required');
  });

  it('infers Chinese recent date range for built-in scrap record queries', async () => {
    const now = new Date('2026-07-06T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    try {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = new GenericQueryEngineService({ stockMovement: { findMany } } as unknown as PrismaService);

      const result = await service.tryExecute({
        manifest: manifest('inventory.scrap.records.list'),
        args: { capabilityId: 'inventory.scrap.records.list', question: '最近30天报废的产品有哪些', limit: 10 },
        context: { runId: 1, storeId: 1, role: 'manager' },
      });

      const call = findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({
        storeId: 1,
        movementType: 'scrap_out',
        occurredAt: { gte: expect.any(Date), lt: expect.any(Date) },
      });
      expect(call.where.occurredAt.gte.getTime()).toBeLessThanOrEqual(now.getTime() - 29 * 86_400_000);
      expect(call.where.occurredAt.lt).toEqual(now);
      expect((result?.data as any).timeRange).toMatchObject({ label: '近 30 天', preset: 'last_30_days' });
      expect(result?.summary).toContain('近 30 天');
    } finally {
      jest.useRealTimers();
    }
  });

  it('executes dynamic detail queries from manifest metadata', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 7,
      storeId: 1,
      name: '林雨薇',
      phone: '13800000000',
      internalNote: '高敏备注',
    });
    const service = new GenericQueryEngineService({ customer: { findFirst } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: genericDetailManifest(),
      args: { capabilityId: 'customer.customers.id.detail', filters: { id: 7 } },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { storeId: 1, id: 7 },
      select: { id: true, name: true, phone: true },
    });
    expect(result?.status).toBe('success');
    expect((result?.data as any).detail).toMatchObject({
      id: 7,
      name: '林雨薇',
      phone: '已脱敏',
    });
    expect((result?.data as any).detail.internalNote).toBeUndefined();
    expect((result?.data as any).queryTrace).toMatchObject({
      kind: 'detail.query',
      sourceModel: 'Customer',
      sqlSummary: expect.objectContaining({ operation: 'findFirst' }),
    });
  });

  it('returns no_data for dynamic detail dry-run without an id instead of unsupported', async () => {
    const findFirst = jest.fn();
    const service = new GenericQueryEngineService({ customer: { findFirst } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: genericDetailManifest(),
      args: { capabilityId: 'customer.customers.id.detail', dryRun: true },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findFirst).not.toHaveBeenCalled();
    expect(result?.status).toBe('no_data');
    expect((result?.data as any).requiredParameters).toEqual(['id']);
    expect((result?.data as any).queryTrace.sqlSummary.operation).toBe('findFirst');
  });

  it('executes store-scoped product order records from manifest metadata', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 11,
        orderNo: 'POMQPDGTF8',
        orderKind: 'product',
        customerName: '杨紫萱',
        totalAmount: 628,
        netAmount: 590,
        totalDiscountAmount: 38,
        payMethod: 'wechat',
        status: 'completed',
        source: 'admin',
        createdAt: new Date('2026-07-01T02:00:00.000Z'),
        remark: '内部备注',
        customer: { id: 1, name: '杨紫萱', phone: '13700000000' },
        store: { id: 1, name: 'Ami 全量演示门店' },
        orderItems: [{ id: 1, name: '洁面乳', itemType: 'product', quantity: 2 }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    const service = new GenericQueryEngineService({ productOrder: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('order.product.records.list'),
      args: { capabilityId: 'order.product.records.list', limit: 10 },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: 1,
        OR: expect.arrayContaining([{ orderKind: { in: ['product'] } }]),
      }),
      take: 10,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'order.product.records',
      sourceModel: 'ProductOrder',
      storeScope: 'required',
      sqlSummary: expect.objectContaining({
        dialect: 'prisma_sql_summary',
        operation: 'findMany',
        model: 'ProductOrder',
        sensitiveValuesRedacted: true,
      }),
    });
    expect((result?.data as any).queryTrace.sqlSummary.statementPreview).toContain('SELECT * FROM "ProductOrder"');
    expect((result?.data as any).items[0]).toMatchObject({
      orderNo: 'POMQPDGTF8',
      orderKindLabel: '商品订单',
      remark: '已脱敏',
    });
    expect(result?.evidence?.sourceTables).toContain('ProductOrder');
  });

  it('executes member card order records through the generic order adapter', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 21,
        orderNo: 'MCR20260705001',
        orderKind: 'member_card_recharge',
        customerName: '林雅',
        totalAmount: 1000,
        netAmount: 1000,
        totalDiscountAmount: 0,
        payMethod: 'alipay',
        status: 'completed',
        source: 'admin',
        createdAt: new Date('2026-07-05T02:00:00.000Z'),
        remark: '充值备注',
        customer: { id: 2, name: '林雅', phone: '13800000000' },
        store: { id: 1, name: 'Ami 全量演示门店' },
        orderItems: [{ id: 3, name: '会员卡充值', itemType: 'member_card', quantity: 1 }],
        paymentRecords: [{ id: 9, method: 'alipay', amount: 1000 }],
        refundRecords: [],
      },
    ]);
    const service = new GenericQueryEngineService({ productOrder: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('order.member-card.records.list'),
      args: { capabilityId: 'order.member-card.records.list', queryKey: 'order.member-card.records', limit: 10 },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: 1,
        OR: expect.arrayContaining([{ orderKind: { in: ['member_card_recharge', 'member_card_open', 'stored_value', 'recharge'] } }]),
      }),
      take: 10,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'order.member-card.records',
      sourceModel: 'ProductOrder',
    });
    expect((result?.data as any).items[0]).toMatchObject({
      orderNo: 'MCR20260705001',
      orderKindLabel: '会员卡充值',
      remark: '已脱敏',
    });
  });

  it('executes inventory expiring risk records from products and batches', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 9,
        sku: 'SKU-9',
        name: '玻尿酸精华',
        currentStock: 8,
        safetyStock: 5,
        costPrice: 18,
        specUnit: '瓶',
        updatedAt: new Date('2026-07-01T02:00:00.000Z'),
        category: { name: '精华' },
        batches: [{ stock: 8, expiryDate: new Date(Date.now() + 10 * 86_400_000), createdAt: new Date('2026-07-01T02:00:00.000Z') }],
      },
    ]);
    const service = new GenericQueryEngineService({ product: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('inventory.expiring-risk.list'),
      args: { capabilityId: 'inventory.expiring-risk.list', filters: { riskWindowDays: 30 }, limit: 10 },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 1, deletedAt: null },
      include: expect.objectContaining({ category: expect.any(Object), batches: expect.any(Object) }),
      orderBy: [{ currentStock: 'asc' }, { updatedAt: 'desc' }],
      take: 50,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).items[0]).toMatchObject({
      productName: '玻尿酸精华',
      stockQty: 8,
      statusLabel: '临期风险',
    });
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'inventory.expiring-risk',
      sourceModel: 'Product',
      sqlSummary: expect.objectContaining({ model: 'Product' }),
    });
    expect(result?.evidence?.metricDefinition).toContain('StockBatch.expiryDate');
  });

  it('executes card usage records with management source and query trace', async () => {
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
    const service = new GenericQueryEngineService({ cardUsageRecord: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('card.usage.records.list'),
      args: { capabilityId: 'card.usage.records.list', timeRange: { preset: 'today', label: '今天' }, limit: 10 },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: 1,
        verifiedAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      }),
      include: expect.objectContaining({
        customer: expect.any(Object),
        operator: expect.any(Object),
        device: expect.any(Object),
        sourceOrder: expect.any(Object),
      }),
      orderBy: { verifiedAt: 'desc' },
      take: 10,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).items[0]).toMatchObject({
      cardName: '补水护理 10 次卡',
      customerName: '林雨薇',
      operatorName: '系统管理员',
      entrySourceLabel: '管理端',
      recognizedAmount: 268,
    });
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'card.usage.records',
      kind: 'record.query',
      sourceModel: 'CardUsageRecord',
      storeScope: 'required',
      sqlSummary: expect.objectContaining({ model: 'CardUsageRecord' }),
    });
    expect(result?.evidence?.sourceTables).toContain('CardUsageRecord');
    expect(result?.evidence?.limitations?.join('\n')).toContain('管理端核销');
  });

  it('executes inactive card package customers from customer cards and usage records', async () => {
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
    const service = new GenericQueryEngineService({ customerCard: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('card.package.inactive-customers.list'),
      args: { capabilityId: 'card.package.inactive-customers.list', filters: { inactiveDays: 30 }, limit: 10 },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customer: { storeId: 1 },
        remainingTimes: { gt: 0 },
        status: { in: ['active', 'enabled', 'available'] },
        createdAt: expect.objectContaining({ lt: expect.any(Date) }),
      }),
      include: expect.objectContaining({
        customer: expect.any(Object),
        card: expect.any(Object),
        usageRecords: expect.any(Object),
      }),
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).items[0]).toMatchObject({
      customerName: '林雨薇',
      cardName: '补水护理 10 次卡',
      remainingTimes: 4,
      lastProjectName: '深层补水护理',
    });
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'card.package.inactive-customers.list',
      sourceModel: 'CustomerCard',
    });
    expect((result?.data as any).queryTrace.filters).toEqual(expect.arrayContaining(['customer.storeId=1', 'remainingTimes>0', 'status in active/enabled/available']));
    expect(result?.evidence?.limitations?.join('\n')).toContain('不自动下发触达');
  });

  it('executes card package order records from customer cards', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 101,
        cardId: 7,
        customerId: 8,
        cardName: '补水护理 10 次卡',
        totalTimes: 10,
        remainingTimes: 10,
        paidAmount: 1280,
        giftTimes: 1,
        status: 'active',
        createdAt: new Date('2026-07-01T02:00:00.000Z'),
        expiryDate: new Date('2026-08-01T00:00:00.000Z'),
        customer: { id: 8, name: '林雨薇', phone: '13900000000', store: { id: 1, name: 'Ami 全量演示门店' } },
        card: { id: 7, name: '补水护理 10 次卡', totalTimes: 10 },
        operator: { id: 1, name: '系统管理员', username: 'admin' },
        sourceOrder: { id: 7, orderNo: 'CARD-1', netAmount: 1280, totalAmount: 1280 },
      },
    ]);
    const service = new GenericQueryEngineService({ customerCard: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('order.card-package.records.list'),
      args: { capabilityId: 'order.card-package.records.list', timeRange: { preset: 'today', label: '今天' }, limit: 10 },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customer: { storeId: 1 },
        createdAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      }),
      include: expect.objectContaining({
        customer: expect.any(Object),
        card: expect.any(Object),
        operator: expect.any(Object),
        sourceOrder: expect.any(Object),
      }),
      orderBy: { createdAt: 'desc' },
      take: 10,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).items[0]).toMatchObject({
      sourceOrderNo: 'CARD-1',
      cardName: '补水护理 10 次卡',
      customerName: '林雨薇',
      paidAmount: 1280,
      statusLabel: '可用',
    });
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'order.card-package.records',
      kind: 'record.query',
      sourceModel: 'CustomerCard',
    });
    expect((result?.data as any).queryTrace.filters).toContain('customer.storeId=1');
    expect(result?.evidence?.limitations?.join('\n')).toContain('不回答核销服务流水');
  });

  it('executes customer consumption records from customer ledger', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 501,
        customerId: 8,
        consumeType: 'card_usage',
        consumeContent: JSON.stringify({ cardName: '补水护理 10 次卡', projectName: '深层补水护理' }),
        payMethod: 'member_card',
        amount: 268,
        campaign: '老客复购',
        consumeTime: new Date('2026-07-01T02:00:00.000Z'),
        customer: { id: 8, name: '林雨薇', phone: '13900000000', storeId: 1, store: { id: 1, name: 'Ami 全量演示门店' } },
      },
    ]);
    const service = new GenericQueryEngineService({ consumptionRecord: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('customer.consumption.records.list'),
      args: { capabilityId: 'customer.consumption.records.list', timeRange: { preset: 'today', label: '今天' }, limit: 10 },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        customer: { storeId: 1 },
        consumeTime: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      }),
      include: expect.objectContaining({ customer: expect.any(Object) }),
      orderBy: { consumeTime: 'desc' },
      take: 10,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).items[0]).toMatchObject({
      customerName: '林雨薇',
      consumeTypeLabel: '次卡核销',
      consumeContentText: '深层补水护理；补水护理 10 次卡',
      payMethodLabel: '会员卡划扣',
      amount: 268,
    });
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'customer.consumption.records',
      kind: 'record.query',
      sourceModel: 'ConsumptionRecord',
    });
    expect(result?.evidence?.limitations?.join('\n')).toContain('同步链路存在断点');
  });

  it('executes revenue trend with chart, metrics and evidence', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, orderNo: 'PO1', createdAt: new Date('2026-07-01T02:00:00.000Z'), netAmount: 100, totalAmount: 120, status: 'completed' },
      { id: 2, orderNo: 'PO2', createdAt: new Date('2026-07-02T02:00:00.000Z'), netAmount: 200, totalAmount: 220, status: 'completed' },
    ]);
    const service = new GenericQueryEngineService({ productOrder: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('finance.revenue.trend'),
      args: { capabilityId: 'finance.revenue.trend', timeRange: { preset: 'last_7_days', label: '近 7 天' } },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ storeId: 1, status: { notIn: expect.any(Array) } }),
      take: 5000,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).chart).toMatchObject({ chartType: 'line', xKey: 'date', yKeys: ['revenue'] });
    expect((result?.data as any).metrics).toMatchObject({ totalRevenue: 300, orderCount: 2, trendDirection: '上升' });
    expect(result?.evidence?.metricDefinition).toContain('ProductOrder.netAmount');
  });

  it('executes daily settlement metric from manifest metadata', async () => {
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
      },
    ]);
    const service = new GenericQueryEngineService({ dailySettlement: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('finance.daily-settlement.metric'),
      args: { capabilityId: 'finance.daily-settlement.metric', timeRange: { preset: 'this_month', label: '本月' } },
      context: { runId: 1, storeId: 6, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        storeId: 6,
        settleDate: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      }),
      orderBy: { settleDate: 'desc' },
      take: 60,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).metrics).toMatchObject({
      totalRevenue: 1200,
      refundAmount: 100,
      netRevenue: 1100,
      orderCount: 8,
      customerCount: 6,
    });
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'finance.daily-settlement.metric',
      kind: 'metric.query',
      sourceModel: 'DailySettlement',
      storeScope: 'required',
      sqlSummary: expect.objectContaining({ model: 'DailySettlement' }),
    });
    expect(result?.evidence?.limitations?.join('\n')).toContain('日结指标依赖日结生成任务');
  });

  it('executes payment method breakdown metric with trace and evidence', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 1, orderId: 11, method: 'wechat', amount: 120, status: 'success', paidAt: new Date('2026-07-02T03:00:00.000Z'), createdAt: new Date('2026-07-02T03:00:00.000Z') },
      { id: 2, orderId: 12, method: 'cash', amount: 80, status: 'success', paidAt: new Date('2026-07-02T04:00:00.000Z'), createdAt: new Date('2026-07-02T04:00:00.000Z') },
      { id: 3, orderId: 13, method: 'wechat', amount: 30, status: 'success', paidAt: new Date('2026-07-02T05:00:00.000Z'), createdAt: new Date('2026-07-02T05:00:00.000Z') },
    ]);
    const service = new GenericQueryEngineService({ paymentRecord: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('finance.payment-method-breakdown.metric'),
      args: { queryKey: 'finance.payment-method-breakdown.metric', timeRange: { preset: 'today', label: '今天' } },
      context: { runId: 1, storeId: 6, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        order: { storeId: 6 },
        OR: expect.any(Array),
      }),
      include: expect.objectContaining({ order: expect.any(Object) }),
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 2000,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).metrics).toMatchObject({
      totalRevenue: 230,
      totalPaymentCount: 3,
      totalOrderCount: 3,
      methodCount: 2,
    });
    expect((result?.data as any).items[0]).toMatchObject({ methodLabel: '微信', revenue: 150, paymentCount: 2 });
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'finance.payment-method-breakdown.metric',
      kind: 'metric.query',
      sourceModel: 'PaymentRecord',
      storeScope: 'required',
      sqlSummary: expect.objectContaining({
        operation: 'findMany',
        model: 'PaymentRecord',
        sensitiveValuesRedacted: true,
      }),
    });
    expect((result?.data as any).queryTrace.filters).toContain('order.storeId=6');
    expect(result?.evidence?.sourceTables).toContain('PaymentRecord');
    expect(result?.evidence?.limitations?.join('\n')).toContain('GenericQueryEngine');
  });

  it('executes refund metric with masked reason and trace', async () => {
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
    const service = new GenericQueryEngineService({ refundRecord: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('finance.refund.metric'),
      args: { capabilityId: 'finance.refund.metric', timeRange: { preset: 'today', label: '今天' } },
      context: { runId: 1, storeId: 6, role: 'manager' },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        order: { storeId: 6 },
        OR: expect.any(Array),
      }),
      include: expect.objectContaining({ order: expect.any(Object) }),
      orderBy: [{ refundedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).metrics).toMatchObject({ refundCount: 2, refundAmount: 100 });
    expect((result?.data as any).items[0]).toMatchObject({
      refundNo: 'RF001',
      amountText: '¥68.00',
      reason: '已脱敏',
    });
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'finance.refund.metric',
      kind: 'metric.query',
      sourceModel: 'RefundRecord',
      sqlSummary: expect.objectContaining({ model: 'RefundRecord' }),
    });
    expect((result?.data as any).queryTrace.filters).toContain('order.storeId=6');
    expect(result?.evidence?.limitations?.join('\n')).toContain('只读退款记录');
  });

  it('executes order detail by order number and keeps query trace', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 11,
      orderNo: 'POMQPDGTF8',
      orderKind: 'product',
      customerName: '杨紫萱',
      totalAmount: 628,
      netAmount: 590,
      totalDiscountAmount: 38,
      payMethod: 'wechat',
      status: 'completed',
      source: 'admin',
      createdAt: new Date('2026-07-01T02:00:00.000Z'),
      remark: '内部备注',
      customer: { id: 1, name: '杨紫萱', phone: '13700000000' },
      store: { id: 1, name: 'Ami 全量演示门店' },
      orderItems: [{ id: 1, name: '洁面乳', itemType: 'product', quantity: 2, unitPrice: 99, netAmount: 198 }],
      paymentRecords: [{ paymentNo: 'PAY-1', method: 'wechat', amount: 590, status: 'paid', paidAt: new Date('2026-07-01T02:00:00.000Z') }],
      refundRecords: [],
    });
    const service = new GenericQueryEngineService({ productOrder: { findFirst } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('order.detail.lookup'),
      args: { capabilityId: 'order.detail.lookup', question: '看一下订单 POMQPDGTF8' },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 1, orderNo: { contains: 'POMQPDGTF8' } },
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).detail).toMatchObject({
      orderNo: 'POMQPDGTF8',
      remark: '已脱敏',
    });
    expect((result?.data as any).queryTrace.sqlSummary).toMatchObject({
      operation: 'findFirst',
      model: 'ProductOrder',
    });
    expect((result?.data as any).items[0]).toMatchObject({ itemName: '洁面乳', itemTypeLabel: '商品' });
  });

  it('executes explicit generic record manifests with store FK path and display fields', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        paymentNo: 'PAY-001',
        method: 'wechat',
        amount: 120,
        rawPayload: 'secret',
        paidAt: new Date('2026-07-02T03:00:00.000Z'),
      },
    ]);
    const service = new GenericQueryEngineService({ paymentRecord: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: genericRecordManifest(),
      args: { timeRange: { preset: 'today', label: '今天' }, limit: 8 },
      context: { runId: 1, storeId: 6, role: 'manager', permissions: ['core:order:products'] },
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        order: { storeId: 6 },
        paidAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      },
      select: {
        id: true,
        paymentNo: true,
        method: true,
        amount: true,
      },
      orderBy: { paidAt: 'desc' },
      take: 8,
    });
    expect(result?.status).toBe('success');
    expect((result?.data as any).items[0]).toMatchObject({
      paymentNo: 'PAY-001',
      method: 'wechat',
      amount: 120,
    });
    expect((result?.data as any).items[0].rawPayload).toBeUndefined();
    expect((result?.data as any).queryTrace).toMatchObject({
      engine: 'generic_query_engine',
      queryKey: 'generic.record.query',
      kind: 'record.query',
      sourceModel: 'PaymentRecord',
      select: ['id', 'paymentNo', 'method', 'amount'],
      filters: expect.arrayContaining(['order.storeId=6']),
      permissionCheck: {
        required: ['core:order:products'],
        granted: ['core:order:products'],
        missing: [],
        wildcard: false,
        allowed: true,
      },
      sqlSummary: expect.objectContaining({
        model: 'PaymentRecord',
        select: ['id', 'paymentNo', 'method', 'amount'],
        sensitiveValuesRedacted: true,
      }),
    });
    expect((result?.data as any).queryTrace.sqlSummary.statementPreview).toContain('SELECT id, paymentNo, method, amount FROM "PaymentRecord"');
    expect(result?.evidence?.limitations?.join('\n')).toContain('动态查询只读取 Manifest 字段策略允许的字段');
  });

  it('executes auto-published semantic record query keys through the dynamic record engine', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 2,
        paymentNo: 'PAY-SEM-001',
        method: 'cash',
        amount: 88,
        paidAt: new Date('2026-07-03T03:00:00.000Z'),
      },
    ]);
    const service = new GenericQueryEngineService({ paymentRecord: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: genericRecordManifest({
        capabilityId: 'cashier.payment.records.auto.list',
        displayName: '自动发布支付记录',
        executor: {
          type: 'business_record_query',
          tool: 'business.record.query',
          queryKey: 'cashier.payment.records.auto',
        },
      }),
      args: { timeRange: { preset: 'today', label: '今天' }, limit: 5 },
      context: { runId: 1, storeId: 6, role: 'manager', permissions: ['*'] },
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        order: { storeId: 6 },
        paidAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      },
      take: 5,
    }));
    expect(result?.status).toBe('success');
    expect((result?.data as any).items[0]).toMatchObject({
      paymentNo: 'PAY-SEM-001',
      method: 'cash',
      amount: 88,
    });
    expect((result?.data as any).queryTrace).toMatchObject({
      queryKey: 'cashier.payment.records.auto',
      sourceModel: 'PaymentRecord',
      select: ['id', 'paymentNo', 'method', 'amount'],
      permissionCheck: expect.objectContaining({
        wildcard: true,
        allowed: true,
      }),
    });
  });

  it('derives store filters from knowledge graph FK paths and applies manifest query plan', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 10, itemType: 'product', netAmount: 80, createdAt: new Date('2026-07-02T02:00:00.000Z') },
      { id: 11, itemType: 'project', netAmount: 120, createdAt: new Date('2026-07-02T03:00:00.000Z') },
    ]);
    const service = new GenericQueryEngineService({ orderItem: { findMany } } as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: genericRecordManifest({
        capabilityId: 'generic.order-item.records.list',
        displayName: '通用订单明细',
        sourceModels: ['OrderItem'],
        fieldPolicies: [
          { field: 'itemType', label: '明细类型', visibility: 'allow', reason: '通用记录展示字段' },
          { field: 'netAmount', label: '实收金额', visibility: 'allow', reason: '通用记录展示字段' },
          { field: 'createdAt', label: '创建时间', visibility: 'allow', reason: '通用记录展示字段' },
        ],
        queryPlan: {
          orderBy: { netAmount: 'desc' },
          take: 5,
          aggregation: [
            { type: 'count', as: 'itemCount' },
            { type: 'sum', field: 'netAmount', as: 'netAmountTotal' },
          ],
        },
      }),
      args: { question: '昨天订单明细' },
      context: { runId: 1, storeId: 6, role: 'manager', permissions: ['core:order:view'] },
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        order: { storeId: 6 },
        createdAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
      },
      select: {
        id: true,
        itemType: true,
        netAmount: true,
        createdAt: true,
      },
      orderBy: { netAmount: 'desc' },
      take: 5,
    });
    expect((result?.data as any).metrics).toEqual({ itemCount: 2, netAmountTotal: 200 });
    expect((result?.data as any).queryTrace).toMatchObject({
      graphRelationPath: ['OrderItem.order->ProductOrder', 'ProductOrder.store->Store'],
      filters: expect.arrayContaining(['order.storeId=6']),
      aggregation: [
        { type: 'count', as: 'itemCount' },
        { type: 'sum', field: 'netAmount', as: 'netAmountTotal' },
      ],
      orderBy: { netAmount: 'desc' },
      take: 5,
    });
    expect((result?.data as any).timeRange.preset).toBe('yesterday');
  });

  it('returns needs_development when explicit generic record manifest has no Prisma delegate', async () => {
    const service = new GenericQueryEngineService({} as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: genericRecordManifest({ sourceModels: ['UnknownModel'] }),
      args: { limit: 5 },
      context: { runId: 1, storeId: 6, role: 'manager' },
    });

    expect(result).toMatchObject({
      status: 'failed',
      data: {
        reason: 'needs_development',
      },
    });
    expect(result?.summary).toContain('UnknownModel');
  });

  it('returns null for capabilities not migrated to the generic engine yet', async () => {
    const service = new GenericQueryEngineService({} as unknown as PrismaService);

    const result = await service.tryExecute({
      manifest: manifest('customer.coupon.status.lookup'),
      args: { capabilityId: 'customer.coupon.status.lookup' },
      context: { runId: 1, storeId: 1, role: 'manager' },
    });

    expect(result).toBeNull();
  });
});
