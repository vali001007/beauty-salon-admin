export interface Customer {
  id: number;
  storeId?: number;
  name: string;
  phone: string;
  gender: '男' | '女';
  age?: number;
  memberLevel: string;
  totalSpent: number;
  visitCount: number;
  lastVisitDate: string;
  tags: string[];
  source: string;
  storeName: string;
  createdAt: string;
  // Extended fields
  email?: string;
  landline?: string;
  wechat?: string;
  maritalStatus?: '未知' | '已婚' | '未婚';
  birthday?: string;
  height?: number;
  weight?: number;
  occupation?: string;
  workplace?: string;
  address?: string;
  hasAllergy?: '无' | '有';
  hasSurgery?: '无' | '有';
  skinType?: string;
  skinCondition?: string;
  remark?: string;
  cashBalance?: number;
  giftBalance?: number;
  totalBalance?: number;
  activeCustomerCardsCount?: number;
}

export interface CustomerCreatePayload {
  storeId?: number;
  storeName?: string;
  name: string;
  phone?: string;
  email?: string;
  landline?: string;
  wechat?: string;
  gender: '男' | '女';
  maritalStatus?: '未知' | '已婚' | '未婚';
  birthday?: string;
  age?: number;
  height?: number;
  weight?: number;
  occupation?: string;
  workplace?: string;
  address?: string;
  hasAllergy?: '无' | '有';
  hasSurgery?: '无' | '有';
  skinType?: string;
  skinCondition?: string;
  totalSpent?: number;
  memberLevel?: string;
  source?: string;
  lastVisitDate?: string;
  tags?: string[];
  remark?: string;
}

export type CustomerUpdatePayload = Partial<CustomerCreatePayload>;

export interface CustomerTag {
  id: number;
  name: string;
  color: string;
}

export interface CustomerConsumptionRecord {
  id: number;
  customerId: number;
  userName: string;
  consumeType: string;
  consumeContent: string;
  payMethod: string;
  amount: string;
  campaign: string;
  consumeTime: string;
}

export interface CustomerHealthProfile {
  id: number;
  customerId: number;
  photo: string;
  name: string;
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  allergyHistory: string;
  goals: string;
  recommendedCare: string;
  instrument: string;
  lastCheck: string;
}

export interface CustomerCardPortraitCardProject {
  projectName: string;
  timesPerCard: number;
}

export interface CustomerPurchasedCardPortrait {
  customerCardId: number;
  cardId: number;
  cardName: string;
  totalTimes: number;
  remainingTimes: number;
  usedTimes: number;
  paidAmount: number;
  discountAmount: number;
  giftTimes: number;
  status: string;
  expireTime: string;
  purchaseTime: string;
  operatorName?: string;
  projects: CustomerCardPortraitCardProject[];
}

export interface CustomerMissingCardPortrait {
  cardId: number;
  cardName: string;
  totalTimes: number;
  price: number;
  validDays: number;
  storeId?: number | null;
  storeName: string;
  projects: CustomerCardPortraitCardProject[];
}

export interface CustomerCardPortrait {
  customerId: number;
  customerName: string;
  customerPhone: string;
  storeId?: number;
  storeName: string;
  memberLevel: string;
  totalSpent: number;
  lastVisitDate: string;
  purchasedCards: CustomerPurchasedCardPortrait[];
  missingCards: CustomerMissingCardPortrait[];
  purchasedCount: number;
  missingCount: number;
}

export interface CustomerMiniappBehaviorSummary {
  totalCustomers: number;
  boundCustomers: number;
  activeCustomers7d: number;
  activeCustomers30d: number;
  avgEngagementScore: number;
  reservationIntentCount: number;
  marketingTouchCount: number;
  conversionCount: number;
  generatedAt: string;
  dataSource: 'derived_from_core_records' | 'miniapp_events';
}

export interface CustomerMiniappBehaviorFunnelItem {
  stage: string;
  count: number;
  rate: string;
}

export interface CustomerMiniappEntryModule {
  name: string;
  eventCount: number;
  customerCount: number;
  conversionHint: string;
}

export interface CustomerMiniappBehaviorSegment {
  label: string;
  customerCount: number;
  activeRate: string;
  avgScore: number;
  conversionRate: string;
  suggestion: string;
}

export interface CustomerMiniappBehaviorCustomer {
  customerId: number;
  name: string;
  phone?: string;
  storeName: string;
  lastActiveAt?: string;
  miniappStatus: '高活跃' | '有意向' | '低活跃' | '待绑定';
  visitCount: number;
  clickCount: number;
  reservationCount: number;
  orderCount: number;
  marketingTouchCount: number;
  conversionCount: number;
  engagementScore: number;
  intentLevel: '高' | '中' | '低';
  nextAction: string;
  evidence: string[];
}

