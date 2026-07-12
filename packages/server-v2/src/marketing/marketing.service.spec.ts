import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MarketingService } from './marketing.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ProductProjectRecommendationService } from './product-project-recommendation.service';
import { CustomerMarketingProfileService } from './customer-marketing-profile.service';
import { MarketingChannelService } from './marketing-channel.service';

describe('MarketingService', () => {
  let service: MarketingService;
  let prisma: jest.Mocked<any>;
  let productProjectService: { getCards: jest.Mock; isProductProjectRecommendationId: jest.Mock; getAudience: jest.Mock };
  let customerProfileService: { buildProfiles: jest.Mock };
  let channelService: { deliver: jest.Mock };

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
    const mockPrisma: any = {
      marketingActivity: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      promotion: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      customerAppEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      marketingRecommendationSnapshot: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      marketingPage: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      marketingPageVersion: { create: jest.fn() },
      marketingRecommendationAdoption: { create: jest.fn(), update: jest.fn() },
      marketingPageLead: {
        count: jest.fn(),
      },
      productOrder: {
        count: jest.fn(),
      },
      marketingAutomationStrategy: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
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
        update: jest.fn(),
      },
      marketingAutomationTouch: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn(),
        createMany: jest.fn(),
      },
      terminalFollowUpTask: {
        findMany: jest.fn().mockResolvedValue([]),
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
      amiGlowDisplayConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    mockPrisma.$transaction = jest.fn(async (callback: any): Promise<any> => callback(mockPrisma));

    productProjectService = {
      getCards: jest.fn().mockResolvedValue([]),
      isProductProjectRecommendationId: jest.fn().mockReturnValue(false),
      getAudience: jest.fn().mockResolvedValue([]),
    };
    customerProfileService = {
      buildProfiles: jest.fn().mockResolvedValue([]),
    };
    channelService = {
      deliver: jest.fn().mockResolvedValue({ status: 'delivered', externalId: 'task-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProductProjectRecommendationService, useValue: productProjectService },
        { provide: CustomerMarketingProfileService, useValue: customerProfileService },
        { provide: MarketingChannelService, useValue: channelService },
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
    it('should scope activity queries to the current store', async () => {
      prisma.marketingActivity.findMany.mockResolvedValue([]);
      prisma.marketingActivity.count.mockResolvedValue(0);

      await service.findActivities({ page: 1, pageSize: 20, storeId: 6 });

      expect(prisma.marketingActivity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storeId: 6 } }),
      );
      expect(prisma.marketingActivity.count).toHaveBeenCalledWith({ where: { storeId: 6 } });
    });

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
    it('should persist the current store and normalize legacy activity status', async () => {
      prisma.marketingActivity.create.mockImplementation(async ({ data }: any) => ({ id: 9, ...data }));

      const result = await service.createActivity({ title: '门店召回', status: '进行中' }, 6);

      expect(prisma.marketingActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storeId: 6, status: 'active' }),
        }),
      );
      expect(result.status).toBe('active');
    });

    it('should create a new marketing activity', async () => {
      const createData = { title: '新年活动', status: 'draft' };
      prisma.marketingActivity.create.mockResolvedValue({ id: 2, ...createData, description: null, participants: 0, conversion: null, startDate: null, endDate: null, targetCustomers: null, discount: null, createdAt: new Date(), updatedAt: new Date() });

      const result = await service.createActivity(createData, 1);

      expect(result.title).toBe('新年活动');
      expect(prisma.marketingActivity.create).toHaveBeenCalledWith({
        data: { ...createData, storeId: 1 },
        include: { primaryPromotion: true },
      });
    });

    it('should normalize selected promotion into activity relation and offer snapshot', async () => {
      const promotion = {
        id: 12,
        name: '回店护理礼遇',
        discountText: '满300减100',
        type: 'money_off',
        status: 'active',
        approvalStatus: 'approved',
        startAt: null,
        endAt: null,
        maxIssueCount: null,
        issuedCount: 0,
        validDays: 14,
      };
      const createData = {
        title: '流失客户唤醒',
        status: 'draft',
        offerJson: { type: 'money_off', label: '旧权益', reason: '推荐带入' },
        primaryPromotionId: 12,
      };
      prisma.promotion.findMany.mockResolvedValue([promotion]);
      prisma.marketingActivity.create.mockImplementation(async ({ data }: any) => ({ id: 12, ...data, primaryPromotion: promotion }));

      const result = await service.createActivity(createData, 1);

      expect(result.primaryPromotionId).toBe(12);
      expect(prisma.marketingActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          primaryPromotionId: 12,
          promotionIdsJson: [12],
          discount: '满300减100',
          offerJson: expect.objectContaining({
            promotionId: 12,
            promotionName: '回店护理礼遇',
            label: '满300减100',
            validDays: 14,
          }),
        }),
        include: { primaryPromotion: true },
      });
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

      await service.createActivity(createData, 1);

      expect(prisma.marketingActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: createData.title,
          pageSchema: createData.pageSchema,
          sourceRecommendationId: '12',
          aiGenerationId: 'ai-activity-page-1',
          publishStatus: 'published',
          publishedAt: new Date(createData.publishedAt),
        }),
        include: { primaryPromotion: true },
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
    it('should scope strategy queries to the current store', async () => {
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue([]);
      prisma.marketingAutomationStrategy.count.mockResolvedValue(0);

      await service.findStrategies({ page: 1, pageSize: 20, storeId: 6 });

      expect(prisma.marketingAutomationStrategy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { storeId: 6 } }),
      );
      expect(prisma.marketingAutomationStrategy.count).toHaveBeenCalledWith({ where: { storeId: 6 } });
    });

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

    it('should persist recommendation attribution into strategy actions', async () => {
      const attribution = {
        source: 'recommendation',
        sourceRecommendationId: '22',
        primaryPromotion: { promotionId: 12, promotionName: '护理周期预约券' },
      };
      prisma.promotion.findMany.mockResolvedValue([{
        id: 12,
        name: '护理周期预约券',
        status: 'active',
        approvalStatus: 'approved',
        startAt: null,
        endAt: null,
        maxIssueCount: null,
        issuedCount: 0,
      }]);
      prisma.marketingAutomationStrategy.create.mockImplementation(async ({ data }: any) => ({ id: 5, ...data }));

      await service.createStrategy({
        name: '护理周期自动触达',
        description: '来自智能推荐',
        executionType: 'auto',
        source: 'recommendation',
        schedule: { type: 'daily', time: '09:00', attribution },
        triggerRules: [{ type: 'care_cycle', params: { cycleDays: 28 } }],
        actions: [{ type: 'coupon', value: '护理周期券', promotionId: 12 }],
        targetCount: 18,
      }, 1);

      expect(prisma.marketingAutomationStrategy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'recommendation',
          schedule: expect.objectContaining({ attribution }),
          actions: [expect.objectContaining({
            promotionId: 12,
            attribution,
          })],
          targetCount: 18,
        }),
      });
    });
  });

  describe('executeStrategy', () => {
    it('returns the existing execution for the same schedule window', async () => {
      prisma.marketingAutomationExecution.findUnique.mockResolvedValue({ id: 88, status: 'success' });

      const result = await service.executeStrategy(7, 6, 'daily-2026-07-12-09:00');

      expect(result).toEqual({ id: 88, status: 'success' });
      expect(prisma.marketingAutomationStrategy.findFirst).not.toHaveBeenCalled();
    });

    it('counts only successful channel delivery as reached', async () => {
      prisma.marketingAutomationStrategy.findFirst.mockResolvedValue({
        ...mockStrategy,
        storeId: 6,
        actions: [{ type: 'push', channel: 'terminal', value: '护理提醒' }],
      }, 1);
      prisma.customer.count.mockResolvedValue(2);
      prisma.predictionRun.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([
        { id: 11, storeId: 6, totalSpent: 100, lastVisitDate: new Date() },
        { id: 12, storeId: 6, totalSpent: 100, lastVisitDate: new Date() },
      ]);
      prisma.marketingAutomationTouch.create
        .mockResolvedValueOnce({ id: 21 })
        .mockResolvedValueOnce({ id: 22 });
      prisma.marketingAutomationTouch.update.mockResolvedValue({});
      prisma.marketingAutomationExecution.create.mockResolvedValue({ id: 10 });
      prisma.marketingAutomationExecution.update.mockImplementation(async ({ data }: any) => ({ id: 10, strategyName: mockStrategy.name, queuedCount: 2, ...data }));
      prisma.marketingAutomationStrategy.update.mockResolvedValue({});
      channelService.deliver
        .mockResolvedValueOnce({ status: 'delivered', externalId: '91' })
        .mockResolvedValueOnce({ status: 'failed', errorCode: 'channel_not_configured' });

      const result = await service.executeStrategy(1, 6, 'window-20260712');

      expect(result).toEqual(expect.objectContaining({ status: 'partial_failed', queuedCount: 2, reachedCount: 1, failedCount: 1 }));
      expect(prisma.marketingAutomationTouch.update).toHaveBeenCalledWith({
        where: { id: 21 },
        data: expect.objectContaining({ status: 'delivered', errorCode: null }),
      });
      expect(prisma.marketingAutomationTouch.update).toHaveBeenCalledWith({
        where: { id: 22 },
        data: expect.objectContaining({ status: 'failed', errorCode: 'channel_not_configured' }),
      });
    });

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
      prisma.marketingAutomationExecution.update.mockResolvedValue({
        id: 1, strategyName: '沉睡客户唤醒', status: 'success', queuedCount: 0, reachedCount: 0, failedCount: 0,
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

    it('should issue bound promotions when executing an automation strategy', async () => {
      prisma.marketingAutomationStrategy.findUnique.mockResolvedValue({
        ...mockStrategy,
        id: 7,
        schedule: { attribution: { sourceRecommendationId: '101' } },
        actions: [{
          type: 'coupon',
          value: '护理周期券',
          promotionId: 31,
          promotionName: '护理周期预约券',
          attribution: { sourceRecommendationId: '101' },
        }],
      });
      prisma.promotion.findMany.mockResolvedValue([{
        id: 31,
        name: '护理周期预约券',
        status: 'active',
        approvalStatus: 'approved',
        startAt: null,
        endAt: null,
        maxIssueCount: 100,
        issuedCount: 2,
      }]);
      prisma.customer.count.mockResolvedValue(2);
      prisma.predictionRun.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([
        { id: 11, name: '客户A', storeId: 1, totalSpent: 1200, lastVisitDate: new Date() },
        { id: 12, name: '客户B', storeId: 1, totalSpent: 800, lastVisitDate: new Date() },
      ]);
      prisma.marketingAutomationTouch.findMany = jest.fn().mockResolvedValue([]);
      prisma.marketingAutomationExecution.create.mockResolvedValue({
        id: 9,
        strategyId: 7,
        strategyName: '沉睡客户唤醒',
        status: 'success',
        triggeredCount: 2,
        reachedCount: 2,
        channel: 'sms',
      });
      prisma.marketingAutomationExecution.update.mockResolvedValue({ id: 9, status: 'success', reachedCount: 2, failedCount: 0 });
      prisma.marketingAutomationStrategy.update.mockResolvedValue({});

      await service.executeStrategy(7);

      expect(prisma.marketingAutomationTouch.create).toHaveBeenCalledTimes(2);
      expect(prisma.marketingAutomationTouch.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ customerId: 11, strategyId: 7, status: 'queued' }),
      }));
      expect(prisma.marketingAutomationTouch.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'delivered' }),
      }));
      expect(prisma.customerAppEvent.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              customerId: 11,
              eventType: 'promotion_claimed',
              targetType: 'promotion',
              targetId: '31',
              source: 'marketing_automation',
              metadataJson: expect.objectContaining({ strategyId: 7, executionId: 9 }),
            }),
            expect.objectContaining({
              customerId: 12,
              eventType: 'promotion_claimed',
              targetType: 'promotion',
              targetId: '31',
            }),
          ]),
          skipDuplicates: true,
        }),
      );
      expect(prisma.promotion.updateMany).toHaveBeenCalledWith({
        where: { id: 31 },
        data: { issuedCount: { increment: 2 } },
      });
    });

    it('should throw NotFoundException for non-existent strategy', async () => {
      prisma.marketingAutomationStrategy.findUnique.mockResolvedValue(null);

      await expect(service.executeStrategy(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('adoptRecommendation', () => {
    it('creates activity, page, version and adoption in one transaction', async () => {
      jest.spyOn(service as any, 'getRecommendationCardById').mockResolvedValue({
        id: 22,
        title: '沉睡客户召回',
        reason: '超过90天未到店',
        targetCustomers: '高流失客户',
        predictionRunId: 53,
        audienceSnapshot: { customerIds: [11, 12], totalCustomers: 2 },
        sourceSignals: ['prediction'],
        offer: { label: '回店护理礼' },
        recommendedItems: [],
      });
      prisma.marketingActivity.create.mockResolvedValue({ id: 31, title: '沉睡客户召回' });
      prisma.marketingPage.create.mockResolvedValue({ id: 41, slug: 'recommendation-22-6' });
      prisma.marketingPageVersion.create.mockResolvedValue({ id: 1 });
      prisma.marketingRecommendationAdoption.create.mockResolvedValue({ id: 51 });
      prisma.marketingRecommendationAdoption.update.mockResolvedValue({ id: 51, status: 'published', activityId: 31, pageId: 41 });

      const result = await service.adoptRecommendation(22, 6, {
        mode: 'activity', activity: { publishPage: true },
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.marketingActivity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: 6, status: 'active' }) }));
      expect(prisma.marketingPage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: 6, activityId: 31, status: 'published' }) }));
      expect(result).toEqual(expect.objectContaining({ adoptionId: 51, recommendationId: 22, status: 'published', activityId: 31, pageId: 41 }));
    });
  });

  describe('promotion guards for automation strategies', () => {
    it('should reject enabling a strategy when bound promotion is not usable', async () => {
      prisma.marketingAutomationStrategy.findUnique.mockResolvedValue({
        ...mockStrategy,
        actions: [{ type: 'coupon', value: '满300减100', promotionId: 99 }],
      });
      prisma.promotion.findMany.mockResolvedValue([{
        id: 99,
        name: '已下线权益',
        status: 'offline',
        approvalStatus: 'approved',
        startAt: null,
        endAt: null,
        maxIssueCount: null,
        issuedCount: 0,
      }]);

      await expect(service.enableStrategy(1)).rejects.toThrow('已下线权益');
      expect(prisma.marketingAutomationStrategy.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'enabled' } }),
      );
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

  describe('unified effects', () => {
    it('loads activity pages in one batch instead of querying once per activity', async () => {
      prisma.marketingActivity.findMany.mockResolvedValue([
        { ...mockActivity, id: 1, storeId: 6 },
        { ...mockActivity, id: 2, storeId: 6 },
      ]);
      prisma.marketingPage.findMany.mockResolvedValue([]);

      await service.getUnifiedEffects({ objectType: 'activity', storeId: 6 });

      expect(prisma.marketingPage.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.marketingPage.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ storeId: 6 }),
      }));
    });

    it('should aggregate effects by source recommendation', async () => {
      const attribution = {
        source: 'recommendation',
        sourceRecommendationId: '101',
        recommendationKey: 'care_cycle:101:2026-06-17',
        audienceSnapshot: { ruleSummary: '护理周期到期 + 干皮', totalCustomers: 20 },
        primaryPromotion: { promotionId: 31, promotionName: '护理周期预约券' },
        originalPromotion: { promotionId: 31, promotionName: '护理周期预约券' },
        selectedPromotion: { promotionId: 32, promotionName: '低峰预约礼' },
        promotionSwitched: true,
        originalOffer: { promotionId: 31, promotionName: '护理周期预约券', label: '护理券' },
        selectedOffer: { promotionId: 32, promotionName: '低峰预约礼', label: '低峰到店礼' },
      };
      prisma.marketingActivity.findMany.mockResolvedValue([
        {
          id: 1,
          title: '护理周期复购活动',
          status: '进行中',
          participants: 20,
          conversion: '10%',
          updatedAt: new Date('2026-06-17T10:00:00.000Z'),
          sourceRecommendationId: '101',
          offerJson: { promotionName: '护理周期预约券', attribution },
          sourceSignalsJson: { attribution },
          recommendedChannelsJson: [{ channel: 'miniapp', label: '小程序' }],
          primaryPromotion: { name: '护理周期预约券' },
        },
      ]);
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue([
        {
          id: 2,
          name: '护理周期自动触达',
          status: 'enabled',
          updatedAt: new Date('2026-06-17T11:00:00.000Z'),
          lastExecutedAt: new Date('2026-06-17T12:00:00.000Z'),
          schedule: { attribution },
          actions: [{ type: 'coupon', value: '护理券', promotionId: 31, promotionName: '护理周期预约券', attribution }],
          executions: [{ reachedCount: 8 }],
          touches: [
            { status: 'converted', convertedAt: new Date('2026-06-17T13:00:00.000Z'), actualRevenue: 680 },
            { status: 'clicked', actualRevenue: 0 },
          ],
        },
      ]);
      prisma.marketingPage.findMany.mockResolvedValue([
        {
          id: 3,
          title: '护理周期推广页',
          status: 'published',
          updatedAt: new Date('2026-06-17T09:00:00.000Z'),
          snapshotJson: { attribution },
          events: [
            { eventType: 'page_view', occurredAt: new Date('2026-06-17T09:10:00.000Z') },
            { eventType: 'cta_click', occurredAt: new Date('2026-06-17T09:20:00.000Z') },
          ],
          leads: [{ status: 'booked', convertedAt: new Date('2026-06-17T09:30:00.000Z') }],
          attributions: [{ attributedRevenue: 480 }],
        },
      ]);

      const result = await service.getUnifiedEffects({ objectType: 'recommendation' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        objectType: 'recommendation',
        objectId: '101',
        objectName: '护理周期复购活动',
        exposureCount: 23,
        clickCount: 3,
        conversionCount: 4,
        revenue: 1160,
        relatedObjectName: expect.stringContaining('权益：护理周期预约券'),
        audienceName: '护理周期到期 + 干皮',
        promotionName: '护理周期预约券',
        channelName: '小程序',
        recommendationAttribution: expect.objectContaining({
          sourceRecommendationId: '101',
          recommendationKey: 'care_cycle:101:2026-06-17',
          promotionSwitched: true,
          originalPromotion: expect.objectContaining({ promotionId: 31 }),
          selectedPromotion: expect.objectContaining({ promotionId: 32 }),
          originalOffer: expect.objectContaining({ label: '护理券' }),
          selectedOffer: expect.objectContaining({ label: '低峰到店礼' }),
        }),
        metrics: expect.objectContaining({
          revenue: expect.objectContaining({ value: 1160, source: 'actual', definition: expect.any(String) }),
          cost: expect.objectContaining({ source: 'estimated', definition: expect.any(String) }),
        }),
      });
      expect(result.summary).toMatchObject({
        totalObjects: 1,
        exposureCount: 23,
        clickCount: 3,
        conversionCount: 4,
        revenue: 1160,
      });
    });

    it('should aggregate promotion claim, reservation, usage and revenue events', async () => {
      prisma.promotion.findMany.mockResolvedValue([{
        id: 31,
        name: '护理周期预约券',
        status: 'active',
        issuedCount: 3,
        usedCount: 1,
        updatedAt: new Date('2026-06-17T10:00:00.000Z'),
        marketingActivities: [{ title: '护理周期复购活动', participants: 20 }],
      }]);
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue([{
        id: 2,
        name: '护理周期自动触达',
        actions: [{ promotionId: 31, promotionName: '护理周期预约券' }],
        executions: [{ reachedCount: 5 }],
        touches: [
          { status: 'reached', actualRevenue: 0 },
          { status: 'converted', convertedAt: new Date('2026-06-17T11:00:00.000Z'), actualRevenue: 680 },
        ],
      }]);
      prisma.marketingPage.findMany.mockResolvedValue([]);
      prisma.customerAppEvent.findMany.mockResolvedValue([
        {
          eventType: 'promotion_claimed',
          channel: 'miniapp',
          targetType: 'promotion',
          targetId: '31',
          metadataJson: { audienceName: '护理周期到期客户' },
          occurredAt: new Date('2026-06-17T09:00:00.000Z'),
        },
        {
          eventType: 'promotion_reserved',
          channel: 'miniapp',
          targetType: 'promotion',
          targetId: '31',
          metadataJson: { reservationId: 7 },
          occurredAt: new Date('2026-06-17T09:30:00.000Z'),
        },
        {
          eventType: 'promotion_used',
          channel: 'terminal',
          targetType: 'promotion',
          targetId: '31',
          metadataJson: { revenueAmount: 980 },
          occurredAt: new Date('2026-06-17T12:00:00.000Z'),
        },
      ]);

      const result = await service.getUnifiedEffects({ objectType: 'promotion' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        objectType: 'promotion',
        objectId: 31,
        objectName: '护理周期预约券',
        exposureCount: 22,
        clickCount: 1,
        conversionCount: 3,
        revenue: 1660,
        relatedObjectName: expect.stringContaining('护理周期自动触达'),
        audienceName: '护理周期到期客户',
        promotionName: '护理周期预约券',
        channelName: '小程序、终端',
      });
      expect(result.summary).toMatchObject({
        totalObjects: 1,
        exposureCount: 22,
        clickCount: 1,
        conversionCount: 3,
        revenue: 1660,
      });
    });
  });

  describe('recommendations', () => {
    it('reuses a completed prediction run from the same business day', async () => {
      const completed = { id: 53, storeId: 6, status: 'completed', customerCount: 10, summaryJson: { customerCount: 10 } };
      prisma.predictionRun.findFirst.mockResolvedValue(completed);

      const result = await service.runPredictions(6);

      expect(result).toEqual({ run: completed, summary: completed.summaryJson, reused: true });
      expect(prisma.predictionRun.create).not.toHaveBeenCalled();
    });

    it('should return compatible recommendation cards', async () => {
      prisma.customer.count.mockResolvedValue(10);

      const result = await service.getRecommendations(undefined, { refresh: true });

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
        predictionFreshness: expect.objectContaining({ status: 'missing', predictionRunId: null }),
      });
    });

    it('should return fallback cards when prediction storage is unavailable', async () => {
      prisma.predictionRun.findFirst.mockRejectedValue(new Error('prediction table unavailable'));
      prisma.customer.count.mockRejectedValue(new Error('customer table unavailable'));

      const result = await service.getRecommendations(undefined, { refresh: true });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        targetCount: 0,
        totalCustomers: 0,
        executionModes: ['activity'],
        preferredMode: 'activity',
      });
      expect(result[0].sourceSignals).toContain('fallback');
    });

    it('should not calculate product and project opportunities for the default customer scope', async () => {
      prisma.customer.count.mockResolvedValue(10);

      const result = await service.getRecommendations(1);

      expect(result.length).toBeGreaterThan(0);
      expect(productProjectService.getCards).not.toHaveBeenCalled();
    });

    it('should delegate product-project scope with limit', async () => {
      productProjectService.getCards.mockResolvedValue([{ id: 2100, title: '临期商品机会' }]);

      const result = await service.getRecommendations(1, { scope: 'product-project', type: 'product_expiry_clearance', limit: 5 });

      expect(productProjectService.getCards).toHaveBeenCalledWith(1, { type: 'product_expiry_clearance', limit: 5 });
      expect(result[0]).toMatchObject({ id: 2100, title: '临期商品机会' });
      expect(result[0].executionState).toMatchObject({
        automation: { done: false, count: 0 },
        activity: { done: false, count: 0 },
        followUp: { done: false, count: 0 },
      });
    });

    it('should reuse recommendation snapshot when cache is warm', async () => {
      prisma.marketingRecommendationSnapshot.findUnique.mockResolvedValue({
        cacheKey: '1:customer:all:20:9:rules-v2',
        cardsJson: [{ id: 1, title: '缓存推荐' }],
        expiresAt: new Date(Date.now() + 60000),
      });
      prisma.predictionRun.findFirst.mockResolvedValue({
        id: 9,
        status: 'completed',
        modelVersion: 'rules-v2',
        customerCount: 1,
        finishedAt: new Date('2026-06-01T00:00:00.000Z'),
      });

      const result = await service.getRecommendations(1, { scope: 'customer', limit: 20 });

      expect(result[0]).toMatchObject({ id: 1, title: '缓存推荐' });
      expect(result[0].executionState).toMatchObject({
        automation: { done: false, count: 0 },
        activity: { done: false, count: 0 },
        followUp: { done: false, count: 0 },
      });
      expect(prisma.customerPredictionSnapshot.findMany).not.toHaveBeenCalled();
    });

    it('should attach execution state from activities, automation strategies and terminal follow-up tasks', async () => {
      prisma.marketingRecommendationSnapshot.findUnique.mockResolvedValue({
        cacheKey: '1:customer:all:20:9:rules-v2',
        cardsJson: [{ id: 1, title: '缓存推荐' }],
        expiresAt: new Date(Date.now() + 60000),
      });
      prisma.predictionRun.findFirst.mockResolvedValue({
        id: 9,
        status: 'completed',
        modelVersion: 'rules-v2',
        customerCount: 1,
        finishedAt: new Date('2026-06-01T00:00:00.000Z'),
      });
      prisma.marketingActivity.findMany.mockResolvedValue([
        {
          id: 21,
          title: '回店护理活动',
          status: '进行中',
          sourceRecommendationId: '1',
          publishStatus: 'published',
          publishedAt: new Date('2026-06-02T09:00:00.000Z'),
          updatedAt: new Date('2026-06-02T09:00:00.000Z'),
        },
      ]);
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue([
        {
          id: 31,
          name: '流失客户自动触达',
          status: 'enabled',
          schedule: { attribution: { sourceRecommendationId: '1' } },
          actions: [],
          updatedAt: new Date('2026-06-03T09:00:00.000Z'),
          lastExecutedAt: null,
        },
      ]);
      prisma.terminalFollowUpTask.findMany.mockResolvedValue([
        {
          id: 41,
          title: '流失客户跟进',
          recommendationId: 1,
          status: 'pending',
          assignedAt: new Date('2026-06-04T09:00:00.000Z'),
          createdAt: new Date('2026-06-04T09:00:00.000Z'),
          updatedAt: new Date('2026-06-04T09:00:00.000Z'),
        },
      ]);

      const result = await service.getRecommendations(1, { scope: 'customer', limit: 20 });

      expect(result[0].executionState).toMatchObject({
        activity: { done: true, count: 1, label: '活动已发布', objectIds: [21] },
        automation: { done: true, count: 1, label: '自动触达已开启', objectIds: [31] },
        followUp: { done: true, count: 1, label: '跟进已下发', objectIds: [41] },
      });
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

      const result = await service.getRecommendations(undefined, { refresh: true });

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
          .mockResolvedValueOnce([])
          .mockResolvedValue([]),
      };
      prisma.recommendationEvent = {
        findMany: jest.fn().mockResolvedValue([]),
      };

      const result = await service.getRecommendations(undefined, { refresh: true });
      const cardExpiry = result.find((item: any) => item.triggerType === 'card_expiry');
      const careCycle = result.find((item: any) => item.triggerType === 'care_cycle');

      expect(cardExpiry?.targetCustomerIds).toEqual([201]);
      expect(careCycle?.targetCustomerIds).toEqual([202]);
    });

    it('should enrich recommendation cards with profile tags and matched promotion asset', async () => {
      prisma.predictionRun.findFirst.mockResolvedValue({
        id: 11,
        status: 'completed',
        modelVersion: 'rules-v2',
        customerCount: 1,
        storeId: 1,
        finishedAt: new Date('2026-06-01T00:00:00.000Z'),
          summaryJson: {
            churnDistribution: [],
          repurchaseDistribution: [{ label: '70-100', count: 1 }],
            marketingResponseDistribution: [],
            ltvDistribution: [],
            avgMarketingResponseScore: 80,
          avgRepurchase30dScore: 75,
          avgChurnScore: 20,
          expectedLtv6m: 1000,
        },
      });
      prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
        {
          id: 1,
          runId: 11,
          customerId: 301,
          marketingResponseScore: 82,
          repurchase30dScore: 75,
          churnScore: 20,
          ltv6m: 1000,
          reasonJson: [],
          featureJson: {},
        },
      ]);
      prisma.promotion.findMany.mockResolvedValue([
        {
          id: 31,
          name: '护理周期预约券',
          discountText: '护理项目满500减80',
          type: 'money_off',
          source: 'system',
          scenario: 'care_cycle_due',
          audienceTags: ['护理周期', '复购窗口'],
          applicableProjectIds: [],
          issuedCount: 0,
          usedCount: 0,
          maxIssueCount: null,
          validDays: 21,
          estimatedCost: 80,
          status: 'active',
          approvalStatus: 'approved',
          metadata: {
            lifecycleTags: ['复购窗口'],
            behaviorTags: ['护理周期到期'],
            skinTags: ['干皮'],
            preferenceTags: ['补水'],
            preferredExecutionModes: ['automation'],
            offerStrength: 'medium',
          },
        },
      ]);
      customerProfileService.buildProfiles.mockResolvedValue([
        {
          customerId: 301,
          lifecycleTags: ['复购窗口'],
          valueTags: ['中 LTV'],
          behaviorTags: ['护理周期到期'],
          preferenceTags: ['补水'],
          skinTags: ['干皮'],
          cardTags: [],
          productCycleTags: [],
          capacityTags: [],
          channelTags: ['小程序活跃'],
          fatigueTags: [],
          evidence: ['客户护理周期到期且偏好补水项目。'],
          updatedAt: new Date().toISOString(),
        },
      ]);

      const result = await service.getRecommendations(1, { refresh: true });
      const repurchase = result.find((item: any) => item.triggerType === 'care_cycle');

      expect(repurchase?.offer).toMatchObject({
        promotionId: 31,
        promotionName: '护理周期预约券',
        label: '护理项目满500减80',
      });
      expect(repurchase?.primaryPromotion).toMatchObject({ promotionId: 31 });
      expect(repurchase?.audienceTags).toEqual(expect.arrayContaining(['复购窗口', '护理周期到期', '补水', '干皮']));
      expect(repurchase?.dataEvidence).toEqual(expect.arrayContaining([expect.stringContaining('画像证据')]));
    });

    it('should use unified promotion effect history when matching recommendation offers', async () => {
      prisma.predictionRun.findFirst.mockResolvedValue({
        id: 12,
        status: 'completed',
        modelVersion: 'rules-v2',
        customerCount: 1,
        storeId: 1,
        finishedAt: new Date('2026-06-01T00:00:00.000Z'),
        summaryJson: {
          churnDistribution: [],
          repurchaseDistribution: [{ label: '70-100', count: 1 }],
          marketingResponseDistribution: [],
          ltvDistribution: [],
          avgMarketingResponseScore: 80,
          avgRepurchase30dScore: 75,
          avgChurnScore: 20,
          expectedLtv6m: 1000,
        },
      });
      prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
        {
          id: 1,
          runId: 12,
          customerId: 401,
          marketingResponseScore: 82,
          repurchase30dScore: 75,
          churnScore: 20,
          ltv6m: 1000,
          reasonJson: [],
          featureJson: {},
        },
      ]);
      prisma.promotion.findMany.mockResolvedValue([
        {
          id: 41,
          name: '护理周期高转化券',
          discountText: '护理项目满500减60',
          type: 'money_off',
          source: 'system',
          scenario: 'care_cycle_due',
          audienceTags: ['护理周期', '复购窗口'],
          applicableProjectIds: [],
          issuedCount: 0,
          usedCount: 0,
          maxIssueCount: null,
          validDays: 21,
          estimatedCost: 60,
          status: 'active',
          approvalStatus: 'approved',
          metadata: { behaviorTags: ['护理周期到期'], preferredExecutionModes: ['automation'] },
        },
        {
          id: 42,
          name: '护理周期普通券',
          discountText: '护理项目满500减80',
          type: 'money_off',
          source: 'system',
          scenario: 'care_cycle_due',
          audienceTags: ['护理周期', '复购窗口'],
          applicableProjectIds: [],
          issuedCount: 0,
          usedCount: 0,
          maxIssueCount: null,
          validDays: 21,
          estimatedCost: 80,
          status: 'active',
          approvalStatus: 'approved',
          metadata: { behaviorTags: ['护理周期到期'], preferredExecutionModes: ['automation'] },
        },
      ]);
      prisma.marketingAutomationStrategy.findMany.mockResolvedValue([
        {
          id: 3,
          name: '高转化护理周期规则',
          actions: [{ promotionId: 41, promotionName: '护理周期高转化券' }],
          executions: [{ reachedCount: 20 }],
          touches: [
            { status: 'converted', convertedAt: new Date(), actualRevenue: 680 },
            { status: 'converted', convertedAt: new Date(), actualRevenue: 520 },
            { status: 'clicked', actualRevenue: 0 },
          ],
        },
      ]);
      prisma.customerAppEvent.findMany.mockResolvedValue([
        { eventType: 'promotion_redeem', targetId: '41', metadataJson: { revenueAmount: 300 }, occurredAt: new Date() },
      ]);
      customerProfileService.buildProfiles.mockResolvedValue([
        {
          customerId: 401,
          lifecycleTags: ['复购窗口'],
          behaviorTags: ['护理周期到期'],
          evidence: ['客户护理周期到期。'],
          updatedAt: new Date().toISOString(),
        },
      ]);

      const result = await service.getRecommendations(1, { refresh: true });
      const repurchase = result.find((item: any) => item.triggerType === 'care_cycle');

      expect(repurchase?.offer).toMatchObject({
        promotionId: 41,
        promotionName: '护理周期高转化券',
      });
      expect(repurchase?.offerFitBreakdown?.historicalEffectScore).toBeGreaterThan(40);
      expect(repurchase?.primaryPromotion?.fitReasons).toEqual(expect.arrayContaining(['历史转化表现较好']));
    });

    it('should include attribution and promotion options in recommendation activity draft', async () => {
      jest.spyOn(service as any, 'getRecommendationCardById').mockResolvedValue({
        id: 101,
        recommendationKey: 'care_cycle:101:2026-06-17',
        recommendationType: 'care_cycle_due',
        title: '护理周期复购',
        reason: '客户护理周期已到期',
        targetCustomers: '护理周期客户（1人）',
        discount: '护理项目满500减80',
        predictionRunId: 11,
        modelVersion: 'rules-v2',
        triggerType: 'care_cycle',
        sourceSignals: ['care_cycle', 'profile'],
        audienceTags: ['复购窗口', '补水'],
        audienceRule: { relation: 'AND', include: [{ dimension: '服务偏好', tags: ['补水'] }], exclude: [] },
        audienceSnapshot: { predictionRunId: 11, generatedAt: '2026-06-17T00:00:00.000Z', ruleSummary: '护理周期', customerIds: [301], totalCustomers: 1, sampleReasons: [] },
        offer: { type: 'money_off', label: '护理项目满500减80', promotionId: 31, promotionName: '护理周期预约券', reason: '适用场景匹配' },
        primaryPromotion: { promotionId: 31, promotionName: '护理周期预约券', discountText: '护理项目满500减80', fitScore: 92 },
        alternativePromotions: [{ promotionId: 32, promotionName: '补水护理加项礼', discountText: '赠修护导入', fitScore: 78 }],
        offerFitBreakdown: { scenarioScore: 100, audienceScore: 85 },
        recommendedItems: [{ type: 'project', id: 8, name: '补水护理', reason: '偏好匹配', confidence: 90 }],
        recommendedChannels: [{ channel: 'miniapp', label: '小程序', reason: '活跃渠道', priority: 'P0' }],
        riskWarnings: ['同客户同项目 7 天内最多触达 1 次'],
      } as any);

      const draft = await service.createRecommendationActivityDraft(101);

      expect(draft.formDefaults).toMatchObject({
        sourceRecommendationId: '101',
        primaryPromotionId: 31,
        promotionIdsJson: [31, 32],
        audienceSnapshotJson: expect.objectContaining({ customerIds: [301] }),
        offerJson: expect.objectContaining({
          promotionId: 31,
          attribution: expect.objectContaining({ sourceRecommendationId: '101' }),
          primaryPromotion: expect.objectContaining({ promotionId: 31 }),
          alternativePromotions: [expect.objectContaining({ promotionId: 32 })],
        }),
        sourceSignalsJson: expect.objectContaining({
          attribution: expect.objectContaining({ recommendationKey: 'care_cycle:101:2026-06-17' }),
          offerFitBreakdown: { scenarioScore: 100, audienceScore: 85 },
        }),
      });
    });

    it('should include attribution and frequency cap in recommendation automation draft', async () => {
      jest.spyOn(service as any, 'getRecommendationCardById').mockResolvedValue({
        id: 102,
        recommendationKey: 'care_cycle:102:2026-06-17',
        recommendationType: 'care_cycle_due',
        title: '护理周期自动触达',
        reason: '客户护理周期已到期',
        discount: '护理项目满500减80',
        priority: 'P0',
        targetCount: 2,
        predictionRunId: 11,
        triggerType: 'care_cycle',
        triggerRule: { type: 'care_cycle', params: { cycleDays: 28 }, defaultEditable: true, reason: '周期到期' },
        audienceSnapshot: { predictionRunId: 11, generatedAt: '2026-06-17T00:00:00.000Z', ruleSummary: '护理周期', customerIds: [301, 302], totalCustomers: 2, sampleReasons: [] },
        offer: { type: 'money_off', label: '护理项目满500减80', promotionId: 31, promotionName: '护理周期预约券', reason: '适用场景匹配' },
        primaryPromotion: { promotionId: 31, promotionName: '护理周期预约券', discountText: '护理项目满500减80', fitScore: 92 },
        recommendedActions: [{ type: 'coupon', value: '护理项目满500减80', promotionId: 31, promotionName: '护理周期预约券', channel: 'miniapp', reason: '自动触达' }],
        recommendedChannels: [{ channel: 'miniapp', label: '小程序', reason: '活跃渠道', priority: 'P0' }],
        riskWarnings: ['同客户同项目 7 天内最多触达 1 次'],
      } as any);
      prisma.customer.count.mockResolvedValue(0);
      prisma.predictionRun.findFirst.mockResolvedValue(null);
      prisma.customer.findMany.mockResolvedValue([]);

      const draft = await service.createRecommendationAutomationDraft(102);

      expect(draft.strategyInput).toMatchObject({
        source: 'recommendation',
        targetCount: 2,
        schedule: expect.objectContaining({
          attribution: expect.objectContaining({ sourceRecommendationId: '102' }),
          frequencyCap: expect.objectContaining({ sameCustomerDays: 14, maxTouchesPerCustomer: 1 }),
        }),
        actions: [expect.objectContaining({
          promotionId: 31,
          promotionName: '护理周期预约券',
          attribution: expect.objectContaining({ primaryPromotion: expect.objectContaining({ promotionId: 31 }) }),
        })],
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

    it('should exclude recently touched customers from recommendation audience', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 1, name: 'Alice', memberLevel: 'VIP', skinType: '混合肌', visitCount: 3, totalSpent: 1200 },
        { id: 2, name: 'Bella', memberLevel: '普通会员', skinType: '干性', visitCount: 1, totalSpent: 300 },
      ]);
      prisma.marketingAutomationTouch.findMany.mockResolvedValue([{ customerId: 1 }]);

      const result = await service.getRecommendationAudience(1);

      expect(result.map((item: any) => item.customerId)).toEqual([2]);
    });
  });
});
