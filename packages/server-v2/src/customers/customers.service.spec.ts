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

  beforeEach(async () => {
    const mockPrisma = {
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
      customerHealthProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
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
        include: { store: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by storeId when provided', async () => {
      prisma.customer.findMany.mockResolvedValue([mockCustomer]);

      await service.findAll(1);

      expect(prisma.customer.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, storeId: 1 },
        include: { store: true },
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

      const result = await service.create(createDto as any);

      expect(result.name).toBe('王五');
      expect(prisma.customer.create).toHaveBeenCalledWith({ data: createDto });
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
