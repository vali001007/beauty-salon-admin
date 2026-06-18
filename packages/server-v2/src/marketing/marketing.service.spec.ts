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
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      marketingPage: {
        findMany: jest.fn(),
      },
      marketingPageLead: {
        count: jest.fn(),
      },
      productOrder: {
        count: jest.fn(),
      },
      marketingAutomationStrategy: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      marketingRuleTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
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
      prisma.marketingPage.findMany.mockResolvedValue([]);
      prisma.marketingPageLead.count.mockResolvedValue(0);
      prisma.productOrder.count.mockResolvedValue(0);
      prisma.marketingActivity.update.mockImplementation(async ({ data }: any) => ({ ...mockActivity, ...data }));

      const result = await service.findActivities({ page: 1, pageSize: 20 });

      const refreshedActivities = [{ ...mockActivity, conversion: '0%' }];
      expect(result).toEqual({
        items: refreshedActivities,
        data: refreshedActivities,
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('should filter activities by status', async () => {
      prisma.marketingActivity.findMany.mockResolvedValue([]);
      prisma.marketingActivity.count.mockResolvedValue(0);
      prisma.marketingPage.findMany.mockResolvedValue([]);
      prisma.marketingPageLead.count.mockResolvedValue(0);
      prisma.productOrder.count.mockResolvedValue(0);

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
    it('should return upgraded trigger types', async () => {
      const result = await service.getTriggerOptions();

      expect(result).toHaveLength(26);
    });

    it('should include expected trigger categories', async () => {
      const result = await service.getTriggerOptions();

      const categories = [...new Set(result.map((t: any) => t.category))];
      expect(categories).toContain('时间触发');
      expect(categories).toContain('行为触发');
      expect(categories).toContain('属性触发');
    });

    it('should include birthday trigger', async () => {
      const result = await service.getTriggerOptions();

      const birthday = result.find((t: any) => t.type === 'birthday');
      expect(birthday).toBeDefined();
      expect(birthday!.name).toBe('生日触发');
      expect(birthday!.category).toBe('时间触发');
      expect(birthday!.defaultParams).toBeDefined();
      expect(birthday!.paramSchema).toBeDefined();
    });

    it('should include all expected trigger types', async () => {
      const result = await service.getTriggerOptions();

      const types = result.map((t: any) => t.type);
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
      expect(types).toContain('coupon_expiry');
      expect(types).toContain('coupon_claimed_unused');
      expect(types).toContain('browse_abandonment');
      expect(types).toContain('booking_abandonment');
      expect(types).toContain('product_expiry_clearance');
      expect(types).toContain('project_idle_capacity');
      expect(types).toContain('seasonal_skin_care');
      expect(types).toContain('holiday_campaign');
      expect(types).toContain('vip_privilege_care');
      expect(types).toContain('product_replenishment');
      expect(types).toContain('referral_campaign');
      expect(types).toContain('visit_frequency');
      expect(types).toContain('visit_gap');
      expect(types).toContain('service_interest');
      expect(types).toContain('new_customer');
      expect(types).toContain('age_range');
    });
  });

  describe('rule templates', () => {
    const template = {
      id: 1,
      code: 'system_dormant',
      name: '沉睡客户唤醒',
      description: '超过指定天数未到店。',
      source: 'system',
      category: 'behavior',
      categoryLabel: '行为触发',
      scenario: '流失召回',
      priority: 'P0',
      status: 'recommended',
      version: '1.0.0',
      triggerType: 'dormant',
      paramSchema: [],
      defaultParams: { days: 60, channels: ['miniapp'] },
      recommendedActions: [{ type: 'push', value: '回归专享', channel: 'miniapp' }],
      scheduleDefault: { type: 'daily', time: '09:00' },
      frequencyCap: { sameCustomerDays: 7 },
      dataDependencies: ['客户档案'],
      recommendationReason: '自动唤醒长期未到店客户',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return paginated rule templates', async () => {
      prisma.marketingRuleTemplate.count.mockResolvedValue(1);
      prisma.marketingRuleTemplate.findMany.mockResolvedValue([template]);
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue([]);

      const result = await service.findRuleTemplates({ page: 1, pageSize: 10, source: 'system' });

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({ name: '沉睡客户唤醒', effect: expect.any(Object) });
      expect(prisma.marketingRuleTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ source: 'system' }),
          take: 10,
        }),
      );
    });

    it('should clone a system rule as store rule', async () => {
      prisma.marketingRuleTemplate.count.mockResolvedValue(1);
      prisma.marketingRuleTemplate.findUnique.mockResolvedValue(template);
      prisma.marketingRuleTemplate.create.mockResolvedValue({ ...template, id: 2, source: 'store', baseTemplateId: 1 });

      const result = await service.cloneRuleTemplate(1, { storeId: 1 });

      expect(result).toMatchObject({ id: 2, source: 'store', baseTemplateId: 1 });
      expect(prisma.marketingRuleTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'store', storeId: 1, baseTemplateId: 1 }),
        }),
      );
    });

    it('should enable a rule template by creating an automation strategy', async () => {
      prisma.marketingRuleTemplate.findUnique.mockResolvedValue(template);
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue([]);
      prisma.customer.count.mockResolvedValue(0);
      prisma.predictionRun.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);
      prisma.marketingAutomationStrategy.create.mockResolvedValue({ id: 9, name: template.name, status: 'enabled' });

      const result = await service.enableRuleTemplate(1);

      expect(result.strategy).toMatchObject({ id: 9, status: 'enabled' });
      expect(prisma.marketingAutomationStrategy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: 'rule_library',
            ruleTemplateId: 1,
            ruleTemplateVersion: '1.0.0',
            status: 'enabled',
          }),
        }),
      );
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
        executionModes: ['activity'],
        preferredMode: 'activity',
        offer: expect.objectContaining({ label: expect.any(String) }),
        recommendedItems: expect.any(Array),
        recommendedChannels: expect.any(Array),
      });
    });

    it('should return fallback cards when prediction storage is unavailable', async () => {
      prisma.predictionRun.findFirst.mockRejectedValue(new Error('prediction table unavailable'));
      prisma.customer.count.mockRejectedValue(new Error('customer table unavailable'));

      const result = await service.getRecommendations();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        targetCount: 0,
        totalCustomers: 0,
        executionModes: ['activity'],
        preferredMode: 'activity',
      });
      expect(result[0].sourceSignals).toContain('fallback');
    });

    it('should ignore behavior event query failures while building cards', async () => {
      prisma.predictionRun.findFirst.mockResolvedValue({
        id: 9,
        status: 'completed',
        modelVersion: 'rules-v2',
        customerCount: 1,
        finishedAt: new Date('2026-06-01T00:00:00.000Z'),
        summaryJson: {
          churnDistribution: [],
          repurchaseDistribution: [],
          marketingResponseDistribution: [],
          ltvDistribution: [],
          avgMarketingResponseScore: 80,
          expectedLtv6m: 1000,
        },
      });
      prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
        {
          id: 1,
          runId: 9,
          customerId: 100,
          marketingResponseScore: 82,
          repurchase30dScore: 75,
          churnScore: 20,
          ltv6m: 1000,
          reasonJson: [],
          featureJson: {},
        },
      ]);
      prisma.customerBehaviorEvent = {
        findMany: jest.fn().mockRejectedValue(new Error('behavior table unavailable')),
      };

      const result = await service.getRecommendations();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('predictionRunId', 9);
    });

    it('should prioritize realtime card and care-cycle signals in recommendation cards', async () => {
      prisma.predictionRun.findFirst.mockResolvedValue({
        id: 10,
        status: 'completed',
        modelVersion: 'rules-v2',
        customerCount: 2,
        storeId: 1,
        finishedAt: new Date('2026-06-01T00:00:00.000Z'),
        summaryJson: {
          churnDistribution: [],
          repurchaseDistribution: [],
          marketingResponseDistribution: [],
          ltvDistribution: [],
          avgMarketingResponseScore: 78,
          expectedLtv6m: 2000,
        },
      });
      prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
        {
          id: 1,
          runId: 10,
          customerId: 201,
          marketingResponseScore: 82,
          repurchase30dScore: 40,
          churnScore: 20,
          ltv6m: 1000,
          reasonJson: [],
          featureJson: {},
        },
        {
          id: 2,
          runId: 10,
          customerId: 202,
          marketingResponseScore: 76,
          repurchase30dScore: 60,
          churnScore: 25,
          ltv6m: 1000,
          reasonJson: [],
          featureJson: {},
        },
      ]);
      prisma.customerCard = {
        findMany: jest.fn().mockResolvedValue([{ customerId: 201 }]),
      };
      prisma.cardUsageRecord = {
        findMany: jest.fn().mockResolvedValue([]),
      };
      prisma.reservation = {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ customerId: 202, date: new Date('2026-05-01') }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      };
      prisma.recommendationEvent = {
        findMany: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getRecommendations();
      const cardExpiry = result.find((item: any) => item.triggerType === 'card_expiry');
      const careCycle = result.find((item: any) => item.triggerType === 'care_cycle');

      expect(cardExpiry?.targetCustomerIds).toEqual([201]);
      expect(careCycle?.targetCustomerIds).toEqual([202]);
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
