import type { ActivityPageSchema } from './ai';

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
  pageSchema?: ActivityPageSchema;
  sourceRecommendationId?: string | number;
  aiGenerationId?: string;
  publishStatus?: 'draft' | 'published' | 'offline';
  publishedAt?: string;
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
  targetCount?: number;
  targetCustomerIds?: number[];
  expectedConversion: string;
  expectedRevenue: string;
  strategy: string;
  discount: string;
  duration: string;
  matchScore: number;
  image: string;
  tags: string[];
  category: string;
  source?: 'strategy' | 'association' | 'churn' | 'ltv';
  predictionRunId?: number;
  modelVersion?: string;
  predictionType?: 'churn' | 'repurchase' | 'marketing_response' | 'ltv' | 'strategy';
  predictionRunFinishedAt?: string;
  dataEvidence?: string[];
}

export interface PredictionReason {
  type: 'churn' | 'repurchase' | 'marketing_response' | 'ltv';
  label: string;
  detail: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight?: number;
}

export interface CustomerPredictionSnapshot {
  id: number;
  runId: number;
  customerId: number;
  storeId: number;
  modelVersion: string;
  churnScore: number;
  churnLevel: '低' | '中' | '高' | '极高' | string;
  repurchase30dScore: number;
  marketingResponseScore: number;
  ltv6m: number;
  ltv12m: number;
  ltvTier: '铂金' | '黄金' | '白银' | '青铜' | string;
  featureJson: Record<string, unknown>;
  reasonJson: PredictionReason[];
  recommendedActionsJson: string[];
  createdAt: string;
  customer?: {
    id: number;
    name: string;
    phone?: string;
    memberLevel?: string;
    totalSpent?: number;
    visitCount?: number;
    lastVisitDate?: string;
  };
}

export interface PredictionRunSummary {
  run: {
    id: number;
    storeId?: number;
    modelVersion: string;
    status: string;
    startedAt: string;
    finishedAt?: string;
    customerCount: number;
    summaryJson?: Record<string, unknown>;
  };
  summary: {
    modelVersion?: string;
    customerCount?: number;
    churnDistribution?: Array<{ label: string; count: number }>;
    repurchaseDistribution?: Array<{ label: string; count: number }>;
    marketingResponseDistribution?: Array<{ label: string; count: number }>;
    ltvDistribution?: Array<{ label: string; count: number }>;
    avgChurnScore?: number;
    avgRepurchase30dScore?: number;
    avgMarketingResponseScore?: number;
    expectedLtv6m?: number;
    expectedLtv12m?: number;
  };
}

export type MarketingTriggerType =
  | 'birthday'
  | 'holiday'
  | 'seasonal'
  | 'care_cycle'
  | 'card_expiry'
  | 'last_visit'
  | 'consumption'
  | 'visit_frequency'
  | 'visit_gap'
  | 'service_interest'
  | 'dormant'
  | 'member_level'
  | 'new_customer'
  | 'skin_type'
  | 'age_range';

export type MarketingTriggerCategory = '时间触发' | '行为触发' | '属性触发';
export type MarketingParameterSource = 'system_default' | 'customized';
export type MarketingRuleRelation = 'AND' | 'OR';
export type MarketingStrategyStatus = 'draft' | 'enabled' | 'paused' | 'archived';

export type MarketingParamValue = string | number | boolean | string[] | number[];

export interface MarketingTriggerParamSchema {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select' | 'multi_select' | 'boolean' | 'date_range';
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  suffix?: string;
}

export interface MarketingTriggerOption {
  type: MarketingTriggerType;
  category: MarketingTriggerCategory;
  label: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2';
  paramSchema: MarketingTriggerParamSchema[];
  defaultParams: Record<string, MarketingParamValue>;
}

export interface MarketingTriggerRule {
  type: MarketingTriggerType;
  params: Record<string, MarketingParamValue>;
  parameterSource: MarketingParameterSource;
}

export interface MarketingAction {
  type: 'coupon' | 'discount' | 'gift' | 'points' | 'sms' | 'push' | 'wechat' | 'miniapp';
  value: string;
  channel?: 'sms' | 'miniapp' | 'wechat' | 'group' | 'store' | 'moments';
  contentTemplate?: string;
}

export interface MarketingSchedule {
  type: 'daily' | 'weekly' | 'monthly' | 'date_range' | 'realtime';
  time?: string;
  weekdays?: number[];
  startDate?: string;
  endDate?: string;
}

export interface MarketingAutomationStrategy {
  id: number;
  name: string;
  description: string;
  status: MarketingStrategyStatus;
  executionType: 'auto' | 'manual';
  schedule: MarketingSchedule;
  triggerRules: MarketingTriggerRule[];
  ruleRelation: MarketingRuleRelation;
  actions: MarketingAction[];
  targetCount: number;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
}

export type MarketingStrategyInput = Omit<
  MarketingAutomationStrategy,
  'id' | 'status' | 'targetCount' | 'createdAt' | 'updatedAt' | 'lastExecutedAt'
>;

export interface AudiencePreviewCustomer {
  id: number;
  name: string;
  phone: string;
  storeName?: string;
  memberLevel: string;
  totalSpent: number;
  lastVisitDate?: string;
  reason: string;
  churnScore?: number;
  repurchase30dScore?: number;
  marketingResponseScore?: number;
  ltvTier?: string;
  predictedConversionScore?: number;
  predictedRevenue?: number;
}

export interface AudiencePreview {
  total: number;
  estimatedCount?: number;
  totalCustomers?: number;
  estimatedReachedCount?: number;
  estimatedConvertedCount?: number;
  estimatedRevenue?: number;
  samples: AudiencePreviewCustomer[];
  ruleRelation: MarketingRuleRelation;
  generatedAt: string;
}

export interface MarketingAutomationExecution {
  id: number;
  strategyId: number;
  strategyName: string;
  status: 'success' | 'partial_failed' | 'failed' | 'running' | 'completed';
  triggeredCount: number;
  reachedCount: number;
  channel: string;
  executedAt: string;
  message?: string;
  touches?: MarketingAutomationTouchEffect[];
}

export interface MarketingAutomationTouchEffect {
  id: number;
  customerId: number;
  customerName?: string;
  predictionSnapshotId?: number;
  predictedConversionScore: number;
  predictedRevenue: number;
  channel?: string;
  status: 'reached' | 'converted' | 'failed' | string;
  touchedAt: string;
  convertedAt?: string;
  conversionType?: string;
  actualRevenue?: number;
  attributionWindowDays: number;
}

export interface MarketingAutomationEffect {
  strategyId: number;
  strategyName: string;
  reachedCount: number;
  conversionRate: string;
  returnRate: string;
  revenue: number;
  cost: number;
  roi: string;
  predictedConvertedCount?: number;
  actualConvertedCount?: number;
  predictedConversionRate?: string;
  actualConversionRate?: string;
  predictedRevenue?: number;
  actualRevenue?: number;
  revenueDeviation?: number;
}
