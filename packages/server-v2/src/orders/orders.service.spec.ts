import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrdersService marketing page attribution', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService({} as PrismaService, {} as any);
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

describe('OrdersService card order sales user', () => {
  function createService(operatorUser: any = null) {
    const customerCardCreate = jest.fn().mockResolvedValue({
      id: 801,
      remainingTimes: 6,
      status: 'active',
      createdAt: new Date('2026-06-20T10:00:00.000Z'),
      expiryDate: new Date('2027-06-20T10:00:00.000Z'),
    });
    const productOrderCreate = jest.fn().mockResolvedValue({
      id: 701,
      orderNo: 'CO701',
      storeId: 1,
      customerId: 12,
    });
    const orderItemCreate = jest.fn().mockResolvedValue({
      id: 901,
    });
    const paymentRecordCreate = jest.fn();
    const customerBalanceAccountFindUnique = jest.fn().mockResolvedValue({
      id: 301,
      customerId: 12,
      storeId: 1,
      cashBalance: 3000,
      giftBalance: 500,
    });
    const customerBalanceAccountUpdate = jest.fn();
    const customerBalanceTransactionCreate = jest.fn();
    const tx = {
      customerCard: {
        create: customerCardCreate,
        update: jest.fn(),
      },
      productOrder: {
        create: productOrderCreate,
      },
      orderItem: {
        create: orderItemCreate,
      },
      paymentRecord: {
        create: paymentRecordCreate,
      },
      customerBalanceAccount: {
        findUnique: customerBalanceAccountFindUnique,
        update: customerBalanceAccountUpdate,
      },
      customerBalanceTransaction: {
        create: customerBalanceTransactionCreate,
      },
      customer: {
        update: jest.fn(),
      },
    };
    const prisma: any = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 12, name: '罗雅婷', phone: '13565060344' }),
      },
      store: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Ami 全量演示门店' }),
      },
      card: {
        findUnique: jest.fn().mockResolvedValue({
          id: 51,
          name: '抗衰管理 6 次卡',
          price: 3680,
          totalTimes: 6,
          projects: [],
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(operatorUser),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new OrdersService(prisma as PrismaService, {} as any);
    (service as any).applyMarketingAttribution = jest.fn();
    (service as any).applyMarketingPageAttribution = jest.fn();
    (service as any).calculateOrderCommissionIfNeeded = jest.fn();
    (service as any).refreshDailySettlementForOrder = jest.fn();
    return {
      service,
      prisma,
      customerCardCreate,
      productOrderCreate,
      orderItemCreate,
      paymentRecordCreate,
      customerBalanceAccountFindUnique,
      customerBalanceAccountUpdate,
      customerBalanceTransactionCreate,
    };
  }

  it('uses selected sales user for admin card orders', async () => {
    const { service, prisma, customerCardCreate } = createService({
      id: 22,
      name: '周顾问',
      username: 'zhou',
      roles: [{ role: { key: 'consultant' } }],
      stores: [{ storeId: 1 }],
    });

    const result = await service.createCardOrder(
      1,
      {
        cardId: 51,
        customerId: 12,
        actualPrice: 3280,
        operatorId: 22,
        expireTime: '2027-06-20T10:00',
      },
      9,
    );

    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 22, status: 'active' }),
    }));
    expect(customerCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ operatorId: 22 }),
    });
    expect((service as any).calculateOrderCommissionIfNeeded).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 701 }),
      expect.objectContaining({ operatorId: 22 }),
    );
    expect(result).toEqual(expect.objectContaining({ operatorId: 22, operatorName: '周顾问' }));
  });

  it('keeps admin card order sales user empty when not selected', async () => {
    const { service, prisma, customerCardCreate } = createService(null);

    await service.createCardOrder(
      1,
      {
        cardId: 51,
        customerId: 12,
        actualPrice: 3280,
        expireTime: '2027-06-20T10:00',
      },
      9,
    );

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(customerCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ operatorId: undefined }),
    });
  });

  it('accepts terminal-style payload for admin card orders', async () => {
    const { service, customerCardCreate, productOrderCreate, orderItemCreate, paymentRecordCreate } = createService(null);

    await service.createCardOrder(
      1,
      {
        cardId: 51,
        customerId: 12,
        customerName: '罗雅婷',
        cardName: '抗衰管理 6 次卡',
        amount: 3280,
        discountAmount: 400,
        totalTimes: 6,
        paymentMethod: '微信',
        giftProjects: ['紧致抗衰护理'],
        remark: '赠送项目：紧致抗衰护理',
        expireTime: '2027-06-20T10:00',
      },
      9,
    );

    expect(customerCardCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paidAmount: 3280,
        discountAmount: 400,
        pricingSnapshot: expect.objectContaining({
          paidAmount: 3280,
          discountAmount: 400,
        }),
      }),
    });
    expect(productOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        totalAmount: 3280,
        listAmount: 3680,
        totalDiscountAmount: 400,
        payMethod: 'wechat',
        discountPayload: expect.objectContaining({ giftProjects: ['紧致抗衰护理'] }),
        items: [expect.objectContaining({ discountAmount: 400, giftProjects: ['紧致抗衰护理'] })],
        remark: '赠送项目：紧致抗衰护理',
      }),
    });
    expect(orderItemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subtotal: 3280,
        discount: 400,
        payload: expect.objectContaining({ giftProjects: ['紧致抗衰护理'] }),
      }),
    });
    expect(paymentRecordCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        method: 'wechat',
        amount: 3280,
      }),
    });
  });

  it('deducts member balance when card order is paid by member balance', async () => {
    const {
      service,
      paymentRecordCreate,
      customerBalanceAccountFindUnique,
      customerBalanceAccountUpdate,
      customerBalanceTransactionCreate,
    } = createService(null);

    await service.createCardOrder(
      1,
      {
        cardId: 51,
        customerId: 12,
        amount: 3280,
        totalTimes: 6,
        paymentMethod: '会员余额',
        remark: '会员卡余额开卡',
      },
      9,
    );

    expect(paymentRecordCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        method: 'member_balance',
        amount: 3280,
      }),
    });
    expect(customerBalanceAccountFindUnique).toHaveBeenCalledWith({
      where: { customerId_storeId: { customerId: 12, storeId: 1 } },
    });
    expect(customerBalanceAccountUpdate).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { cashBalance: 220, giftBalance: 0, status: 'active' },
    });
    expect(customerBalanceTransactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 12,
        storeId: 1,
        orderId: 701,
        type: 'deduct',
        amount: 2780,
        giftAmount: 500,
        cashBalanceBefore: 3000,
        cashBalanceAfter: 220,
        giftBalanceBefore: 500,
        giftBalanceAfter: 0,
        paymentMethod: 'member_balance',
        remark: '会员卡余额开卡',
      }),
    });
  });

  it('calculates admin card sale commission from the selected sales user', async () => {
    const calculateOrderCommissions = jest.fn().mockResolvedValue([{ id: 9101, type: 'card_sale' }]);
    const service = new OrdersService({} as PrismaService, { calculateOrderCommissions } as any);
    const tx: any = {
      orderItem: {
        findMany: jest.fn().mockResolvedValue([{ id: 901, itemType: 'card', itemId: 51, subtotal: 3280 }]),
      },
      beautician: {
        findMany: jest.fn(),
      },
    };

    await (service as any).calculateOrderCommissionIfNeeded(
      tx,
      { id: 701, storeId: 1, status: 'completed' },
      { operatorId: 22 },
    );

    expect(calculateOrderCommissions).toHaveBeenCalledWith(
      {
        storeId: 1,
        orderId: 701,
        staffUserId: 22,
        items: [{ itemType: 'card', itemId: 51, categoryId: undefined, subtotal: 3280, orderItemId: 901 }],
      },
      tx,
    );
    expect(tx.beautician.findMany).not.toHaveBeenCalled();
  });
});

