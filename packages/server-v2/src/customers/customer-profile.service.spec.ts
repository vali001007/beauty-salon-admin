import { CustomerProfileService } from './customer-profile.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CustomerProfileService', () => {
  it('includes lifecycle context when lifecycle snapshots are available', async () => {
    const prisma: any = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          storeId: 1,
          name: '王女士',
          phone: '13800000000',
          memberLevel: '黄金会员',
          tags: [],
          totalSpent: 10000,
          visitCount: 8,
          lastVisitDate: new Date('2026-07-01T00:00:00.000Z'),
          customerCards: [],
          consumptionRecords: [],
          healthProfile: null,
        }),
      },
      customerPredictionSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      marketingAutomationTouch: { findMany: jest.fn().mockResolvedValue([]) },
      recommendationEvent: { findMany: jest.fn().mockResolvedValue([]) },
      customerLifecycleSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          lifecycleStage: 'member',
          ltvTier: '黄金',
          churnRiskLevel: '低',
          touchFatigueScore: 0.2,
          assetSummaryJson: { activeCardCount: 1 },
          servicePreferenceJson: { preferredProjects: [] },
          evidenceJson: ['客户有有效卡项'],
          computedAt: new Date('2026-07-08T00:00:00.000Z'),
        }),
      },
      customerOpportunity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 20,
            opportunityType: 'care_cycle_due',
            priority: 'P1',
            status: 'open',
            score: 80,
            recommendedExecutionMode: 'automation',
            recommendedChannelsJson: [],
            recommendedOfferJson: null,
            recommendedItemsJson: [],
            evidenceJson: ['护理周期到期'],
            expiresAt: null,
          },
        ]),
      },
      customerLifecycleEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CustomerProfileService(prisma as PrismaService);

    const result = await service.getCustomerProfile(1);

    expect(result.lifecycle?.snapshot?.lifecycleStageLabel).toBe('会员');
    expect(result.lifecycle?.opportunities[0]).toMatchObject({ opportunityTypeLabel: '护理周期到期' });
  });

  it('returns null lifecycle context when lifecycle tables are unavailable', async () => {
    const prisma: any = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          storeId: 1,
          name: '王女士',
          tags: [],
          totalSpent: 0,
          visitCount: 0,
          customerCards: [],
          consumptionRecords: [],
          healthProfile: null,
        }),
      },
      customerPredictionSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      marketingAutomationTouch: { findMany: jest.fn().mockResolvedValue([]) },
      recommendationEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CustomerProfileService(prisma as PrismaService);

    const result = await service.getCustomerProfile(1);

    expect(result.lifecycle).toBeNull();
  });
});
