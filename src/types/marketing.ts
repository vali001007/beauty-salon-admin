export interface MarketingActivity {
  id: number;
  title: string;
  description: string;
  image: string;
  status: '进行中' | '即将开始' | '已结束' | '草稿';
  participants: number;
  conversion: string;
  startDate: string;
  endDate: string;
  targetCustomers: string;
  discount: string;
  source?: '手动创建' | '策略自动创建';
  strategyName?: string;
  posterBg?: string;
  posterImage?: string;
  posterTitleColor?: string;
}

export interface MarketingTemplate {
  id: number;
  name: string;
  description: string;
  icon: string;
  usage: number;
  categories: string[];
}

export interface MarketingRecommendation {
  id: number;
  title: string;
  reason: string;
  targetCustomers: string;
  expectedConversion: string;
  expectedRevenue: string;
  strategy: string;
  discount: string;
  duration: string;
  matchScore: number;
  image: string;
  tags: string[];
  category: string;
}