describe('OrdersService member card recharge', () => {
  it('creates recharge order side effects through the shared recharge flow', async () => {
    const createdAt = new Date('2026-06-26T10:00:00.000Z');
    const productOrderCreate = jest.fn().mockResolvedValue({
      id: 701,
      orderNo: 'MR701',
      storeId: 1,
      status: 'completed',
      createdAt,
    });
    const orderItemCreate = jest.fn().mockResolvedValue({ id: 801 });
    const consumptionRecordCreate = jest.fn();
    const paymentRecordCreate = jest.fn();
    const balanceTransactionCreate = jest.fn().mockResolvedValue({ id: 901, createdAt });
    const tx = {
      customerBalanceAccount: {
        upsert: jest.fn().mockResolvedValue({ id: 301, cashBalance: 1000, giftBalance: 100 }),
        update: jest.fn().mockResolvedValue({ id: 301, cashBalance: 1500, giftBalance: 150 }),
      },
      productOrder: {
        create: productOrderCreate,
      },
      orderItem: {
        create: orderItemCreate,
      },
      consumptionRecord: {
        create: consumptionRecordCreate,
      },
      paymentRecord: {
        create: paymentRecordCreate,
      },
      customer: {
        update: jest.fn(),
      },
      customerBalanceTransaction: {
        create: balanceTransactionCreate,
      },
    };
    const prisma: any = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 10, name: '李女士', phone: '13800138000' }),
      },
      store: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Ami 全量演示门店' }),
      },
      customerBalanceAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 301,
          customerId: 10,
          storeId: 1,
          cashBalance: 1500,
          giftBalance: 150,
          customer: { id: 10, name: '李女士', phone: '13800138000' },
          store: { id: 1, name: 'Ami 全量演示门店' },
          transactions: [
            {
              id: 901,
              type: 'recharge',
              amount: 500,
              giftAmount: 50,
              transactionNo: 'BAL901',
              order: { id: 701, orderNo: 'MR701' },
              createdAt,
            },
          ],
        }),
      },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const service = new OrdersService(prisma as PrismaService, {} as any);
    (service as any).applyMarketingAttribution = jest.fn();
    (service as any).applyMarketingPageAttribution = jest.fn();
    (service as any).calculateOrderCommissionIfNeeded = jest.fn();
    (service as any).refreshDailySettlementForOrder = jest.fn();

    const result = await service.createRechargeOrder({
      customerId: 10,
      storeId: 1,
      amount: 500,
      discountAmount: 50,
      giftProjects: ['补水护理'],
      paymentMethod: 'wechat',
      transactionNo: 'WX001',
      beauticianId: 2,
      source: 'terminal',
      remark: '终端充值',
    });

    expect(productOrderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderKind: 'member_card_recharge',
        customerId: 10,
        storeId: 1,
        totalAmount: 500,
        source: 'terminal',
        discountPayload: { giftAmount: 50, giftProjects: ['补水护理'] },
      }),
    });
    expect(orderItemCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 701,
        itemType: 'recharge',
        unitPrice: 500,
        beauticianId: 2,
        payload: { giftAmount: 50, giftProjects: ['补水护理'], remark: '终端充值' },
      }),
    });
    expect(consumptionRecordCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 10,
        consumeType: '充值',
        consumeContent: '充值 500，赠送 50，赠送项目：补水护理',
        payMethod: 'wechat',
        amount: 500,
      }),
    });
    expect(balanceTransactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 10,
        storeId: 1,
        orderId: 701,
        type: 'recharge',
        amount: 500,
        giftAmount: 50,
        paymentMethod: 'wechat',
      }),
    });
    expect((service as any).calculateOrderCommissionIfNeeded).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 701 }),
      expect.objectContaining({ beauticianId: 2 }),
    );
    expect((service as any).refreshDailySettlementForOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 701 }),
      'member_card_recharge',
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 301,
        orderId: 701,
        orderNo: 'MR701',
        balanceTransactionId: 901,
        cashBalance: 1500,
        giftBalance: 150,
        paymentMethod: 'wechat',
      }),
    );
  });
});

