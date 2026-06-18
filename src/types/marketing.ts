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
  predictionRunId?: string | number;
  audienceSnapshotId?: string | number;
  audienceSnapshotJson?: AudienceSnapshot;
  sourceSignalsJson?: Record<string, unknown> | string[];
  offerJson?: RecommendedOffer;
  primaryPromotionId?: number | null;
  promotionIdsJson?: number[];
  primaryPromotion?: {
    id: number;
    name: string;
    discountText: string;
    status?: string;
    approvalStatus?: string;
  } | null;
  recommendedItemsJson?: RecommendedItem[];
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
  source?: 'strategy' | 'association' | 'churn' | 'ltv' | 'inventory' | 'capacity' | 'product' | 'project';
  recommendationType?: 'product_expiry_clearance' | 'project_idle_capacity' | 'product_replenishment' | 'project_cycle_due' | string;
  recommendationKey?: string;
  predictionRunId?: number;
  modelVersion?: string;
  predictionType?: 'churn' | 'repurchase' | 'marketing_response' | 'ltv' | 'strategy';
  predictionRunFinishedAt?: string;
  dataEvidence?: string[];
  priority?: RecommendationPriority;
  executionModes?: RecommendationExecutionMode[];
  preferredMode?: RecommendationExecutionMode;
  modeReason?: string;
  recommendedChannels?: RecommendedChannel[];
  triggerRule?: RecommendedTriggerRule;
  recommendedActions?: RecommendedAction[];
  offer?: RecommendedOffer;
  primaryPromotion?: RecommendedPromotionMatch | null;
  alternativePromotions?: RecommendedPromotionMatch[];
  offerFitBreakdown?: RecommendationOfferFitBreakdown;
  recommendedItems?: RecommendedItem[];
  audienceSnapshot?: AudienceSnapshot;
  sourceSignals?: string[];
  totalCustomers?: number;
  triggerType?: MarketingTriggerType;
  preferAutoRule?: boolean;
  isFallback?: boolean;
  inventorySnapshot?: RecommendationInventorySnapshot;
  capacitySnapshot?: RecommendationCapacitySnapshot;
  expectedGrossProfit?: string;
  expectedLossAvoided?: string;
  riskWarnings?: string[];
  executionState?: RecommendationExecutionState;
}

export interface RecommendationActionExecutionState {
  done: boolean;
  count: number;
  lastAt?: string;
  label?: string;
  objectIds?: Array<number | string>;
}

export interface RecommendationExecutionState {
  automation: RecommendationActionExecutionState;
  activity: RecommendationActionExecutionState;
  followUp: RecommendationActionExecutionState;
}

export type RecommendationPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type RecommendationExecutionMode = 'activity' | 'automation' | 'advisor_task' | 'miniapp_slot' | 'transfer' | 'replenishment';

export interface RecommendationInventorySnapshot {
  productId: number;
  productName: string;
  batchId?: number;
  batchNo?: string;
  stock: number;
  daysToExpiry?: number;
  forecastSellThroughQty?: number;
  gapQty?: number;
  expectedLossAmount?: number;
}

export interface RecommendationCapacitySnapshot {
  dateRange: string;
  idleSlots: number;
  idleMinutes: number;
  utilizationRate: number;
  beauticianIds: number[];
  projectIds: number[];
}

export interface AudienceSnapshot {
  predictionRunId?: number;
  generatedAt: string;
  ruleSummary: string;
  customerIds: number[];
  totalCustomers: number;
  sampleReasons: Array<{
    customerId: number;
    reason: string;
    score: number;
  }>;
}

export interface RecommendedChannel {
  channel: 'sms' | 'miniapp' | 'wechat' | 'group' | 'store' | 'moments';
  label: string;
  reason: string;
  priority: RecommendationPriority;
}

export interface RecommendedTriggerRule {
  type: MarketingTriggerType;
  params: Record<string, MarketingParamValue>;
  defaultEditable: boolean;
  reason: string;
}

export interface RecommendedAction {
  type: MarketingAction['type'] | 'consultant_task';
  value: string;
  promotionId?: number;
  promotionName?: string;
  channel?: MarketingAction['channel'];
  reason: string;
}

