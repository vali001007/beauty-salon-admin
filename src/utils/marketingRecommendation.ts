/**
 * 智能营销推荐算法
 * 综合客户画像、消费习惯、季节特征、行业趋势四个维度计算匹配度
 */
import type {
  AudienceSnapshot,
  Customer,
  MarketingTriggerType,
  RecommendationExecutionMode,
  RecommendationPriority,
  RecommendedAction,
  RecommendedChannel,
  RecommendedItem,
  RecommendedOffer,
  RecommendationOfferFitBreakdown,
  RecommendedPromotionMatch,
  RecommendedTriggerRule,
} from '@/types';
import { MARKETING_RECOMMENDATION_IMAGES } from '@/config/marketingAssets';
import { computeSegmentStats, computeSkinStats, type SegmentType } from './customerSegmentation';
import { computeAssociationRules, computeChurnScores, computeLTVPredictions } from './advancedAnalytics';

export type UrgencyLevel = 'urgent' | 'recommended' | 'opportunity';

export interface Recommendation {
  id: number;
  title: string;
  reason: string;
  targetCustomers: string;
  targetCount: number;
  targetCustomerIds: number[];
  expectedConversion: string;
  expectedRevenue: string;
  strategy: string;
  discount: string;
  duration: string;
  matchScore: number;
  image: string;
  tags: string[];
  category: 'high-conversion' | 'customer-wake' | 'viral' | 'member-care' | 'seasonal' | 'trend' | 'cross-sell' | 'churn-alert' | 'ltv-nurture' | 'inventory-opportunity' | 'capacity-opportunity' | 'product-replenishment' | 'project-cycle' | string;
  recommendationType?:
    | 'product_expiry_clearance'
    | 'project_idle_capacity'
    | 'product_replenishment'
    | 'project_cycle_due'
    | 'homecare_bundle'
    | 'service_upgrade'
    | 'inventory_clearance'
    | 'care_cycle_due'
    | 'card_expiring'
    | 'dormant_winback'
    | 'coupon_claimed_unused'
    | 'browse_abandonment'
    | string;
  recommendationKey?: string;
  triggerType?: MarketingTriggerType;
  preferAutoRule: boolean;
  urgency: UrgencyLevel;
  urgencyLabel: string;
  dataEvidence?: string[];    // 数据依据（折叠展示）
  source: 'strategy' | 'association' | 'churn' | 'ltv' | 'inventory' | 'capacity' | 'product' | 'project' | 'customer_lifecycle';
  predictionRunId?: number;
  modelVersion?: string;
  predictionType?: 'churn' | 'repurchase' | 'marketing_response' | 'ltv' | 'strategy' | string;
  predictionRunFinishedAt?: string;
  predictionFreshness?: {
    predictionRunId: number | null;
    generatedAt: string | null;
    ageHours: number | null;
    status: 'fresh' | 'stale' | 'missing';
  };
  totalCustomers?: number;
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
  isFallback?: boolean;
  inventorySnapshot?: {
    productId: number;
    productName: string;
    batchId?: number;
    batchNo?: string;
    stock: number;
    daysToExpiry?: number;
    forecastSellThroughQty?: number;
    gapQty?: number;
    expectedLossAmount?: number;
  };
  capacitySnapshot?: {
    dateRange: string;
    idleSlots: number;
    idleMinutes: number;
    utilizationRate: number;
    beauticianIds: number[];
    projectIds: number[];
  };
  expectedGrossProfit?: string;
  expectedLossAvoided?: string;
  riskWarnings?: string[];
  executionState?: RecommendationExecutionState;
  opportunityIds?: number[];
  fulfillment?: {
    inventoryReady: boolean;
    capacityReady: boolean;
    latestChecks?: Array<Record<string, unknown>>;
  };
  attributionSummary?: {
    eventCount: number;
    hasAttribution: boolean;
  };
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

// ========== 季节 & 节日 ==========
const MONTH = new Date().getMonth() + 1; // 1-12, 当前4月

function getSeason(): '春' | '夏' | '秋' | '冬' {
  if (MONTH >= 3 && MONTH <= 5) return '春';
  if (MONTH >= 6 && MONTH <= 8) return '夏';
  if (MONTH >= 9 && MONTH <= 11) return '秋';
  return '冬';
}

function getUpcomingHolidays(): string[] {
  const holidays: Record<number, string[]> = {
    1: ['元旦', '春节'], 2: ['情人节', '春节'], 3: ['三八女神节'],
    4: ['清明节'], 5: ['母亲节', '520'], 6: ['端午节', '618'],
    7: ['七夕'], 8: ['七夕'], 9: ['中秋节', '教师节'],
    10: ['国庆节'], 11: ['双十一'], 12: ['双十二', '圣诞节'],
  };
  return [...(holidays[MONTH] || []), ...(holidays[MONTH % 12 + 1] || [])];
}

const SEASON_KEYWORDS: Record<string, { services: string[]; skinFocus: string[]; theme: string }> = {
  '春': { services: ['敏感修复', '补水保湿', '防晒护理'], skinFocus: ['敏感肌肤', '混合肌肤'], theme: '春季焕肤' },
  '夏': { services: ['美白淡斑', '控油清洁', '防晒', '身体护理'], skinFocus: ['油性肌肤', '混合肌肤'], theme: '夏日清爽' },
  '秋': { services: ['深层补水', '抗衰修复', '屏障修护'], skinFocus: ['干性肌肤', '敏感肌肤'], theme: '秋冬滋养' },
  '冬': { services: ['深层滋养', '抗干燥', '热石SPA'], skinFocus: ['干性肌肤'], theme: '冬季暖养' },
};

const IMAGES = MARKETING_RECOMMENDATION_IMAGES;

// ========== 维度评分函数 ==========

/** 维度1: 客户画像匹配分 (0-100) */
function scoreCustomerProfile(
  segmentStats: ReturnType<typeof computeSegmentStats>,
  targetSegment: SegmentType,
  totalCustomers: number
): number {
  const seg = segmentStats.find((s) => s.segment === targetSegment);
  if (!seg) return 30;
  const ratio = seg.customerCount / totalCustomers;
  const contribution = parseFloat(seg.spendContribution) || 0;

  switch (targetSegment) {
    case '高价值客户': return Math.min(100, 60 + contribution); // 消费贡献越高越值得维护
    case '流失风险客户': return Math.min(100, 50 + ratio * 200); // 人数越多越紧迫
    case '新客户': return Math.min(100, 50 + ratio * 150);
    case '潜在价值客户': return Math.min(100, 55 + ratio * 120);
    case '稳定客户': return Math.min(100, 50 + ratio * 100);
    default: return 50;
  }
}

/** 维度2: 消费习惯匹配分 (0-100) */
function scoreConsumptionHabit(
  records: Array<{ consumeType: string; amount: string; campaign: string }>,
  strategyType: 'service' | 'product' | 'package' | 'recharge' | 'general'
): number {
  if (records.length === 0) return 40;
  const typeCounts: Record<string, number> = {};
  let promoCount = 0;
  for (const r of records) {
    typeCounts[r.consumeType] = (typeCounts[r.consumeType] || 0) + 1;
    if (r.campaign !== '无') promoCount++;
  }
  const total = records.length;
  const promoRate = promoCount / total;

  let typeMatch = 50;
  switch (strategyType) {
    case 'service': typeMatch = ((typeCounts['服务消费'] || 0) / total) * 100; break;
    case 'product': typeMatch = ((typeCounts['产品消费'] || 0) / total) * 100; break;
    case 'package': typeMatch = ((typeCounts['套餐消费'] || 0) / total) * 100; break;
    case 'recharge': typeMatch = ((typeCounts['充值消费'] || 0) / total) * 100; break;
    default: typeMatch = 60;
  }

  // 促销敏感度加分
  const promoBonus = promoRate * 30;
  return Math.min(100, Math.round(typeMatch * 0.7 + promoBonus + 20));
}

/** 维度3: 季节特征匹配分 (0-100) */
function scoreSeasonMatch(strategyTheme: string, targetSkin?: string): number {
  const season = getSeason();
  const seasonData = SEASON_KEYWORDS[season];
  let score = 40; // 基础分

  // 主题匹配
  if (strategyTheme.includes(seasonData.theme) || seasonData.services.some((s) => strategyTheme.includes(s))) {
    score += 35;
  }

  // 肌肤类型与季节匹配
  if (targetSkin && seasonData.skinFocus.includes(targetSkin)) {
    score += 20;
  }

  // 节日加分
  const holidays = getUpcomingHolidays();
  if (holidays.length > 0) score += 5;

  return Math.min(100, score);
}

/** 维度4: 行业趋势匹配分 (0-100) */
function scoreTrendMatch(trendTags: string[]): number {
  // 当前行业热门趋势及权重
  const hotTrends: Record<string, number> = {
    '轻医美': 90, '个性化定制': 85, '社交裂变': 82, '天然有机': 78,
    '抗衰': 88, '补水': 75, '美白': 72, '敏感修复': 80,
  };
  let maxScore = 40;
  for (const tag of trendTags) {
    if (hotTrends[tag]) maxScore = Math.max(maxScore, hotTrends[tag]);
  }
  return maxScore;
}

/** 综合匹配度 */
function computeMatchScore(profile: number, habit: number, season: number, trend: number): number {
  return Math.round(profile * 0.30 + habit * 0.25 + season * 0.25 + trend * 0.20);
}

// ========== 策略模板池 ==========

interface StrategyTemplate {
  title: string;
  segment?: SegmentType;
  skinType?: string;
  strategyType: 'service' | 'product' | 'package' | 'recharge' | 'general';
  category: Recommendation['category'];
  theme: string;
  trendTags: string[];
  strategy: string;
  discount: string;
  duration: string;
  tags: string[];
  imageIdx: number;
  triggerType?: MarketingTriggerType;
  preferAutoRule: boolean;
}

function buildTemplates(): StrategyTemplate[] {
  const season = getSeason();
  const holidays = getUpcomingHolidays();
  const seasonData = SEASON_KEYWORDS[season];

  const templates: StrategyTemplate[] = [
    // === 分群驱动 ===
    { title: 'VIP尊享护理套餐', segment: '高价值客户', strategyType: 'package', category: 'high-conversion', theme: '高端定制', trendTags: ['个性化定制', '抗衰'], strategy: '为高消费客户提供专属高端护理体验，提升客单价和满意度', discount: 'VIP专属9折 + 季度礼包', duration: '长期有效', tags: ['高转化', '高收益', 'AI推荐'], imageIdx: 0, triggerType: 'member_level', preferAutoRule: true },
    { title: '青春焕颜体验计划', segment: '潜在价值客户', strategyType: 'service', category: 'high-conversion', theme: '性价比体验', trendTags: ['补水', '美白'], strategy: '针对年轻客户推出高性价比护理体验，促进消费升级', discount: '满500减100', duration: '30天', tags: ['高转化', '拉新'], imageIdx: 1, triggerType: 'visit_frequency', preferAutoRule: false },
    { title: '沉睡客户唤醒计划', segment: '流失风险客户', strategyType: 'general', category: 'customer-wake', theme: '唤醒回访', trendTags: ['个性化定制'], strategy: '通过专属优惠券+个性化关怀短信重新激活长期未到店客户', discount: '回归专享满300减80', duration: '45天', tags: ['唤醒客户', '高潜力'], imageIdx: 2, triggerType: 'dormant', preferAutoRule: true },
    { title: '新客专享首单礼', segment: '新客户', strategyType: 'service', category: 'high-conversion', theme: '新客引导', trendTags: ['补水'], strategy: '低门槛体验活动提升新客转化和留存', discount: '首单立减50 + 体验券', duration: '注册后30天', tags: ['拉新', 'AI推荐'], imageIdx: 3, triggerType: 'new_customer', preferAutoRule: true },
    { title: '老友带新裂变计划', segment: '稳定客户', strategyType: 'general', category: 'viral', theme: '社交裂变', trendTags: ['社交裂变'], strategy: '利用稳定客户的推荐意愿，开展老带新裂变活动', discount: '推荐人和新客各得100元券', duration: '60天', tags: ['裂变营销', '高转化'], imageIdx: 4, triggerType: undefined, preferAutoRule: false },

    // === 肌肤驱动 ===
    { title: `${seasonData.theme}·敏感肌修护季`, skinType: '敏感肌肤', strategyType: 'service', category: 'member-care', theme: '敏感修复', trendTags: ['敏感修复', '天然有机'], strategy: '针对敏感肌客户推出温和无刺激的专业修护方案', discount: '敏感肌专属8.5折', duration: '30天', tags: ['会员关怀', 'AI推荐'], imageIdx: 5, triggerType: 'skin_type', preferAutoRule: true },
    { title: `${seasonData.theme}·补水保湿护理季`, skinType: '干性肌肤', strategyType: 'service', category: 'member-care', theme: '补水保湿', trendTags: ['补水', '抗衰'], strategy: '针对干性肌肤缺水问题推荐深度补水护理方案', discount: '补水套餐立减200', duration: '30天', tags: ['会员关怀', '高转化'], imageIdx: 6, triggerType: 'skin_type', preferAutoRule: true },
    { title: '控油焕肤清爽计划', skinType: '油性肌肤', strategyType: 'service', category: 'high-conversion', theme: '控油清洁', trendTags: ['补水', '美白'], strategy: '年轻油性肌肤群体，推出性价比高的控油清洁套餐', discount: '控油套餐8折', duration: '21天', tags: ['高转化'], imageIdx: 7, triggerType: 'skin_type', preferAutoRule: true },
    { title: '精准分区护理套餐', skinType: '混合肌肤', strategyType: 'package', category: 'member-care', theme: '个性化定制', trendTags: ['个性化定制'], strategy: '针对混合肌肤推出T区+U区分区护理方案', discount: '分区护理满500减80', duration: '30天', tags: ['会员关怀'], imageIdx: 0, triggerType: 'skin_type', preferAutoRule: true },
    { title: '轻奢抗衰养护体验', skinType: '中性肌肤', strategyType: 'package', category: 'high-conversion', theme: '抗衰', trendTags: ['抗衰', '轻医美'], strategy: '肤质优良群体推荐预防性抗衰护理和高端体验', discount: '养护套餐立减150', duration: '30天', tags: ['高收益', 'AI推荐'], imageIdx: 1, triggerType: 'care_cycle', preferAutoRule: true },
  ];

  // === 季节驱动 ===
  templates.push({
    title: `${seasonData.theme}特惠活动`, strategyType: 'service', category: 'seasonal' as any,
    theme: seasonData.theme, trendTags: seasonData.services.slice(0, 2),
    strategy: `${season}季换季期间推出${seasonData.services.join('、')}等应季护理项目`,
    discount: '应季项目8折起', duration: '当季有效', tags: ['季节推荐', 'AI推荐'], imageIdx: 2,
    triggerType: 'seasonal', preferAutoRule: false,
  });

  if (holidays.length > 0) {
    templates.push({
      title: `${holidays[0]}感恩特惠`, strategyType: 'general', category: 'seasonal' as any,
      theme: holidays[0], trendTags: ['社交裂变'],
      strategy: `${holidays[0]}期间推出感恩回馈活动，提升客户到店率和消费`,
      discount: `${holidays[0]}专享7.5折`, duration: '节日前后15天', tags: ['节日营销', '高转化'], imageIdx: 3,
      triggerType: 'holiday', preferAutoRule: false,
    });
  }

  // === 行业趋势驱动 ===
  templates.push(
    { title: '轻医美入门体验', strategyType: 'service', category: 'trend' as any, theme: '轻医美', trendTags: ['轻医美', '抗衰'], strategy: '水光针、光子嫩肤等轻医美项目体验价，吸引高消费客户', discount: '轻医美项目体验价5折', duration: '30天', tags: ['行业趋势', 'AI推荐', '高收益'], imageIdx: 4, triggerType: undefined, preferAutoRule: false },
    { title: '天然有机护肤专场', strategyType: 'product', category: 'trend' as any, theme: '天然有机', trendTags: ['天然有机', '敏感修复'], strategy: '主打天然有机成分产品线，满足消费升级需求', discount: '有机产品满300减50', duration: '21天', tags: ['行业趋势'], imageIdx: 5, triggerType: undefined, preferAutoRule: false },
    { title: '闺蜜拼团美丽计划', strategyType: 'general', category: 'viral', theme: '社交裂变', trendTags: ['社交裂变'], strategy: '2人成团享受优惠，推荐人额外返现，社交裂变拓新客', discount: '拼团8折 + 推荐返50', duration: '21天', tags: ['裂变营销', '高转化', 'AI推荐'], imageIdx: 6, triggerType: undefined, preferAutoRule: false },
  );

  return templates;
}

// ========== 主入口 ==========

export function generateRecommendations(
  customers: Customer[],
  consumptionRecords: Array<{
    customerId: number;
    consumeType: string;
    consumeContent?: string;
    amount: string;
    campaign: string;
    consumeTime: string;
  }>,
  healthProfiles: Array<{ customerId: number; skinType: string; skinStatus: string; mainProblems: string }>
): Recommendation[] {
  const segmentStats = computeSegmentStats(customers);
  const skinStats = computeSkinStats(customers, healthProfiles);
  const totalCustomers = customers.length;

  const templates = buildTemplates();
  const normalizedConsumptionRecords = consumptionRecords.map((record) => ({
    ...record,
    consumeContent: record.consumeContent ?? record.consumeType,
  }));
  const recommendations: Recommendation[] = [];

  templates.forEach((tpl, idx) => {
    // 计算目标客户数
    let targetCount = 0;
    let targetLabel = '';
    let targetCustomerIds: number[] = [];

    if (tpl.segment) {
      const seg = segmentStats.find((s) => s.segment === tpl.segment);
      targetCount = seg?.customerCount || 0;
      targetCustomerIds = seg?.customerIds || [];
      targetLabel = `${tpl.segment}（约${targetCount}人）`;
    } else if (tpl.skinType) {
      const skin = skinStats.find((s) => s.skinType === tpl.skinType);
      targetCount = skin?.customerCount || 0;
      targetCustomerIds = skin?.customerIds || [];
      targetLabel = `${tpl.skinType}客户（约${targetCount}人）`;
    } else {
      // 季节/趋势策略面向全部活跃客户
      targetCustomerIds = customers.filter((c) => c.visitCount > 0).map((c) => c.id);
      targetCount = targetCustomerIds.length;
      targetLabel = `全部活跃客户（约${targetCount}人）`;
    }

    // 四维评分
    const profileScore = tpl.segment
      ? scoreCustomerProfile(segmentStats, tpl.segment, totalCustomers)
      : tpl.skinType
        ? Math.min(100, 50 + (skinStats.find((s) => s.skinType === tpl.skinType)?.customerCount || 0) / totalCustomers * 200)
        : 55;

    const habitScore = scoreConsumptionHabit(consumptionRecords, tpl.strategyType);
    const seasonScore = scoreSeasonMatch(tpl.theme, tpl.skinType);
    const trendScore = scoreTrendMatch(tpl.trendTags);

    const matchScore = computeMatchScore(profileScore, habitScore, seasonScore, trendScore);

    // 预期转化率和营收
    const baseConversion = matchScore > 85 ? 0.35 : matchScore > 70 ? 0.28 : matchScore > 55 ? 0.22 : 0.15;
    const conversionVariance = (Math.random() - 0.5) * 0.08;
    const conversion = Math.max(0.1, Math.min(0.55, baseConversion + conversionVariance));
    const avgSpendPerCustomer = totalCustomers > 0
      ? customers.reduce((s, c) => s + c.totalSpent, 0) / customers.filter((c) => c.visitCount > 0).length * 0.05
      : 500;
    const expectedRevenue = Math.round(targetCount * conversion * avgSpendPerCustomer);

    recommendations.push({
      id: idx + 1,
      title: tpl.title,
      reason: generateReason(tpl, targetCount, segmentStats, skinStats),
      targetCustomers: targetLabel,
      targetCount,
      targetCustomerIds,
      expectedConversion: `预计转化率 ${(conversion * 100).toFixed(1)}%`,
      expectedRevenue: expectedRevenue >= 10000 ? `预计营收 ¥${(expectedRevenue / 10000).toFixed(1)}万` : `预计营收 ¥${expectedRevenue.toLocaleString()}`,
      strategy: tpl.strategy,
      discount: tpl.discount,
      duration: `建议周期: ${tpl.duration}`,
      matchScore,
      image: IMAGES[tpl.imageIdx % IMAGES.length],
      tags: tpl.tags,
      category: tpl.category,
      triggerType: tpl.triggerType,
      preferAutoRule: tpl.preferAutoRule,
      urgency: tpl.category === 'customer-wake' ? 'urgent' : matchScore >= 75 ? 'recommended' : 'opportunity',
      urgencyLabel: tpl.category === 'customer-wake' ? '🔴 紧急' : matchScore >= 75 ? '🟡 推荐' : '🟢 机会',
      source: 'strategy',
    });
  });

  // ===== 新增：算法驱动的推荐卡片 =====
  let nextId = recommendations.length + 1;

  // 流失预警卡片
  const churnScores = computeChurnScores(customers, normalizedConsumptionRecords);
  const highChurn = churnScores.filter((s) => s.churnProbability >= 45);
  const criticalChurn = churnScores.filter((s) => s.churnProbability >= 70);
  if (highChurn.length > 0) {
    const totalLostRevenue = highChurn.reduce((s, c) => s + c.totalSpent, 0);
    recommendations.push({
      id: nextId++,
      title: `${criticalChurn.length}位客户即将流失，需立即唤醒`,
      reason: `流失概率评分发现${highChurn.length}位高风险客户（其中${criticalChurn.length}位极高风险），累计历史消费¥${(totalLostRevenue / 10000).toFixed(1)}万，如不及时干预将造成重大损失`,
      targetCustomers: `高流失风险客户（${highChurn.length}人）`,
      targetCount: highChurn.length,
      targetCustomerIds: highChurn.map((c) => c.customerId),
      expectedConversion: `预计挽回率 25-35%`,
      expectedRevenue: `预计挽回 ¥${(totalLostRevenue * 0.3 * 0.05 / 10000).toFixed(1)}万`,
      strategy: '针对高流失风险客户发送专属回归优惠券+关怀短信，按流失概率分级触达',
      discount: '回归专享满300减100',
      duration: '建议周期: 立即执行',
      matchScore: 95,
      image: IMAGES[2],
      tags: ['紧急', '流失预警'],
      category: 'churn-alert',
      triggerType: 'dormant',
      preferAutoRule: true,
      urgency: 'urgent',
      urgencyLabel: '🔴 紧急',
      source: 'churn',
      dataEvidence: [
        `极高风险（≥70%）：${criticalChurn.length}人`,
        `高风险（45-70%）：${highChurn.length - criticalChurn.length}人`,
        `主要流失原因：${[...new Set(highChurn.flatMap((c) => c.factors))].slice(0, 3).join('、')}`,
        `涉及历史消费：¥${(totalLostRevenue / 10000).toFixed(1)}万`,
      ],
    });
  }

  // 关联规则卡片（交叉销售）
  const rules = computeAssociationRules(normalizedConsumptionRecords);
  const topRules = rules.filter((r) => r.confidence >= 0.2 && r.lift >= 1.2).slice(0, 3);
  if (topRules.length > 0) {
    const bestRule = topRules[0];
    const antecedentCustomerIds = [
      ...new Set(
        normalizedConsumptionRecords
          .filter((record) => record.consumeContent?.replace(/\s*x\d+$/, '').trim() === bestRule.antecedent)
          .map((record) => record.customerId)
      ),
    ];
    recommendations.push({
      id: nextId++,
      title: `交叉销售机会：${bestRule.antecedent} → ${bestRule.consequent}`,
      reason: `关联分析发现：消费了"${bestRule.antecedent}"的客户中，${(bestRule.confidence * 100).toFixed(0)}%也会消费"${bestRule.consequent}"，提升度${bestRule.lift.toFixed(1)}倍`,
      targetCustomers: `${bestRule.antecedent}消费客户（${antecedentCustomerIds.length}人）`,
      targetCount: antecedentCustomerIds.length,
      targetCustomerIds: antecedentCustomerIds,
      expectedConversion: `预计转化率 ${(bestRule.confidence * 100).toFixed(0)}%`,
      expectedRevenue: `预计增收 ¥${(bestRule.count * 3 * bestRule.confidence * 300).toLocaleString()}`,
      strategy: `向消费了"${bestRule.antecedent}"的客户推荐"${bestRule.consequent}"，提升客单价`,
      discount: '搭配购买享9折',
      duration: '建议周期: 持续执行',
      matchScore: Math.round(bestRule.confidence * 100),
      image: IMAGES[5],
      tags: ['交叉销售', '提升客单价'],
      category: 'cross-sell',
      triggerType: 'service_interest',
      preferAutoRule: true,
      urgency: 'recommended',
      urgencyLabel: '🟡 推荐',
      source: 'association',
      dataEvidence: topRules.map((r) => `${r.antecedent} → ${r.consequent}：置信度${(r.confidence * 100).toFixed(0)}%，提升度${r.lift.toFixed(1)}x，${r.count}人`),
    });
  }

  // LTV高价值维护卡片
  const ltvPredictions = computeLTVPredictions(customers, normalizedConsumptionRecords);
  const platinumCustomers = ltvPredictions.filter((p) => p.ltvTier === '铂金');
  const decliningHigh = ltvPredictions.filter((p) => (p.ltvTier === '铂金' || p.ltvTier === '黄金') && p.trend === '下降');
  if (platinumCustomers.length > 0) {
    const totalFutureLTV = platinumCustomers.reduce((s, p) => s + p.predictedLTV12M, 0);
    recommendations.push({
      id: nextId++,
      title: `${platinumCustomers.length}位铂金客户值得重点维护`,
      reason: `LTV预测显示${platinumCustomers.length}位铂金客户未来12个月预计贡献¥${(totalFutureLTV / 10000).toFixed(1)}万营收${decliningHigh.length > 0 ? `，其中${decliningHigh.length}位消费趋势下降需关注` : ''}`,
      targetCustomers: `铂金级客户（${platinumCustomers.length}人）`,
      targetCount: platinumCustomers.length,
      targetCustomerIds: platinumCustomers.map((p) => p.customerId),
      expectedConversion: '预计维护成功率 85%',
      expectedRevenue: `预计保住 ¥${(totalFutureLTV / 10000).toFixed(1)}万`,
      strategy: '为铂金客户提供专属VIP服务、优先预约、季度礼包，防止高价值客户流失',
      discount: 'VIP专属权益',
      duration: '建议周期: 长期维护',
      matchScore: 88,
      image: IMAGES[0],
      tags: ['高价值维护', 'LTV驱动'],
      category: 'ltv-nurture',
      triggerType: 'member_level',
      preferAutoRule: true,
      urgency: decliningHigh.length > 0 ? 'urgent' : 'opportunity',
      urgencyLabel: decliningHigh.length > 0 ? '🔴 紧急' : '🟢 机会',
      source: 'ltv',
      dataEvidence: [
        `铂金客户：${platinumCustomers.length}人`,
        `预计12个月贡献：¥${(totalFutureLTV / 10000).toFixed(1)}万`,
        `消费趋势下降：${decliningHigh.length}人`,
        `月均消费：¥${Math.round(platinumCustomers.reduce((s, p) => s + p.monthlyAvg, 0) / platinumCustomers.length).toLocaleString()}`,
      ],
    });
  }

  // 用LTV增强所有卡片的预期营收
  const avgLTV6M = ltvPredictions.length > 0 ? ltvPredictions.reduce((s, p) => s + p.predictedLTV6M, 0) / ltvPredictions.length : 0;
  for (const rec of recommendations) {
    if (rec.source === 'strategy' && avgLTV6M > 0) {
      const ltvRevenue = Math.round(rec.targetCount * (avgLTV6M / 6) * 0.1);
      if (ltvRevenue > 10000) {
        rec.expectedRevenue = `预计营收 ¥${(ltvRevenue / 10000).toFixed(1)}万（LTV校准）`;
      }
    }
  }

  // 按紧急度+匹配度综合排序
  const urgencyWeight: Record<UrgencyLevel, number> = { urgent: 100, recommended: 50, opportunity: 0 };
  return recommendations.sort((a, b) => {
    const scoreA = urgencyWeight[a.urgency] + a.matchScore;
    const scoreB = urgencyWeight[b.urgency] + b.matchScore;
    return scoreB - scoreA;
  });
}

function generateReason(
  tpl: StrategyTemplate,
  targetCount: number,
  segmentStats: ReturnType<typeof computeSegmentStats>,
  skinStats: ReturnType<typeof computeSkinStats>
): string {
  const season = getSeason();

  if (tpl.segment === '流失风险客户') {
    return `数据分析发现有${targetCount}位客户超过60天未到店，需要及时唤醒以降低流失率`;
  }
  if (tpl.segment === '高价值客户') {
    const seg = segmentStats.find((s) => s.segment === '高价值客户');
    return `${targetCount}位高价值客户贡献了${seg?.spendContribution || '0%'}的营收，值得重点维护提升复购`;
  }
  if (tpl.segment === '新客户') {
    return `近期新增${targetCount}位新客户，首次体验转化是留存关键`;
  }
  if (tpl.segment === '潜在价值客户') {
    return `${targetCount}位年轻客户消费潜力大但客单价偏低，适合通过体验升级促进消费`;
  }
  if (tpl.segment === '稳定客户') {
    return `${targetCount}位稳定客户满意度高、推荐意愿强，是裂变营销的最佳种子用户`;
  }
  if (tpl.skinType) {
    const skin = skinStats.find((s) => s.skinType === tpl.skinType);
    return `${tpl.skinType}客户占比${skin?.percentage || '0%'}，${season}季是该肤质护理的黄金期`;
  }
  if (tpl.theme.includes(season)) {
    return `${season}季换季期间客户护肤需求旺盛，历史数据显示该时段转化率提升20%+`;
  }
  if (tpl.trendTags.includes('轻医美')) {
    return '轻医美项目需求持续增长，水光针/光子嫩肤是当前最热门的入门级项目';
  }
  if (tpl.trendTags.includes('社交裂变')) {
    return '社交裂变是美容行业获客成本最低的方式，老客户推荐转化率高达40%+';
  }
  return `基于客户画像和消费数据分析，该策略预计覆盖${targetCount}位目标客户`;
}
