import { FinanceMetricsService } from './finance-metrics.service';

describe('FinanceMetricsService', () => {
  const createPrisma = () => ({
    productOrder: { findMany: jest.fn() },
    paymentRecord: { findMany: jest.fn() },
    refundRecord: { findMany: jest.fn() },
    customerBalanceTransaction: { findMany: jest.fn() },
    cardUsageRecord: { findMany: jest.fn() },
    stockMovement: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
    commissionRecord: { findMany: jest.fn() },
    store: { findMany: jest.fn() },
    card: { findMany: jest.fn() },
  });

  it('aggregates daily cash, prepaid, operating revenue, member balance and profit from one source of truth', async () => {
    const prisma = createPrisma();
    const order = {
      id: 10,
      storeId: 1,
      customerId: 1,
      status: 'completed',
      totalAmount: 2000,
      netAmount: 2000,
      createdAt: new Date('2026-06-30T08:00:00.000Z'),
      orderItems: [
        { id: 1, itemType: 'project', itemId: 101, quantity: 1, netAmount: 500, subtotal: 500 },
        { id: 2, itemType: 'product', itemId: 201, quantity: 2, netAmount: 300, subtotal: 300 },
        { id: 3, itemType: 'card', itemId: 301, quantity: 1, netAmount: 1000, subtotal: 1000 },
        { id: 4, itemType: 'recharge', itemId: null, quantity: 1, netAmount: 200, subtotal: 200 },
      ],
      paymentRecords: [],
      refundRecords: [],
      store: { id: 1, name: 'Ami 全量演示门店' },
    };
    prisma.productOrder.findMany.mockResolvedValue([order]);
    prisma.paymentRecord.findMany.mockResolvedValue([
      { amount: 2000, method: 'wechat', status: 'success', paidAt: new Date('2026-06-30T08:10:00.000Z'), order: { storeId: 1 } },
      { amount: 100, method: 'cash', status: 'success', paidAt: new Date('2026-06-30T08:11:00.000Z'), order: { storeId: 1 } },
    ]);
    prisma.refundRecord.findMany.mockResolvedValue([
      { amount: 100, status: 'success', refundedAt: new Date('2026-06-30T09:00:00.000Z'), order },
    ]);
    prisma.customerBalanceTransaction.findMany.mockResolvedValue([
      { amount: 80, giftAmount: 20, storeId: 1, createdAt: new Date('2026-06-30T10:00:00.000Z') },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      {
        id: 20,
        storeId: 1,
        customerId: 2,
        projectId: 101,
        cardName: '补水 10 次卡',
        projectName: '补水护理',
        times: 1,
        recognizedAmount: 300,
        recognizedUnitValue: 300,
        verifiedAt: new Date('2026-06-30T11:00:00.000Z'),
      },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        sourceType: 'project_order',
        sourceId: 10,
        sourceNo: 'POM10',
        productId: 301,
        storeId: 1,
        quantity: -10,
        costAmount: 20,
        costSource: 'batch_snapshot',
        occurredAt: new Date('2026-06-30T11:01:00.000Z'),
        product: { costPrice: 2 },
      },
      {
        sourceType: 'card_usage',
        sourceId: 20,
        sourceNo: 'CARD20',
        productId: 301,
        storeId: 1,
        quantity: -10,
        costAmount: 20,
        costSource: 'batch_snapshot',
        occurredAt: new Date('2026-06-30T11:01:20.000Z'),
        product: { costPrice: 2 },
      },
      {
        sourceType: 'product_order',
        sourceId: 10,
        sourceNo: 'POM10',
        productId: 201,
        storeId: 1,
        quantity: -2,
        costAmount: 100,
        costSource: 'batch_snapshot',
        occurredAt: new Date('2026-06-30T11:01:30.000Z'),
        product: { costPrice: 50 },
      },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: 201, costPrice: 50 }]);
    prisma.project.findMany.mockResolvedValue([
      { id: 101, bomItems: [{ productId: 301, standardQty: 10, product: { id: 301, costPrice: 2 } }] },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ storeId: 1, amount: 50, createdAt: new Date('2026-06-30T11:02:00.000Z') }]);
    prisma.store.findMany.mockResolvedValue([{ id: 1, name: 'Ami 全量演示门店' }]);
    prisma.card.findMany.mockResolvedValue([]);

    const service = new FinanceMetricsService(prisma as any);
    const result = await service.getDailyMetrics({ storeId: 1, dateFrom: '2026-06-30', dateTo: '2026-06-30' });

    expect(result.total).toBe(1);
    expect(result.summary.cashIncome).toBe(2100);
    expect(result.summary.paymentBreakdown).toMatchObject({ cash: 100, wechat: 2000, alipay: 0, card: 0, total: 2100 });
    expect(result.summary.prepaidAmount).toBe(1200);
    expect(result.summary.cardUsageRecognized).toBe(300);
    expect(result.summary.memberBalanceDeductCash).toBe(80);
    expect(result.summary.memberBalanceDeductGift).toBe(20);
    expect(result.summary.memberBalanceDeductTotal).toBe(100);
    expect(result.summary.refundAmount).toBe(100);
    expect(result.summary.operatingRevenue).toBe(1060);
    expect(result.summary.materialCost).toBe(40);
    expect(result.summary.productCost).toBe(100);
    expect(result.summary.commissionCost).toBe(50);
    expect(result.summary.grossProfit).toBe(870);
    expect(result.summary.customerCount).toBe(2);
    expect(result.summary.dataQuality.status).toBe('complete');
  });

  it('separates actual, estimated and missing costs in daily cost quality', async () => {
    const prisma = createPrisma();
    const actualOrder = {
      id: 20,
      orderNo: 'POM20',
      storeId: 1,
      customerId: 1,
      status: 'completed',
      totalAmount: 820,
      netAmount: 820,
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
      orderItems: [
        { id: 21, itemType: 'project', itemId: 101, quantity: 1, netAmount: 300, subtotal: 300, name: '实际耗材项目' },
        { id: 22, itemType: 'project', itemId: 102, quantity: 1, netAmount: 200, subtotal: 200, name: 'BOM 估算项目' },
        { id: 23, itemType: 'product', itemId: 201, quantity: 2, netAmount: 120, subtotal: 120, name: '有批次商品' },
        { id: 24, itemType: 'product', itemId: 202, quantity: 1, netAmount: 80, subtotal: 80, name: '主档估算商品' },
        { id: 25, itemType: 'product', itemId: 203, quantity: 1, netAmount: 120, subtotal: 120, name: '缺成本商品' },
      ],
      paymentRecords: [],
      refundRecords: [],
      store: { id: 1, name: 'Ami 全量演示门店' },
    };
    prisma.productOrder.findMany.mockResolvedValue([actualOrder]);
    prisma.paymentRecord.findMany.mockResolvedValue([]);
    prisma.refundRecord.findMany.mockResolvedValue([]);
    prisma.customerBalanceTransaction.findMany.mockResolvedValue([]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        storeId: 1,
        sourceType: 'project_order',
        sourceId: 20,
        sourceNo: 'POM20',
        movementType: 'service_consume',
        quantity: -1,
        unitCost: 30,
        costAmount: 30,
        costSource: 'batch_snapshot',
        occurredAt: new Date('2026-07-01T08:05:00.000Z'),
        productId: 301,
        product: { id: 301, name: '精华液', costPrice: 99 },
      },
      {
        storeId: 1,
        sourceType: 'product_order',
        sourceId: 20,
        sourceNo: 'POM20',
        movementType: 'sale_out',
        quantity: -2,
        unitCost: 12,
        costAmount: 24,
        costSource: 'batch_snapshot',
        occurredAt: new Date('2026-07-01T08:06:00.000Z'),
        productId: 201,
        product: { name: '有批次商品', costPrice: 50 },
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 201, costPrice: 50 },
      { id: 202, costPrice: 40 },
      { id: 203, costPrice: 0 },
    ]);
    prisma.project.findMany.mockResolvedValue([
      { id: 101, bomItems: [{ productId: 301, standardQty: 1, product: { id: 301, costPrice: 20 } }] },
      { id: 102, bomItems: [{ productId: 302, standardQty: 1, product: { id: 302, costPrice: 15 } }] },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ storeId: 1, amount: 10, createdAt: new Date('2026-07-01T09:00:00.000Z') }]);
    prisma.store.findMany.mockResolvedValue([{ id: 1, name: 'Ami 全量演示门店' }]);
    prisma.card.findMany.mockResolvedValue([]);

    const service = new FinanceMetricsService(prisma as any);
    const result = await service.getDailyMetrics({ storeId: 1, dateFrom: '2026-07-01', dateTo: '2026-07-01' });
    const summary = result.summary as any;

    expect(summary.materialCostActual).toBe(30);
    expect(summary.materialCostEstimated).toBe(15);
    expect(summary.materialCostMissing).toBe(0);
    expect(summary.productCostActual).toBe(24);
    expect(summary.productCostEstimated).toBe(40);
    expect(summary.productCostMissing).toBe(120);
    expect(summary.materialCost).toBe(45);
    expect(summary.productCost).toBe(64);
    expect(summary.costQuality.status).toBe('missing');
    expect(summary.costQuality.reasons).toEqual(expect.arrayContaining(['missing_batch_cost', 'product_master_estimate']));
    expect(summary.costQuality.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'product', itemName: '缺成本商品', reason: 'missing_batch_cost', suggestedAction: expect.stringContaining('商品成本') }),
        expect.objectContaining({ type: 'product', itemName: '主档估算商品', reason: 'product_master_estimate' }),
      ]),
    );
  });

  it('recognizes legacy order items on payment date and applies refund items to the exact business category', async () => {
    const prisma = createPrisma();
    const paidAt = new Date('2026-07-02T08:00:00.000Z');
    const order = {
      id: 31,
      storeId: 1,
      customerId: 9,
      createdAt: new Date('2026-07-01T08:00:00.000Z'),
      status: 'paid',
      netAmount: 500,
      totalAmount: 500,
      orderItems: [
        { id: 311, itemType: 'project', itemId: 101, quantity: 1, netAmount: 200, subtotal: 200 },
        { id: 312, itemType: 'recharge', quantity: 1, netAmount: 300, subtotal: 300 },
      ],
      paymentRecords: [{ status: 'success', amount: 500, paidAt }],
      refundRecords: [],
    };
    prisma.productOrder.findMany.mockResolvedValue([order]);
    prisma.paymentRecord.findMany.mockResolvedValue([{ id: 1, amount: 500, method: 'wechat', status: 'success', paidAt, order: { storeId: 1 } }]);
    prisma.refundRecord.findMany.mockResolvedValue([{
      id: 71,
      orderId: 31,
      amount: 420,
      refundMode: 'refund_only',
      status: 'success',
      refundedAt: new Date('2026-07-02T10:00:00.000Z'),
      order: { ...order, storeId: 1 },
      items: [
        { id: 1, orderItemId: 311, itemType: 'project', refundAmount: 120, stockMovements: [] },
        { id: 2, orderItemId: 312, itemType: 'recharge', refundAmount: 300, stockMovements: [] },
      ],
    }]);
    prisma.customerBalanceTransaction.findMany.mockResolvedValue([]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.commissionRecord.findMany.mockResolvedValue([]);
    prisma.store.findMany.mockResolvedValue([{ id: 1, name: 'Store' }]);
    prisma.card.findMany.mockResolvedValue([]);

    const service = new FinanceMetricsService(prisma as any);
    const result = await service.getDailyMetrics({ storeId: 1, dateFrom: '2026-07-02', dateTo: '2026-07-02' });

    expect(result.summary.operatingRevenue).toBe(80);
    expect(result.summary.prepaidAmount).toBe(0);
    expect(result.summary.refundAmount).toBe(420);
  });

  it('deduplicates customers across the full summary period and exposes order and customer averages separately', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      { id: 1, storeId: 1, customerId: 9, createdAt: new Date('2026-07-01T08:00:00.000Z'), status: 'paid', orderItems: [{ id: 1, itemType: 'project', netAmount: 100, subtotal: 100, recognizedAt: new Date('2026-07-01T08:00:00.000Z') }], paymentRecords: [], refundRecords: [] },
      { id: 2, storeId: 1, customerId: 9, createdAt: new Date('2026-07-02T08:00:00.000Z'), status: 'paid', orderItems: [{ id: 2, itemType: 'project', netAmount: 300, subtotal: 300, recognizedAt: new Date('2026-07-02T08:00:00.000Z') }], paymentRecords: [], refundRecords: [] },
    ]);
    prisma.paymentRecord.findMany.mockResolvedValue([]);
    prisma.refundRecord.findMany.mockResolvedValue([]);
    prisma.customerBalanceTransaction.findMany.mockResolvedValue([]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.commissionRecord.findMany.mockResolvedValue([]);
    prisma.store.findMany.mockResolvedValue([{ id: 1, name: 'Store' }]);
    prisma.card.findMany.mockResolvedValue([]);

    const service = new FinanceMetricsService(prisma as any);
    const result = await service.getDailyMetrics({ storeId: 1, dateFrom: '2026-07-01', dateTo: '2026-07-02' });

    expect(result.summary.customerCount).toBe(1);
    expect(result.summary.orderCount).toBe(2);
    expect(result.summary.avgOrderAmount).toBe(200);
    expect(result.summary.avgCustomerSpend).toBe(400);
  });
});
