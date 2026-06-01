import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('MarketingService', () => {
  let service: MarketingService;
  let prisma: jest.Mocked<any>;

  const mockActivity = {
    id: 1,
    title: '双十一促销',
    description: '全场八折',
    status: 'active',
    participants: 50,
    conversion: '15%',
    startDate: new Date('2024-11-01'),
    endDate: new Date('2024-11-11'),
    targetCustomers: null,
    discount: '8折',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStrategy = {
    id: 1,
    name: '沉睡客户唤醒',
    status: 'enabled',
    targetCount: 100,
    triggerRules: [],
    lastExecutedAt: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      marketingActivity: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      marketingAutomationStrategy: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      marketingAutomationExecution: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      marketingAutomationTouch: {
        createMany: jest.fn(),
      },
      predictionRun: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      customerPredictionSnapshot: {
        findMany: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
        findFirst: jest.fn(),
      },
      customer: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback?: string) => fallback),
          },
        },
      ],
    }).compile();

    service = module.get<MarketingService>(MarketingService);
    prisma = module.get(PrismaService);
  });

  describe('findActivities', () => {
    it('should return paginated activities', async () => {
      const activities = [mockActivity];
      prisma.marketingActivity.findMany.mockResolvedValue(activities);
      prisma.marketingActivity.count.mockResolvedValue(1);

      const result = await service.findActivities({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        items: activities,
        data: activities,
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter activities by status', async () => {
      prisma.marketingActivity.findMany.mockResolvedValue([]);
      prisma.marketingActivity.count.mockResolvedValue(0);

      await service.findActivities({ page: 1, pageSize: 20, status: 'active' });

      expect(prisma.marketingActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'active' },
        }),
      );
    });
  });

  describe('createActivity', () => {
    it('should create a new marketing activity', async () => {
      const createData = { title: '新年活动', status: 'draft' };
      prisma.marketingActivity.create.mockResolvedValue({ id: 2, ...createData, description: null, participants: 0, conversion: null, startDate: null, endDate: null, targetCustomers: null, discount: null, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.createActivity(createData);

      expect(result.title).toBe('新年活动');
      expect(prisma.marketingActivity.create).toHaveBeenCalledWith({ data: createData });
    });
  });

  describe('createActivity page schema', () => {
    it('should persist generated mini program page fields', async () => {
      const createData = {
        title: '老朋友回店护理礼',
        status: 'active',
        pageSchema: { schemaVersion: '1.0', title: '老朋友回店护理礼', sections: [] },
        sourceRecommendationId: '12',
        aiGenerationId: 'ai-activity-page-1',
        publishStatus: 'published',
        publishedAt: '2026-06-01T10:00:00.000Z',
      };
      prisma.marketingActivity.create.mockResolvedValue({ id: 3, ...createData, publishedAt: new Date(createData.publishedAt) });

      await service.createActivity(createData);

      expect(prisma.marketingActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: createData.title,
          pageSchema: createData.pageSchema,
          sourceRecommendationId: '12',
          aiGenerationId: 'ai-activity-page-1',
          publishStatus: 'published',
          publishedAt: new Date(createData.publishedAt),
        }),
      });
    });
  });

  describe('getTriggerOptions', () => {
    it('should return 15 trigger types', async () => {
      const result = await service.getTriggerOptions();

      expect(result).toHaveLength(15);
    });

    it('should include expected trigger categories', async () => {
      const result = await service.getTriggerOptions();

      const categories = [...new Set(result.map((t) => t.category))];
      expect(categories).toContain('time');
      expect(categories).toContain('behavior');
      expect(categories).toContain('attribute');
    });

    it('should include birthday trigger', async () => {
      const result = await service.getTriggerOptions();

      const birthday = result.find((t) => t.type === 'birthday');
      expect(birthday).toBeDefined();
      expect(birthday!.name).toBe('生日触发');
      expect(birthday!.category).toBe('time');
    });

    it('should include all expected trigger types', async () => {
      const result = await service.getTriggerOptions();

      const types = result.map((t) => t.type);
      expect(types).toContain('birthday');
      expect(types).toContain('last_visit');
      expect(types).toContain('dormant');
      expect(types).toContain('consumption');
      expect(types).toContain('member_level');
      expect(types).toContain('skin_type');
      expect(types).toContain('holiday');
      expect(types).toContain('seasonal');
      expect(types).toContain('care_cycle');
      expect(types).toContain('card_expiry');
      expect(types).toContain('visit_frequency');
      expect(types).toContain('visit_gap');
      expect(types).toContain('service_interest');
      expect(types).toContain('new_customer');
      expect(types).toContain('age_range');
    });
  });

  describe('findStrategies', () => {
    it('should return paginated strategies', async () => {
      const strategies = [mockStrategy];
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue(strategies);
      prisma.marketingAutomationStrategy.count.mockResolvedValue(1);

      const result = await service.findStrategies({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        items: strategies,
        data: strategies,
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter strategies by status', async () => {
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue([]);
      prisma.marketingAutomationStrategy.count.mockResolvedValue(0);

      await service.findStrategies({ page: 1, pageSize: 20, status: 'enabled' });

      expect(prisma.marketingAutomationStrategy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'enabled' },
        }),
      );
    });
  });

  describe('executeStrategy', () => {
    it('should execute a strategy and create an execution record', async () => {
      prisma.marketingAutomationStrategy.findUnique.mockResolvedValue(mockStrategy);
      prisma.customer.count.mockResolvedValue(0);
      prisma.predictionRun.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.marketingAutomationExecution.create.mockResolvedValue({
        id: 1,
        strategyId: 1,
        strategyName: '沉睡客户唤醒',
        status: 'success',
        triggeredCount: 0,
        reachedCount: 0,
        channel: 'sms',
      });
      prisma.marketingAutomationStrategy.update.mockResolvedValue({});

      const result = await service.executeStrategy(1);

      expect(result.status).toBe('success');
      expect(result.strategyName).toBe('沉睡客户唤醒');
      expect(prisma.marketingAutomationExecution.create).toHaveBeenCalled();
      expect(prisma.marketingAutomationStrategy.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { lastExecutedAt: expect.any(Date), targetCount: 0 },
      });
    });

    it('should throw NotFoundException for non-existent strategy', async () => {
      prisma.marketingAutomationStrategy.findUnique.mockResolvedValue(null);

      await expect(service.executeStrategy(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('previewAudience', () => {
    it('should return estimated audience count', async () => {
      prisma.customer.count.mockResolvedValue(1000);
      prisma.predictionRun.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue(new Array(300).fill(null).map((_, index) => ({
        id: index + 1,
        name: `客户${index + 1}`,
        phone: '13800000000',
        memberLevel: '普通会员',
        totalSpent: 1000,
        lastVisitDate: new Date(),
        store: { name: '门店' },
      })));

      const result = await service.previewAudience(
        [{ type: 'dormant', params: { daysInactive: 60 } }],
        'AND',
      );

      expect(result.totalCustomers).toBe(1000);
      expect(result.estimatedCount).toBe(300); // 30% of 1000
    });

    it('should handle empty customer base', async () => {
      prisma.customer.count.mockResolvedValue(0);
      prisma.predictionRun.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);

      const result = await service.previewAudience([], 'OR');

      expect(result.totalCustomers).toBe(0);
      expect(result.estimatedCount).toBe(0);
    });
  });

  describe('recommendations', () => {
    it('should return compatible recommendation cards', async () => {
      prisma.customer.count.mockResolvedValue(10);

      const result = await service.getRecommendations();

      expect(result[0]).toMatchObject({
        id: 1,
        title: expect.any(String),
        targetCount: 2,
        matchScore: expect.any(Number),
      });
    });

    it('should return audience profiles for a recommendation', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 1, name: 'Alice', memberLevel: 'VIP', skinType: '混合肌', visitCount: 3, totalSpent: 1200 },
      ]);

      const result = await service.getRecommendationAudience(1);

      expect(result[0]).toMatchObject({
        customerId: 1,
        name: 'Alice',
        segment: 'VIP',
      });
    });
  });
});
