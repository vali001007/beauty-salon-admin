export interface ProjectType {
  id: number;
  name: string;
  description: string;
  status: '启用' | '停用';
  createTime: string;
}

export interface BeauticianLevel {
  id: number;
  name: string;
  status: '可用' | '停用';
  createTime: string;
}

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
