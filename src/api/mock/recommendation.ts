import type { BehaviorProfile } from '@/utils/customerSegmentation';
import { computeBehaviorProfiles } from '@/utils/customerSegmentation';
import { generateRecommendations, type Recommendation } from '@/utils/marketingRecommendation';
import rawCustomers from './data/customers.json';
import rawConsumptionRecords from './data/consumption-records.json';
import rawHealthProfiles from './data/health-profiles.json';

const customers = (rawCustomers as any[]).map((customer) => ({ ...customer, tags: customer.tags || [] }));
const consumptionRecords = rawConsumptionRecords as any[];
const healthProfiles = rawHealthProfiles as any[];

export async function mockGetMarketingRecommendations(): Promise<Recommendation[]> {
  return generateRecommendations(customers, consumptionRecords, healthProfiles).map((item) => ({
    ...item,
    predictionRunId: 1,
    modelVersion: 'rules-v1',
    predictionType: item.source === 'churn' ? 'churn' : item.source === 'ltv' ? 'ltv' : item.category === 'high-conversion' ? 'repurchase' : 'marketing_response',
    predictionRunFinishedAt: '2026-05-31T09:31:00.000Z',
    dataEvidence: item.dataEvidence || ['基于 rules-v1 预测快照生成', `目标客户 ${item.targetCount} 人`],
  }));
}

export async function mockGetMarketingRecommendationAudience(recommendationId: number): Promise<BehaviorProfile[]> {
  const recommendations = await mockGetMarketingRecommendations();
  const target = recommendations.find((item) => item.id === recommendationId);
  if (!target) throw new Error('推荐不存在');

  const behaviorProfiles = computeBehaviorProfiles(customers, consumptionRecords, healthProfiles);
  return behaviorProfiles.filter((profile) => target.targetCustomerIds.includes(profile.customerId));
}

export async function mockCreateRecommendation(data: Omit<Recommendation, 'id'>): Promise<Recommendation> {
  return { ...data, id: Date.now() } as Recommendation;
}

export async function mockUpdateRecommendation(id: number, data: Partial<Recommendation>): Promise<Recommendation> {
  const recommendations = await mockGetMarketingRecommendations();
  const target = recommendations.find((item) => item.id === id);
  if (!target) throw new Error('推荐不存在');
  return { ...target, ...data } as Recommendation;
}

export async function mockDeleteRecommendation(id: number): Promise<void> {
  const recommendations = await mockGetMarketingRecommendations();
  const target = recommendations.find((item) => item.id === id);
  if (!target) throw new Error('推荐不存在');
}