describe('OrdersService refunds', () => {
  it('refreshes daily settlement after a successful product order refund', async () => {
    const createdAt = new Date('2026-06-23T05:00:00.000Z');
    const order = {
      id: 501,
      orderNo: 'PO501',
      customerId: 12,
      customerName: '罗雅婷',
      storeId: 1,
      totalAmount: 680,
      netAmount: 680,
      status: 'completed',
      payMethod: 'wechat',
      createdAt,
      orderItems: [{ id: 9001, itemType: 'product', itemId: 88, name: '修护精华', quantity: 1, unitPrice: 680, subtotal: 680, netAmount: 680 }],
      paymentRecords: [{ method: 'wechat', paidAt: createdAt }],
      refundRecords: [],
      marketingAttributions: [],
      recommendationEvents: [],
    };
    const refundedOrder = {
      ...order,
      status: 'refunded',
      refundRecords: [{ amount: 680, status: 'success', refundedAt: new Date('2026-06-23T06:00:00.000Z') }],
    };
    const tx = {
      refundRecord: { create: jest.fn() },
      productOrder: {
        update: jest.fn().mockResolvedValue(refundedOrder),
        findUnique: jest.fn().mockResolvedValue(refundedOrder),
      },
      customer: { update: jest.fn() },
    };
    const prisma: any = {
      productOrder: { findUnique: jest.fn().mockResolvedValue(order) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const commissionService = {
      reverseOrderCommissions: jest.fn(),
      generateDailySettlement: jest.fn(),
    };
    const service = new OrdersService(prisma as PrismaService, commissionService as any);
    jest.spyOn(service as any, 'reverseMarketingAttribution').mockResolvedValue(undefined);

    const result = await service.refundOrder(501, { reason: '顾客退款', amount: 680 });

    expect(tx.refundRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 501,
        amount: 680,
        reason: '顾客退款',
        status: 'success',
        refundedAt: expect.any(Date),
      }),
    });
    expect(commissionService.reverseOrderCommissions).toHaveBeenCalledWith(501, 680, tx);
    expect(commissionService.generateDailySettlement).toHaveBeenCalledWith(1, createdAt);
    expect(result).toEqual(expect.objectContaining({ id: 501, status: 'refunded' }));
  });
});