export interface CustomerMiniappEventContractField {
  field: string;
  label: string;
  required: boolean;
}

export interface CustomerMiniappBehaviorAnalysis {
  summary: CustomerMiniappBehaviorSummary;
  funnel: CustomerMiniappBehaviorFunnelItem[];
  entryModules: CustomerMiniappEntryModule[];
  segments: CustomerMiniappBehaviorSegment[];
  customers: CustomerMiniappBehaviorCustomer[];
  eventContract: CustomerMiniappEventContractField[];
}

export interface CustomerProfileSegmentStats {
  segment: string;
  customerCount: number;
  percentage: string;
  avgSpend: string;
  totalSpend: string;
  spendContribution: string;
  avgAge: number;
  characteristics: string[];
  customerIds: number[];
}

export interface CustomerProfileSkinStats {
  skinType: string;
  customerCount: number;
  percentage: string;
  avgSpend: string;
  avgAge: string;
  totalSpend: string;
  spendContribution: string;
  skinFeatures: string[];
  customerIds: number[];
  trend: string;
}

export interface CustomerProfileBehaviorProfile {
  customerId: number;
  name: string;
  segment: string;
  skinType: string;
  visitFrequency: string;
  avgSpend: string;
  preferredService: string;
  promotionSensitivity: string;
  repurchaseRate: string;
  loyalty: string;
  seasonalTrend: string;
}

export interface CustomerProfilePredictionRow {
  customer: Customer;
  churnScore: number;
  churnLevel: string;
  repurchase30dScore: number;
  marketingResponseScore: number;
  ltvTier: string;
  ltv12m: number;
  reasons: string[];
  lifecycleStage?: string;
  lifecycleStageLabel?: string;
  opportunityTypes?: string[];
  opportunityTypeLabels?: string[];
  serviceCycleSummary?: Array<{ projectId?: number | null; nextDueAt?: string | null; cycleDays: number }>;
  fulfillmentRiskLabels?: string[];
  topLifecycleEvidence?: string[];
}

export interface CustomerProfileAnalytics {
  generatedAt: string;
  storeId?: number;
  totalCustomers: number;
  segmentStats: CustomerProfileSegmentStats[];
  skinStats: CustomerProfileSkinStats[];
  behaviorProfiles: CustomerProfileBehaviorProfile[];
  predictionRows: CustomerProfilePredictionRow[];
}

export interface CustomerProfileAnalyticsOverview {
  generatedAt: string;
  storeId?: number;
  totalCustomers: number;
}

export interface CustomerProfileSegmentAnalytics extends CustomerProfileAnalyticsOverview {
  segmentStats: CustomerProfileSegmentStats[];
}

export interface CustomerProfileSkinAnalytics extends CustomerProfileAnalyticsOverview {
  skinStats: CustomerProfileSkinStats[];
}

