import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: jest.Mocked<any>;

  const mockCustomer = {
    id: 1,
    name: '张三',
    phone: '13800138000',
    memberLevel: 'gold',
    storeId: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const expectCustomerView = (customer: typeof mockCustomer) =>
    expect.objectContaining({
      ...customer,
      birthday: '',
      createdAt: expect.any(String),
      lastVisitDate: '',
      storeName: '',
      totalSpent: 0,
    });

  const expectCustomerListInclude = (storeId?: number) => ({
    store: true,
    balanceAccounts: storeId
      ? { where: { storeId, status: 'active' }, take: 1 }
      : { where: { status: 'active' }, take: 1 },
    customerCards: { where: { status: 'active', remainingTimes: { gt: 0 } }, select: { id: true } },
  });

  beforeEach(async () => {
    const mockPrisma: any = {
      customer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        createMany: jest.fn(),
      },
      consumptionRecord: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      productOrder: {
        findMany: jest.fn(),
      },
      customerBalanceTransaction: {
        findMany: jest.fn(),
      },
      customerCard: {
        findMany: jest.fn(),
      },
      cardUsageRecord: {
        findMany: jest.fn(),
      },
      project: {
        findMany: jest.fn(),
      },
      product: {
        findMany: jest.fn(),
      },
      card: {
        findMany: jest.fn(),
      },
      customerHealthProfile: {
        create: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(async (callback: any) => callback(mockPrisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
    prisma = module.get(PrismaService);
  });

  describe('findAll', () => {
    it('should return all non-deleted customers', async () => {
      const customers = [mockCustomer, { ...mockCustomer, id: 2, name: '李四' }];
      prisma.customer.findMany.mockResolvedValue(customers);

      const result = await service.findAll();

      expect(result).toEqual(customers.map((customer) => expectCustomerView(customer)));
      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        include: expectCustomerListInclude(),
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by storeId when provided', async () => {
      prisma.customer.findMany.mockResolvedValue([mockCustomer]);

      await service.findAll(1);

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, storeId: 1 },
        include: expectCustomerListInclude(1),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findPaginated', () => {
    it('should return paginated results', async () => {
      const customers = [mockCustomer];
      prisma.customer.findMany.mockResolvedValue(customers);
      prisma.customer.count.mockResolvedValue(1);

      const result = await service.findPaginated({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        items: customers.map((customer) => expectCustomerView(customer)),
        data: customers.map((customer) => expectCustomerView(customer)),
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter by keyword', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);

      await service.findPaginated({ page: 1, pageSize: 20, keyword: '张' });

      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: '张', mode: 'insensitive' } },
              { phone: { contains: '张' } },
            ],
          }),
        }),
      );
    });

    it('should filter by memberLevel', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);

      await service.findPaginated({ page: 1, pageSize: 20, memberLevel: 'gold' });

      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ memberLevel: 'gold' }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return a customer by id', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...mockCustomer,
        healthProfile: null,
      });

      const result = await service.findById(1);

      expect(result.id).toBe(1);
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: { healthProfile: true, store: true },
      });
    });

    it('should throw NotFoundException for non-existent customer', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for deleted customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...mockCustomer,
        deletedAt: new Date(),
      });

      await expect(service.findById(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new customer', async () => {
      const createDto = { name: '王五', phone: '13700137000', storeId: 1 };
      prisma.customer.create.mockResolvedValue({ id: 3, ...createDto });
      prisma.customerHealthProfile.create.mockResolvedValue({ id: 1, customerId: 3 });

      const result = await service.create(createDto as any);

      expect(result.name).toBe('王五');
      expect(prisma.customer.create).toHaveBeenCalledWith({ data: createDto });
      expect(prisma.customerHealthProfile.create).toHaveBeenCalledWith({
        data: {
          customerId: 3,
          skinType: '未记录',
          skinStatus: undefined,
          allergyHistory: undefined,
        },
      });
    });
  });

  describe('update', () => {
    it('should update an existing customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        ...mockCustomer,
        healthProfile: null,
      });
      const updateDto = { name: '张三丰' };
      prisma.customer.update.mockResolvedValue({ ...mockCustomer, ...updateDto });
      prisma.customerHealthProfile.upsert.mockResolvedValue({ id: 1, customerId: 1 });

      const result = await service.update(1, updateDto as any);

      expect(result.name).toBe('张三丰');
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updateDto,
      });
    });

    it('should throw NotFoundException when updating non-existent customer', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.update(999, { name: 'test' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete customers by ids', async () => {
      prisma.customer.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.remove([1, 2]);

      expect(result.count).toBe(2);
      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('getConsumptionRecordsPaginated', () => {
    beforeEach(() => {
      prisma.consumptionRecord.findMany.mockResolvedValue([]);
      prisma.productOrder.findMany.mockResolvedValue([]);
      prisma.customerBalanceTransaction.findMany.mockResolvedValue([]);
      prisma.customerCard.findMany.mockResolvedValue([]);
      prisma.cardUsageRecord.findMany.mockResolvedValue([]);
      prisma.project.findMany.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([]);
      prisma.card.findMany.mockResolvedValue([]);
    });

    it('should include paid project orders even when no legacy consumption record exists', async () => {
      prisma.productOrder.findMany.mockResolvedValue([
        {
          id: 178,
          orderNo: 'PO1781893252477',
          customerId: 1,
          customerName: '陈天佑',
          totalAmount: 398,
          status: 'completed',
          payMethod: 'wechat',
          source: 'admin',
          createdAt: new Date('2026-06-19T02:00:00.000Z'),
          updatedAt: new Date('2026-06-19T02:00:00.000Z'),
          customer: { id: 1, name: '陈天佑', phone: '13300000000', store: { name: 'Ami 全量演示门店' } },
          store: { id: 1, name: 'Ami 全量演示门店' },
          orderItems: [
            {
              id: 1,
              itemType: 'project',
              itemId: 85,
              name: '深层补水护理',
              quantity: 1,
              unitPrice: 398,
              subtotal: 398,
            },
          ],
          paymentRecords: [{ method: 'wechat', paidAt: new Date('2026-06-19T02:01:00.000Z') }],
        },
      ]);

      const result = await service.getConsumptionRecordsPaginated({ page: 1, pageSize: 10, keyword: 'PO1781893252477' }, 1);

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          userName: '陈天佑',
          consumeType: '项目订单',
          consumeContent: expect.stringContaining('PO1781893252477'),
          amount: '￥398.00',
          orderNo: 'PO1781893252477',
        }),
      );
    });

    it('should avoid duplicating terminal checkout rows already written to consumption records', async () => {
      const paidAt = new Date('2026-06-19T03:00:00.000Z');
      prisma.productOrder.findMany.mockResolvedValue([
        {
          id: 201,
          orderNo: 'PO-DUP',
          customerId: 1,
          customerName: '陈天佑',
          totalAmount: 268,
          status: 'completed',
          payMethod: 'cash',
          source: 'terminal',
          createdAt: paidAt,
          updatedAt: paidAt,
          customer: { id: 1, name: '陈天佑', phone: '13300000000', store: { name: 'Ami 全量演示门店' } },
          store: { id: 1, name: 'Ami 全量演示门店' },
          orderItems: [{ id: 1, itemType: 'product', itemId: 5, name: '屏障修护乳', quantity: 1, unitPrice: 268, subtotal: 268 }],
          paymentRecords: [{ method: 'cash', paidAt }],
        },
      ]);
      prisma.consumptionRecord.findMany.mockResolvedValue([
        {
          id: 88,
          customerId: 1,
          consumeType: '消费',
          consumeContent: '屏障修护乳 x1',
          payMethod: 'cash',
          amount: 268,
          campaign: null,
          consumeTime: new Date('2026-06-19T03:05:00.000Z'),
          customer: { name: '陈天佑', store: { name: 'Ami 全量演示门店' } },
        },
      ]);

      const result = await service.getConsumptionRecordsPaginated({ page: 1, pageSize: 10 }, 1);

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual(expect.objectContaining({ sourceType: 'order', orderNo: 'PO-DUP' }));
    });
  });

  describe('importCustomers', () => {
    it('should bulk import customers', async () => {
      const customers = [
        { name: '客户A', phone: '13100131000', storeId: 1 },
        { name: '客户B', phone: '13200132000', storeId: 1 },
      ];
      prisma.customer.createMany.mockResolvedValue({ count: 2 });

      const result = await service.importCustomers(customers as any);

      expect(result.count).toBe(2);
      expect(prisma.customer.createMany).toHaveBeenCalledWith({
        data: customers,
        skipDuplicates: true,
      });
    });
  });
});
