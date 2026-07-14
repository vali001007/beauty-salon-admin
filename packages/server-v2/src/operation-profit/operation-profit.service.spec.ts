import { OperationProfitService } from './operation-profit.service';

describe('OperationProfitService', () => {
  const createPrisma = () => ({
    productOrder: { findMany: jest.fn() },
    cardUsageRecord: { findMany: jest.fn() },
    card: { findMany: jest.fn() },
    operatingCost: { findMany: jest.fn() },
    stockMovement: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    commissionRecord: { aggregate: jest.fn(), findMany: jest.fn() },
    customerBalanceTransaction: { aggregate: jest.fn(), findMany: jest.fn() },
    project: { findMany: jest.fn(), count: jest.fn() },
    customerCard: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    beautician: { findMany: jest.fn() },
    customerBalanceAccount: { findMany: jest.fn() },
    monthlyProfitClose: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    memberLiabilitySnapshot: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    financeAuditLog: { create: jest.fn() },
  });
  const mockProjectMarginProjects = (prisma: ReturnType<typeof createPrisma>, projects: any[], allProjectIds = projects.map((project) => ({ id: project.id }))) => {
    prisma.project.findMany.mockResolvedValueOnce(projects).mockResolvedValueOnce(allProjectIds);
  };

  it('separates cash income from operating income and reports missing cost quality', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 10,
        orderNo: 'O10',
        customerId: 1,
        totalAmount: 1200,
        status: 'completed',
        createdAt: new Date('2026-06-10T10:00:00.000Z'),
        orderItems: [
          { id: 1, itemType: 'project', itemId: 101, quantity: 1, subtotal: 500 },
          { id: 2, itemType: 'product', itemId: 201, quantity: 2, subtotal: 300 },
          { id: 3, itemType: 'card', itemId: 301, quantity: 1, subtotal: 400 },
        ],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      {
        id: 20,
        customerId: 1,
        cardName: '补水卡',
        projectName: '补水护理',
        times: 1,
        verifiedAt: new Date('2026-06-11T10:00:00.000Z'),
      },
    ]);
    prisma.card.findMany.mockResolvedValue([{ name: '补水卡', price: 1000, totalTimes: 10 }]);
    prisma.operatingCost.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([{ id: 201, costPrice: 50 }]);
    prisma.commissionRecord.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.customerBalanceTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const service = new OperationProfitService(prisma as any);
    const result = await service.getOverview({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.summary.cashIncome).toBe(1200);
    expect(result.summary.operatingIncome).toBe(900);
    expect(result.trend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-06-10', cashIncome: 1200, operatingIncome: 800 }),
        expect.objectContaining({ date: '2026-06-11', cashIncome: 0, operatingIncome: 100 }),
      ]),
    );
    expect(result.dataQuality.status).toBe('missing_cost');
    expect(result.dataQuality.missingCostReasons).toEqual(
      expect.arrayContaining(['missing_cost', 'missing_actual_consumption', 'missing_commission']),
    );
    expect(result.readiness).toEqual(expect.objectContaining({ status: 'blocked', publishable: false }));
  });

  it('creates versioned monthly profit closes and blocks confirmation when readiness is not publishable', async () => {
    const prisma = createPrisma();
    const service = new OperationProfitService(prisma as any);
    jest.spyOn(service, 'getOverview').mockResolvedValue({
      summary: { operatingIncome: 1000, grossProfit: 500, operatingProfit: 300 },
      costBreakdown: [
        { key: 'material', amount: 100 },
        { key: 'product', amount: 200 },
        { key: 'commission', amount: 200 },
        { key: 'rent', amount: 200 },
      ],
      dataQuality: { status: 'complete', missingCostReasons: [] },
      readiness: { status: 'ready', publishable: true, blockers: [], warnings: [] },
    } as any);
    prisma.monthlyProfitClose.findFirst.mockResolvedValue(null);
    prisma.monthlyProfitClose.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));

    const draft = await service.generateMonthlyClose(3, '2026-06', { userId: 7, storeIds: [3], roles: ['store_manager'], permissions: [] });
    expect(draft).toEqual(expect.objectContaining({ version: 1, status: 'draft', operatingRevenue: 1000, operatingProfit: 300 }));

    prisma.monthlyProfitClose.findUnique.mockResolvedValue({ id: 1, storeId: 3, status: 'draft', dataQuality: { readiness: { publishable: false } } });
    await expect(service.confirmMonthlyClose(1, { userId: 7, storeIds: [3], roles: ['store_manager'], permissions: [] })).rejects.toThrow('利润数据未达到发布条件');
  });

  it('reopens a confirmed monthly close without overwriting its version', async () => {
    const prisma = createPrisma();
    const service = new OperationProfitService(prisma as any);
    prisma.monthlyProfitClose.findUnique.mockResolvedValue({ id: 8, storeId: 3, periodMonth: '2026-06', version: 1, status: 'confirmed' });
    prisma.monthlyProfitClose.update.mockResolvedValue({ id: 8, storeId: 3, periodMonth: '2026-06', version: 1, status: 'reopened' });

    const result = await service.reopenMonthlyClose(8, '补录六月房租后重新结账', { userId: 1, storeIds: [], roles: ['super_admin'], permissions: ['*'] });
    expect(result).toEqual(expect.objectContaining({ version: 1, status: 'reopened' }));
    expect(prisma.monthlyProfitClose.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 8 }, data: expect.objectContaining({ status: 'reopened', reopenReason: '补录六月房租后重新结账' }) }));
  });

  it('returns a confirmed liability snapshot for a historical as-of date', async () => {
    const prisma = createPrisma();
    const service = new OperationProfitService(prisma as any);
    prisma.memberLiabilitySnapshot.findFirst.mockResolvedValue({
      id: 6,
      storeId: 3,
      snapshotDate: new Date('2026-06-30T00:00:00.000Z'),
      cashContractLiability: 1000,
      giftObligation: 200,
      cardLiability: 800,
      remainingTimes: 16,
      status: 'confirmed',
    });

    const result = await service.getPrepaidLiabilities({ storeId: 3, asOfDate: '2026-06-30' } as any);
    expect(result.summary).toEqual(expect.objectContaining({ totalLiability: 2000, cashBalance: 1000, giftBalance: 200, cardLiability: 800, remainingTimes: 16 }));
    expect(result.snapshot).toEqual(expect.objectContaining({ id: 6, status: 'confirmed' }));
  });

  it('prorates monthly operating costs and excludes actual-date costs outside a partial-month query', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([{
      id: 10, orderNo: 'O10', customerId: 1, totalAmount: 2000, status: 'completed', createdAt: new Date('2026-07-05T08:00:00.000Z'),
      orderItems: [{ id: 1, itemType: 'project', itemId: 101, quantity: 1, netAmount: 2000, subtotal: 2000 }], paymentRecords: [], refundRecords: [],
    }]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.operatingCost.findMany.mockResolvedValue([
      { id: 1, category: 'rent', amount: 3100, allocationType: 'store_month', periodMonth: '2026-07', costDate: new Date('2026-07-01') },
      { id: 2, category: 'marketing', amount: 500, allocationType: 'actual_date', periodMonth: '2026-07', costDate: new Date('2026-07-20') },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([{ sourceType: 'project_order', sourceId: 10, productId: 1, quantity: -1, costAmount: 200 }]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.commissionRecord.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
    prisma.customerBalanceTransaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });

    const service = new OperationProfitService(prisma as any);
    const result = await service.getOverview({ storeId: 1, from: '2026-07-01', to: '2026-07-10' });

    expect(result.costBreakdown).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'rent', amount: 1000 })]));
    expect(result.costBreakdown.some((item) => item.key === 'marketing')).toBe(false);
    expect(result.summary.operatingProfit).toBe(700);
  });

  it('builds daily profit from each day gross profit instead of applying one period margin', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.operatingCost.findMany.mockResolvedValue([{ id: 1, category: 'rent', amount: 3100, allocationType: 'store_month', periodMonth: '2026-07', costDate: new Date('2026-07-01') }]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.commissionRecord.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.customerBalanceTransaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    const financeMetrics = { getDailyMetrics: jest.fn().mockResolvedValue({
      summary: { cashIncome: 700, operatingRevenue: 700, grossProfit: 500, grossMargin: 0.7143, customerCount: 2, avgTicket: 350, prepaidAmount: 0, cardUsageRecognized: 0, dataQuality: { missingReasons: [] } },
      items: [
        { date: '2026-07-01', cashIncome: 200, operatingRevenue: 200, grossProfit: 100 },
        { date: '2026-07-02', cashIncome: 500, operatingRevenue: 500, grossProfit: 400 },
      ],
    }) };
    const service = new OperationProfitService(prisma as any, financeMetrics as any);

    const result = await service.getOverview({ storeId: 1, from: '2026-07-01', to: '2026-07-02' });
    expect(result.trend).toEqual([
      expect.objectContaining({ date: '2026-07-01', grossProfit: 100, operatingProfit: 0 }),
      expect.objectContaining({ date: '2026-07-02', grossProfit: 400, operatingProfit: 300 }),
    ]);
  });

  it('uses product order cost snapshots in overview gross profit', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 12,
        orderNo: 'O12',
        customerId: 1,
        totalAmount: 200,
        status: 'completed',
        createdAt: new Date('2026-06-10T10:00:00.000Z'),
        orderItems: [
          {
            id: 4,
            itemType: 'product',
            itemId: 201,
            quantity: 2,
            subtotal: 200,
            payload: { costAmount: 80 },
          },
        ],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.operatingCost.findMany.mockResolvedValue([
      { category: 'rent', amount: 1 },
      { category: 'salary', amount: 1 },
      { category: 'marketing', amount: 1 },
      { category: 'utilities', amount: 1 },
      { category: 'depreciation', amount: 1 },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([{ id: 201, costPrice: 120 }]);
    prisma.commissionRecord.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.customerBalanceTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const service = new OperationProfitService(prisma as any);
    const result = await service.getOverview({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    const productCost = result.costBreakdown.find((item) => item.key === 'product');
    expect(productCost?.amount).toBe(80);
    expect(result.summary.grossProfit).toBe(120);
  });

  it('reports missing cost when overview product income has no product cost', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 13,
        orderNo: 'O13',
        customerId: 1,
        totalAmount: 160,
        status: 'completed',
        createdAt: new Date('2026-06-10T10:00:00.000Z'),
        orderItems: [{ id: 5, itemType: 'product', itemId: 202, quantity: 1, subtotal: 160, payload: {} }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.operatingCost.findMany.mockResolvedValue([
      { category: 'rent', amount: 1 },
      { category: 'salary', amount: 1 },
      { category: 'marketing', amount: 1 },
      { category: 'utilities', amount: 1 },
      { category: 'depreciation', amount: 1 },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.product.findMany.mockResolvedValue([{ id: 202, costPrice: 0 }]);
    prisma.commissionRecord.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prisma.customerBalanceTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const service = new OperationProfitService(prisma as any);
    const result = await service.getOverview({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.dataQuality.status).toBe('missing_cost');
    expect(result.dataQuality.missingCostReasons).toEqual(expect.arrayContaining(['missing_cost']));
  });

  it('deducts only product and project order item commissions in overview gross profit', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 14,
        orderNo: 'O14',
        customerId: 1,
        totalAmount: 650,
        status: 'completed',
        createdAt: new Date('2026-06-10T10:00:00.000Z'),
        orderItems: [
          { id: 6, itemType: 'project', itemId: 101, quantity: 1, subtotal: 500 },
          { id: 7, itemType: 'card', itemId: 301, quantity: 1, subtotal: 150 },
        ],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.operatingCost.findMany.mockResolvedValue([
      { category: 'rent', amount: 1 },
      { category: 'salary', amount: 1 },
      { category: 'marketing', amount: 1 },
      { category: 'utilities', amount: 1 },
      { category: 'depreciation', amount: 1 },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([{ quantity: -1, product: { costPrice: 80 } }]);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.commissionRecord.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    prisma.customerBalanceTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const service = new OperationProfitService(prisma as any);
    const result = await service.getOverview({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(prisma.commissionRecord.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderItemId: { in: [6] },
          type: { in: ['project', 'product'] },
        }),
      }),
    );
    expect(result.summary.operatingIncome).toBe(500);
    expect(result.costBreakdown.find((item) => item.key === 'commission')?.amount).toBe(50);
    expect(result.summary.grossProfit).toBe(370);
  });

  it('deducts completed refunds from overview operating income and trend income', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 15,
        orderNo: 'O15',
        customerId: 1,
        totalAmount: 600,
        status: 'completed',
        createdAt: new Date('2026-06-10T10:00:00.000Z'),
        orderItems: [
          { id: 8, itemType: 'project', itemId: 101, quantity: 1, subtotal: 500 },
          { id: 9, itemType: 'product', itemId: 201, quantity: 1, subtotal: 100, payload: { costAmount: 20 } },
        ],
        paymentRecords: [],
        refundRecords: [{ id: 91, amount: 120, status: 'completed' }],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.operatingCost.findMany.mockResolvedValue([
      { category: 'rent', amount: 1 },
      { category: 'salary', amount: 1 },
      { category: 'marketing', amount: 1 },
      { category: 'utilities', amount: 1 },
      { category: 'depreciation', amount: 1 },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([{ quantity: -1, product: { costPrice: 80 } }]);
    prisma.product.findMany.mockResolvedValue([{ id: 201, costPrice: 20 }]);
    prisma.commissionRecord.aggregate.mockResolvedValue({ _sum: { amount: 50 } });
    prisma.customerBalanceTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const service = new OperationProfitService(prisma as any);
    const result = await service.getOverview({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.summary.cashIncome).toBe(480);
    expect(result.summary.operatingIncome).toBe(480);
    expect(result.incomeBreakdown.find((item) => item.key === 'single_service')?.amount).toBe(400);
    expect(result.incomeBreakdown.find((item) => item.key === 'product_sales')?.amount).toBe(80);
    expect(result.incomeBreakdown.find((item) => item.key === 'refund')?.amount).toBe(120);
    expect(result.trend).toEqual([expect.objectContaining({ date: '2026-06-10', cashIncome: 600, operatingIncome: 480 })]);
    expect(result.summary.grossProfit).toBe(330);
  });

  it('returns project margin rows with missing BOM reasons', async () => {
    const prisma = createPrisma();
    mockProjectMarginProjects(prisma, [
      { id: 101, name: '补水护理', price: 500, type: { name: '面护' }, bomItems: [] },
    ]);
    prisma.project.count.mockResolvedValue(1);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 10,
        orderNo: 'O10',
        totalAmount: 500,
        status: 'completed',
        createdAt: new Date('2026-06-10T10:00:00.000Z'),
        orderItems: [{ id: 1, itemType: 'project', itemId: 101, quantity: 1, subtotal: 500 }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 41, orderItemId: 21, amount: 50, status: 'pending' },
      { id: 42, orderItemId: 22, amount: 10, status: 'pending' },
    ]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProjectMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.items[0]).toMatchObject({
      projectId: 101,
      projectName: '补水护理',
      serviceIncome: 500,
      status: 'cost_missing',
    });
    expect(result.items[0].missingCostReasons).toEqual(expect.arrayContaining(['missing_bom']));
  });

  it('sorts project margin rows by real service income before inactive projects', async () => {
    const prisma = createPrisma();
    mockProjectMarginProjects(prisma, [
      { id: 102, name: '本期未成交项目', price: 300, type: { name: '面护' }, bomItems: [] },
      {
        id: 101,
        name: '本期有成交项目',
        price: 500,
        type: { name: '面护' },
        bomItems: [{ productId: 301, standardQty: 1, product: { id: 301, costPrice: 80 } }],
      },
    ]);
    prisma.project.count.mockResolvedValue(2);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 20,
        orderNo: 'O20',
        totalAmount: 500,
        status: 'completed',
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
        orderItems: [{ id: 11, itemType: 'project', itemId: 101, name: '本期有成交项目', quantity: 1, subtotal: 500 }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { sourceType: 'project_order', sourceId: 20, productId: 301, quantity: -1, remark: '项目订单自动扣耗材：本期有成交项目', product: { costPrice: 80 } },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 31, orderItemId: 11, type: 'project', amount: 50, status: 'pending' }]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProjectMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30', page: 1, pageSize: 2 });

    expect(result.items.map((item: any) => item.projectName)).toEqual(['本期有成交项目', '本期未成交项目']);
    expect(result.items[0]).toMatchObject({ serviceCount: 1, serviceIncome: 500 });
  });

  it('attributes project stock movements by project BOM and remark instead of whole order', async () => {
    const prisma = createPrisma();
    mockProjectMarginProjects(prisma, [
      {
        id: 101,
        name: '补水护理',
        price: 500,
        type: { name: '面护' },
        bomItems: [{ productId: 301, standardQty: 1, product: { id: 301, costPrice: 20 } }],
      },
      {
        id: 102,
        name: '肩颈舒压',
        price: 300,
        type: { name: '身体' },
        bomItems: [{ productId: 302, standardQty: 1, product: { id: 302, costPrice: 80 } }],
      },
    ]);
    prisma.project.count.mockResolvedValue(2);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 20,
        orderNo: 'O20',
        totalAmount: 800,
        status: 'completed',
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
        orderItems: [
          { id: 11, itemType: 'project', itemId: 101, quantity: 1, subtotal: 500 },
          { id: 12, itemType: 'project', itemId: 102, quantity: 1, subtotal: 300 },
        ],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { sourceType: 'project_order', sourceId: 20, productId: 301, quantity: -1, remark: '项目订单自动扣耗材：补水护理', product: { costPrice: 20 } },
      { sourceType: 'project_order', sourceId: 20, productId: 302, quantity: -1, remark: '项目订单自动扣耗材：肩颈舒压', product: { costPrice: 80 } },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 31, orderItemId: 11, amount: 50, status: 'pending' },
      { id: 32, orderItemId: 12, amount: 30, status: 'pending' },
    ]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProjectMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.items.find((item: any) => item.projectId === 101)).toMatchObject({
      actualMaterialCost: 20,
      contributionProfit: 430,
    });
    expect(result.items.find((item: any) => item.projectId === 102)).toMatchObject({
      actualMaterialCost: 80,
      contributionProfit: 190,
    });
  });

  it('deducts project commissions by order item id even when records are created after the period', async () => {
    const prisma = createPrisma();
    mockProjectMarginProjects(prisma, [
      {
        id: 101,
        name: '补水护理',
        price: 500,
        type: { name: '面护' },
        bomItems: [{ productId: 301, standardQty: 1, product: { id: 301, costPrice: 80 } }],
      },
    ]);
    prisma.project.count.mockResolvedValue(1);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 20,
        orderNo: 'O20',
        totalAmount: 500,
        status: 'completed',
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
        orderItems: [{ id: 11, itemType: 'project', itemId: 101, quantity: 1, subtotal: 500 }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { sourceType: 'project_order', sourceId: 20, productId: 301, quantity: -1, remark: '项目订单自动扣耗材：补水护理', product: { costPrice: 80 } },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      {
        id: 31,
        orderItemId: 11,
        type: 'project',
        amount: 50,
        status: 'pending',
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
      },
    ]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProjectMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(prisma.commissionRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderItemId: { in: [11] },
          type: 'project',
          status: { not: 'cancelled' },
        }),
      }),
    );
    expect(result.items[0]).toMatchObject({
      projectId: 101,
      serviceIncome: 500,
      actualMaterialCost: 80,
      commissionCost: 50,
      contributionProfit: 370,
      status: 'high_profit',
      missingCostReasons: [],
    });
  });

  it('deducts completed refunds from project margin service income and contribution profit', async () => {
    const prisma = createPrisma();
    mockProjectMarginProjects(prisma, [
      {
        id: 101,
        name: '补水护理',
        price: 500,
        type: { name: '面护' },
        bomItems: [{ productId: 301, standardQty: 1, product: { id: 301, costPrice: 80 } }],
      },
    ]);
    prisma.project.count.mockResolvedValue(1);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 20,
        orderNo: 'O20',
        totalAmount: 500,
        status: 'completed',
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
        orderItems: [{ id: 11, itemType: 'project', itemId: 101, quantity: 1, subtotal: 500 }],
        paymentRecords: [],
        refundRecords: [{ id: 91, amount: 100, status: 'completed' }],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { sourceType: 'project_order', sourceId: 20, productId: 301, quantity: -1, remark: '项目订单自动扣耗材：补水护理', product: { costPrice: 80 } },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 31, orderItemId: 11, type: 'project', amount: 50, status: 'pending' },
    ]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProjectMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.items[0]).toMatchObject({
      projectId: 101,
      serviceIncome: 400,
      avgDealPrice: 400,
      actualMaterialCost: 80,
      commissionCost: 50,
      contributionProfit: 270,
      marginRate: 0.675,
      status: 'high_profit',
      missingCostReasons: [],
    });
  });

  it('filters project margin status before pagination', async () => {
    const prisma = createPrisma();
    mockProjectMarginProjects(prisma, [
      {
        id: 101,
        name: '高毛利项目',
        price: 500,
        type: { name: '面护' },
        bomItems: [{ productId: 301, standardQty: 1, product: { id: 301, costPrice: 20 } }],
      },
      {
        id: 102,
        name: '亏损项目',
        price: 100,
        type: { name: '身体' },
        bomItems: [{ productId: 302, standardQty: 1, product: { id: 302, costPrice: 150 } }],
      },
    ]);
    prisma.project.count.mockResolvedValue(2);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 30,
        orderNo: 'O30',
        totalAmount: 600,
        status: 'completed',
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
        orderItems: [
          { id: 21, itemType: 'project', itemId: 101, quantity: 1, subtotal: 500 },
          { id: 22, itemType: 'project', itemId: 102, quantity: 1, subtotal: 100 },
        ],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { sourceType: 'project_order', sourceId: 30, productId: 301, quantity: -1, remark: '项目订单自动扣耗材：高毛利项目', product: { costPrice: 20 } },
      { sourceType: 'project_order', sourceId: 30, productId: 302, quantity: -1, remark: '项目订单自动扣耗材：亏损项目', product: { costPrice: 150 } },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 41, orderItemId: 21, amount: 50, status: 'pending' },
      { id: 42, orderItemId: 22, amount: 10, status: 'pending' },
    ]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProjectMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30', status: 'loss', page: 1, pageSize: 1 });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      projectId: 102,
      projectName: '亏损项目',
      status: 'loss',
    });
  });

  it('keeps project order income visible when the project master record is missing', async () => {
    const prisma = createPrisma();
    mockProjectMarginProjects(prisma, [
      {
        id: 101,
        name: '正常项目',
        price: 500,
        type: { name: '面护' },
        bomItems: [{ productId: 301, standardQty: 1, product: { id: 301, costPrice: 80 } }],
      },
    ]);
    prisma.project.count.mockResolvedValue(1);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 30,
        orderNo: 'O30',
        totalAmount: 898,
        status: 'completed',
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
        orderItems: [
          { id: 21, itemType: 'project', itemId: 101, name: '正常项目', quantity: 1, subtotal: 500 },
          { id: 22, itemType: 'project', itemId: 999, name: '历史异常项目', quantity: 1, subtotal: 398 },
        ],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([
      { sourceType: 'project_order', sourceId: 30, productId: 301, quantity: -1, remark: '项目订单自动扣耗材：正常项目', product: { costPrice: 80 } },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 41, orderItemId: 21, amount: 50, status: 'pending' }]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProjectMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.total).toBe(2);
    expect(result.items.find((item: any) => item.projectId === 999)).toMatchObject({
      projectName: '历史异常项目',
      projectType: '项目档案缺失',
      serviceCount: 1,
      serviceIncome: 398,
      contributionProfit: 398,
      status: 'cost_missing',
      missingCostReasons: expect.arrayContaining(['missing_project_master', 'missing_bom', 'missing_commission']),
    });
  });

  it('returns product margin rows with product cost and commission deductions', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 10,
        orderNo: 'O10',
        customerId: 1,
        customerName: '张女士',
        totalAmount: 120,
        status: 'completed',
        createdAt: new Date('2026-06-10T10:00:00.000Z'),
        orderItems: [{ id: 1, itemType: 'product', itemId: 201, name: '修护精华', quantity: 1, subtotal: 120, payload: { costPrice: 50 } }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 201,
        name: '修护精华',
        sku: 'SKU-201',
        brand: 'Ami',
        categoryId: 7,
        category: { id: 7, name: '精华' },
        costPrice: 55,
        retailPrice: 168,
      },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 9, orderItemId: 1, amount: 6, type: 'product', status: 'pending' }]);
    prisma.stockMovement.findMany.mockResolvedValue([]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProductMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.items[0]).toMatchObject({
      productId: 201,
      productName: '修护精华',
      salesAmount: 120,
      productCost: 50,
      commissionCost: 6,
      grossProfit: 64,
      marginRate: 0.5333,
      costSource: 'order_snapshot',
      status: 'high_profit',
      orderCount: 1,
      sourceOrders: [
        expect.objectContaining({
          orderId: 10,
          orderNo: 'O10',
          orderItemId: 1,
          orderedAt: '2026-06-10',
          customerName: '张女士',
          quantity: 1,
          salesAmount: 120,
          refundAmount: 0,
          netSalesAmount: 120,
          commissionCost: 6,
        }),
      ],
      missingCostReasons: [],
    });
  });

  it('deducts product commissions by product order item id and product type only', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 10,
        orderNo: 'O10',
        customerId: 1,
        totalAmount: 420,
        status: 'completed',
        createdAt: new Date('2026-06-10T10:00:00.000Z'),
        orderItems: [
          { id: 1, itemType: 'product', itemId: 201, name: '修护精华', quantity: 1, subtotal: 120, payload: { costPrice: 50 } },
          { id: 2, itemType: 'project', itemId: 101, name: '补水护理', quantity: 1, subtotal: 300 },
        ],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 201,
        name: '修护精华',
        sku: 'SKU-201',
        brand: 'Ami',
        categoryId: 7,
        category: { id: 7, name: '精华' },
        costPrice: 55,
        retailPrice: 168,
      },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 9, orderItemId: 1, amount: 6, type: 'product', status: 'pending', createdAt: new Date('2026-07-01T10:00:00.000Z') },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProductMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(prisma.commissionRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderItemId: { in: [1] },
          type: 'product',
          status: { not: 'cancelled' },
        }),
      }),
    );
    expect(result.items[0]).toMatchObject({
      productId: 201,
      netSalesAmount: 120,
      productCost: 50,
      commissionCost: 6,
      grossProfit: 64,
      missingCostReasons: [],
    });
  });

  it('flags product margin rows when product cost or commission is missing', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 11,
        orderNo: 'O11',
        customerId: 2,
        totalAmount: 100,
        status: 'paid',
        createdAt: new Date('2026-06-12T10:00:00.000Z'),
        orderItems: [{ id: 2, itemType: 'product', itemId: 202, name: '低价面膜', quantity: 1, subtotal: 100 }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.product.findMany.mockResolvedValue([{ id: 202, name: '低价面膜', sku: 'SKU-202', costPrice: 0, retailPrice: 100, category: null }]);
    prisma.commissionRecord.findMany.mockResolvedValue([]);
    prisma.stockMovement.findMany.mockResolvedValue([]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProductMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.items[0]).toMatchObject({
      productId: 202,
      status: 'cost_missing',
      costSource: 'missing',
    });
    expect(result.items[0].missingCostReasons).toEqual(expect.arrayContaining(['missing_batch_cost', 'missing_commission']));
  });

  it('uses sale stock movement cost snapshot for product margin details', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 13,
        orderNo: 'O13',
        customerId: 3,
        customerName: '李女士',
        totalAmount: 198,
        status: 'completed',
        createdAt: new Date('2026-06-13T10:00:00.000Z'),
        orderItems: [{ id: 13, orderId: 13, itemType: 'product', itemId: 203, name: '批次商品', quantity: 2, subtotal: 198 }],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 203, name: '批次商品', sku: 'SKU-203', costPrice: 80, retailPrice: 99, category: null },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 13, orderItemId: 13, amount: 8, type: 'product', status: 'pending' }]);
    prisma.stockMovement.findMany.mockResolvedValue([
      {
        sourceId: 13,
        sourceNo: 'O13',
        productId: 203,
        quantity: -2,
        unitCost: 12,
        costAmount: 24,
        costSource: 'batch_snapshot',
        product: { costPrice: 80 },
      },
    ]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProductMargins({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    expect(result.items[0]).toMatchObject({
      productId: 203,
      costSource: 'batch_snapshot',
      unitCost: 12,
      productCost: 24,
      sourceOrders: [
        expect.objectContaining({
          orderNo: 'O13',
          unitCost: 12,
          productCost: 24,
          costSource: 'batch_snapshot',
          costSourceNo: 'O13',
        }),
      ],
    });
  });

  it('filters product margin status after refund, gross profit, and pagination calculations', async () => {
    const prisma = createPrisma();
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 12,
        orderNo: 'O12',
        customerId: 3,
        totalAmount: 600,
        status: 'completed',
        createdAt: new Date('2026-06-15T10:00:00.000Z'),
        orderItems: [
          { id: 3, itemType: 'product', itemId: 201, name: '高毛利精华', quantity: 1, subtotal: 500, payload: { costAmount: 50 } },
          { id: 4, itemType: 'product', itemId: 202, name: '亏损面膜', quantity: 1, subtotal: 100, payload: { costAmount: 90 } },
        ],
        paymentRecords: [],
        refundRecords: [{ id: 91, amount: 120, status: 'completed' }],
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      { id: 201, name: '高毛利精华', sku: 'SKU-201', costPrice: 50, retailPrice: 500, category: null },
      { id: 202, name: '亏损面膜', sku: 'SKU-202', costPrice: 90, retailPrice: 100, category: null },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 11, orderItemId: 3, amount: 50, type: 'product', status: 'pending' },
      { id: 12, orderItemId: 4, amount: 5, type: 'product', status: 'pending' },
    ]);
    prisma.stockMovement.findMany.mockResolvedValue([]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getProductMargins({
      storeId: 1,
      from: '2026-06-01',
      to: '2026-06-30',
      status: 'loss',
      page: 1,
      pageSize: 1,
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      productId: 202,
      productName: '亏损面膜',
      refundAmount: 20,
      netSalesAmount: 80,
      productCost: 90,
      commissionCost: 5,
      grossProfit: -15,
      status: 'loss',
      missingCostReasons: [],
    });
  });

  it('deducts beautician performance commissions by period order item id and staff user id first', async () => {
    const prisma = createPrisma();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 701,
        name: '王美容师',
        username: 'wang_beautician',
        status: 'active',
        stores: [{ storeId: 1, store: { id: 1, name: 'Ami 门店' } }],
        beauticianProfiles: [
          {
            id: 601,
            userId: 701,
            name: '历史王美容师',
            storeId: 1,
            status: 'active',
            store: { id: 1, name: 'Ami 门店' },
          },
        ],
      },
    ]);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 50,
        orderNo: 'O50',
        customerId: 301,
        totalAmount: 1000,
        status: 'completed',
        createdAt: new Date('2026-06-15T10:00:00.000Z'),
        orderItems: [
          { id: 81, itemType: 'project', itemId: 101, beauticianId: 601, quantity: 2, subtotal: 1000 },
          { id: 82, itemType: 'project', itemId: 102, beauticianId: 999, quantity: 1, subtotal: 500 },
        ],
        paymentRecords: [],
        refundRecords: [],
      },
    ]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.card.findMany.mockResolvedValue([]);
    prisma.commissionRecord.aggregate.mockResolvedValue({ _sum: { amount: 120 } });
    prisma.commissionRecord.findMany.mockResolvedValue([{ staffUserId: 701, beauticianId: 601, orderItemId: 81, amount: 120 }]);

    const service = new OperationProfitService(prisma as any);
    const result = await service.getBeauticianPerformance({ storeId: 1, from: '2026-06-01', to: '2026-06-30' });

    const aggregateWhere = prisma.commissionRecord.aggregate.mock.calls[0][0].where;
    expect(aggregateWhere).toEqual(
      expect.objectContaining({
        storeId: 1,
        orderItemId: { in: [81] },
        type: { in: ['project', 'product'] },
        staffUserId: 701,
        status: { not: 'cancelled' },
      }),
    );
    expect(aggregateWhere).not.toHaveProperty('beauticianId');
    expect(aggregateWhere).not.toHaveProperty('createdAt');
    expect(prisma.beautician.findMany).not.toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      staffUserId: 701,
      staffName: '王美容师',
      beauticianId: 601,
      beauticianName: '王美容师',
      serviceIncome: 1000,
      serviceCount: 2,
      customerCount: 1,
      commissionCost: 120,
      contributionProfit: 880,
      missingCostReasons: [],
      serviceDetails: [
        expect.objectContaining({
          sourceType: 'order',
          sourceLabel: '项目订单',
          sourceNo: 'O50',
          quantity: 2,
          income: 1000,
          commissionCost: 120,
          contributionProfit: 880,
        }),
      ],
    });
  });
});