describe('OrdersService project order inventory consumption', () => {
  let service: OrdersService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      customer: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      productOrder: {
        create: jest.fn(async ({ data }: any) => ({
          id: 501,
          ...data,
          createdAt: new Date('2026-06-14T09:00:00.000Z'),
          updatedAt: new Date('2026-06-14T09:00:00.000Z'),
        })),
        findUnique: jest.fn(async () => ({
          id: 501,
          orderNo: 'PO-501',
          customerName: '散客',
          storeId: 1,
          totalAmount: 400,
          status: 'paid',
          payMethod: 'wechat',
          orderItems: [
            {
              id: 701,
              orderId: 501,
              itemType: 'project',
              itemId: 101,
              name: 'Hydration',
              quantity: 2,
              unitPrice: 200,
              subtotal: 400,
              discount: 0,
            },
          ],
          paymentRecords: [],
          refundRecords: [],
          marketingAttributions: [],
        })),
      },
      orderItem: {
        createMany: jest.fn(),
      },
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 901 }),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([{ projectId: 101, productId: 301, standardQty: 2, unit: '支' }]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: 301, costPrice: 18 }]),
        findFirst: jest.fn().mockResolvedValue({ id: 301, storeId: 1, currentStock: 10, unit: '支' }),
        update: jest.fn().mockResolvedValue({ id: 301 }),
      },
      paymentRecord: {
        create: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    service = new OrdersService(prisma as PrismaService, {} as any);
  });

  it('deducts project BOM stock when creating a paid project order', async () => {
    await service.createProjectOrder({
      customerName: '散客',
      storeId: 1,
      status: '已付款',
      paymentMethod: '微信',
      totalAmount: 400,
      remark: '库存发布前验收-项目 BOM 扣减',
      items: [{ projectId: 101, projectName: 'Hydration', quantity: 2, unitPrice: 200, subtotal: 400 }],
    });

    expect(tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 501,
          itemType: 'project',
          itemId: 101,
          name: 'Hydration',
          quantity: 2,
          unitPrice: 200,
          subtotal: 400,
        }),
      ],
    });
    expect(tx.projectBomItem.findMany).toHaveBeenCalledWith({
      where: { projectId: { in: [101] } },
      select: { projectId: true, productId: true, standardQty: true, unit: true },
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { currentStock: 6 },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        productId: 301,
        movementType: 'service_consume',
        quantity: -4,
        beforeStock: 10,
        afterStock: 6,
        sourceType: 'project_order',
        sourceId: 501,
        remark: expect.stringContaining('库存发布前验收-项目 BOM 扣减'),
      }),
    });
  });

  it('deducts product stock when creating a paid product order', async () => {
    tx.productOrder.findUnique.mockResolvedValueOnce({
      id: 501,
      orderNo: 'PO-501',
      customerName: '散客',
      storeId: 1,
      totalAmount: 120,
      status: 'paid',
      payMethod: 'wechat',
      orderItems: [
        {
          id: 701,
          orderId: 501,
          itemType: 'product',
          itemId: 301,
          name: '补水精华',
          quantity: 3,
          unitPrice: 40,
          subtotal: 120,
          discount: 0,
        },
      ],
      paymentRecords: [],
      refundRecords: [],
      marketingAttributions: [],
    });

    await service.createProductOrder({
      customerName: '散客',
      storeId: 1,
      status: '已付款',
      paymentMethod: '微信',
      totalAmount: 120,
      items: [{ productId: 301, productName: '补水精华', quantity: 3, unitPrice: 40, subtotal: 120 }],
    });

    expect(tx.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: [301] }, storeId: 1, deletedAt: null },
      select: { id: true, costPrice: true },
    });
    expect(tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 501,
          itemType: 'product',
          itemId: 301,
          payload: expect.objectContaining({
            costPrice: 18,
            productCostPrice: 18,
            costAmount: 54,
            productCostAmount: 54,
            costSource: 'product_master',
            costCapturedAt: expect.any(String),
          }),
        }),
      ],
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 301 },
      data: { currentStock: 7 },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 1,
        productId: 301,
        movementType: 'sale_out',
        quantity: -3,
        beforeStock: 10,
        afterStock: 7,
        sourceType: 'product_order',
        sourceId: 501,
      }),
    });
  });

  it('preserves pre-allocated terminal discounts without reallocating them', async () => {
    tx.productOrder.findUnique.mockResolvedValueOnce({
      id: 501,
      orderNo: 'PO-501',
      customerName: '散客',
      storeId: 1,
      totalAmount: 90,
      listAmount: 100,
      itemDiscountAmount: 0,
      orderDiscountAmount: 10,
      totalDiscountAmount: 10,
      netAmount: 90,
      status: 'paid',
      payMethod: 'wechat',
      orderItems: [
        {
          id: 701,
          orderId: 501,
          itemType: 'product',
          itemId: 301,
          name: '补水精华',
          quantity: 1,
          unitPrice: 100,
          listAmount: 100,
          subtotal: 90,
          itemDiscountAmount: 0,
          orderAllocatedDiscountAmount: 10,
          totalDiscountAmount: 10,
          netAmount: 90,
        },
      ],
      paymentRecords: [],
      refundRecords: [],
      marketingAttributions: [],
    });

    await service.createProductOrder({
      customerName: '散客',
      storeId: 1,
      status: '已付款',
      paymentMethod: '微信',
      preAllocatedDiscount: true,
      items: [
        {
          productId: 301,
          productName: '补水精华',
          quantity: 1,
          unitPrice: 100,
          listAmount: 100,
          subtotal: 90,
          itemDiscountAmount: 0,
          orderAllocatedDiscountAmount: 10,
          totalDiscountAmount: 10,
          netAmount: 90,
        },
      ],
    });

    expect(tx.productOrder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        listAmount: 100,
        itemDiscountAmount: 0,
        orderDiscountAmount: 10,
        totalDiscountAmount: 10,
        netAmount: 90,
        discountPayload: expect.objectContaining({ preAllocated: true }),
      }),
    });
    expect(tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 501,
          itemType: 'product',
          itemId: 301,
          listAmount: 100,
          subtotal: 90,
          itemDiscountAmount: 0,
          orderAllocatedDiscountAmount: 10,
          totalDiscountAmount: 10,
          netAmount: 90,
        }),
      ],
    });
    expect(tx.paymentRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 90,
      }),
    });
  });

  it('does not deduct project BOM stock for pending project orders', async () => {
    await service.createProjectOrder({
      customerName: '散客',
      storeId: 1,
      status: '待付款',
      paymentMethod: '微信',
      totalAmount: 400,
      items: [{ projectId: 101, projectName: 'Hydration', quantity: 2, unitPrice: 200, subtotal: 400 }],
    });

    expect(tx.projectBomItem.findMany).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});

