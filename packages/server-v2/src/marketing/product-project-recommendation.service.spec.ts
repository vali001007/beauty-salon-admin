import { ProductProjectRecommendationService } from './product-project-recommendation.service';

describe('ProductProjectRecommendationService', () => {
  let prisma: jest.Mocked<any>;
  let profileService: jest.Mocked<any>;
  let service: ProductProjectRecommendationService;

  beforeEach(() => {
    prisma = {
      stockBatch: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      predictionRun: { findFirst: jest.fn().mockResolvedValue(null) },
      customerPredictionSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      schedule: { findMany: jest.fn().mockResolvedValue([]) },
      reservation: { findMany: jest.fn().mockResolvedValue([]) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn().mockResolvedValue([]) },
      promotion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    profileService = { buildProfiles: jest.fn().mockResolvedValue([]) };
    service = new ProductProjectRecommendationService(
      prisma as any,
      { get: jest.fn((_key, fallback) => fallback) } as any,
      profileService as any,
    );
  });

  it('rejects product and project recommendation queries without a store scope', async () => {
    await expect((service as any).getCards(undefined)).rejects.toThrow('storeId is required');
    await expect((service as any).getAudience(2001, undefined)).rejects.toThrow('storeId is required');
  });

  it('generates product expiry clearance cards with inventory evidence', async () => {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    prisma.stockBatch.findMany.mockResolvedValue([
      {
        id: 501,
        productId: 10,
        batchNo: 'B-EXP',
        stock: 80,
        expiryDate,
        product: {
          id: 10,
          name: '修护面膜',
          unit: '盒',
          costPrice: 20,
          retailPrice: 98,
          category: { name: '面膜' },
          bomItems: [{ project: { id: 20, name: '补水护理', price: 480, type: { name: '面部护理' } } }],
        },
      },
    ]);
    prisma.orderItem.findMany.mockImplementation(async (args: any) => {
      if (args.select?.itemId) return [{ itemId: 10, quantity: 20 }];
      return [];
    });
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 7, modelVersion: 'rules-v2' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { customerId: 1, marketingResponseScore: 80, repurchase30dScore: 60, churnScore: 20, reasonJson: [] },
      { customerId: 2, marketingResponseScore: 70, repurchase30dScore: 58, churnScore: 30, reasonJson: [] },
    ]);

    const cards = await service.getCards(1, { type: 'product_expiry_clearance' });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      recommendationType: 'product_expiry_clearance',
      triggerType: 'product_expiry_clearance',
      priority: 'P0',
      source: 'inventory',
      inventorySnapshot: {
        productId: 10,
        batchId: 501,
        batchNo: 'B-EXP',
      },
    });
    expect(cards[0].recommendedItems.map((item: any) => item.name)).toContain('补水护理');
    expect(cards[0].dataEvidence.join(' ')).toContain('预计自然消化');
  });

  it('matches product expiry cards with a promotion asset', async () => {
    const now = new Date();
    const expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    prisma.promotion.findMany.mockResolvedValue([
      {
        id: 51,
        name: '临期商品消化券',
        type: 'money_off',
        discountText: '临期护理搭赠券',
        scenario: 'product_expiry_clearance',
        source: 'system',
        status: 'active',
        approvalStatus: 'approved',
        validDays: 14,
        audienceTags: ['临期库存适配', '库存消化'],
        applicableProjectIds: [20],
        applicableProductIds: [10],
        metadata: {
          behaviorTags: ['库存消化'],
          productCycleTags: ['临期库存适配'],
          preferredExecutionModes: ['activity'],
          channelTags: ['小程序', '门店跟进'],
        },
        grossMarginGuard: { inventoryCapRequired: true, stackable: false },
      },
    ]);
    prisma.stockBatch.findMany.mockResolvedValue([
      {
        id: 501,
        productId: 10,
        batchNo: 'B-EXP',
        stock: 80,
        expiryDate,
        product: {
          id: 10,
          name: '修护面膜',
          unit: '盒',
          costPrice: 20,
          retailPrice: 98,
          category: { name: '面膜' },
          bomItems: [{ project: { id: 20, name: '补水护理', price: 480, type: { name: '面部护理' } } }],
        },
      },
    ]);
    prisma.orderItem.findMany.mockImplementation(async (args: any) => {
      if (args.select?.itemId) return [{ itemId: 10, quantity: 20 }];
      return [];
    });
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 7, modelVersion: 'rules-v2' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { customerId: 1, marketingResponseScore: 80, repurchase30dScore: 60, churnScore: 20, reasonJson: [] },
    ]);
    profileService.buildProfiles.mockResolvedValue([
      { lifecycleTags: ['成熟客户'], behaviorTags: ['库存消化'], productCycleTags: ['临期库存适配'], evidence: ['客户近期对面膜类商品响应高'] },
    ]);

    const cards = await service.getCards(1, { type: 'product_expiry_clearance' });

    expect(cards).toHaveLength(1);
    expect(cards[0].offer).toMatchObject({
      promotionId: 51,
      promotionName: '临期商品消化券',
      label: '临期护理搭赠券',
    });
    expect(cards[0].primaryPromotion).toMatchObject({ promotionId: 51, fitLevel: 'high' });
    expect(cards[0].offerFitBreakdown.scenarioScore).toBe(100);
    expect(cards[0].recommendedActions[0]).toMatchObject({ promotionId: 51, promotionName: '临期商品消化券' });
    expect(cards[0].dataEvidence.join(' ')).toContain('权益匹配：临期商品消化券');
  });

  it('generates product replenishment cards only when stock is above safety stock', async () => {
    const purchaseDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    prisma.orderItem.findMany.mockImplementation(async (args: any) => {
      if (args.where?.itemType === 'product' && args.include?.order) {
        return [
          {
            itemId: 11,
            quantity: 1,
            order: { id: 90, customerId: 3, storeId: 1, createdAt: purchaseDate },
          },
        ];
      }
      return [];
    });
    prisma.product.findMany.mockResolvedValue([
      {
        id: 11,
        name: '保湿精华',
        unit: '瓶',
        costPrice: 80,
        retailPrice: 298,
        currentStock: 30,
        safetyStock: 5,
        category: { name: '精华' },
      },
    ]);
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 8, modelVersion: 'rules-v2' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { customerId: 3, marketingResponseScore: 75, repurchase30dScore: 70, churnScore: 20, reasonJson: [] },
    ]);

    const cards = await service.getCards(1, { type: 'product_replenishment' });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      recommendationType: 'product_replenishment',
      triggerType: 'product_replenishment',
      preferredMode: 'automation',
      targetCustomerIds: [3],
    });
    expect(cards[0].recommendedItems[0]).toMatchObject({ id: 11, name: '保湿精华' });
  });

  it('generates idle capacity cards with capacity evidence', async () => {
    const targetDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    prisma.schedule.findMany.mockResolvedValue([
      {
        id: 701,
        storeId: 1,
        beauticianId: 9,
        date: targetDate,
        startTime: '14:00',
        endTime: '17:00',
        beautician: {
          projectSkills: [
            { project: { id: 31, name: '水光护理', price: 398, type: { name: '补水护理' } } },
          ],
        },
      },
    ]);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 801, customerId: 5, projectId: 31, beauticianId: 9, date: targetDate, startTime: '14:00', endTime: '15:00' },
    ]);
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 9, modelVersion: 'rules-v2' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { customerId: 6, marketingResponseScore: 80, repurchase30dScore: 70, churnScore: 20, reasonJson: [] },
    ]);

    const cards = await service.getCards(1, { type: 'project_idle_capacity' });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      recommendationType: 'project_idle_capacity',
      triggerType: 'project_idle_capacity',
      source: 'capacity',
      preferredMode: 'activity',
      capacitySnapshot: {
        idleMinutes: 120,
        utilizationRate: 0.33,
        beauticianIds: [9],
        projectIds: [31],
      },
    });
    expect(cards[0].offer).toMatchObject({ type: 'low_peak_privilege' });
    expect(cards[0].dataEvidence.join(' ')).toContain('预约占用率');
  });

  it('matches idle capacity cards with low-peak privilege assets', async () => {
    const targetDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    prisma.promotion.findMany.mockResolvedValue([
      {
        id: 61,
        name: '低峰预约礼',
        type: 'low_peak_privilege',
        discountText: '低峰时段预约赠修护导入',
        scenario: 'project_idle_capacity',
        source: 'system',
        status: 'active',
        approvalStatus: 'approved',
        validDays: 7,
        audienceTags: ['低峰可约', '高响应客户'],
        applicableProjectIds: [31],
        applicableProductIds: [],
        metadata: {
          behaviorTags: ['美容师空档'],
          capacityTags: ['低峰可约'],
          preferredExecutionModes: ['activity'],
          channelTags: ['小程序', '门店跟进'],
        },
        grossMarginGuard: { usableTimeRangeRequired: true, stackable: false },
      },
    ]);
    prisma.schedule.findMany.mockResolvedValue([
      {
        id: 701,
        storeId: 1,
        beauticianId: 9,
        date: targetDate,
        startTime: '14:00',
        endTime: '17:00',
        beautician: {
          projectSkills: [
            { project: { id: 31, name: '水光护理', price: 398, type: { name: '补水护理' } } },
          ],
        },
      },
    ]);
    prisma.reservation.findMany.mockResolvedValue([
      { id: 801, customerId: 5, projectId: 31, beauticianId: 9, date: targetDate, startTime: '14:00', endTime: '15:00' },
    ]);
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 9, modelVersion: 'rules-v2' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { customerId: 6, marketingResponseScore: 80, repurchase30dScore: 70, churnScore: 20, reasonJson: [] },
    ]);
    profileService.buildProfiles.mockResolvedValue([
      { behaviorTags: ['高响应客户'], capacityTags: ['低峰可约'], evidence: ['客户常在工作日下午预约'] },
    ]);

    const cards = await service.getCards(1, { type: 'project_idle_capacity' });

    expect(cards).toHaveLength(1);
    expect(cards[0].offer).toMatchObject({
      promotionId: 61,
      promotionName: '低峰预约礼',
      label: '低峰时段预约赠修护导入',
    });
    expect(cards[0].primaryPromotion).toMatchObject({ promotionId: 61, fitLevel: 'high' });
    expect(cards[0].riskWarnings.join(' ')).not.toContain('低峰权益需要配置可用时段');
    expect(cards[0].dataEvidence.join(' ')).toContain('权益匹配：低峰预约礼');
  });

  it('generates project cycle due cards only when future capacity exists and future reservations are excluded', async () => {
    const serviceDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    prisma.orderItem.findMany.mockImplementation(async (args: any) => {
      if (args.where?.itemType === 'project' && args.include?.order) {
        return [
          { itemId: 41, order: { id: 101, customerId: 10, storeId: 1, createdAt: serviceDate } },
          { itemId: 41, order: { id: 102, customerId: 11, storeId: 1, createdAt: serviceDate } },
        ];
      }
      return [];
    });
    prisma.project.findMany.mockResolvedValue([
      { id: 41, name: '补水护理', price: 480, type: { name: '基础面护' } },
    ]);
    prisma.reservation.findMany.mockImplementation(async (args: any) => {
      if (args.select?.customerId && args.select?.projectId && !args.select?.startTime) {
        return [{ customerId: 11, projectId: 41 }];
      }
      if (args.select?.startTime) {
        return [];
      }
      return [];
    });
    prisma.schedule.findMany.mockResolvedValue([
      {
        id: 901,
        storeId: 1,
        beauticianId: 12,
        date: futureDate,
        startTime: '14:00',
        endTime: '17:00',
        beautician: { projectSkills: [{ projectId: 41, certified: true }] },
      },
    ]);
    prisma.predictionRun.findFirst.mockResolvedValue({ id: 10, modelVersion: 'rules-v2' });
    prisma.customerPredictionSnapshot.findMany.mockResolvedValue([
      { customerId: 10, marketingResponseScore: 72, repurchase30dScore: 76, churnScore: 20, reasonJson: [] },
      { customerId: 11, marketingResponseScore: 74, repurchase30dScore: 78, churnScore: 20, reasonJson: [] },
    ]);

    const cards = await service.getCards(1, { type: 'project_cycle_due' });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      recommendationType: 'project_cycle_due',
      triggerType: 'care_cycle',
      source: 'project',
      preferredMode: 'automation',
      targetCustomerIds: [10],
      capacitySnapshot: {
        idleMinutes: 180,
        beauticianIds: [12],
        projectIds: [41],
      },
    });
    expect(cards[0].targetCustomerIds).not.toContain(11);
    expect(cards[0].dataEvidence.join(' ')).toContain('未来 7 天同项目可预约工时');
  });
});