export interface RecommendedOffer {
  type:
    | 'money_off'
    | 'percentage_off'
    | 'gift'
    | 'trial_price'
    | 'points'
    | 'member_privilege'
    | 'free_service'
    | 'bundle'
    | 'low_peak_privilege'
    | 'discount'
    | 'package_upgrade'
    | 'stored_value_bonus'
    | 'referral_reward'
    | 'group_deal';
  label: string;
  threshold?: number;
  amount?: number;
  discountRate?: number;
  validDays?: number;
  usableTimeRange?: string;
  reason: string;
  promotionId?: number;
  promotionName?: string;
  fitScore?: number;
  fitReason?: string;
  riskWarnings?: string[];
  draftSuggestion?: {
    name: string;
    type: string;
    discountText: string;
    reason: string;
  };
}

export interface RecommendationOfferFitBreakdown {
  scenarioScore?: number;
  audienceScore?: number;
  behaviorIntentScore?: number;
  itemFitScore?: number;
  timingUrgencyScore?: number;
  valueProtectionScore?: number;
  channelFitScore?: number;
  operationFitScore?: number;
  historicalEffectScore?: number;
  fatiguePenalty?: number;
  marginRiskPenalty?: number;
  conflictPenalty?: number;
}

export interface RecommendedPromotionMatch {
  promotionId: number;
  promotionName?: string;
  name: string;
  discountText: string;
  type: string;
  scenario?: string | null;
  source?: string;
  fitScore: number;
  fitLevel?: 'excellent' | 'good' | 'backup' | 'not_recommended';
  fitReason?: string;
  fitReasons?: string[];
  riskWarnings?: string[];
  scoreBreakdown?: RecommendationOfferFitBreakdown;
  estimatedCost?: number;
  promotion?: Record<string, unknown>;
}