describe('OrdersService project order profit detail', () => {
  it('calculates product order income, product cost, commission and gross profit', async () => {
    const prisma: any = {
      productOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 601,
          orderNo: 'PO-601',
          customerId: 12,
          customerName: '李心怡',
          customer: { id: 12, name: '李心怡', phone: '13884230304' },
          storeId: 1,
          store: { id: 1, name: 'Ami 全量演示门店' },
          totalAmount: 360,
          netAmount: 360,
          status: 'completed',
          payMethod: 'wechat',
          source: 'admin',
          createdAt: new Date('2026-06-21T10:00:00.000Z'),
          refundRecords: [],
          orderItems: [
            {
              id: 702,
              orderId: 601,
              itemType: 'product',
              itemId: 301,
              name: '抗衰紧致眼霜',
              quantity: 2,
              unitPrice: 198,
              listAmount: 396,
              subtotal: 360,
              netAmount: 360,
              totalDiscountAmount: 36,
              payload: { productCostPrice: 88, productCostAmount: 176 },
              commissionRecords: [
                {
                  id: 802,
                  staffUserId: 22,
                  staffUser: { id: 22, name: '韩雨', username: 'hanyu' },
                  beauticianId: null,
                  beautician: null,
                  ruleId: 92,
                  rule: { id: 92, name: '商品提成' },
                  sourceAmount: 360,
                  rate: 0.05,
                  amount: 18,
                  status: 'pending',
                  settleMonth: '2026-06',
                },
              ],
            },
          ],
          paymentRecords: [{ method: 'wechat' }],
        }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 301,
            name: '抗衰紧致眼霜',
            sku: 'SKU-301',
            brand: 'Ami Lab',
            costPrice: 90,
            retailPrice: 198,
            category: { id: 3, name: '眼霜' },
          },
        ]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 902,
            productId: 301,
            quantity: -2,
            unit: '支',
            occurredAt: new Date('2026-06-21T10:02:00.000Z'),
            remark: '商品订单自动扣库存',
            product: { id: 301, name: '抗衰紧致眼霜', unit: '支', costPrice: 90 },
          },
        ]),
      },
      commissionRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new OrdersService(prisma as PrismaService, {} as any);

    const result = await service.findProductOrderProfit(601);

    expect(prisma.productOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 601, orderItems: { some: { itemType: { in: ['product', 'goods'] } } } },
    }));
    expect(result).toEqual(expect.objectContaining({
      orderId: 601,
      totalSalesAmount: 360,
      productCost: 176,
      commissionCost: 18,
      totalCost: 194,
      grossProfit: 166,
      grossMargin: 0.4611,
      costSource: 'order_snapshot',
      dataQuality: 'complete',
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      productName: '抗衰紧致眼霜',
      quantity: 2,
      netSalesAmount: 360,
      unitCost: 88,
      productCost: 176,
      commissionCost: 18,
      grossProfit: 166,
      grossMargin: 0.4611,
      costSource: 'order_snapshot',
    }));
    expect(result.items[0].commissionRecords).toEqual([
      expect.objectContaining({ staffUserName: '韩雨', ruleName: '商品提成', amount: 18 }),
    ]);
    expect(result.stockMovements).toEqual([
      expect.objectContaining({ productName: '抗衰紧致眼霜', quantity: 2, costAmount: 180 }),
    ]);
  });

  it('calculates income, BOM cost, actual material cost, commission and gross profit', async () => {
    const prisma: any = {
      productOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: 501,
          orderNo: 'PO-501',
          customerId: 11,
          customerName: '罗若兰',
          customer: { id: 11, name: '罗若兰', phone: '15947941614' },
          storeId: 1,
          store: { id: 1, name: 'Ami 全量演示门店' },
          totalAmount: 400,
          status: 'completed',
          payMethod: 'wechat',
          source: 'admin',
          createdAt: new Date('2026-06-20T10:00:00.000Z'),
          orderItems: [
            {
              id: 701,
              orderId: 501,
              itemType: 'project',
              itemId: 101,
              name: '肩颈舒压',
              quantity: 2,
              unitPrice: 200,
              subtotal: 400,
              discount: 0,
              beauticianId: 31,
              beautician: { id: 31, name: '周宁' },
              payload: {},
              commissionRecords: [
                {
                  id: 801,
                  staffUserId: 21,
                  staffUser: { id: 21, name: '周宁', username: 'zhouning' },
                  beauticianId: 31,
                  beautician: { id: 31, name: '周宁' },
                  ruleId: 91,
                  rule: { id: 91, name: '项目通用提成' },
                  sourceAmount: 400,
                  rate: 0.1,
                  amount: 40,
                  status: 'pending',
                  settleMonth: '2026-06',
                },
              ],
            },
          ],
          paymentRecords: [{ method: 'wechat' }],
        }),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            projectId: 101,
            productId: 301,
            standardQty: 1.5,
            unit: 'ml',
            product: { id: 301, name: '按摩精油', unit: 'ml', costPrice: 20 },
          },
        ]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 901,
            productId: 301,
            quantity: -3,
            unit: 'ml',
            occurredAt: new Date('2026-06-20T10:05:00.000Z'),
            remark: '项目订单自动扣耗材：肩颈舒压',
            product: { id: 301, name: '按摩精油', unit: 'ml', costPrice: 20 },
          },
        ]),
      },
      commissionRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new OrdersService(prisma as PrismaService, {} as any);

    const result = await service.findProjectOrderProfit(501);

    expect(prisma.productOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 501, orderItems: { some: { itemType: 'project' } } },
    }));
    expect(result).toEqual(expect.objectContaining({
      orderId: 501,
      totalIncome: 400,
      standardMaterialCost: 60,
      actualMaterialCost: 60,
      materialCost: 60,
      commissionCost: 40,
      totalCost: 100,
      grossProfit: 300,
      grossMargin: 0.75,
      materialCostSource: 'actual_stock_movement',
      dataQuality: 'complete',
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      projectName: '肩颈舒压',
      beauticianName: '周宁',
      income: 400,
      standardMaterialCost: 60,
      commissionCost: 40,
      grossProfit: 300,
      grossMargin: 0.75,
    }));
    expect(result.items[0].bomItems).toEqual([
      expect.objectContaining({ productName: '按摩精油', quantity: 3, costAmount: 60 }),
    ]);
    expect(result.items[0].commissionRecords).toEqual([
      expect.objectContaining({ staffUserName: '周宁', ruleName: '项目通用提成', amount: 40 }),
    ]);
  });

  it('calculates card order sales profit without duplicating card usage material cost', async () => {
    const prisma: any = {
      customerCard: {
        findUnique: jest.fn().mockResolvedValue({
          id: 801,
          customerId: 12,
          customer: { id: 12, name: '李心怡', phone: '13884230304' },
          cardId: 51,
          cardName: '综合护理 20 次卡',
          totalTimes: 20,
          remainingTimes: 18,
          paidAmount: 5980,
          discountAmount: 1000,
          recognizedUnitValue: 299,
          status: 'active',
          sourceOrderId: 701,
          sourceOrderItemId: 901,
          createdAt: new Date('2026-06-22T10:00:00.000Z'),
          expiryDate: new Date('2027-06-22T10:00:00.000Z'),
          card: { id: 51, name: '综合护理 20 次卡', price: 6980, totalTimes: 20, projects: [] },
          operator: { id: 1, name: '系统管理员', username: 'admin' },
          sourceOrder: {
            id: 701,
            orderNo: 'CO-701',
            storeId: 1,
            store: { id: 1, name: 'Ami 全量演示门店' },
            payMethod: 'wechat',
            paymentRecords: [{ method: 'wechat' }],
            refundRecords: [{ amount: 299, status: 'success' }],
          },
          sourceOrderItem: {
            id: 901,
            listAmount: 6980,
            netAmount: 5980,
            totalDiscountAmount: 1000,
            commissionRecords: [
              {
                id: 1001,
                staffUserId: 21,
                staffUser: { id: 21, name: '韩雨', username: 'hanyu' },
                beauticianId: null,
                beautician: null,
                ruleId: 88,
                rule: { id: 88, name: '开卡提成' },
                sourceAmount: 5980,
                rate: 0.05,
                amount: 299,
                status: 'pending',
                settleMonth: '2026-06',
              },
            ],
          },
          usageRecords: [
            {
              id: 1201,
              projectId: 101,
              project: { id: 101, name: '肩颈舒压' },
              projectName: '肩颈舒压',
              times: 1,
              recognizedUnitValue: 299,
              recognizedAmount: 299,
              remainingTimes: 19,
              verifiedAt: new Date('2026-06-23T10:00:00.000Z'),
              commissionRecords: [
                {
                  id: 1301,
                  staffUserId: 22,
                  staffUser: { id: 22, name: '周宁', username: 'zhouning' },
                  beauticianId: 31,
                  beautician: { id: 31, name: '周宁' },
                  ruleId: 89,
                  rule: { id: 89, name: '项目核销提成' },
                  sourceAmount: 299,
                  rate: 0.08,
                  amount: 23.92,
                  status: 'pending',
                  settleMonth: '2026-06',
                },
              ],
            },
          ],
        }),
      },
      commissionRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            projectId: 101,
            productId: 301,
            standardQty: 1,
            product: { id: 301, name: '按摩精油', unit: 'ml', costPrice: 20 },
          },
        ]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1401,
            sourceType: 'card_usage',
            sourceId: 1201,
            productId: 301,
            quantity: -1.5,
            unit: 'ml',
            occurredAt: new Date('2026-06-23T10:01:00.000Z'),
            remark: '次卡核销自动扣耗材：肩颈舒压',
            product: { id: 301, name: '按摩精油', unit: 'ml', costPrice: 20 },
          },
        ]),
      },
    };
    const service = new OrdersService(prisma as PrismaService, {} as any);

    const result = await service.findCardOrderProfit(801);

    expect(prisma.customerCard.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 801 } }));
    expect(result).toEqual(expect.objectContaining({
      customerCardId: 801,
      sourceOrderId: 701,
      sourceOrderNo: 'CO-701',
      paidAmount: 5980,
      refundAmount: 299,
      netSalesAmount: 5681,
      recognizedAmount: 299,
      remainingLiability: 5382,
      saleCommissionCost: 299,
      totalCost: 299,
      recognizedCommissionCost: 15.74,
      recognizedGrossProfit: 283.26,
      recognizedGrossMargin: 0.9474,
      salesContribution: 5382,
      grossProfit: 283.26,
      grossMargin: 0.9474,
      dataQuality: 'complete',
    }));
    expect(result.saleCommissionRecords).toEqual([
      expect.objectContaining({ staffUserName: '韩雨', ruleName: '开卡提成', amount: 299 }),
    ]);
    expect(result.usageRecords[0]).toEqual(expect.objectContaining({
      projectName: '肩颈舒压',
      recognizedAmount: 299,
      standardMaterialCost: 20,
      actualMaterialCost: 30,
      materialCost: 30,
      materialCostSource: 'actual_stock_movement',
      commissionCost: 23.92,
      projectCost: 53.92,
      projectGrossProfit: 245.08,
      projectGrossMargin: 0.8197,
    }));
  });

  it('calculates card usage profit from recognized income, material cost and commission cost', async () => {
    const prisma: any = {
      cardUsageRecord: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1201,
          customerCardId: 801,
          cardId: 18,
          projectId: 101,
          storeId: 1,
          customerId: 55,
          customerName: '孙思琪',
          cardName: '综合养护 20 次卡',
          projectName: '肩颈舒压',
          times: 1,
          remainingTimes: 9,
          recognizedUnitValue: 299,
          recognizedAmount: 299,
          sourceOrderId: 701,
          sourceOrderItemId: 702,
          operatorId: 22,
          beauticianId: 31,
          verifiedAt: new Date('2026-06-23T10:00:00.000Z'),
          customer: { id: 55, name: '孙思琪', phone: '13800000000' },
          customerCard: { id: 801, cardName: '综合养护 20 次卡', totalTimes: 20, remainingTimes: 9, status: 'active' },
          card: { id: 18, name: '综合养护 20 次卡', price: 5980, totalTimes: 20 },
          project: { id: 101, name: '肩颈舒压' },
          store: { id: 1, name: 'Ami 全量演示门店' },
          sourceOrder: { id: 701, orderNo: 'CO-701', store: { id: 1, name: 'Ami 全量演示门店' } },
          operator: { id: 22, name: '周宁', username: 'zhouning' },
          beautician: { id: 31, name: '周宁' },
          commissionRecords: [
            {
              id: 1301,
              staffUserId: 22,
              staffUser: { id: 22, name: '周宁', username: 'zhouning' },
              beauticianId: 31,
              beautician: { id: 31, name: '周宁' },
              ruleId: 89,
              rule: { id: 89, name: '项目核销提成' },
              sourceAmount: 299,
              rate: 0.08,
              amount: 23.92,
              status: 'pending',
              settleMonth: '2026-06',
            },
          ],
        }),
      },
      projectBomItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            projectId: 101,
            productId: 301,
            standardQty: 1,
            product: { id: 301, name: '按摩精油', unit: 'ml', costPrice: 20 },
          },
        ]),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1401,
            sourceType: 'card_usage',
            sourceId: 1201,
            productId: 301,
            quantity: -1.5,
            unit: 'ml',
            occurredAt: new Date('2026-06-23T10:01:00.000Z'),
            remark: '次卡核销自动扣耗材：肩颈舒压',
            product: { id: 301, name: '按摩精油', unit: 'ml', costPrice: 20 },
          },
        ]),
      },
    };
    const service = new OrdersService(prisma as PrismaService, {} as any);

    const result = await service.findCardUsageProfit(1201);

    expect(prisma.cardUsageRecord.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1201 } }));
    expect(prisma.projectBomItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 101 } }));
    expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ sourceType: 'card_usage', sourceId: 1201 }),
    }));
    expect(result).toEqual(expect.objectContaining({
      id: 1201,
      customerCardId: 801,
      sourceOrderNo: 'CO-701',
      customerName: '孙思琪',
      cardName: '综合养护 20 次卡',
      projectName: '肩颈舒压',
      recognizedAmount: 299,
      standardMaterialCost: 20,
      actualMaterialCost: 30,
      materialCost: 30,
      materialCostSource: 'actual_stock_movement',
      commissionCost: 23.92,
      projectCost: 53.92,
      projectGrossProfit: 245.08,
      projectGrossMargin: 0.8197,
      dataQuality: 'complete',
    }));
    expect(result.materialMovements).toEqual([
      expect.objectContaining({ productName: '按摩精油', quantity: 1.5, costAmount: 30 }),
    ]);
    expect(result.commissionRecords).toEqual([
      expect.objectContaining({ staffUserName: '周宁', ruleName: '项目核销提成', amount: 23.92 }),
    ]);
  });
});
