import type { MarketingActivity } from '@/types';

export interface MarketingStrategy {
  id: number;
  name: string;
  description: string;
  executionType: '自动' | '手动';
  executionTime: string;
  status: '启用' | '停用' | '草稿';
}

export interface StrategyEffectSummary {
  id: number;
  name: string;
  status: '启用' | '停用' | '草稿';
  triggerCount: number;
  reachedCount: number;
  couponUsedRate: string;
  returnRate: string;
  revenue: number;
  lastExecuted: string;
}

const MOCK_STRATEGY_EFFECTS: StrategyEffectSummary[] = [
  { id: 1, name: '沉睡客户唤醒计划', status: '启用', triggerCount: 48, reachedCount: 156, couponUsedRate: '32%', returnRate: '28%', revenue: 45600, lastExecuted: '2026-03-31' },
  { id: 2, name: '生日专属关怀', status: '启用', triggerCount: 78, reachedCount: 78, couponUsedRate: '58%', returnRate: '55%', revenue: 62400, lastExecuted: '2026-03-31' },
  { id: 3, name: '春季焕肤推荐', status: '启用', triggerCount: 65, reachedCount: 230, couponUsedRate: '38%', returnRate: '35%', revenue: 89200, lastExecuted: '2026-03-25' },
  { id: 4, name: '高消费客户维护', status: '启用', triggerCount: 15, reachedCount: 45, couponUsedRate: '65%', returnRate: '62%', revenue: 128000, lastExecuted: '2026-03-15' },
  { id: 5, name: '母亲节感恩活动', status: '草稿', triggerCount: 0, reachedCount: 0, couponUsedRate: '0%', returnRate: '0%', revenue: 0, lastExecuted: '-' },
  { id: 6, name: '新客首次体验', status: '停用', triggerCount: 0, reachedCount: 34, couponUsedRate: '22%', returnRate: '18%', revenue: 12800, lastExecuted: '2026-03-20' },
];

export async function mockGetStrategyEffects(): Promise<StrategyEffectSummary[]> {
  return [...MOCK_STRATEGY_EFFECTS];
}

let strategyIdCounter = 100;

export async function mockCreateStrategy(data: { name: string; description: string; executionType: string; executionTime: string }): Promise<MarketingStrategy> {
  const strategy: MarketingStrategy = {
    id: strategyIdCounter++,
    name: data.name,
    description: data.description,
    executionType: data.executionType as '自动' | '手动',
    executionTime: data.executionTime,
    status: '启用',
  };
  return strategy;
}

export async function mockSaveStrategyDraft(data: { name: string; description: string; executionType: string; executionTime: string }): Promise<MarketingStrategy> {
  const strategy: MarketingStrategy = {
    id: strategyIdCounter++,
    name: data.name,
    description: data.description,
    executionType: data.executionType as '自动' | '手动',
    executionTime: data.executionTime,
    status: '草稿',
  };
  return strategy;
}

const MOCK_ACTIVITIES: MarketingActivity[] = [
  {
    id: 1,
    title: '双十一美容特惠',
    description: '全场护肤项目8折优惠',
    image: '',
    status: '进行中',
    participants: 156,
    conversion: '32%',
    startDate: '2024-11-01',
    endDate: '2024-11-11',
    targetCustomers: '全部会员',
    discount: '8折',
    source: '手动创建',
    posterBg: '#FF6B9D',
    posterImage: 'https://images.unsplash.com/photo-1611169035510-f9af52e6dbe2?w=600',
    posterTitleColor: '#FFFFFF',
  },
  {
    id: 2,
    title: '新客首单立减',
    description: '新客户首次消费满200减50',
    image: '',
    status: '进行中',
    participants: 89,
    conversion: '45%',
    startDate: '2024-10-01',
    endDate: '2024-12-31',
    targetCustomers: '新客户',
    discount: '满200减50',
    source: '手动创建',
    posterBg: '#6B5CE7',
    posterImage: 'https://images.unsplash.com/photo-1527632911563-ee5b6d53465b?w=600',
    posterTitleColor: '#FFFFFF',
  },
  {
    id: 3,
    title: '圣诞节限定套餐',
    description: '圣诞限定美容套餐，含面部护理+身体SPA',
    image: '',
    status: '即将开始',
    participants: 0,
    conversion: '0%',
    startDate: '2024-12-20',
    endDate: '2024-12-26',
    targetCustomers: 'VIP会员',
    discount: '7折',
    source: '手动创建',
    posterBg: '#10B981',
    posterImage: 'https://images.unsplash.com/photo-1531299244174-d247dd4e5a66?w=600',
    posterTitleColor: '#FFFFFF',
  },
];

export async function mockGetMarketingActivities(): Promise<MarketingActivity[]> {
  return [...MOCK_ACTIVITIES];
}

export async function mockCreateMarketingActivity(
  data: Omit<MarketingActivity, 'id'>,
): Promise<MarketingActivity> {
  const newId = Math.max(...MOCK_ACTIVITIES.map((a) => a.id)) + 1;
  const activity: MarketingActivity = { ...data, id: newId };
  MOCK_ACTIVITIES.push(activity);
  return activity;
}

export async function mockUpdateMarketingActivity(
  id: number,
  data: Partial<MarketingActivity>,
): Promise<MarketingActivity> {
  const index = MOCK_ACTIVITIES.findIndex((a) => a.id === id);
  if (index === -1) throw new Error('营销活动不存在');
  MOCK_ACTIVITIES[index] = { ...MOCK_ACTIVITIES[index], ...data };
  return MOCK_ACTIVITIES[index];
}