export interface RecommendedItem {
  type: 'project' | 'product' | 'card' | 'package';
  id?: number;
  name: string;
  category?: string;
  price?: number;
  activityPrice?: number;
  reason: string;
  confidence: number;
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

export interface InvitationCandidate {
  customerId: number;
  customerName: string;
  memberLevel?: string;
  phoneMasked?: string;
  skinType?: string;
  lastVisitDate?: string;
  preferredProjectNames: string[];
  reason: string;
  evidence: string[];
  priority: RecommendationPriority | 'high' | 'medium' | 'low';
}

export interface InvitationCandidateResponse {
  items: InvitationCandidate[];
  generatedAt: string;
  source: 'prediction' | 'customer_profile';
  emptyReason?: string;
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

export type MarketingEffectObjectType = 'activity' | 'auto' | 'page' | 'promotion' | 'recommendation' | 'glow';

export interface UnifiedMarketingEffectItem {
  id: string;
  objectId: number | string;
  objectType: MarketingEffectObjectType;
  objectTypeLabel: string;
  objectName: string;
  status: string;
  exposureCount: number;
  clickCount: number;
  conversionCount: number;
  revenue: number;
  cost: number;
  roi: string;
  conversionRate: string;
  dateRange?: string;
  lastEventAt?: string;
  detailPath?: string;
  emptyReason?: string;
  metricsSource: string;
  relatedObjectName?: string;
  audienceName?: string;
  promotionName?: string;
  channelName?: string;
  recommendationAttribution?: {
    sourceRecommendationId: string;
    recommendationKey?: string;
    recommendationType?: string;
    originalPromotion?: Record<string, unknown> | null;
    selectedPromotion?: Record<string, unknown> | null;
    promotionSwitched: boolean;
    originalOffer?: Record<string, unknown> | null;
    selectedOffer?: Record<string, unknown> | null;
  };
}

export interface UnifiedMarketingEffectSummary {
  totalObjects: number;
  exposureCount: number;
  clickCount: number;
  conversionCount: number;
  revenue: number;
  cost: number;
  roi: string;
}

export interface UnifiedMarketingEffectsResponse {
  items: UnifiedMarketingEffectItem[];
  summary: UnifiedMarketingEffectSummary;
  emptyReasons: Partial<Record<MarketingEffectObjectType, string>>;
  generatedAt: string;
}

export type MarketingTriggerType =
  | 'birthday'
  | 'holiday'
  | 'seasonal'
  | 'care_cycle'
  | 'card_expiry'
  | 'coupon_expiry'
  | 'coupon_claimed_unused'
  | 'browse_abandonment'
  | 'booking_abandonment'
  | 'appointment_reminder'
  | 'no_show_recovery'
  | 'package_remaining'
  | 'product_replenishment'
  | 'product_expiry_clearance'
  | 'project_idle_capacity'
  | 'project_cycle_due'
  | 'seasonal_skin_care'
  | 'holiday_campaign'
  | 'vip_privilege_care'
  | 'referral_campaign'
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
  priority: RecommendationPriority;
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
  promotionId?: number;
  promotionName?: string;
  channel?: 'sms' | 'miniapp' | 'wechat' | 'group' | 'store' | 'moments';
  contentTemplate?: string;
  attribution?: Record<string, unknown>;
}

export interface MarketingSchedule {
  type: 'daily' | 'weekly' | 'monthly' | 'date_range' | 'realtime';
  time?: string;
  weekdays?: number[];
  startDate?: string;
  endDate?: string;
  attribution?: Record<string, unknown>;
  frequencyCap?: Record<string, unknown>;
}

export interface MarketingAutomationStrategy {
  id: number;
  name: string;
  description: string;
  status: MarketingStrategyStatus;
  executionType: 'auto' | 'manual';
  source?: 'manual' | 'rule_library' | 'recommendation';
  ruleTemplateId?: number;
  ruleTemplateVersion?: string;
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

export type MarketingRuleTemplateSource = 'system' | 'store';
export type MarketingRuleTemplateCategory = 'time' | 'behavior' | 'attribute';
export type MarketingRuleTemplateStatus = 'recommended' | 'enabled' | 'disabled' | 'draft' | 'archived';

export interface MarketingRuleFrequencyCap {
  sameCustomerDays?: number;
  sameChannelDays?: number;
  maxTouchesPerDay?: number;
}

export interface MarketingRuleEffectSummary {
  ruleTemplateId: number;
  strategyCount: number;
  activeStrategyCount: number;
  reachedCount: number;
  convertedCount: number;
  conversionRate: string;
  returnCount: number;
  revenue: number;
  cost: number;
  roi: string;
  lastExecutedAt?: string;
}

export interface MarketingRuleTemplate {
  id: number;
  code: string;
  name: string;
  description?: string;
  source: MarketingRuleTemplateSource;
  category: MarketingRuleTemplateCategory;
  categoryLabel: MarketingTriggerCategory;
  scenario: string;
  priority: RecommendationPriority;
  status: MarketingRuleTemplateStatus;
  version: string;
  baseTemplateId?: number;
  storeId?: number;
  triggerType: MarketingTriggerType;
  paramSchema: MarketingTriggerParamSchema[];
  defaultParams: Record<string, MarketingParamValue>;
  recommendedActions: MarketingAction[];
  scheduleDefault: MarketingSchedule;
  frequencyCap: MarketingRuleFrequencyCap;
  dataDependencies: string[];
  recommendationReason?: string;
  createdBy?: number;
  createdAt: string;
  updatedAt: string;
  effect?: MarketingRuleEffectSummary;
}

export type MarketingRuleTemplateInput = Partial<
  Pick<
    MarketingRuleTemplate,
    | 'code'
    | 'name'
    | 'description'
    | 'category'
    | 'categoryLabel'
    | 'scenario'
    | 'priority'
    | 'status'
    | 'baseTemplateId'
    | 'storeId'
    | 'triggerType'
    | 'paramSchema'
    | 'defaultParams'
    | 'recommendedActions'
    | 'scheduleDefault'
    | 'frequencyCap'
    | 'dataDependencies'
    | 'recommendationReason'
    | 'createdBy'
  >
>;

export interface MarketingRuleTemplateQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  source?: 'all' | MarketingRuleTemplateSource;
  category?: 'all' | MarketingRuleTemplateCategory;
  scenario?: string;
  priority?: 'all' | RecommendationPriority | 'urgent' | 'recommended' | 'opportunity';
  status?: 'all' | MarketingRuleTemplateStatus;
}

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