export interface CustomerProfileBehaviorAnalytics extends CustomerProfileAnalyticsOverview {
  items: CustomerProfileBehaviorProfile[];
  data?: CustomerProfileBehaviorProfile[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerProfilePredictionAnalytics extends CustomerProfileAnalyticsOverview {
  items: CustomerProfilePredictionRow[];
  data?: CustomerProfilePredictionRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerProfileBehaviorQuery {
  page?: number;
  pageSize?: number;
  segment?: string;
  skinType?: string;
}

export interface CustomerProfilePredictionQuery {
  page?: number;
  pageSize?: number;
}

export interface CustomerProfilePrediction {
  id: number;
  runId: number;
  churnScore: number;
  churnLevel: string;
  repurchase30dScore: number;
  marketingResponseScore: number;
  ltv6m: number;
  ltv12m: number;
  ltvTier: string;
  featureJson: Record<string, unknown>;
  reasonJson: Array<{ type?: string; label?: string; detail?: string; impact?: string; weight?: number }>;
  recommendedActionsJson: unknown;
  updatedAt: string;
}

export interface CustomerLifecycleSnapshot {
  id: number;
  storeId?: number;
  customerId?: number;
  predictionRunId?: number | null;
  predictionSnapshotId?: number | null;
  lifecycleStage: string;
  lifecycleStageLabel: string;
  ltvTier?: string | null;
  churnRiskLevel?: string | null;
  touchFatigueScore: number;
  assetSummary: Record<string, unknown>;
  servicePreference: Record<string, unknown>;
  evidence: string[];
  computedAt: string;
}

export interface CustomerOpportunity {
  id: number;
  storeId?: number;
  customerId: number;
  opportunityType: string;
  opportunityTypeLabel: string;
  priority: 'P0' | 'P1' | 'P2' | string;
  status: string;
  score: number;
  recommendedExecutionMode: string;
  recommendedChannels: Array<Record<string, unknown>>;
  recommendedOffer: Record<string, unknown> | null;
  recommendedItems: Array<Record<string, unknown>>;
  evidence: string[];
  fulfillment?: CustomerOpportunityFulfillmentCheck | null;
  attributionEventCount?: number;
  attributionEvents?: LifecycleAttributionEvent[];
  expiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerServiceCycleState {
  id: number;
  storeId?: number;
  customerId?: number;
  projectId?: number | null;
  lastServiceAt?: string | null;
  cycleDays: number;
  nextDueAt?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  evidence: string[];
  updatedAt: string;
}

export interface CustomerOpportunityFulfillmentCheck {
  id: number;
  opportunityId: number;
  inventoryReady: boolean;
  capacityReady: boolean;
  requiredProducts: Array<Record<string, unknown>>;
  capacitySnapshot: Record<string, unknown>;
  risks: Array<Record<string, unknown> | string>;
  checkedAt: string;
}

export interface LifecycleAttributionEvent {
  id: number;
  storeId?: number;
  customerId?: number;
  opportunityId?: number | null;
  recommendationKey?: string | null;
  eventType: string;
  sourceType: string;
  sourceId?: string | null;
  touchId?: number | null;
  orderId?: number | null;
  reservationId?: number | null;
  stockMovementId?: number | null;
  evidence: Record<string, unknown>;
  occurredAt: string;
}

export interface CustomerLifecycleRuleVersion {
  id: number;
  storeId?: number | null;
  ruleType: string;
  version: number;
  status: 'draft' | 'active' | 'archived' | 'rolled_back' | string;
  rolloutRatio: number;
  ruleJson: Record<string, unknown>;
  publishedAt?: string | null;
  publishedBy?: number | null;
  rollbackFromId?: number | null;
  changeLog?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerLifecycleQualitySnapshot {
  id: number;
  storeId: number;
  fieldCoverageRate: number;
  ruleHitRate: number;
  attributionCompletenessRate: number;
  fulfillmentReadyRate: number;
  metricsJson: Record<string, unknown>;
  computedAt: string;
}

export interface LifecycleBusinessPlan {
  id: number;
  storeId: number;
  planPeriod: string;
  title: string;
  status: 'draft' | 'waiting_approval' | 'approved' | 'rejected' | 'executed' | string;
  goalsJson: Record<string, unknown>;
  actionsJson: Array<Record<string, unknown>>;
  evidenceJson: Array<string> | Record<string, unknown>;
  approvalJson?: Record<string, unknown> | null;
  resultJson?: Record<string, unknown> | null;
  createdBy?: number | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  executedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerLifecycleContext {
  snapshot: CustomerLifecycleSnapshot | null;
  opportunities: CustomerOpportunity[];
  events: Array<Record<string, unknown>>;
  serviceCycles: CustomerServiceCycleState[];
  attributionEvents: LifecycleAttributionEvent[];
}

export interface CustomerProfile {
  customerId: number;
  storeId: number;
  generatedAt: string;
  basic: {
    name: string;
    phone?: string | null;
    gender?: string | null;
    age?: number | null;
    memberLevel?: string | null;
    source?: string | null;
    tags: string[];
    skinType?: string | null;
    skinCondition?: string | null;
    totalSpent: number;
    visitCount: number;
    lastVisitDate?: string | null;
  };
  health: {
    skinType?: string | null;
    skinStatus?: string | null;
    mainProblems?: string | null;
    allergyHistory?: string | null;
    goals?: string | null;
    recommendedCare?: string | null;
    instrument?: string | null;
    lastCheck?: string | null;
  } | null;
  consumption: {
    totalSpent: number;
    visitCount: number;
    lastVisitDate?: string | null;
    lastVisitDays?: number | null;
    avgSpentPerVisit: number;
    preferredProjects: Array<{ name: string; count: number }>;
    recentRecords: Array<{
      id: number;
      consumeType: string;
      consumeContent: string;
      payMethod?: string | null;
      amount: number;
      consumeTime: string;
    }>;
  };
  cards: {
    activeCards: Array<Record<string, unknown>>;
    expiringCards: Array<Record<string, unknown>>;
    usedUpCards: Array<Record<string, unknown>>;
  };
  prediction: CustomerProfilePrediction | null;
  lifecycle: CustomerLifecycleContext | null;
  touchHistory: Array<Record<string, unknown>>;
  recommendationEvents: Array<Record<string, unknown>>;
}
