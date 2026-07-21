import { CommissionService } from './commission.service.js';

describe('CommissionService', () => {
  let prisma: any;
  let service: CommissionService;

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn(), findFirst: jest.fn() },
      product: { findUnique: jest.fn(), findFirst: jest.fn() },
      card: { findUnique: jest.fn() },
      cardUsageRecord: { findMany: jest.fn() },
      user: { findFirst: jest.fn() },
      beauticianLevel: { findUnique: jest.fn() },
      beautician: { findFirst: jest.fn() },
      projectBomItem: { findMany: jest.fn() },
      productOrder: { findMany: jest.fn() },
      customerBalanceTransaction: { findMany: jest.fn() },
      store: { findMany: jest.fn(), count: jest.fn() },
      paymentRecord: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
      refundRecord: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
      commissionRule: {
        create: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commissionRuleAssignment: {
        create: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commissionRecord: {
        create: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      commissionSettlement: {
        upsert: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      commissionSettlementRecord: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      cashierShift: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      dailySettlement: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      commissionAdjustment: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      dailySettlementSnapshot: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      financeAuditLog: { create: jest.fn(), findMany: jest.fn() },
      amiPerformanceRecord: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      amiMonthlyBill: {
        upsert: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      supplySettlement: {
        findMany: jest.fn(),
      },
    };
    prisma.cardUsageRecord.findMany.mockResolvedValue([]);
    prisma.customerBalanceTransaction.findMany.mockResolvedValue([]);
    prisma.commissionSettlementRecord.findMany.mockResolvedValue([]);
    service = new CommissionService(prisma);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches exact object and employee rule only', async () => {
    prisma.commissionRuleAssignment.findMany.mockResolvedValue([
      {
        id: 30,
        targetType: 'specific',
        targetId: 99,
        userId: 21,
        rule: { id: 3, rate: 0.1, calcBase: 'total', priority: 0 },
      },
    ]);
    prisma.commissionRecord.create.mockImplementation(async ({ data }: any) => ({
      id: 10,
      ...data,
      staffUser: { id: data.staffUserId, name: '李老师' },
      beautician: { id: data.beauticianId, name: '李老师' },
      store: { id: data.storeId, name: '静安店' },
      order: { id: data.orderId, orderNo: 'PO1' },
      rule: { id: data.ruleId, name: '指定项目' },
      assignment: { id: data.assignmentId, rule: { id: data.ruleId, name: '指定项目' } },
    }));

    const record = await service.calculateCommission({
      storeId: 1,
      staffUserId: 21,
      beauticianId: 2,
      orderId: 3,
      type: 'project',
      itemId: 99,
      categoryId: 7,
      sourceAmount: 1000,
    });

    expect(prisma.commissionRuleAssignment.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 1,
        type: 'project',
        status: 'active',
        userId: 21,
        targetType: 'specific',
        targetId: 99,
        rule: { status: 'active' },
      },
      include: { rule: true },
    });
    expect(prisma.commissionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleId: 3, assignmentId: 30, amount: 100, rate: 0.1 }),
      }),
    );
    expect(record?.amount).toBe(100);
  });

  it('rejects duplicate active rules for the same object and employee', async () => {
    prisma.commissionRuleAssignment.findMany.mockResolvedValue([
      { id: 1, targetType: 'specific', targetId: 99, userId: 21, rule: { id: 1, rate: 0.05, calcBase: 'total' } },
      { id: 2, targetType: 'specific', targetId: 99, userId: 21, rule: { id: 2, rate: 0.08, calcBase: 'total' } },
    ]);

    await expect(
      service.calculateCommission({
        storeId: 1,
        staffUserId: 21,
        beauticianId: 2,
        orderId: 3,
        type: 'project',
        itemId: 99,
        sourceAmount: 1000,
      }),
    ).rejects.toThrow('同一对象与员工组合存在多条启用提成配置');
    expect(prisma.commissionRecord.create).not.toHaveBeenCalled();
  });

  it('applies designated beautician bonus', async () => {
    prisma.commissionRuleAssignment.findMany.mockResolvedValue([
      {
        id: 40,
        targetType: 'specific',
        targetId: 99,
        userId: 21,
        rule: {
          id: 4,
          rate: 0.1,
          calcBase: 'total',
          priority: 0,
          isDesignated: true,
          designatedBonus: 0.2,
        },
      },
    ]);
    prisma.commissionRecord.create.mockImplementation(async ({ data }: any) => ({ id: 11, ...data }));

    await service.calculateCommission({
      storeId: 1,
      staffUserId: 21,
      beauticianId: 2,
      type: 'project',
      itemId: 99,
      sourceAmount: 1000,
      isDesignated: true,
    });

    expect(prisma.commissionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 120 }),
      }),
    );
  });

  it('uses service fee as commission base when rule calcBase is service_fee', async () => {
    prisma.commissionRuleAssignment.findMany.mockResolvedValue([
      { id: 60, targetType: 'specific', targetId: 99, userId: 21, rule: { id: 6, rate: 0.1, calcBase: 'service_fee', priority: 0 } },
    ]);
    prisma.commissionRecord.create.mockImplementation(async ({ data }: any) => ({ id: 12, ...data }));

    const record = await service.calculateCommission({
      storeId: 1,
      staffUserId: 21,
      beauticianId: 2,
      type: 'project',
      itemId: 99,
      sourceAmount: 1000,
      serviceFee: 320,
    });

    expect(prisma.commissionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleId: 6, sourceAmount: 320, amount: 32, rate: 0.1 }),
      }),
    );
    expect(record?.sourceAmount).toBe(320);
    expect(record?.amount).toBe(32);
  });

  it('uses profit base and fixed amount when configured on a rule', async () => {
    prisma.commissionRuleAssignment.findMany.mockResolvedValue([
      { id: 70, targetType: 'specific', targetId: 88, userId: 21, rule: { id: 7, rate: 0.2, fixedAmount: 88, calcBase: 'profit', priority: 0 } },
    ]);
    prisma.commissionRecord.create.mockImplementation(async ({ data }: any) => ({ id: 13, ...data }));

    const record = await service.calculateCommission({
      storeId: 1,
      staffUserId: 21,
      beauticianId: 2,
      type: 'product',
      itemId: 88,
      sourceAmount: 1000,
      profit: 400,
    });

    expect(prisma.commissionRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ruleId: 7, sourceAmount: 400, amount: 88, rate: 0.2 }),
      }),
    );
    expect(record?.amount).toBe(88);
  });

  it('returns null for object-scoped rule types without an item id', async () => {
    const record = await service.calculateCommission({
      storeId: 1,
      staffUserId: 21,
      beauticianId: 2,
      type: 'project',
      sourceAmount: 1000,
    });

    expect(record).toBeNull();
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(prisma.commissionRuleAssignment.findMany).not.toHaveBeenCalled();
  });

  it('returns null for invalid commission input without querying rules', async () => {
    const zeroAmountRecord = await service.calculateCommission({
      storeId: 1,
      staffUserId: 21,
      beauticianId: 2,
      type: 'project',
      sourceAmount: 0,
    });
    const missingBeauticianRecord = await service.calculateCommission({
      storeId: 1,
      staffUserId: 0,
      beauticianId: 2,
      type: 'project',
      sourceAmount: 100,
    });

    expect(zeroAmountRecord).toBeNull();
    expect(missingBeauticianRecord).toBeNull();
    expect(prisma.commissionRuleAssignment.findMany).not.toHaveBeenCalled();
    expect(prisma.commissionRecord.create).not.toHaveBeenCalled();
  });

  it('calculates order commissions for supported item types and skips unsupported items', async () => {
    prisma.commissionRuleAssignment.findMany.mockImplementation(async ({ where }: any) => {
      if (where.type === 'card_sale') {
        return [{ id: 100, targetType: 'specific', targetId: 66, userId: 21, rule: { id: 10, rate: 0.1, calcBase: 'total', priority: 0 } }];
      }
      if (where.type === 'recharge') {
        return [{ id: 101, targetType: 'all', targetId: null, userId: 21, rule: { id: 11, rate: 0.1, calcBase: 'total', priority: 0 } }];
      }
      return [];
    });
    prisma.commissionRecord.create.mockImplementation(async ({ data }: any) => ({ id: data.orderItemId, ...data }));

    const records = await service.calculateOrderCommissions({
      storeId: 1,
      orderId: 99,
      staffUserId: 21,
      beauticianId: 2,
      items: [
        { itemType: 'card', itemId: 66, subtotal: 500, orderItemId: 1 },
        { itemType: 'recharge', subtotal: 1000, orderItemId: 2 },
        { itemType: 'service_package', subtotal: 300, orderItemId: 3 },
      ],
    });

    expect(records).toHaveLength(2);
    expect(prisma.commissionRecord.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ type: 'card_sale', amount: 50, orderItemId: 1 }) }),
    );
    expect(prisma.commissionRecord.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ type: 'recharge', amount: 100, orderItemId: 2 }) }),
    );
  });

  it('returns null when no active rule matches', async () => {
    prisma.commissionRuleAssignment.findMany.mockResolvedValue([]);

    const record = await service.calculateCommission({
      storeId: 1,
      staffUserId: 21,
      beauticianId: 2,
      type: 'product',
      sourceAmount: 300,
    });

    expect(record).toBeNull();
    expect(prisma.commissionRecord.create).not.toHaveBeenCalled();
  });

  it('filters out records under minThreshold', async () => {
    prisma.commissionRuleAssignment.findMany.mockResolvedValue([
      { id: 50, targetType: 'specific', targetId: 88, userId: 21, rule: { id: 5, rate: 0.01, calcBase: 'total', minThreshold: 20, priority: 0 } },
    ]);

    const record = await service.calculateCommission({
      storeId: 1,
      staffUserId: 21,
      beauticianId: 2,
      type: 'product',
      itemId: 88,
      sourceAmount: 1000,
    });

    expect(record).toBeNull();
    expect(prisma.commissionRecord.create).not.toHaveBeenCalled();
  });

  it('cancels pending and confirmed records on refund reversal', async () => {
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    prisma.commissionRecord.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.reverseOrderCommissions(99, 188);

    expect(result.count).toBe(2);
    expect(prisma.commissionRecord.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: { status: 'cancelled', remark: '订单退款，退款金额 188' },
    });
  });

  it('reverses only refunded item commissions and creates negative adjustments for settled records', async () => {
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 1, orderItemId: 11, storeId: 3, amount: 50, sourceAmount: 500, status: 'confirmed', settlementRecords: [] },
      { id: 2, orderItemId: 12, storeId: 3, amount: 80, sourceAmount: 800, status: 'settled', settlementRecords: [{ settlementId: 20 }] },
    ]);
    prisma.commissionRecord.updateMany.mockResolvedValue({ count: 1 });
    prisma.commissionAdjustment.create.mockResolvedValue({ id: 801 });

    const result = await service.reverseOrderCommissions(99, 900, prisma, [
      { orderItemId: 11, refundAmount: 500 },
      { orderItemId: 12, refundAmount: 400 },
    ]);

    expect(prisma.commissionRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ orderItemId: { in: [11, 12] } }) }));
    expect(prisma.commissionRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [1] } } }));
    expect(prisma.commissionAdjustment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ settlementId: 20, commissionRecordId: 2, type: 'refund_recovery', amount: -40, status: 'pending' }) });
    expect(result).toEqual(expect.objectContaining({ count: 1, adjustmentCount: 1 }));
  });

  it('lists, creates, updates and archives commission rule algorithms without binding objects or employees', async () => {
    prisma.commissionRule.findMany.mockResolvedValue([
      {
        id: 1,
        storeId: 3,
        name: '项目规则',
        type: 'project',
        targetType: 'all',
        targetId: null,
        levelId: null,
        userId: null,
        rate: '0.12',
        fixedAmount: null,
        designatedBonus: '0.2',
        minThreshold: '5',
        status: 'active',
        priority: 9,
        store: { id: 3, name: '静安店' },
        level: null,
        user: null,
        assignments: [{ id: 80, status: 'active' }],
      },
    ]);
    prisma.commissionRule.count.mockResolvedValue(1);

    const page = await service.getRules({
      page: '2',
      pageSize: '5',
      storeId: '3',
      type: 'project',
      status: 'active',
      keyword: '项目',
    });

    expect(prisma.commissionRule.findMany).toHaveBeenCalledWith({
      where: { storeId: 3, type: 'project', status: 'active', name: { contains: '项目', mode: 'insensitive' } },
      include: {
        store: { select: { id: true, name: true } },
        level: true,
        user: { select: { id: true, name: true, username: true } },
        assignments: { where: { status: { not: 'archived' } }, select: { id: true, status: true } },
      },
      skip: 5,
      take: 5,
      orderBy: [{ type: 'asc' }, { createdAt: 'desc' }],
    });
    expect(page.items[0]).toEqual(expect.objectContaining({ id: 1, rate: 0.12, designatedBonus: 0.2, minThreshold: 5, assignments: [{ id: 80, status: 'active' }] }));

    prisma.store.findMany.mockResolvedValue([{ id: 3 }]);
    prisma.commissionRule.create.mockImplementation(async ({ data }: any) => ({
      id: 100 + prisma.commissionRule.create.mock.calls.length,
      ...data,
      store: { id: data.storeId, name: '静安店' },
      level: null,
      user: null,
      assignments: [],
    }));
    prisma.commissionRule.update.mockImplementation(async ({ data }: any) => ({
      id: 9,
      storeId: 3,
      name: data.name ?? '已更新',
      type: data.type ?? 'product',
      targetType: data.targetType ?? 'all',
      targetId: data.targetId ?? null,
      levelId: data.levelId,
      userId: data.userId ?? null,
      rate: data.rate ?? 0.07,
      status: data.status ?? 'active',
      priority: data.priority ?? 1,
      store: { id: 3, name: '静安店' },
      level: null,
      user: null,
      assignments: [],
    }));

    const created = await service.createRule('3', {
      name: '项目算法',
      type: 'project',
      rate: 0.12,
    });
    expect(prisma.beauticianLevel.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
    expect(prisma.commissionRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
        storeId: 3,
          type: 'project',
          targetType: 'all',
          targetId: null,
          userId: null,
          rate: 0.12,
        }),
      }),
    );
    expect(created).toEqual(expect.objectContaining({ name: '项目算法', rate: 0.12, targetType: 'all', userId: null }));

    prisma.commissionRule.findUnique
      .mockResolvedValueOnce({ id: 9, storeId: 3, name: '旧规则', type: 'project', targetType: 'all', rate: 0.08, userId: null })
      .mockResolvedValueOnce({ id: 9, storeId: 3, name: '已更新', type: 'product', targetType: 'all', targetId: null, rate: 0.07, userId: null });

    const updated = await service.updateRule(9, { name: '商品算法', type: 'product', rate: 0.07 });
    const archived = await service.deleteRule(9);

    expect(prisma.product.findFirst).not.toHaveBeenCalled();
    expect(updated).toEqual(expect.objectContaining({ name: '商品算法', type: 'product' }));
    expect(archived.status).toBe('archived');
  });

  it('lists, creates, updates and archives commission rule assignments', async () => {
    prisma.commissionRuleAssignment.findMany.mockResolvedValue([
      {
        id: 80,
        storeId: 3,
        ruleId: 1,
        type: 'project',
        targetType: 'specific',
        targetId: 99,
        userId: 21,
        status: 'active',
        remark: '指定项目员工',
        store: { id: 3, name: '静安店' },
        rule: { id: 1, name: '项目算法', type: 'project', rate: '0.08', calcBase: 'total', status: 'active' },
        user: { id: 21, name: '唐伊', username: 'tangyi' },
      },
    ]);
    prisma.commissionRuleAssignment.count.mockResolvedValue(1);

    const page = await service.getAssignments({
      page: '1',
      pageSize: '10',
      storeId: '3',
      type: 'project',
      status: 'active',
      keyword: '项目',
    });

    expect(prisma.commissionRuleAssignment.findMany).toHaveBeenCalledWith({
      where: { storeId: 3, type: 'project', status: 'active', rule: { name: { contains: '项目', mode: 'insensitive' } } },
      include: {
        store: { select: { id: true, name: true } },
        rule: true,
        user: { select: { id: true, name: true, username: true } },
      },
      skip: 0,
      take: 10,
      orderBy: [{ type: 'asc' }, { targetId: 'asc' }, { userId: 'asc' }, { createdAt: 'desc' }],
    });
    expect(page.items[0]).toEqual(expect.objectContaining({ id: 80, ruleName: '项目算法', userName: '唐伊' }));

    prisma.commissionRule.findUnique.mockResolvedValue({ id: 1, storeId: 3, name: '项目算法', type: 'project', status: 'active' });
    prisma.user.findFirst.mockResolvedValue({ id: 21 });
    prisma.project.findFirst.mockResolvedValue({ id: 99 });
    prisma.commissionRuleAssignment.findFirst.mockResolvedValue(null);
    prisma.commissionRuleAssignment.create.mockImplementation(async ({ data }: any) => ({
      id: 81,
      ...data,
      store: { id: data.storeId, name: '静安店' },
      rule: { id: data.ruleId, name: '项目算法', type: data.type, rate: 0.08, calcBase: 'total' },
      user: { id: data.userId, name: '唐伊', username: 'tangyi' },
    }));
    prisma.commissionRuleAssignment.findUnique.mockResolvedValue({
      id: 81,
      storeId: 3,
      ruleId: 1,
      type: 'project',
      targetType: 'specific',
      targetId: 99,
      userId: 21,
      status: 'active',
    });
    prisma.commissionRuleAssignment.update.mockImplementation(async ({ data }: any) => ({
      id: 81,
      storeId: 3,
      ruleId: data.ruleId ?? 1,
      type: data.type ?? 'project',
      targetType: data.targetType ?? 'specific',
      targetId: data.targetId ?? 99,
      userId: data.userId ?? 21,
      status: data.status ?? 'active',
      remark: data.remark,
      store: { id: 3, name: '静安店' },
      rule: { id: data.ruleId ?? 1, name: '项目算法', type: data.type ?? 'project', rate: 0.08, calcBase: 'total' },
      user: { id: data.userId ?? 21, name: '唐伊', username: 'tangyi' },
    }));

    const created = await service.createAssignment('3', {
      ruleId: 1,
      type: 'project',
      targetType: 'specific',
      targetId: 99,
      userId: 21,
      status: 'active',
    });
    const updated = await service.updateAssignment(81, { remark: '改为门店主理人' });
    const archived = await service.deleteAssignment(81);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 21, status: 'active', deletedAt: null, stores: { some: { storeId: 3 } } },
    });
    expect(prisma.project.findFirst).toHaveBeenCalledWith({ where: { id: 99, storeId: 3 } });
    expect(prisma.commissionRuleAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 3, type: 'project', status: 'active', userId: 21, targetType: 'specific', targetId: 99 }),
      }),
    );
    expect(created).toEqual(expect.objectContaining({ id: 81, ruleName: '项目算法', userName: '唐伊' }));
    expect(updated).toEqual(expect.objectContaining({ id: 81, remark: '改为门店主理人' }));
    expect(archived.status).toBe('archived');
  });

  it('queries commission records with finance filters and serialized source fields', async () => {
    prisma.commissionRecord.findMany.mockResolvedValue([
      {
        id: 7,
        storeId: 3,
        staffUserId: 21,
        beauticianId: 5,
        orderId: 9,
        orderItemId: 11,
        ruleId: 13,
        type: 'project',
        sourceAmount: '1000.5',
        rate: '0.08',
        amount: '80.04',
        status: 'pending',
        createdAt: new Date('2026-06-08T09:00:00.000Z'),
        staffUser: { id: 21, name: 'Alice', username: 'alice' },
        beautician: { id: 5, name: 'Alice' },
        store: { id: 3, name: 'Store A' },
        order: { id: 9, orderNo: 'PO-9', customerName: 'Customer A' },
        orderItem: { id: 11, name: 'Hydration', itemType: 'project', itemId: 101 },
        rule: { id: 13, name: 'Project rule' },
        assignment: { id: 70, rule: { id: 13, name: 'Project rule' } },
      },
    ]);
    prisma.commissionRecord.count.mockResolvedValue(1);

    const result = await service.getRecords({
      page: '2',
      pageSize: '10',
      storeId: '3',
      staffUserId: '21',
      type: 'project',
      status: 'pending',
      settleMonth: '2026-06',
    });

    expect(prisma.commissionRecord.findMany).toHaveBeenCalledWith({
      where: { storeId: 3, staffUserId: 21, type: 'project', status: 'pending', settleMonth: '2026-06' },
      include: {
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
        order: { select: { id: true, orderNo: true, customerName: true } },
        orderItem: { select: { id: true, name: true, itemType: true, itemId: true } },
        cardUsageRecord: { select: { id: true, cardName: true, projectName: true } },
        rule: { select: { id: true, name: true } },
        assignment: { include: { rule: { select: { id: true, name: true } } } },
      },
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.commissionRecord.count).toHaveBeenCalledWith({
      where: { storeId: 3, staffUserId: 21, type: 'project', status: 'pending', settleMonth: '2026-06' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        pageSize: 10,
        items: [
          expect.objectContaining({
            id: 7,
            sourceAmount: 1000.5,
            rate: 0.08,
            amount: 80.04,
            staffUserName: 'Alice',
            beauticianName: 'Alice',
            storeName: 'Store A',
            orderNo: 'PO-9',
            ruleName: 'Project rule',
          }),
        ],
      }),
    );
  });

  it('serializes card usage commission records with card and project display fields', async () => {
    prisma.commissionRecord.findMany.mockResolvedValue([
      {
        id: 8,
        storeId: 3,
        staffUserId: 21,
        beauticianId: 5,
        type: 'project',
        sourceType: 'card_usage',
        sourceId: 88,
        cardUsageRecordId: 88,
        sourceAmount: '68',
        rate: '0.08',
        amount: '5.44',
        status: 'confirmed',
        staffUser: { id: 21, name: '唐伊', username: 'tangyi' },
        beautician: { id: 5, name: '唐伊' },
        store: { id: 3, name: 'Store A' },
        cardUsageRecord: { id: 88, cardName: '抗衰管理 6 次卡', projectName: '紧致抗衰护理' },
      },
    ]);
    prisma.commissionRecord.count.mockResolvedValue(1);

    const result = await service.getRecords({ storeId: '3', type: 'project', settleMonth: '2026-06' });

    expect(result.items[0]).toEqual(expect.objectContaining({
      orderNo: '抗衰管理 6 次卡',
      orderItem: { id: 88, name: '紧致抗衰护理', itemType: 'card_usage' },
      staffUserName: '唐伊',
      beauticianName: '唐伊',
    }));
  });

  it('summarizes commission records by staff user and status for the selected month', async () => {
    prisma.commissionRecord.findMany.mockResolvedValue([
      { staffUserId: 21, beauticianId: 5, amount: '100', status: 'pending', staffUser: { id: 21, name: 'Alice' }, beautician: { id: 5, name: 'Alice' } },
      { staffUserId: 21, beauticianId: 5, amount: 50, status: 'confirmed', staffUser: { id: 21, name: 'Alice' }, beautician: { id: 5, name: 'Alice' } },
      { staffUserId: 22, beauticianId: 6, amount: 20, status: 'settled', staffUser: { id: 22, name: 'Bob' }, beautician: { id: 6, name: 'Bob' } },
      { staffUserId: 22, beauticianId: 6, amount: 10, status: 'cancelled', staffUser: { id: 22, name: 'Bob' }, beautician: { id: 6, name: 'Bob' } },
    ]);
    prisma.commissionSettlementRecord.findMany.mockResolvedValue([
      {
        amountSnapshot: 25,
        commissionRecord: { staffUserId: 22, beauticianId: 6, staffUser: { id: 22, name: 'Bob' }, beautician: { id: 6, name: 'Bob' } },
      },
    ]);

    const result = await service.getRecordSummary({ storeId: 3, settleMonth: '2026-06', type: 'project' });

    expect(prisma.commissionRecord.findMany).toHaveBeenCalledWith({
      where: { storeId: 3, type: 'project', settleMonth: '2026-06' },
      include: { staffUser: { select: { id: true, name: true, username: true } }, beautician: { select: { id: true, name: true } } },
    });
    expect(prisma.commissionSettlementRecord.findMany).toHaveBeenCalledWith({
      where: {
        settlement: { status: { in: ['confirmed', 'paid'] }, storeId: 3, settleMonth: '2026-06' },
        commissionRecord: { type: 'project' },
      },
      include: {
        commissionRecord: {
          include: {
            staffUser: { select: { id: true, name: true, username: true } },
            beautician: { select: { id: true, name: true } },
          },
        },
      },
    });
    expect(result).toEqual({
      totalAmount: 180,
      pendingAmount: 100,
      confirmedAmount: 50,
      settledAmount: 25,
      count: 4,
      items: [
        { staffUserId: 21, staffUserName: 'Alice', beauticianId: 5, beauticianName: 'Alice', totalAmount: 150, pendingAmount: 100, confirmedAmount: 50, settledAmount: 0, count: 2 },
        { staffUserId: 22, staffUserName: 'Bob', beauticianId: 6, beauticianName: 'Bob', totalAmount: 30, pendingAmount: 0, confirmedAmount: 0, settledAmount: 25, count: 2 },
      ],
      data: [
        { staffUserId: 21, staffUserName: 'Alice', beauticianId: 5, beauticianName: 'Alice', totalAmount: 150, pendingAmount: 100, confirmedAmount: 50, settledAmount: 0, count: 2 },
        { staffUserId: 22, staffUserName: 'Bob', beauticianId: 6, beauticianName: 'Bob', totalAmount: 30, pendingAmount: 0, confirmedAmount: 0, settledAmount: 25, count: 2 },
      ],
    });
  });

  it('updates an unsettled commission record and keeps order cost source on the same record', async () => {
    const confirmedAt = new Date('2026-06-08T10:00:00.000Z');
    prisma.commissionRecord.findUnique.mockResolvedValue({
      id: 7,
      storeId: 3,
      staffUserId: 21,
      beauticianId: 5,
      sourceAmount: 1000,
      rate: 0.08,
      amount: 80,
      status: 'confirmed',
      confirmedAt,
    });
    prisma.user.findFirst.mockResolvedValue({ id: 22 });
    prisma.beautician.findFirst.mockResolvedValue({ id: 6 });
    prisma.commissionRecord.update.mockResolvedValue({
      id: 7,
      storeId: 3,
      staffUserId: 22,
      beauticianId: 6,
      orderId: 9,
      orderItemId: 11,
      type: 'project',
      sourceAmount: 500,
      rate: 0.1,
      amount: 55,
      status: 'confirmed',
      confirmedAt,
      remark: '调整提成',
      staffUser: { id: 22, name: 'Bob', username: 'bob' },
      beautician: { id: 6, name: 'Bob' },
      store: { id: 3, name: 'Store A' },
      order: { id: 9, orderNo: 'PO-9', customerName: 'Customer A' },
      orderItem: { id: 11, name: 'Hydration', itemType: 'project', itemId: 101 },
      rule: { id: 13, name: 'Project rule' },
    });

    const result = await service.updateRecord(7, {
      staffUserId: 22,
      sourceAmount: 500,
      rate: 0.1,
      amount: 55,
      remark: '调整提成',
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 22, status: 'active', deletedAt: null, stores: { some: { storeId: 3 } } },
      select: { id: true },
    });
    expect(prisma.beautician.findFirst).toHaveBeenCalledWith({
      where: { storeId: 3, userId: 22, status: 'active' },
      select: { id: true },
    });
    expect(prisma.commissionRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          staffUserId: 22,
          beauticianId: 6,
          sourceAmount: 500,
          rate: 0.1,
          amount: 55,
          status: 'confirmed',
          confirmedAt,
          remark: '调整提成',
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ id: 7, amount: 55, staffUserName: 'Bob', orderNo: 'PO-9' }));
  });

  it('rejects updates for settled commission records', async () => {
    prisma.commissionRecord.findUnique.mockResolvedValue({ id: 8, status: 'settled' });

    await expect(service.updateRecord(8, { amount: 20 })).rejects.toThrow('已结算提成不能修改');
    expect(prisma.commissionRecord.update).not.toHaveBeenCalled();
  });

  it('confirms a single commission record and supports filtered batch confirmation', async () => {
    const systemNow = new Date('2026-06-08T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);
    prisma.commissionRecord.findUnique.mockResolvedValue({ id: 7, status: 'pending' });
    prisma.commissionRecord.update.mockResolvedValue({
      id: 7,
      storeId: 3,
      beauticianId: 5,
      type: 'project',
      sourceAmount: 1000,
      rate: 0.08,
      amount: 80,
      status: 'confirmed',
      confirmedAt: systemNow,
      beautician: { id: 5, name: 'Alice' },
      store: { id: 3, name: 'Store A' },
      order: { id: 9, orderNo: 'PO-9' },
      rule: { id: 13, name: 'Project rule' },
    });
    prisma.commissionRecord.updateMany.mockResolvedValue({ count: 2 });

    const record = await service.confirmRecord(7);
    const batch = await service.batchConfirmRecords({ ids: [7, 8], storeId: '3', settleMonth: '2026-06' });

    expect(prisma.commissionRecord.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(prisma.commissionRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: { status: 'confirmed', confirmedAt: systemNow },
      }),
    );
    expect(record).toEqual(expect.objectContaining({ id: 7, status: 'confirmed', amount: 80, beauticianName: 'Alice' }));
    expect(prisma.commissionRecord.updateMany).toHaveBeenCalledWith({
      where: { status: 'pending', id: { in: [7, 8] }, storeId: 3, settleMonth: '2026-06' },
      data: { status: 'confirmed', confirmedAt: systemNow },
    });
    expect(batch).toEqual({ count: 2 });
  });

  it('generates monthly settlement grouped by staff user and type', async () => {
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 101, staffUserId: 21, beauticianId: 1, type: 'project', amount: 100, status: 'confirmed' },
      { id: 102, staffUserId: 21, beauticianId: 1, type: 'product', amount: 20, status: 'pending' },
      { id: 201, staffUserId: 22, beauticianId: 2, type: 'recharge', amount: 30, status: 'confirmed' },
    ]);
    prisma.commissionSettlement.findUnique.mockResolvedValue(null);
    prisma.commissionSettlement.upsert.mockImplementation(async ({ create }: any) => ({
      id: create.staffUserId,
      ...create,
      staffUser: { id: create.staffUserId, name: `员工${create.staffUserId}` },
      beautician: { id: create.beauticianId, name: `美容师${create.beauticianId}` },
      store: { id: create.storeId, name: '静安店' },
    }));

    const result = await service.generateSettlement(8, '2026-06');

    expect(result.total).toBe(2);
    expect(prisma.commissionSettlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          staffUserId: 21,
          beauticianId: 1,
          projectAmount: 100,
          productAmount: 20,
          totalAmount: 120,
          netAmount: 120,
        }),
      }),
    );
    expect(prisma.commissionSettlementRecord.deleteMany).toHaveBeenCalledWith({ where: { settlementId: 21 } });
    expect(prisma.commissionSettlementRecord.createMany).toHaveBeenCalledWith({
      data: [
        { settlementId: 21, commissionRecordId: 101, amountSnapshot: 100, statusSnapshot: 'confirmed' },
        { settlementId: 21, commissionRecordId: 102, amountSnapshot: 20, statusSnapshot: 'pending' },
      ],
    });
    expect(result.items[0]).toEqual(expect.objectContaining({ detailCount: 2, detailAmount: 120 }));
  });

  it('exports commission settlements as a payroll csv with traceable amounts', async () => {
    const confirmedAt = new Date('2026-06-30T10:00:00.000Z');
    prisma.commissionSettlement.findMany.mockResolvedValue([
      {
        id: 1,
        settleMonth: '2026-06',
        projectAmount: 100,
        productAmount: 20,
        cardSaleAmount: 30,
        rechargeAmount: 40,
        otherAmount: 5,
        totalAmount: 195,
        deductions: 10,
        netAmount: 185,
        status: 'confirmed',
        confirmedAt,
        paidAt: null,
        store: { id: 8, name: '静安店' },
        staffUser: { id: 21, name: '李老师', username: 'li' },
        beautician: { id: 2, name: '李老师' },
      },
    ]);

    const result = await service.exportSettlements({ storeId: 8, settleMonth: '2026-06', status: 'confirmed' });

    expect(prisma.commissionSettlement.findMany).toHaveBeenCalledWith({
      where: { storeId: 8, settleMonth: '2026-06', status: 'confirmed' },
      include: {
        store: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        settlementRecords: true,
      },
      orderBy: [{ settleMonth: 'desc' }, { staffUserId: 'asc' }],
    });
    expect(result.filename).toBe('commission-settlements-2026-06.csv');
    expect(result.contentType).toBe('text/csv; charset=utf-8');
    expect(result.total).toBe(1);
    expect(result.content).toContain('"月份","门店","员工","项目提成"');
    expect(result.content).toContain('"2026-06","静安店","李老师","100","20","30","40","5","195","10","185","confirmed"');
  });

  it('confirms a commission settlement and moves confirmed records to settled', async () => {
    const systemNow = new Date('2026-06-30T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);
    const settlement = {
      id: 20,
      storeId: 3,
      staffUserId: 21,
      beauticianId: 5,
      settleMonth: '2026-06',
      projectAmount: 100,
      productAmount: 20,
      cardSaleAmount: 30,
      rechargeAmount: 40,
      otherAmount: 5,
      totalAmount: 195,
      deductions: 0,
      netAmount: 195,
      status: 'draft',
      store: { id: 3, name: 'Store A' },
      staffUser: { id: 21, name: 'Alice', username: 'alice' },
      beautician: { id: 5, name: 'Alice' },
    };
    prisma.commissionSettlement.findUnique.mockResolvedValue({
      ...settlement,
      settlementRecords: [
        { id: 1, settlementId: 20, commissionRecordId: 701, amountSnapshot: 100, statusSnapshot: 'confirmed' },
        { id: 2, settlementId: 20, commissionRecordId: 702, amountSnapshot: 95, statusSnapshot: 'pending' },
      ],
    });
    prisma.commissionSettlement.update.mockResolvedValue({
      ...settlement,
      status: 'confirmed',
      confirmedAt: systemNow,
      confirmedBy: 99,
      settlementRecords: [
        { id: 1, settlementId: 20, commissionRecordId: 701, amountSnapshot: 100, statusSnapshot: 'confirmed' },
        { id: 2, settlementId: 20, commissionRecordId: 702, amountSnapshot: 95, statusSnapshot: 'pending' },
      ],
    });
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 701, amount: 100, status: 'confirmed' },
      { id: 702, amount: 95, status: 'pending' },
    ]);
    prisma.commissionRecord.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.confirmSettlement(20, 99);

    expect(prisma.commissionSettlement.findUnique).toHaveBeenCalledWith({
      where: { id: 20 },
      include: {
        store: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        settlementRecords: {
          include: {
            commissionRecord: {
              include: {
                staffUser: { select: { id: true, name: true, username: true } },
                beautician: { select: { id: true, name: true } },
                store: { select: { id: true, name: true } },
                order: { select: { id: true, orderNo: true, customerName: true } },
                orderItem: { select: { id: true, name: true, itemType: true, itemId: true } },
                cardUsageRecord: { select: { id: true, cardName: true, projectName: true } },
                rule: { select: { id: true, name: true } },
                assignment: { include: { rule: { select: { id: true, name: true } } } },
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    expect(prisma.commissionSettlement.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { status: 'confirmed', confirmedAt: systemNow, confirmedBy: 99 },
      include: {
        store: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
        settlementRecords: true,
      },
    });
    expect(prisma.commissionRecord.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [701, 702] }, status: { in: ['pending', 'confirmed'] } },
      data: { status: 'settled', settledAt: systemNow },
    });
    expect(result).toEqual(expect.objectContaining({ id: 20, status: 'confirmed', netAmount: 195, staffUserName: 'Alice' }));
  });

  it('marks draft commission settlements as needing regeneration when locked records drift', async () => {
    prisma.commissionSettlement.findMany.mockResolvedValue([
      {
        id: 20,
        storeId: 3,
        staffUserId: 21,
        beauticianId: 5,
        settleMonth: '2026-06',
        projectAmount: 100,
        productAmount: 20,
        cardSaleAmount: 0,
        rechargeAmount: 0,
        otherAmount: 0,
        totalAmount: 120,
        deductions: 0,
        netAmount: 120,
        status: 'draft',
        store: { id: 3, name: 'Store A' },
        staffUser: { id: 21, name: 'Alice', username: 'alice' },
        beautician: { id: 5, name: 'Alice' },
        settlementRecords: [
          { id: 1, settlementId: 20, commissionRecordId: 701, amountSnapshot: 100, statusSnapshot: 'confirmed' },
          { id: 2, settlementId: 20, commissionRecordId: 702, amountSnapshot: 20, statusSnapshot: 'pending' },
        ],
      },
    ]);
    prisma.commissionSettlement.count.mockResolvedValue(1);
    prisma.commissionRecord.findMany.mockResolvedValue([
      { id: 701, amount: 130, status: 'confirmed' },
      { id: 702, amount: 20, status: 'pending' },
      { id: 703, amount: 25, status: 'confirmed' },
    ]);

    const result = await service.getSettlements({ page: 1, pageSize: 20, storeId: 3, settleMonth: '2026-06' });

    expect(prisma.commissionRecord.findMany).toHaveBeenCalledWith({
      where: { storeId: 3, staffUserId: 21, settleMonth: '2026-06', status: { in: ['pending', 'confirmed'] } },
      select: { id: true, amount: true, status: true },
    });
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        needsRegenerate: true,
        regenerateMissingRecordCount: 1,
        regenerateChangedRecordCount: 1,
        regenerateDiffAmount: 55,
      }),
    );
    expect(result.items[0].regenerateReason).toContain('重新生成结算单');
  });

  it('rejects confirming a draft settlement when locked commission records drift', async () => {
    prisma.commissionSettlement.findUnique.mockResolvedValue({
      id: 20,
      storeId: 3,
      staffUserId: 21,
      beauticianId: 5,
      settleMonth: '2026-06',
      projectAmount: 100,
      productAmount: 20,
      cardSaleAmount: 0,
      rechargeAmount: 0,
      otherAmount: 0,
      totalAmount: 120,
      deductions: 0,
      netAmount: 120,
      status: 'draft',
      store: { id: 3, name: 'Store A' },
      staffUser: { id: 21, name: 'Alice', username: 'alice' },
      beautician: { id: 5, name: 'Alice' },
      settlementRecords: [
        { id: 1, settlementId: 20, commissionRecordId: 701, amountSnapshot: 100, statusSnapshot: 'confirmed' },
      ],
    });
    prisma.commissionRecord.findMany.mockResolvedValue([{ id: 701, amount: 130, status: 'confirmed' }]);

    await expect(service.confirmSettlement(20, 99)).rejects.toThrow('重新生成结算单');
    expect(prisma.commissionSettlement.update).not.toHaveBeenCalled();
    expect(prisma.commissionRecord.updateMany).not.toHaveBeenCalled();
  });

  it('marks a confirmed commission settlement as paid', async () => {
    const systemNow = new Date('2026-07-05T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);
    const settlement = {
      id: 20,
      storeId: 3,
      staffUserId: 21,
      beauticianId: 5,
      settleMonth: '2026-06',
      projectAmount: 100,
      productAmount: 20,
      cardSaleAmount: 30,
      rechargeAmount: 40,
      otherAmount: 5,
      totalAmount: 195,
      deductions: 0,
      netAmount: 195,
      status: 'confirmed',
      store: { id: 3, name: 'Store A' },
      staffUser: { id: 21, name: 'Alice', username: 'alice' },
      beautician: { id: 5, name: 'Alice' },
    };
    prisma.commissionSettlement.findUnique.mockResolvedValue(settlement);
    prisma.commissionSettlement.update.mockResolvedValue({ ...settlement, status: 'paid', paidAt: systemNow });

    const result = await service.markSettlementPaid(20);

    expect(prisma.commissionSettlement.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { status: 'paid', paidAt: systemNow },
      include: {
        store: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, username: true } },
        beautician: { select: { id: true, name: true } },
      },
    });
    expect(prisma.commissionRecord.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: 20, status: 'paid', netAmount: 195, storeName: 'Store A' }));
  });

  it('returns beautician commission summary with type breakdown', async () => {
    const systemNow = new Date('2026-06-08T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);
    prisma.commissionRecord.findMany
      .mockResolvedValueOnce([{ type: 'project', amount: 80 }])
      .mockResolvedValueOnce([
        { type: 'project', sourceAmount: 1000, amount: 80, status: 'pending' },
        { type: 'product', sourceAmount: 500, amount: 25, status: 'confirmed' },
        { type: 'project', sourceAmount: 600, amount: 48, status: 'settled' },
      ])
      .mockResolvedValueOnce([
        {
          id: 1,
          type: 'project',
          sourceAmount: 1000,
          rate: 0.08,
          amount: 80,
          status: 'pending',
          order: { id: 10, orderNo: 'PO-1', customerName: '客户A' },
          orderItem: { id: 20, name: '补水护理' },
          rule: { id: 30, name: '项目通用提成' },
        },
      ]);

    const result = await service.getBeauticianSummary({ storeId: 3, beauticianId: 2 });

    expect(result).toEqual(
      expect.objectContaining({
        todayAmount: 80,
        monthAmount: 153,
        monthPendingAmount: 80,
        monthConfirmedAmount: 73,
        todayCount: 1,
        monthCount: 3,
      }),
    );
    expect(result.breakdown).toEqual([
      {
        type: 'project',
        label: '项目服务',
        amount: 128,
        sourceAmount: 1600,
        pendingAmount: 80,
        confirmedAmount: 48,
        count: 2,
      },
      {
        type: 'product',
        label: '商品销售',
        amount: 25,
        sourceAmount: 500,
        pendingAmount: 0,
        confirmedAmount: 25,
        count: 1,
      },
    ]);
    expect(result.recentRecords[0]).toEqual(
      expect.objectContaining({
        id: 1,
        amount: 80,
        orderNo: 'PO-1',
        ruleName: '项目通用提成',
      }),
    );
  });

  it('uses detailLimit for month detail records and keeps recent records compact', async () => {
    const systemNow = new Date('2026-06-08T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);
    const detailRecords = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      type: 'project',
      sourceAmount: 100,
      rate: 0.1,
      amount: 10,
      status: 'pending',
      order: { id: index + 10, orderNo: `PO-${index + 1}`, customerName: `Customer ${index + 1}` },
      orderItem: { id: index + 20, name: `Service ${index + 1}` },
      rule: { id: index + 30, name: 'Project rule' },
    }));
    prisma.commissionRecord.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ type: 'project', sourceAmount: 600, amount: 60, status: 'pending' }])
      .mockResolvedValueOnce(detailRecords);

    const result = await service.getBeauticianSummary({ storeId: 3, beauticianId: 2, detailLimit: '50' });

    expect(prisma.commissionRecord.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: {
          beauticianId: 2,
          status: { not: 'cancelled' },
          storeId: 3,
          settleMonth: '2026-06',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    expect(result.monthRecords).toHaveLength(6);
    expect(result.recentRecords).toHaveLength(5);
    expect(result.monthRecords.map((record: any) => record.orderNo)).toEqual(['PO-1', 'PO-2', 'PO-3', 'PO-4', 'PO-5', 'PO-6']);
    expect(result.recentRecords.map((record: any) => record.orderNo)).toEqual(['PO-1', 'PO-2', 'PO-3', 'PO-4', 'PO-5']);
  });

  it('closes cashier shift with rounded system cash and cash difference', async () => {
    const systemNow = new Date('2026-06-08T10:00:00.000Z');
    const startedAt = new Date('2026-06-08T02:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);

    prisma.cashierShift.findFirst.mockResolvedValue({
      id: 7,
      storeId: 3,
      deviceId: 11,
      operatorId: 21,
      startedAt,
      openingCash: 500,
    });
    prisma.paymentRecord.findMany.mockResolvedValue([
      { method: 'cash', amount: 320.15 },
      { method: 'wechat', amount: 180 },
      { method: 'bank_card', amount: 100 },
    ]);
    prisma.refundRecord.findMany.mockResolvedValue([{ amount: 20.1 }]);
    prisma.cashierShift.update.mockImplementation(async ({ data }: any) => ({
      id: 7,
      storeId: 3,
      deviceId: 11,
      operatorId: 21,
      openingCash: 500,
      ...data,
      store: { id: 3, name: 'Store' },
      device: { id: 11, name: 'POS-1' },
      operator: { id: 21, name: 'Cashier' },
    }));

    const result = await service.closeCashierShift({ storeId: 3, shiftId: 7, closingCash: 810.05 });

    expect(prisma.cashierShift.findFirst).toHaveBeenCalledWith({
      where: { storeId: 3, status: 'open', id: 7 },
      orderBy: { startedAt: 'desc' },
    });
    expect(prisma.paymentRecord.findMany).toHaveBeenCalledWith({
      where: {
        status: 'success',
        paidAt: { gte: startedAt, lte: systemNow },
        order: { storeId: 3 },
      },
    });
    expect(prisma.refundRecord.findMany).toHaveBeenCalledWith({
      where: {
        status: 'success',
        refundedAt: { gte: startedAt, lte: systemNow },
        order: { storeId: 3 },
      },
    });
    expect(prisma.cashierShift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({
          status: 'closed',
          closingCash: 810.05,
          systemCash: 800.05,
          cashDiff: 10,
          summary: expect.objectContaining({
            cash: 320.15,
            wechat: 180,
            card: 100,
            refund: 20.1,
            total: 600.15,
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        closingCash: 810.05,
        systemCash: 800.05,
        cashDiff: 10,
        alertLevel: 'normal',
      }),
    );
  });

  it('opens cashier shift and serializes shift fields', async () => {
    const startedAt = new Date('2026-06-08T09:00:00.000Z');
    prisma.cashierShift.findFirst.mockResolvedValue(null);
    prisma.cashierShift.create.mockImplementation(async ({ data }: any) => ({
      id: 9,
      ...data,
      openingCash: String(data.openingCash),
      closingCash: null,
      systemCash: null,
      cashDiff: null,
      startedAt,
      store: { id: data.storeId, name: 'Store A' },
      device: { id: data.deviceId, name: 'POS-1' },
      operator: { id: data.operatorId, name: 'Alice' },
    }));

    const result = await service.openCashierShift({
      storeId: '3',
      deviceId: '11',
      operatorId: '21',
      openingCash: '500.5',
    });

    expect(prisma.cashierShift.findFirst).toHaveBeenCalledWith({
      where: { storeId: 3, status: 'open', deviceId: 11 },
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(prisma.cashierShift.create).toHaveBeenCalledWith({
      data: {
        storeId: 3,
        deviceId: 11,
        operatorId: 21,
        operatorType: 'user',
        openingCash: 500.5,
        status: 'open',
      },
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 9,
        storeId: 3,
        deviceId: 11,
        operatorId: 21,
        openingCash: 500.5,
        closingCash: undefined,
        systemCash: undefined,
        cashDiff: undefined,
        storeName: 'Store A',
        deviceName: 'POS-1',
        operatorName: 'Alice',
        alertLevel: 'normal',
      }),
    );
  });

  it('gets current cashier shift scoped by operator when no device is provided', async () => {
    prisma.cashierShift.findFirst.mockResolvedValue({
      id: 10,
      storeId: 3,
      operatorId: 21,
      openingCash: '300',
      closingCash: null,
      systemCash: '360.1',
      cashDiff: '55.01',
      store: { id: 3, name: 'Store A' },
      operator: { id: 21, name: 'Alice' },
    });

    const result = await service.getCurrentCashierShift({ storeId: '3', operatorId: '21' });

    expect(prisma.cashierShift.findFirst).toHaveBeenCalledWith({
      where: { storeId: 3, status: 'open', operatorId: 21 },
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 10,
        openingCash: 300,
        closingCash: undefined,
        systemCash: 360.1,
        cashDiff: 55.01,
        storeName: 'Store A',
        operatorName: 'Alice',
        alertLevel: 'warning',
      }),
    );
  });

  it('queries cashier shift history with pagination, device and date filters', async () => {
    const dateFrom = new Date('2026-05-31T16:00:00.000Z');
    const dateToExclusive = new Date('2026-06-08T16:00:00.000Z');
    const where = {
      storeId: 3,
      deviceId: 11,
      status: 'closed',
      startedAt: { gte: dateFrom, lt: dateToExclusive },
    };
    prisma.cashierShift.findMany.mockResolvedValue([
      {
        id: 7,
        storeId: 3,
        deviceId: 11,
        operatorId: 21,
        openingCash: '500',
        closingCash: '810.05',
        systemCash: '800.05',
        cashDiff: '10',
        store: { id: 3, name: 'Store A' },
        device: { id: 11, name: 'POS-1' },
        operator: { id: 21, name: 'Alice' },
      },
    ]);
    prisma.cashierShift.count.mockResolvedValue(1);

    const result = await service.getCashierShiftHistory({
      page: '2',
      pageSize: '5',
      storeId: '3',
      deviceId: '11',
      status: 'closed',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-08',
    });

    expect(prisma.cashierShift.findMany).toHaveBeenCalledWith({
      where,
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
      skip: 5,
      take: 5,
      orderBy: { startedAt: 'desc' },
    });
    expect(prisma.cashierShift.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        pageSize: 5,
        items: [
          expect.objectContaining({
            id: 7,
            openingCash: 500,
            closingCash: 810.05,
            systemCash: 800.05,
            cashDiff: 10,
            storeName: 'Store A',
            deviceName: 'POS-1',
            operatorName: 'Alice',
          }),
        ],
      }),
    );
    expect(result.data).toBe(result.items);
  });

  it('queries payment records for cashier reconciliation with order context', async () => {
    const dateFrom = new Date('2026-05-31T16:00:00.000Z');
    const dateToExclusive = new Date('2026-06-08T16:00:00.000Z');
    const where = {
      status: 'success',
      method: 'wechat',
      paidAt: { gte: dateFrom, lt: dateToExclusive },
      order: { storeId: 3 },
    };
    prisma.paymentRecord.findMany.mockResolvedValue([
      {
        id: 91,
        orderId: 8,
        paymentNo: 'PAY-91',
        method: 'wechat',
        amount: '128.50',
        status: 'success',
        paidAt: new Date('2026-06-01T09:00:00.000Z'),
        order: { id: 8, orderNo: 'PO-8', checkoutGroupNo: 'PO-GROUP-8', orderKind: 'product', source: 'terminal', customerName: '王敏', storeId: 3, store: { id: 3, name: 'Store A' } },
      },
    ]);
    prisma.paymentRecord.count.mockResolvedValue(1);
    prisma.paymentRecord.aggregate.mockResolvedValue({ _sum: { amount: '128.50' } });

    const result = await service.getPaymentRecords({
      page: '1',
      pageSize: '10',
      storeId: '3',
      status: 'success',
      method: 'wechat',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-08',
    });

    expect(prisma.paymentRecord.findMany).toHaveBeenCalledWith({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            checkoutGroupNo: true,
            orderKind: true,
            source: true,
            customerName: true,
            storeId: true,
            store: { select: { id: true, name: true } },
          },
        },
      },
      skip: 0,
      take: 10,
      orderBy: { paidAt: 'desc' },
    });
    expect(result.summary).toEqual(expect.objectContaining({ paymentAmount: 128.5, paymentCount: 1 }));
    expect(prisma.paymentRecord.count).toHaveBeenCalledWith({ where });
    expect(result.items[0]).toEqual(expect.objectContaining({ amount: 128.5, orderNo: 'PO-8', checkoutGroupNo: 'PO-GROUP-8', source: 'terminal', customerName: '王敏', storeName: 'Store A' }));
  });

  it('queries refund records for cashier reconciliation with order context', async () => {
    const dateFrom = new Date('2026-05-31T16:00:00.000Z');
    const dateToExclusive = new Date('2026-06-08T16:00:00.000Z');
    const where = {
      status: 'success',
      refundedAt: { gte: dateFrom, lt: dateToExclusive },
      order: { storeId: 3, payMethod: 'member_balance' },
    };
    prisma.refundRecord.findMany.mockResolvedValue([
      {
        id: 51,
        orderId: 7,
        refundNo: 'REF-51',
        amount: '66.80',
        status: 'success',
        reason: '客户退款',
        refundedAt: new Date('2026-06-01T10:00:00.000Z'),
        order: { id: 7, orderNo: 'PO-7', orderKind: 'project', customerName: '李丽', storeId: 3, payMethod: 'member_balance', store: { id: 3, name: 'Store A' } },
      },
    ]);
    prisma.refundRecord.count.mockResolvedValue(1);

    const result = await service.getRefundRecords({
      page: '1',
      pageSize: '10',
      storeId: '3',
      status: 'success',
      method: 'member_balance',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-08',
    });

    expect(prisma.refundRecord.findMany).toHaveBeenCalledWith({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNo: true,
            orderKind: true,
            customerName: true,
            storeId: true,
            payMethod: true,
            store: { select: { id: true, name: true } },
          },
        },
      },
      skip: 0,
      take: 10,
      orderBy: { refundedAt: 'desc' },
    });
    expect(prisma.refundRecord.count).toHaveBeenCalledWith({ where });
    expect(result.items[0]).toEqual(expect.objectContaining({ amount: 66.8, orderNo: 'PO-7', customerName: '李丽', payMethod: 'member_balance' }));
  });

  it('detects cashier reconciliation exceptions from daily settlement, refunds and cash shifts', async () => {
    const dateFrom = new Date('2026-05-31T16:00:00.000Z');
    const dateToExclusive = new Date('2026-06-01T16:00:00.000Z');
    prisma.dailySettlement.findMany.mockResolvedValue([
      {
        id: 31,
        storeId: 3,
        settleDate: new Date('2026-06-01T00:00:00.000Z'),
        totalRevenue: '100',
        summary: { total: 200 },
        refundAmount: '20',
        status: 'draft',
        updatedAt: new Date('2026-06-01T09:00:00.000Z'),
        store: { id: 3, name: 'Store A' },
      },
    ]);
    prisma.paymentRecord.findMany.mockResolvedValue([
      {
        id: 91,
        orderId: 8,
        amount: '200',
        status: 'success',
        paidAt: new Date('2026-06-01T08:00:00.000Z'),
        order: { id: 8, orderNo: 'PO-8', customerName: '王敏', storeId: 3 },
      },
    ]);
    prisma.refundRecord.findMany.mockResolvedValue([
      {
        id: 51,
        orderId: 7,
        refundNo: 'REF-51',
        amount: '50',
        status: 'success',
        refundedAt: new Date('2026-06-01T10:00:00.000Z'),
        order: { id: 7, orderNo: 'PO-7', customerName: '李丽', storeId: 3 },
      },
    ]);
    prisma.cashierShift.findMany.mockResolvedValue([
      {
        id: 61,
        storeId: 3,
        startedAt: new Date('2026-06-01T08:00:00.000Z'),
        status: 'closed',
        cashDiff: '60',
        store: { id: 3, name: 'Store A' },
        device: null,
        operator: { id: 21, name: 'Alice' },
      },
    ]);

    const result = await service.getReconciliationExceptions({ page: 1, pageSize: 20, storeId: 3, dateFrom: '2026-06-01', dateTo: '2026-06-01' });

    expect(prisma.dailySettlement.findMany).toHaveBeenCalledWith({
      where: { storeId: 3, settleDate: { gte: dateFrom, lt: dateToExclusive } },
      include: { store: { select: { id: true, name: true } } },
      orderBy: { settleDate: 'desc' },
    });
    expect(prisma.paymentRecord.findMany).toHaveBeenCalledWith({
      where: { status: 'success', paidAt: { gte: dateFrom, lt: dateToExclusive }, order: { storeId: 3 } },
      include: { order: { select: { id: true, orderNo: true, customerName: true, storeId: true } } },
    });
    expect(prisma.refundRecord.findMany).toHaveBeenCalledWith({
      where: { status: { in: ['success', 'completed', 'refunded'] }, refundedAt: { gte: dateFrom, lt: dateToExclusive }, order: { storeId: 3 } },
      include: {
        items: { include: { stockMovements: true } },
        order: { select: { id: true, orderNo: true, customerName: true, storeId: true, netAmount: true, status: true, refundRecords: { where: { status: { in: ['success', 'completed', 'refunded'] } }, select: { amount: true } } } },
      },
    });
    expect(prisma.cashierShift.findMany).toHaveBeenCalledWith({
      where: { storeId: 3, startedAt: { gte: dateFrom, lt: dateToExclusive }, status: { in: ['closed', 'reconciled'] } },
      include: {
        store: { select: { id: true, name: true } },
        device: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    expect(result.total).toBe(5);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'daily_unconfirmed', severity: 'medium', actionTarget: 'daily' }),
        expect.objectContaining({ type: 'daily_amount_mismatch', severity: 'high', actionTarget: 'daily', amountDiff: -30 }),
        expect.objectContaining({ type: 'refund_after_daily_settlement', severity: 'medium', actionTarget: 'refunds', sourceId: 51 }),
        expect.objectContaining({ type: 'cash_shift_diff', severity: 'high', actionTarget: 'shifts', amountDiff: 60 }),
        expect.objectContaining({ type: 'refund_without_items', severity: 'high', actionTarget: 'refunds', sourceId: 51 }),
      ]),
    );
    expect(result.summary).toEqual({ high: 3, medium: 2, low: 0 });
  });

  it('rejects cross-store finance object access by id', async () => {
    prisma.commissionRule.findUnique.mockResolvedValue({ id: 88, storeId: 9, status: 'active' });
    await expect(service.getRuleById(88, { userId: 7, storeIds: [3], roles: ['store_manager'], permissions: ['core:finance:manage'] })).rejects.toThrow('无权访问该门店财务数据');

    prisma.commissionRecord.findUnique.mockResolvedValue({ id: 99, storeId: 9, status: 'pending' });
    await expect(service.confirmRecord(99, { userId: 7, storeIds: [3], roles: ['store_manager'], permissions: ['core:finance:manage'] })).rejects.toThrow('无权访问该门店财务数据');
    expect(prisma.commissionRecord.update).not.toHaveBeenCalled();
  });

  it('rejects paying a draft settlement and records payment evidence for a confirmed settlement', async () => {
    prisma.commissionSettlement.findUnique.mockResolvedValueOnce({ id: 20, storeId: 3, status: 'draft', settlementRecords: [] });
    await expect(service.markSettlementPaid(20, { userId: 7, storeIds: [3], roles: ['store_manager'], permissions: ['core:finance:manage'], paymentBatchNo: 'PAY-202607', paymentMethod: 'bank_transfer', paymentVoucherNo: 'V-001' } as any)).rejects.toThrow('只有已确认结算单可以发放');

    prisma.commissionSettlement.findUnique.mockResolvedValueOnce({ id: 20, storeId: 3, status: 'confirmed', settlementRecords: [] });
    prisma.commissionSettlement.update.mockResolvedValue({ id: 20, storeId: 3, status: 'paid', paidAt: new Date() });
    await service.markSettlementPaid(20, { userId: 7, storeIds: [3], roles: ['store_manager'], permissions: ['core:finance:manage'], paymentBatchNo: 'PAY-202607', paymentMethod: 'bank_transfer', paymentVoucherNo: 'V-001' } as any);
    expect(prisma.commissionSettlement.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'paid', paidBy: 7, paymentBatchNo: 'PAY-202607', paymentMethod: 'bank_transfer', paymentVoucherNo: 'V-001' }) }));
  });

  it('creates a traceable commission adjustment without mutating locked commission records', async () => {
    prisma.commissionSettlement.findUnique.mockResolvedValue({ id: 20, storeId: 3, status: 'confirmed' });
    prisma.commissionAdjustment.create.mockImplementation(async ({ data }: any) => ({ id: 801, ...data }));

    const result = await service.createCommissionAdjustment(20, { type: 'refund_recovery', amount: -50, reason: '已结算订单退款追缴' }, { userId: 7, storeIds: [3], roles: ['store_manager'], permissions: ['core:finance:manage'] });

    expect(prisma.commissionAdjustment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ settlementId: 20, storeId: 3, type: 'refund_recovery', amount: -50, createdBy: 7, status: 'pending' }) });
    expect(prisma.commissionRecord.update).not.toHaveBeenCalled();
    expect(result.id).toBe(801);
  });

  it('does not compare prepaid payment cash flow with operating revenue', async () => {
    prisma.dailySettlement.findMany.mockResolvedValue([{
      id: 1,
      storeId: 3,
      settleDate: new Date('2026-06-01T00:00:00.000Z'),
      totalRevenue: '0',
      rechargeIncome: '100',
      refundAmount: '0',
      status: 'confirmed',
      summary: { total: 100, prepaidAmount: 100 },
      updatedAt: new Date('2026-06-01T12:00:00.000Z'),
      store: { id: 3, name: 'Store A' },
    }]);
    prisma.paymentRecord.findMany.mockResolvedValue([{
      id: 1,
      orderId: 10,
      amount: '100',
      status: 'success',
      paidAt: new Date('2026-06-01T08:00:00.000Z'),
      order: { id: 10, orderNo: 'RC10', orderKind: 'member_card_recharge', storeId: 3 },
    }]);
    prisma.refundRecord.findMany.mockResolvedValue([]);
    prisma.cashierShift.findMany.mockResolvedValue([]);

    const result = await service.getReconciliationExceptions({ page: 1, pageSize: 20, storeId: 3, dateFrom: '2026-06-01', dateTo: '2026-06-01' });

    expect(result.items.some((item) => item.type === 'daily_amount_mismatch')).toBe(false);
  });

  it('generates daily settlement with net revenue, payment split, costs and commissions', async () => {
    const settleDate = new Date('2026-06-08T00:00:00.000Z');
    const dayStart = new Date('2026-06-07T16:00:00.000Z');
    const dayEnd = new Date('2026-06-08T16:00:00.000Z');

    prisma.productOrder.findMany.mockResolvedValue([
      {
        id: 1,
        customerId: 101,
        totalAmount: 1000,
        payMethod: 'cash',
        paymentRecords: [
          { method: 'cash', amount: 300 },
          { method: 'wechat', amount: 700 },
        ],
        orderItems: [
          { itemType: 'product', itemId: 501, quantity: 2 },
          { itemType: 'project', itemId: 601, quantity: 1 },
        ],
      },
      {
        id: 2,
        customerId: 102,
        totalAmount: 500,
        payMethod: 'alipay',
        paymentRecords: [],
        orderItems: [{ itemType: 'recharge', itemId: null, quantity: 1 }],
      },
      {
        id: 3,
        customerId: 101,
        totalAmount: 200,
        payMethod: 'member_balance',
        paymentRecords: [{ method: 'member_balance', amount: 200 }],
        orderItems: [],
      },
      {
        id: 4,
        customerId: 103,
        totalAmount: 300,
        payMethod: 'cash',
        paymentRecords: [],
        orderItems: [{ itemType: 'card', itemId: 66, quantity: 1, netAmount: 300, subtotal: 300 }],
      },
    ]);
    prisma.refundRecord.findMany.mockResolvedValue([{ amount: 50 }]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      { storeId: 3, verifiedAt: new Date('2026-06-08T06:00:00.000Z'), recognizedAmount: 200 },
    ]);
    prisma.product.findUnique.mockResolvedValue({ costPrice: 15 });
    prisma.projectBomItem.findMany.mockResolvedValue([
      { standardQty: 2, product: { costPrice: 20 } },
      { standardQty: 0.5, product: { costPrice: 40 } },
    ]);
    prisma.commissionRecord.findMany.mockResolvedValue([{ amount: 80 }, { amount: 20 }]);
    prisma.dailySettlement.upsert.mockImplementation(async ({ create }: any) => ({
      id: 99,
      ...create,
      store: { id: create.storeId, name: 'Store' },
    }));

    const result = await service.generateDailySettlement(3, settleDate);

    expect(prisma.productOrder.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 3,
        createdAt: { gte: dayStart, lt: dayEnd },
        OR: [
          { status: { in: ['completed', 'paid', 'refunded'] } },
          { paymentRecords: { some: { status: 'success' } } },
        ],
      },
      include: {
        orderItems: true,
        paymentRecords: { where: { status: 'success' } },
      },
    });
    expect(prisma.refundRecord.findMany).toHaveBeenCalledWith({
      where: {
        status: { in: ['success', 'completed', 'refunded'] },
        refundedAt: { gte: dayStart, lt: dayEnd },
        order: { storeId: 3 },
      },
    });
    expect(prisma.commissionRecord.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 3,
        createdAt: { gte: dayStart, lt: dayEnd },
        status: { not: 'cancelled' },
      },
    });
    expect(prisma.dailySettlement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { storeId_settleDate: { storeId: 3, settleDate } },
        create: expect.objectContaining({
          totalRevenue: 1950,
          cashRevenue: 600,
          wechatRevenue: 700,
          alipayRevenue: 500,
          balanceRevenue: 200,
          rechargeIncome: 500,
          refundAmount: 50,
          orderCount: 4,
          customerCount: 3,
          avgTransaction: 487.5,
          materialCost: 90,
          grossProfit: 1760,
          grossMargin: 90.26,
          commissionTotal: 100,
          status: 'draft',
          summary: expect.objectContaining({
            cash: 600,
            wechat: 700,
            alipay: 500,
            member_balance: 200,
            refund: 50,
            total: 2000,
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        totalRevenue: 2150,
        cardUsageRevenue: 200,
        prepaidIncome: 800,
        refundAmount: 50,
        grossProfit: 1960,
        grossMargin: 91.16,
        commissionTotal: 100,
        settleDate: '2026-06-08',
      }),
    );
  });

  it('rejects regenerating a confirmed daily settlement until it is reopened', async () => {
    prisma.dailySettlement.findUnique.mockResolvedValue({ id: 99, storeId: 3, status: 'confirmed' });

    await expect(service.generateDailySettlement(3, '2026-06-08')).rejects.toThrow('已确认日结禁止重新生成');
    expect(prisma.dailySettlement.upsert).not.toHaveBeenCalled();
  });

  it('confirms a daily settlement by creating an immutable version snapshot and audit log', async () => {
    const settlement = {
      id: 99,
      storeId: 3,
      settleDate: new Date('2026-06-08T00:00:00.000Z'),
      totalRevenue: 1200,
      cashRevenue: 200,
      wechatRevenue: 1000,
      alipayRevenue: 0,
      cardRevenue: 0,
      balanceRevenue: 0,
      rechargeIncome: 0,
      refundAmount: 50,
      orderCount: 4,
      customerCount: 3,
      avgTransaction: 300,
      materialCost: 100,
      grossProfit: 1050,
      grossMargin: 87.5,
      commissionTotal: 50,
      status: 'draft',
      summary: { total: 1200, dataQuality: { status: 'complete' } },
    };
    prisma.dailySettlement.findUnique.mockResolvedValue(settlement);
    prisma.dailySettlementSnapshot.count.mockResolvedValue(0);
    prisma.dailySettlementSnapshot.create.mockImplementation(async ({ data }: any) => ({ id: 501, ...data }));
    prisma.dailySettlement.update.mockResolvedValue({ ...settlement, status: 'confirmed', confirmedBy: 7, confirmedAt: new Date() });

    const result = await service.confirmDailySettlement(99, 7, 3);

    expect(prisma.dailySettlementSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ dailySettlementId: 99, storeId: 3, version: 1, confirmedBy: 7, totalRevenue: 1200, snapshot: expect.objectContaining({ summary: settlement.summary }) }),
    });
    expect(prisma.financeAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ storeId: 3, userId: 7, action: 'daily_settlement_confirm', entityType: 'DailySettlement', entityId: 99 }),
    });
    expect(result).toEqual(expect.objectContaining({ status: 'confirmed', version: 1 }));
  });

  it('allows system auto confirmation and freezes reconciliation summaries in the snapshot', async () => {
    const settlement = {
      id: 100,
      storeId: 3,
      settleDate: new Date('2026-06-09T00:00:00.000Z'),
      totalRevenue: 900,
      cashRevenue: 100,
      wechatRevenue: 800,
      alipayRevenue: 0,
      cardRevenue: 0,
      balanceRevenue: 0,
      rechargeIncome: 0,
      refundAmount: 0,
      orderCount: 2,
      customerCount: 2,
      avgTransaction: 450,
      materialCost: 50,
      grossProfit: 850,
      grossMargin: 94.44,
      commissionTotal: 0,
      status: 'draft',
      summary: { total: 900 },
      systemSummary: { totalRevenue: 900 },
      adjustmentSummary: { totalRevenue: 0 },
      finalSummary: { totalRevenue: 900 },
    };
    prisma.dailySettlement.findUnique.mockResolvedValue(settlement);
    prisma.dailySettlementSnapshot.count.mockResolvedValue(0);
    prisma.dailySettlementSnapshot.create.mockResolvedValue({ id: 502 });
    prisma.dailySettlement.update.mockResolvedValue({ ...settlement, status: 'confirmed', confirmationMode: 'auto' });

    const result = await service.confirmDailySettlement(100, undefined, 3, {
      confirmationMode: 'auto',
      reconciliationRunId: 88,
      ruleVersion: 'finance_reconciliation_v1',
      sourceDigest: 'digest-1',
    });

    expect(prisma.dailySettlementSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dailySettlementId: 100,
        confirmedBy: null,
        confirmationMode: 'auto',
        reconciliationRunId: 88,
        ruleVersion: 'finance_reconciliation_v1',
        sourceDigest: 'digest-1',
        systemSummary: settlement.systemSummary,
        adjustmentSummary: settlement.adjustmentSummary,
        finalSummary: settlement.finalSummary,
      }),
    });
    expect(prisma.dailySettlement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 100 },
      data: expect.objectContaining({ status: 'confirmed', confirmedBy: null, confirmationMode: 'auto' }),
    }));
    expect(prisma.financeAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'daily_settlement_auto_confirm', userId: null }),
    });
    expect(result).toEqual(expect.objectContaining({ status: 'confirmed', version: 1 }));
  });

  it('allows only a super admin to reopen a confirmed daily settlement with a reason', async () => {
    prisma.dailySettlement.findUnique.mockResolvedValue({ id: 99, storeId: 3, status: 'confirmed', settleDate: new Date('2026-06-08') });
    prisma.dailySettlement.update.mockResolvedValue({ id: 99, storeId: 3, status: 'draft', settleDate: new Date('2026-06-08') });

    await expect(service.reopenDailySettlement(99, { userId: 8, storeIds: [3], roles: ['store_manager'], permissions: ['core:finance:manage'], reason: '补录退款后重新结账' })).rejects.toThrow('仅平台管理员可以重开');

    const result = await service.reopenDailySettlement(99, { userId: 1, storeIds: [], roles: ['super_admin'], permissions: ['*'], reason: '补录退款后重新结账' });
    expect(prisma.dailySettlement.update).toHaveBeenCalledWith({ where: { id: 99 }, data: { status: 'draft', confirmedAt: null, confirmedBy: null } });
    expect(prisma.financeAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'daily_settlement_reopen', reason: '补录退款后重新结账', userId: 1 }) });
    expect(result.status).toBe('draft');
  });

  it('lists daily settlements by business date and hides legacy duplicate date rows', async () => {
    const canonical = {
      id: 20,
      storeId: 3,
      settleDate: new Date('2026-06-23T00:00:00.000Z'),
      totalRevenue: 1200,
      cashRevenue: 0,
      wechatRevenue: 1200,
      alipayRevenue: 0,
      cardRevenue: 0,
      balanceRevenue: 0,
      rechargeIncome: 0,
      refundAmount: 0,
      avgTransaction: 1200,
      materialCost: 100,
      grossProfit: 1100,
      grossMargin: 91.67,
      commissionTotal: 0,
      status: 'draft',
      updatedAt: new Date('2026-06-23T03:00:00.000Z'),
      store: { id: 3, name: 'Store' },
    };
    const legacy = {
      ...canonical,
      id: 19,
      settleDate: new Date('2026-06-22T16:00:00.000Z'),
      totalRevenue: 900,
      status: 'confirmed',
      updatedAt: new Date('2026-06-23T04:00:00.000Z'),
    };
    prisma.dailySettlement.findMany.mockResolvedValue([canonical, legacy]);
    prisma.cardUsageRecord.findMany.mockResolvedValue([
      { storeId: 3, verifiedAt: new Date('2026-06-23T05:00:00.000Z'), recognizedAmount: 180 },
      { storeId: 3, verifiedAt: new Date('2026-06-23T08:00:00.000Z'), recognizedAmount: 120 },
    ]);
    prisma.productOrder.findMany.mockResolvedValue([
      {
        storeId: 3,
        createdAt: new Date('2026-06-23T02:00:00.000Z'),
        totalAmount: 500,
        netAmount: 500,
        paymentRecords: [{ amount: 500 }],
        orderItems: [{ itemType: 'recharge', netAmount: 500, subtotal: 500 }],
      },
      {
        storeId: 3,
        createdAt: new Date('2026-06-23T04:00:00.000Z'),
        totalAmount: 300,
        netAmount: 300,
        paymentRecords: [{ amount: 300 }],
        orderItems: [{ itemType: 'card', netAmount: 300, subtotal: 300 }],
      },
    ]);

    const result = await service.getDailySettlements({ page: 1, pageSize: 20, storeId: 3, dateFrom: '2026-06-23', dateTo: '2026-06-23' });

    expect(prisma.dailySettlement.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 3,
        settleDate: {
          gte: new Date('2026-06-22T16:00:00.000Z'),
          lt: new Date('2026-06-23T16:00:00.000Z'),
        },
      },
      include: { store: { select: { id: true, name: true } } },
      orderBy: { settleDate: 'desc' },
    });
    expect(prisma.cardUsageRecord.findMany).toHaveBeenCalledWith({
      where: {
        storeId: { in: [3] },
        verifiedAt: {
          gte: new Date('2026-06-22T16:00:00.000Z'),
          lt: new Date('2026-06-23T16:00:00.000Z'),
        },
      },
      select: { storeId: true, verifiedAt: true, recognizedAmount: true },
    });
    expect(prisma.productOrder.findMany).toHaveBeenCalledWith({
      where: {
        storeId: { in: [3] },
        createdAt: {
          gte: new Date('2026-06-22T16:00:00.000Z'),
          lt: new Date('2026-06-23T16:00:00.000Z'),
        },
        orderItems: { some: { itemType: { in: ['recharge', 'card', 'open'] } } },
        OR: [
          { status: { in: ['completed', 'paid', 'refunded'] } },
          { paymentRecords: { some: { status: 'success' } } },
        ],
      },
      include: {
        orderItems: true,
        paymentRecords: { where: { status: 'success' } },
      },
    });
    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ id: 20, settleDate: '2026-06-23', totalRevenue: 1500, cardUsageRevenue: 300, prepaidIncome: 800, grossProfit: 1400, grossMargin: 93.33 }));
  });

  it('generates yesterday daily settlements for all active stores and keeps partial failures', async () => {
    const systemNow = new Date('2026-06-09T01:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);
    jest.spyOn((service as any).logger, 'error').mockImplementation();

    prisma.store.findMany.mockResolvedValue([
      { id: 1, name: 'Store A' },
      { id: 2, name: 'Store B' },
    ]);
    jest.spyOn(service, 'generateDailySettlement').mockImplementation(async (storeId: any) => {
      if (storeId === 2) throw new Error('settlement failed');
      return { id: 10, storeId, totalRevenue: 100 } as any;
    });

    const result = await service.generateDailySettlementsForAllStores();

    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, status: 'active' },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    expect(service.generateDailySettlement).toHaveBeenNthCalledWith(1, 1, '2026-06-08');
    expect(service.generateDailySettlement).toHaveBeenNthCalledWith(2, 2, '2026-06-08');
    expect(result).toEqual({
      items: [{ id: 10, storeId: 1, totalRevenue: 100 }],
      data: [{ id: 10, storeId: 1, totalRevenue: 100 }],
      total: 1,
      failed: 1,
      errors: [{ storeId: 2, storeName: 'Store B', message: 'settlement failed' }],
      settleDate: '2026-06-08',
    });
  });

  it('runs the rule-driven reconciliation service for every active store at 01:00', async () => {
    const systemNow = new Date('2026-06-09T01:00:00.000Z');
    jest.useFakeTimers().setSystemTime(systemNow);
    prisma.store.findMany.mockResolvedValue([{ id: 3, name: 'A 店' }, { id: 4, name: 'B 店' }]);
    const runner = { runDailyClose: jest.fn().mockResolvedValue({ status: 'passed', autoConfirmed: true }) };
    const cronService = new CommissionService(prisma, undefined, { get: jest.fn().mockReturnValue(runner) } as any);

    const result = await cronService.handleDailySettlementCron();

    expect(runner.runDailyClose).toHaveBeenCalledTimes(2);
    expect(runner.runDailyClose).toHaveBeenNthCalledWith(1, 3, '2026-06-08', { triggerType: 'scheduled', autoConfirm: true });
    expect(runner.runDailyClose).toHaveBeenNthCalledWith(2, 4, '2026-06-08', { triggerType: 'scheduled', autoConfirm: true });
    expect(result).toEqual(expect.objectContaining({ total: 2, settleDate: '2026-06-08' }));
  });

  it('records Ami marketing contribution with default commission rate and settle month', async () => {
    const occurredAt = new Date('2026-06-08T12:00:00.000Z');
    prisma.amiPerformanceRecord.findFirst.mockResolvedValue(null);
    prisma.amiPerformanceRecord.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));

    const result = await service.recordAmiContribution({
      storeId: 3,
      category: 'marketing_conversion',
      triggerType: 'automation',
      triggerId: 88,
      customerId: 101,
      orderId: 202,
      revenueAmount: 1000,
      occurredAt,
    });

    expect(prisma.amiPerformanceRecord.findFirst).toHaveBeenCalledWith({
      where: {
        storeId: 3,
        category: 'marketing_conversion',
        triggerType: 'automation',
        triggerId: 88,
        occurredAt: { gte: new Date('2026-06-07T12:00:00.000Z') },
      },
    });
    expect(prisma.amiPerformanceRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 3,
        category: 'marketing_conversion',
        triggerType: 'automation',
        triggerId: 88,
        customerId: 101,
        orderId: 202,
        revenueAmount: 1000,
        commissionRate: 0.08,
        commissionAmount: 80,
        occurredAt,
        settleMonth: '2026-06',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ commissionAmount: 80 }));
  });

  it('uses churn recovery commission rate and skips duplicate Ami triggers within 24 hours', async () => {
    const existed = { id: 9, category: 'churn_recovery', triggerId: 77 };
    prisma.amiPerformanceRecord.findFirst.mockResolvedValue(existed);

    const result = await service.recordAmiContribution({
      storeId: 3,
      category: 'churn_recovery',
      triggerType: 'automation',
      triggerId: 77,
      revenueAmount: 1000,
      occurredAt: new Date('2026-06-08T12:00:00.000Z'),
    });

    expect(result).toBe(existed);
    expect(prisma.amiPerformanceRecord.create).not.toHaveBeenCalled();
  });

  it('records Ami work-minute contribution without revenue commission', async () => {
    prisma.amiPerformanceRecord.findFirst.mockResolvedValue(null);
    prisma.amiPerformanceRecord.create.mockImplementation(async ({ data }: any) => ({ id: 2, ...data }));

    await service.recordAmiContribution({
      storeId: 3,
      category: 'cashier_assist',
      triggerType: 'terminal_checkout',
      triggerId: 202,
      workMinutes: 2,
      occurredAt: new Date('2026-06-08T12:00:00.000Z'),
    });

    expect(prisma.amiPerformanceRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 3,
        category: 'cashier_assist',
        triggerType: 'terminal_checkout',
        triggerId: 202,
        workMinutes: 2,
        settleMonth: '2026-06',
      }),
    });
    expect(prisma.amiPerformanceRecord.create.mock.calls[0][0].data.commissionAmount).toBeUndefined();
  });

  it('generates Ami monthly bill with commission fee capped at three times base fee', async () => {
    prisma.amiPerformanceRecord.findMany.mockResolvedValue([
      { category: 'marketing_conversion', revenueAmount: 50000, commissionAmount: 4000, workMinutes: null },
      { category: 'cashier_assist', revenueAmount: null, commissionAmount: null, workMinutes: 20 },
    ]);
    prisma.amiMonthlyBill.create.mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
      store: { id: data.storeId, name: 'Store' },
    }));

    const result = await service.generateAmiMonthlyBill(3, '2026-06');

    expect(prisma.amiMonthlyBill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 1,
          baseFee: 699,
          commissionFee: 2097,
          totalFee: 2796,
          revenueGenerated: 50000,
          roi: 17.88,
          breakdown: expect.objectContaining({
            recordCount: 2,
            workMinutes: 20,
            rawCommissionFee: 4000,
            commissionCap: 2097,
          }),
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({ commissionFee: 2097, totalFee: 2796, roi: 17.88 }));
  });

  it('auto-generates Ami monthly bills for all active stores and keeps partial failures', async () => {
    jest.spyOn((service as any).logger, 'error').mockImplementation();
    prisma.store.findMany.mockResolvedValue([
      { id: 1, name: 'Store A' },
      { id: 2, name: 'Store B' },
    ]);
    jest.spyOn(service, 'generateAmiMonthlyBill').mockImplementation(async (storeId: any, settleMonth: string) => {
      if (storeId === 2) throw new Error('bill failed');
      return { id: 100, storeId, settleMonth, totalFee: 699 } as any;
    });

    const result = await service.generateAmiMonthlyBillsForAllStores('2026-05');

    expect(prisma.store.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, status: 'active' },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
    expect(service.generateAmiMonthlyBill).toHaveBeenNthCalledWith(1, 1, '2026-05');
    expect(service.generateAmiMonthlyBill).toHaveBeenNthCalledWith(2, 2, '2026-05');
    expect(result).toEqual({
      items: [{ id: 100, storeId: 1, settleMonth: '2026-05', totalFee: 699 }],
      data: [{ id: 100, storeId: 1, settleMonth: '2026-05', totalFee: 699 }],
      total: 1,
      failed: 1,
      errors: [{ storeId: 2, storeName: 'Store B', message: 'bill failed' }],
      settleMonth: '2026-05',
    });
  });

  it('summarizes Ami dashboard from performance records and bills', async () => {
    prisma.amiPerformanceRecord.findMany.mockResolvedValue([
      { category: 'marketing_conversion', revenueAmount: 1000, commissionAmount: 80, workMinutes: null },
      { category: 'cashier_assist', revenueAmount: null, commissionAmount: null, workMinutes: 6 },
    ]);
    prisma.amiMonthlyBill.findMany.mockResolvedValue([{ totalFee: 779 }]);

    const result = await service.getAmiDashboard({ storeId: 3, settleMonth: '2026-06' });

    expect(result).toEqual(
      expect.objectContaining({
        settleMonth: '2026-06',
        revenueGenerated: 1000,
        commissionAmount: 80,
        workMinutes: 6,
        totalFee: 779,
        roi: 1.28,
        recordCount: 2,
        billCount: 1,
      }),
    );
    expect(result.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'marketing_conversion', revenueAmount: 1000, commissionAmount: 80 }),
        expect.objectContaining({ category: 'cashier_assist', workMinutes: 6 }),
      ]),
    );
  });

  it('summarizes monthly platform revenue with traceable source records and per-store monthly ARPU', async () => {
    prisma.amiMonthlyBill.findMany.mockResolvedValue([
      {
        id: 1,
        storeId: 11,
        settleMonth: '2026-06',
        baseFee: 699,
        commissionFee: 100,
        store: { id: 11, name: 'Store A' },
      },
      {
        id: 2,
        storeId: 12,
        settleMonth: '2026-06',
        baseFee: 699,
        commissionFee: 200,
        store: { id: 12, name: 'Store B' },
      },
    ]);
    prisma.supplySettlement.findMany.mockResolvedValue([
      {
        id: 10,
        supplierId: 21,
        settleMonth: '2026-06',
        orderCount: 3,
        rebateAmount: 60,
        platformFee: 24,
        supplier: { id: 21, name: 'Supplier A' },
      },
      {
        id: 11,
        supplierId: 22,
        settleMonth: '2026-06',
        orderCount: 2,
        rebateAmount: 30,
        platformFee: 12,
        supplier: { id: 22, name: 'Supplier B' },
      },
    ]);
    prisma.store.count.mockResolvedValue(3);

    const result = await service.getPlatformRevenue({ period: 'month', value: '2026-06' });

    expect(prisma.amiMonthlyBill.findMany).toHaveBeenNthCalledWith(1, {
      where: { settleMonth: '2026-06', status: { in: ['confirmed', 'invoiced', 'paid'] } },
      include: { store: { select: { id: true, name: true } } },
      orderBy: [{ settleMonth: 'asc' }, { storeId: 'asc' }],
    });
    expect(prisma.supplySettlement.findMany).toHaveBeenCalledWith({
      where: { settleMonth: '2026-06', status: { in: ['confirmed', 'supplier_confirmed', 'paid'] } },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: [{ settleMonth: 'asc' }, { supplierId: 'asc' }],
    });
    expect(prisma.store.count).toHaveBeenCalledWith({ where: { deletedAt: null, status: { not: 'archived' } } });
    expect(result).toEqual(
      expect.objectContaining({
        period: 'month',
        value: '2026-06',
        months: ['2026-06'],
        totalRevenue: 1824,
        arpu: 608,
        ltvEstimate: 7296,
        monthOverMonth: 0,
      }),
    );
    expect(result.amiSubscription).toEqual(
      expect.objectContaining({
        total: 1398,
        storeCount: 2,
        records: [
          { id: 1, storeId: 11, storeName: 'Store A', settleMonth: '2026-06', amount: 699 },
          { id: 2, storeId: 12, storeName: 'Store B', settleMonth: '2026-06', amount: 699 },
        ],
      }),
    );
    expect(result.amiCommission).toEqual(
      expect.objectContaining({
        total: 300,
        avgPerStore: 150,
        records: [
          { id: 1, storeId: 11, storeName: 'Store A', settleMonth: '2026-06', amount: 100 },
          { id: 2, storeId: 12, storeName: 'Store B', settleMonth: '2026-06', amount: 200 },
        ],
      }),
    );
    expect(result.supplyChainRebate).toEqual(
      expect.objectContaining({
        total: 90,
        orderCount: 5,
        records: [
          { id: 10, supplierId: 21, supplierName: 'Supplier A', settleMonth: '2026-06', amount: 60 },
          { id: 11, supplierId: 22, supplierName: 'Supplier B', settleMonth: '2026-06', amount: 30 },
        ],
      }),
    );
    expect(result.supplyChainFee).toEqual(
      expect.objectContaining({
        total: 36,
        records: [
          { id: 10, supplierId: 21, supplierName: 'Supplier A', settleMonth: '2026-06', amount: 24 },
          { id: 11, supplierId: 22, supplierName: 'Supplier B', settleMonth: '2026-06', amount: 12 },
        ],
      }),
    );
    expect(result.storeRanking).toEqual([
      { storeId: 12, storeName: 'Store B', amiSubscription: 699, amiCommission: 200, totalRevenue: 899 },
      { storeId: 11, storeName: 'Store A', amiSubscription: 699, amiCommission: 100, totalRevenue: 799 },
    ]);
  });

  it('prevents regenerating a non-draft Ami bill and enforces the bill state machine', async () => {
    prisma.amiMonthlyBill.findFirst.mockResolvedValueOnce({ id: 1, storeId: 3, settleMonth: '2026-06', version: 1, status: 'confirmed' });
    await expect(service.generateAmiMonthlyBill(3, '2026-06')).rejects.toThrow('只有草稿账单可以重新生成');

    prisma.amiMonthlyBill.findFirst.mockResolvedValueOnce({ id: 1, storeId: 3, settleMonth: '2026-06', version: 1, status: 'draft' });
    prisma.amiMonthlyBill.update.mockResolvedValue({ id: 1, storeId: 3, settleMonth: '2026-06', version: 1, status: 'draft' });
    prisma.amiPerformanceRecord.findMany.mockResolvedValue([]);
    await service.generateAmiMonthlyBill(3, '2026-06');

    prisma.amiMonthlyBill.findUnique.mockResolvedValue({ id: 1, storeId: 3, status: 'draft' });
    prisma.amiMonthlyBill.update = jest.fn().mockResolvedValue({ id: 1, storeId: 3, status: 'confirmed' });
    const confirmed = await service.transitionAmiMonthlyBill(1, 'confirmed', { userId: 7, storeIds: [3], roles: ['store_manager'], permissions: ['core:finance:manage'] });
    expect(confirmed.status).toBe('confirmed');
  });

  it('separates confirmed platform revenue from draft estimated revenue', async () => {
    prisma.amiMonthlyBill.findMany
      .mockResolvedValueOnce([{ id: 1, storeId: 11, settleMonth: '2026-06', status: 'confirmed', baseFee: 699, commissionFee: 100, store: { id: 11, name: 'Store A' } }])
      .mockResolvedValueOnce([{ id: 2, storeId: 12, settleMonth: '2026-06', status: 'draft', baseFee: 699, commissionFee: 200, totalFee: 899 }]);
    prisma.supplySettlement.findMany.mockResolvedValue([]);
    prisma.store.count.mockResolvedValue(2);

    const result = await service.getPlatformRevenue({ period: 'month', value: '2026-06' });

    expect(prisma.amiMonthlyBill.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { settleMonth: '2026-06', status: { in: ['confirmed', 'invoiced', 'paid'] } } }));
    expect(result.totalRevenue).toBe(799);
    expect(result.estimatedRevenue).toBe(899);
    expect(result.annualizedRevenueEstimate).toBe(result.ltvEstimate);
  });

  it('summarizes quarterly platform revenue by month trend and month-over-month growth', async () => {
    prisma.amiMonthlyBill.findMany.mockResolvedValue([
      { id: 1, storeId: 11, settleMonth: '2026-05', baseFee: 500, commissionFee: 100, store: { id: 11, name: 'Store A' } },
      { id: 2, storeId: 12, settleMonth: '2026-06', baseFee: 700, commissionFee: 150, store: { id: 12, name: 'Store B' } },
    ]);
    prisma.supplySettlement.findMany.mockResolvedValue([
      { id: 10, supplierId: 21, settleMonth: '2026-05', orderCount: 2, rebateAmount: 300, platformFee: 100, supplier: { id: 21, name: 'Supplier A' } },
      { id: 11, supplierId: 22, settleMonth: '2026-06', orderCount: 3, rebateAmount: 400, platformFee: 250, supplier: { id: 22, name: 'Supplier B' } },
    ]);
    prisma.store.count.mockResolvedValue(2);

    const result = await service.getPlatformRevenue({ period: 'quarter', value: '2026-Q2' });

    expect(prisma.amiMonthlyBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settleMonth: { in: ['2026-04', '2026-05', '2026-06'] }, status: { in: ['confirmed', 'invoiced', 'paid'] } },
      }),
    );
    expect(prisma.supplySettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settleMonth: { in: ['2026-04', '2026-05', '2026-06'] }, status: { in: ['confirmed', 'supplier_confirmed', 'paid'] } },
      }),
    );
    expect(result.months).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(result.monthTrend).toEqual([
      { month: '2026-04', amiSubscription: 0, amiCommission: 0, supplyChainRebate: 0, supplyChainFee: 0, totalRevenue: 0 },
      { month: '2026-05', amiSubscription: 500, amiCommission: 100, supplyChainRebate: 300, supplyChainFee: 100, totalRevenue: 1000 },
      { month: '2026-06', amiSubscription: 700, amiCommission: 150, supplyChainRebate: 400, supplyChainFee: 250, totalRevenue: 1500 },
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        period: 'quarter',
        value: '2026-Q2',
        totalRevenue: 2500,
        monthOverMonth: 50,
        arpu: 416.67,
        ltvEstimate: 5000,
      }),
    );
  });

  it('expands yearly platform revenue to all months and keeps ARPU as monthly average', async () => {
    prisma.amiMonthlyBill.findMany.mockResolvedValue([
      { id: 1, storeId: 11, settleMonth: '2026-01', baseFee: 600, commissionFee: 100, store: { id: 11, name: 'Store A' } },
      { id: 2, storeId: 12, settleMonth: '2026-12', baseFee: 700, commissionFee: 200, store: { id: 12, name: 'Store B' } },
    ]);
    prisma.supplySettlement.findMany.mockResolvedValue([
      { id: 10, supplierId: 21, settleMonth: '2026-12', orderCount: 4, rebateAmount: 300, platformFee: 100, supplier: { id: 21, name: 'Supplier A' } },
    ]);
    prisma.store.count.mockResolvedValue(2);

    const result = await service.getPlatformRevenue({ period: 'year', value: '2026' });

    expect(prisma.amiMonthlyBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          settleMonth: {
            in: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'],
          },
          status: { in: ['confirmed', 'invoiced', 'paid'] },
        },
      }),
    );
    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toBe('2026-01');
    expect(result.months[11]).toBe('2026-12');
    expect(result.totalRevenue).toBe(2000);
    expect(result.arpu).toBe(83.33);
    expect(result.ltvEstimate).toBe(1000);
    expect(result.monthTrend.find((item) => item.month === '2026-06')?.totalRevenue).toBe(0);
    expect(result.monthTrend.find((item) => item.month === '2026-12')).toEqual({
      month: '2026-12',
      amiSubscription: 700,
      amiCommission: 200,
      supplyChainRebate: 300,
      supplyChainFee: 100,
      totalRevenue: 1300,
    });
  });
});
