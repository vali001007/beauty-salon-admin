import type {
  AudiencePreview,
  AudiencePreviewCustomer,
  Customer,
  CustomerPredictionSnapshot,
  MarketingActivity,
  MarketingAutomationEffect,
  MarketingAutomationExecution,
  MarketingAutomationTouchEffect,
  MarketingAutomationStrategy,
  MarketingParamValue,
  MarketingRuleRelation,
  MarketingStrategyInput,
  MarketingTriggerOption,
  MarketingTriggerRule,
  PredictionReason,
  PredictionRunSummary,
} from '@/types';
import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';
import { computeChurnScores, computeLTVPredictions } from '@/utils/advancedAnalytics';
import { FIXTURE_CONSUMPTION_RECORDS, FIXTURE_CUSTOMERS, FIXTURE_HEALTH_PROFILES } from './fixtures';

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

const MODEL_VERSION = 'rules-v1';
const mockCustomers = FIXTURE_CUSTOMERS.map((customer) => ({ ...customer, tags: customer.tags || [] }));
const mockConsumptionRecords = FIXTURE_CONSUMPTION_RECORDS as Array<{ customerId: number; consumeContent: string; consumeType: string; amount: string; consumeTime: string }>;

function buildMockPredictionSnapshots(runId = 1): CustomerPredictionSnapshot[] {
  const churnScores = computeChurnScores(mockCustomers, mockConsumptionRecords);
  const ltvPredictions = computeLTVPredictions(mockCustomers, mockConsumptionRecords);
  return mockCustomers.map((customer, index) => {
    const churn = churnScores.find((item) => item.customerId === customer.id);
    const ltv = ltvPredictions.find((item) => item.customerId === customer.id);
    const churnScore = churn?.churnProbability ?? 20;
    const repurchase30dScore = Math.max(5, Math.min(95, 78 - churnScore + (customer.visitCount > 8 ? 12 : 0)));
    const marketingResponseScore = Math.max(5, Math.min(95, Math.round(repurchase30dScore * 0.65 + (customer.totalSpent > 10000 ? 18 : 8))));
    const reasons: PredictionReason[] = [
      { type: 'churn', label: `${churnScore}分`, detail: churn?.factors?.[0] || '暂无明显流失风险', impact: churnScore >= 55 ? 'negative' : 'neutral' },
      { type: 'repurchase', label: `${repurchase30dScore}分`, detail: '按最近到店、历史消费频率和护理周期估算 30 天复购概率', impact: repurchase30dScore >= 65 ? 'positive' : 'neutral' },
      { type: 'marketing_response', label: `${marketingResponseScore}分`, detail: '综合复购概率、会员等级和促销敏感度估算活动响应', impact: marketingResponseScore >= 70 ? 'positive' : 'neutral' },
      { type: 'ltv', label: ltv?.ltvTier || '青铜', detail: `未来 12 个月预计价值 ¥${(ltv?.predictedLTV12M || 0).toLocaleString()}`, impact: ['铂金', '黄金'].includes(ltv?.ltvTier || '') ? 'positive' : 'neutral' },
    ];
    return {
      id: index + 1,
      runId,
      customerId: customer.id,
      storeId: 1,
      modelVersion: MODEL_VERSION,
      churnScore,
      churnLevel: churn?.riskLevel || '低',
      repurchase30dScore,
      marketingResponseScore,
      ltv6m: ltv?.predictedLTV6M || 0,
      ltv12m: ltv?.predictedLTV12M || 0,
      ltvTier: ltv?.ltvTier || '青铜',
      featureJson: {
        lastVisitDays: churn?.lastVisitDays || 0,
        avgVisitGap: churn?.avgVisitGap || 30,
        spendTrend: ltv?.trend || '稳定',
        monthlyAvg: ltv?.monthlyAvg || 0,
        memberLevel: customer.memberLevel,
      },
      reasonJson: reasons,
      recommendedActionsJson: ['小程序券包', churnScore >= 55 ? '顾问关怀' : '护理周期提醒'],
      createdAt: '2026-05-31T09:30:00.000Z',
      customer,
    };
  });
}

let mockPredictionRun: PredictionRunSummary = {
  run: {
    id: 1,
    storeId: 1,
    modelVersion: MODEL_VERSION,
    status: 'completed',
    startedAt: '2026-05-31T09:30:00.000Z',
    finishedAt: '2026-05-31T09:31:00.000Z',
    customerCount: mockCustomers.length,
  },
  summary: {},
};
let mockPredictionSnapshots = buildMockPredictionSnapshots(mockPredictionRun.run.id);

function summarizeMockPredictions(): PredictionRunSummary['summary'] {
  const countBy = (field: keyof CustomerPredictionSnapshot, labels: string[]) =>
    labels.map((label) => ({ label, count: mockPredictionSnapshots.filter((item) => item[field] === label).length }));
  const scoreBy = (field: keyof CustomerPredictionSnapshot) => [
    { label: '0-39', count: mockPredictionSnapshots.filter((item) => Number(item[field]) < 40).length },
    { label: '40-69', count: mockPredictionSnapshots.filter((item) => Number(item[field]) >= 40 && Number(item[field]) < 70).length },
    { label: '70-100', count: mockPredictionSnapshots.filter((item) => Number(item[field]) >= 70).length },
  ];
  return {
    modelVersion: MODEL_VERSION,
    customerCount: mockPredictionSnapshots.length,
    churnDistribution: countBy('churnLevel', ['低', '中', '高', '极高']),
    repurchaseDistribution: scoreBy('repurchase30dScore'),
    marketingResponseDistribution: scoreBy('marketingResponseScore'),
    ltvDistribution: countBy('ltvTier', ['铂金', '黄金', '白银', '青铜']),
    avgChurnScore: Math.round(mockPredictionSnapshots.reduce((sum, item) => sum + item.churnScore, 0) / mockPredictionSnapshots.length),
    avgRepurchase30dScore: Math.round(mockPredictionSnapshots.reduce((sum, item) => sum + item.repurchase30dScore, 0) / mockPredictionSnapshots.length),
    avgMarketingResponseScore: Math.round(mockPredictionSnapshots.reduce((sum, item) => sum + item.marketingResponseScore, 0) / mockPredictionSnapshots.length),
    expectedLtv6m: mockPredictionSnapshots.reduce((sum, item) => sum + item.ltv6m, 0),
    expectedLtv12m: mockPredictionSnapshots.reduce((sum, item) => sum + item.ltv12m, 0),
  };
}

mockPredictionRun = { ...mockPredictionRun, summary: summarizeMockPredictions() };

export async function mockGetStrategyEffects(): Promise<StrategyEffectSummary[]> {
  return [...MOCK_STRATEGY_EFFECTS];
}

export async function mockRunPredictions(): Promise<PredictionRunSummary> {
  const nextId = mockPredictionRun.run.id + 1;
  mockPredictionSnapshots = buildMockPredictionSnapshots(nextId);
  mockPredictionRun = {
    run: {
      id: nextId,
      storeId: 1,
      modelVersion: MODEL_VERSION,
      status: 'completed',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      customerCount: mockPredictionSnapshots.length,
    },
    summary: summarizeMockPredictions(),
  };
  return mockPredictionRun;
}

export async function mockGetLatestPredictionSummary(): Promise<PredictionRunSummary> {
  return mockPredictionRun;
}

export async function mockGetPredictionCustomers(
  params: PaginationParams & {
    churnLevel?: string;
    ltvTier?: string;
    minRepurchaseScore?: number;
    minMarketingResponseScore?: number;
  },
): Promise<PaginatedResponse<CustomerPredictionSnapshot>> {
  let list = [...mockPredictionSnapshots];
  if (params.churnLevel) list = list.filter((item) => item.churnLevel === params.churnLevel);
  if (params.ltvTier) list = list.filter((item) => item.ltvTier === params.ltvTier);
  if (params.minRepurchaseScore) list = list.filter((item) => item.repurchase30dScore >= params.minRepurchaseScore!);
  if (params.minMarketingResponseScore) list = list.filter((item) => item.marketingResponseScore >= params.minMarketingResponseScore!);
  const start = (params.page - 1) * params.pageSize;
  return createPaginatedResponse(list.slice(start, start + params.pageSize), list.length, params.page, params.pageSize);
}

export async function mockGetCustomerPrediction(customerId: number): Promise<{
  snapshot: CustomerPredictionSnapshot;
  history: Array<Pick<CustomerPredictionSnapshot, 'id' | 'runId' | 'churnScore' | 'repurchase30dScore' | 'marketingResponseScore' | 'ltv6m' | 'ltv12m' | 'createdAt'>>;
}> {
  const snapshot = mockPredictionSnapshots.find((item) => item.customerId === customerId);
  if (!snapshot) throw new Error('预测快照不存在');
  return {
    snapshot,
    history: [snapshot].map((item) => ({
      id: item.id,
      runId: item.runId,
      churnScore: item.churnScore,
      repurchase30dScore: item.repurchase30dScore,
      marketingResponseScore: item.marketingResponseScore,
      ltv6m: item.ltv6m,
      ltv12m: item.ltv12m,
      createdAt: item.createdAt,
    })),
  };
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

const TRIGGER_OPTIONS: MarketingTriggerOption[] = [
  {
    type: 'birthday', category: '时间触发', label: '生日关怀', priority: 'P0',
    description: '在客户生日前后自动发送祝福与专属权益。',
    paramSchema: [
      { key: 'offsetDays', label: '提前触达天数', type: 'number', required: true, min: -30, max: 30, suffix: '天' },
      { key: 'dateScope', label: '权益周期', type: 'select', required: true, options: [{ label: '生日当月', value: 'birthday_month' }, { label: '生日当天', value: 'birthday_day' }] },
      { key: 'channels', label: '触达渠道', type: 'multi_select', options: [{ label: '短信', value: 'sms' }, { label: '小程序', value: 'miniapp' }, { label: '微信', value: 'wechat' }] },
    ],
    defaultParams: { offsetDays: -7, dateScope: 'birthday_month', repeatPolicy: 'once_per_year', channels: ['sms', 'miniapp'], defaultAction: 'birthday_discount_20_percent_off' },
  },
  {
    type: 'holiday', category: '时间触发', label: '节假日营销', priority: 'P1',
    description: '在主要节日前预热并持续触达主题活动。',
    paramSchema: [
      { key: 'holidayCode', label: '目标节日', type: 'select', options: [{ label: '下一个主要节日', value: 'auto_upcoming_major_holiday' }, { label: '母亲节', value: 'mothers_day' }, { label: '七夕', value: 'qixi' }] },
      { key: 'offsetDays', label: '提前预热天数', type: 'number', suffix: '天' },
      { key: 'dateRange', label: '活动周期', type: 'date_range' },
    ],
    defaultParams: { holidayCode: 'auto_upcoming_major_holiday', offsetDays: -10, dateRange: [-10, 3], channels: ['miniapp', 'wechat', 'moments'] },
  },
  {
    type: 'seasonal', category: '时间触发', label: '季节性护肤', priority: 'P1',
    description: '结合换季肤质问题推荐护理方案。',
    paramSchema: [
      { key: 'season', label: '季节', type: 'select', options: [{ label: '当前季节', value: 'current' }, { label: '春季', value: 'spring' }, { label: '夏季', value: 'summer' }, { label: '秋季', value: 'autumn' }, { label: '冬季', value: 'winter' }] },
      { key: 'leadDays', label: '提前触达天数', type: 'number', suffix: '天' },
    ],
    defaultParams: { season: 'current', leadDays: 15, skinTypes: 'auto_by_season', projectCategories: 'auto_by_season' },
  },
  {
    type: 'care_cycle', category: '时间触发', label: '护理周期到期', priority: 'P1',
    description: '上次护理完成后按周期提醒复购预约。',
    paramSchema: [
      { key: 'cycleDays', label: '护理周期', type: 'number', min: 1, suffix: '天' },
      { key: 'lastServiceType', label: '护理类型', type: 'select', options: [{ label: '面部护理', value: 'facial_care' }, { label: '身体护理', value: 'body_care' }] },
      { key: 'remindDaysBefore', label: '提前提醒', type: 'number', suffix: '天' },
    ],
    defaultParams: { cycleDays: 28, lastServiceType: 'facial_care', remindDaysBefore: 3, channels: ['miniapp', 'sms'] },
  },
  {
    type: 'card_expiry', category: '时间触发', label: '卡项即将到期', priority: 'P1',
    description: '次卡或套餐临期时提醒使用或续费。',
    paramSchema: [
      { key: 'beforeDays', label: '到期提前天数', type: 'number', suffix: '天' },
      { key: 'remainingTimes', label: '剩余次数不超过', type: 'number', suffix: '次' },
    ],
    defaultParams: { beforeDays: 30, remainingTimes: 1, cardType: 'all', actionIntent: 'use_or_renew' },
  },
  {
    type: 'last_visit', category: '行为触发', label: '最近消费时间', priority: 'P0',
    description: '客户超过指定天数未到店时触发轻唤醒。',
    paramSchema: [
      { key: 'operator', label: '判断方式', type: 'select', options: [{ label: '大于', value: 'greater_than' }, { label: '大于等于', value: 'greater_than_or_equal' }] },
      { key: 'days', label: '未到店天数', type: 'number', min: 1, suffix: '天' },
      { key: 'excludeBooked', label: '排除已预约客户', type: 'boolean' },
    ],
    defaultParams: { operator: 'greater_than', days: 30, excludeBooked: true, channels: ['sms', 'miniapp'] },
  },
  {
    type: 'consumption', category: '行为触发', label: '消费金额', priority: 'P0',
    description: '依据消费额筛选高价值或潜力客户。',
    paramSchema: [
      { key: 'period', label: '统计周期', type: 'select', options: [{ label: '累计消费', value: 'cumulative' }, { label: '近一年', value: 'year' }] },
      { key: 'operator', label: '判断方式', type: 'select', options: [{ label: '大于等于', value: 'greater_than_or_equal' }, { label: '大于', value: 'greater_than' }] },
      { key: 'amount', label: '金额门槛', type: 'number', min: 0, suffix: '元' },
    ],
    defaultParams: { period: 'cumulative', operator: 'greater_than_or_equal', amount: 5000, tierAction: 'vip_care' },
  },
  {
    type: 'visit_frequency', category: '行为触发', label: '到店频率', priority: 'P2',
    description: '客户活跃度下降时触发召回。',
    paramSchema: [
      { key: 'windowDays', label: '观察周期', type: 'number', suffix: '天' },
      { key: 'count', label: '到店次数阈值', type: 'number', suffix: '次' },
      { key: 'compareToPreviousWindow', label: '与上周期比较', type: 'boolean' },
    ],
    defaultParams: { windowDays: 90, operator: 'less_than', count: 2, compareToPreviousWindow: true },
  },
  {
    type: 'visit_gap', category: '行为触发', label: '消费间隔异常', priority: 'P2',
    description: '到店间隔明显超过个人平均周期时干预。',
    paramSchema: [
      { key: 'multiplier', label: '平均间隔倍数', type: 'number' },
      { key: 'minDays', label: '最少间隔', type: 'number', suffix: '天' },
      { key: 'excludeNewCustomer', label: '排除新客户', type: 'boolean' },
    ],
    defaultParams: { multiplier: 2, minDays: 45, excludeNewCustomer: true },
  },
  {
    type: 'service_interest', category: '行为触发', label: '项目服务偏好', priority: 'P2',
    description: '按项目消费偏好推荐相关护理和套餐。',
    paramSchema: [
      { key: 'windowDays', label: '观察周期', type: 'number', suffix: '天' },
      { key: 'minCount', label: '最低消费次数', type: 'number', suffix: '次' },
      { key: 'recommendMode', label: '推荐方式', type: 'select', options: [{ label: '相关项目', value: 'related_project' }, { label: '升级套餐', value: 'upgrade_package' }] },
    ],
    defaultParams: { windowDays: 180, minCount: 2, projectCategory: 'last_top_category', recommendMode: 'related_project' },
  },
  {
    type: 'dormant', category: '行为触发', label: '沉睡客户唤醒', priority: 'P0',
    description: '长期未到店的客户进入专属唤醒池。',
    paramSchema: [
      { key: 'days', label: '沉睡天数', type: 'number', min: 1, suffix: '天' },
      { key: 'excludePurchasedRecently', label: '排除近期购买', type: 'boolean' },
      { key: 'excludeBooked', label: '排除已预约', type: 'boolean' },
      { key: 'wakeLevel', label: '唤醒强度', type: 'select', options: [{ label: '轻度', value: 'light' }, { label: '中度', value: 'medium' }, { label: '强力', value: 'strong' }] },
    ],
    defaultParams: { days: 60, excludePurchasedRecently: true, excludeBooked: true, wakeLevel: 'medium' },
  },
  {
    type: 'member_level', category: '属性触发', label: '会员等级', priority: 'P0',
    description: '为高等级会员配置专属关怀。',
    paramSchema: [
      { key: 'levels', label: '会员等级', type: 'multi_select', options: [{ label: '金卡会员', value: 'gold' }, { label: '铂金会员', value: 'platinum' }, { label: '钻石会员', value: 'diamond' }] },
      { key: 'actionIntent', label: '营销意图', type: 'select', options: [{ label: '权益关怀', value: 'privilege_care' }, { label: '续费升级', value: 'upgrade' }] },
    ],
    defaultParams: { levels: ['gold', 'platinum', 'diamond'], actionIntent: 'privilege_care', channels: ['wechat', 'store'] },
  },
  {
    type: 'new_customer', category: '属性触发', label: '新客户引导', priority: 'P1',
    description: '新建档客户在首单窗口内自动引导。',
    paramSchema: [
      { key: 'withinDays', label: '新客窗口', type: 'number', suffix: '天' },
      { key: 'hasNoOrder', label: '仅未消费客户', type: 'boolean' },
      { key: 'touchDay', label: '第几天触达', type: 'number', suffix: '天' },
    ],
    defaultParams: { withinDays: 7, hasNoOrder: true, touchDay: 3, defaultAction: 'first_order_coupon' },
  },
  {
    type: 'skin_type', category: '属性触发', label: '肌肤类型', priority: 'P0',
    description: '根据肤质和 Ami Aura Lite 检测结果推荐方案。',
    paramSchema: [
      { key: 'skinTypes', label: '肤质范围', type: 'multi_select', options: [{ label: '干性', value: 'dry' }, { label: '油性', value: 'oily' }, { label: '敏感', value: 'sensitive' }, { label: '混合', value: 'combination' }, { label: '中性', value: 'normal' }] },
      { key: 'recommendMode', label: '推荐方式', type: 'select', options: [{ label: '肤质护理计划', value: 'skin_care_plan' }, { label: '匹配项目', value: 'projects' }] },
    ],
    defaultParams: { skinTypes: ['dry', 'oily', 'sensitive', 'combination', 'normal'], sourcePriority: ['aura_lite', 'health_profile', 'manual'], recommendMode: 'skin_care_plan' },
  },
  {
    type: 'age_range', category: '属性触发', label: '年龄段', priority: 'P2',
    description: '按年龄层匹配护肤主题与项目。',
    paramSchema: [
      { key: 'minAge', label: '最小年龄', type: 'number', suffix: '岁' },
      { key: 'maxAge', label: '最大年龄', type: 'number', suffix: '岁' },
      { key: 'theme', label: '营销主题', type: 'select', options: [{ label: '抗初老', value: 'anti_aging_entry' }, { label: '补水焕亮', value: 'hydrating' }] },
    ],
    defaultParams: { minAge: 25, maxAge: 40, theme: 'anti_aging_entry', channels: ['miniapp', 'wechat'] },
  },
];

const automationCustomers = FIXTURE_CUSTOMERS.map((customer) => ({ ...customer, tags: customer.tags || [] }));
const healthProfiles = FIXTURE_HEALTH_PROFILES as Array<{ customerId: number; skinType: string }>;
const skinTypeAliases: Record<string, string[]> = {
  dry: ['干', '偏干'], oily: ['油'], sensitive: ['敏感'], combination: ['混合', '混油'], normal: ['中性'],
};

const nowDate = () => new Date();
const daysSince = (date: string) => {
  if (!date) return Number.POSITIVE_INFINITY;
  const value = new Date(date);
  const days = Math.floor((nowDate().getTime() - value.getTime()) / 86400000);
  return days >= 0 ? days : 0;
};
const cloneParams = (params: Record<string, MarketingParamValue>) => JSON.parse(JSON.stringify(params)) as Record<string, MarketingParamValue>;

function matchRule(customer: Customer, rule: MarketingTriggerRule): { match: boolean; reason: string } {
  const params = rule.params;
  if (rule.type === 'birthday') {
    const birthday = customer.birthday && new Date(customer.birthday);
    const monthMatch = birthday && birthday.getMonth() === nowDate().getMonth();
    return { match: Boolean(monthMatch), reason: '生日权益周期已命中' };
  }
  if (rule.type === 'last_visit' || rule.type === 'dormant') {
    const days = Number(params.days || 30);
    const elapsed = daysSince(customer.lastVisitDate);
    return { match: elapsed > days, reason: `${elapsed === Number.POSITIVE_INFINITY ? '从未' : `${elapsed}天未`}到店` };
  }
  if (rule.type === 'consumption') {
    const threshold = Number(params.amount || 0);
    return { match: customer.totalSpent >= threshold, reason: `累计消费¥${customer.totalSpent.toLocaleString()}` };
  }
  if (rule.type === 'member_level') {
    const levelMap: Record<string, string> = { gold: '金卡会员', platinum: '铂金会员', diamond: '钻石会员' };
    const selected = (params.levels as string[] || []).map((item) => levelMap[item] || item);
    return { match: selected.includes(customer.memberLevel), reason: `会员等级为${customer.memberLevel}` };
  }
  if (rule.type === 'skin_type') {
    const profile = healthProfiles.find((item) => item.customerId === customer.id);
    const skinType = profile?.skinType || customer.skinCondition || '';
    const selected = params.skinTypes as string[] || [];
    const matched = selected.some((value) => (skinTypeAliases[value] || [value]).some((alias) => skinType.includes(alias)));
    return { match: matched, reason: `肤质为${skinType || '未建档'}` };
  }
  return { match: customer.id % 4 === 0, reason: '符合规则模拟样本' };
}

function calculateAudience(rules: MarketingTriggerRule[], relation: MarketingRuleRelation): AudiencePreview {
  const matched = automationCustomers.flatMap((customer) => {
    const checks = rules.map((rule) => matchRule(customer, rule));
    const match = relation === 'AND' ? checks.every((item) => item.match) : checks.some((item) => item.match);
    if (!match) return [];
    const reasons = checks.filter((item) => item.match).map((item) => item.reason).join('；');
    const prediction = mockPredictionSnapshots.find((item) => item.customerId === customer.id);
    const predictedConversionScore = Math.min(95, Math.max(10, Math.round((prediction?.marketingResponseScore || 45) * 0.75 + (prediction?.repurchase30dScore || 40) * 0.2)));
    const predictedRevenue = Math.round((prediction?.ltv6m || customer.totalSpent * 0.12 || 600) * predictedConversionScore / 100 * 0.18);
    return [{
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      storeName: customer.storeName,
      memberLevel: customer.memberLevel,
      totalSpent: customer.totalSpent,
      lastVisitDate: customer.lastVisitDate,
      reason: reasons,
      churnScore: prediction?.churnScore,
      repurchase30dScore: prediction?.repurchase30dScore,
      marketingResponseScore: prediction?.marketingResponseScore,
      ltvTier: prediction?.ltvTier,
      predictedConversionScore,
      predictedRevenue,
    } satisfies AudiencePreviewCustomer];
  });
  const estimatedConvertedCount = Math.round(matched.reduce((sum, item) => sum + (item.predictedConversionScore || 0) / 100, 0));
  const estimatedRevenue = matched.reduce((sum, item) => sum + (item.predictedRevenue || 0), 0);
  return {
    total: matched.length,
    estimatedCount: matched.length,
    totalCustomers: automationCustomers.length,
    estimatedReachedCount: matched.length,
    estimatedConvertedCount,
    estimatedRevenue,
    samples: matched.slice(0, 8),
    ruleRelation: relation,
    generatedAt: new Date().toISOString(),
  };
}

const initialRule = (type: MarketingTriggerOption['type']): MarketingTriggerRule => {
  const option = TRIGGER_OPTIONS.find((item) => item.type === type)!;
  return { type, params: cloneParams(option.defaultParams), parameterSource: 'system_default' };
};

let automationIdCounter = 4;
const seededAutomationStrategies: MarketingAutomationStrategy[] = [
  {
    id: 1, name: '沉睡客户唤醒计划', description: '60 天未到店客户发送专属护理券', status: 'enabled', executionType: 'auto',
    schedule: { type: 'daily', time: '09:00' }, triggerRules: [initialRule('dormant')], ruleRelation: 'AND',
    actions: [{ type: 'coupon', value: '满500减100', channel: 'miniapp' }, { type: 'sms', value: '沉睡客户关怀提醒', channel: 'sms' }],
    targetCount: 0, createdAt: '2026-04-10', updatedAt: '2026-05-20', lastExecutedAt: '2026-05-25 09:00',
  },
  {
    id: 2, name: '生日专属关怀', description: '生日月客户专属折扣与祝福', status: 'enabled', executionType: 'auto',
    schedule: { type: 'daily', time: '08:00' }, triggerRules: [initialRule('birthday')], ruleRelation: 'AND',
    actions: [{ type: 'discount', value: '生日月全场8折', channel: 'miniapp' }], targetCount: 0,
    createdAt: '2026-03-01', updatedAt: '2026-05-20', lastExecutedAt: '2026-05-25 08:00',
  },
  {
    id: 3, name: '高价值会员关怀', description: '高等级且高消费客户定制维护', status: 'draft', executionType: 'manual',
    schedule: { type: 'monthly', time: '10:00' }, triggerRules: [initialRule('member_level'), initialRule('consumption')], ruleRelation: 'AND',
    actions: [{ type: 'gift', value: '季度护理礼遇', channel: 'store' }], targetCount: 0,
    createdAt: '2026-05-01', updatedAt: '2026-05-20',
  },
];
let automationStrategies: MarketingAutomationStrategy[] = seededAutomationStrategies.map((strategy) => ({
  ...strategy,
  targetCount: calculateAudience(strategy.triggerRules, strategy.ruleRelation).total,
}));

let automationExecutions: MarketingAutomationExecution[] = [
  { id: 1, strategyId: 1, strategyName: '沉睡客户唤醒计划', status: 'success', triggeredCount: 48, reachedCount: 48, channel: '短信/小程序', executedAt: '2026-05-25 09:00' },
  { id: 2, strategyId: 2, strategyName: '生日专属关怀', status: 'success', triggeredCount: 12, reachedCount: 12, channel: '小程序', executedAt: '2026-05-25 08:00' },
];
let automationTouches: Record<number, MarketingAutomationTouchEffect[]> = {};

export async function mockGetAutomationTriggerOptions(): Promise<MarketingTriggerOption[]> {
  return TRIGGER_OPTIONS.map((option) => ({ ...option, defaultParams: cloneParams(option.defaultParams) }));
}

export async function mockGetAutomationStrategiesPaginated(params: PaginationParams & { keyword?: string; status?: string }): Promise<PaginatedResponse<MarketingAutomationStrategy>> {
  let result = [...automationStrategies];
  if (params.keyword) result = result.filter((item) => item.name.includes(params.keyword!) || item.description.includes(params.keyword!));
  if (params.status && params.status !== 'all') result = result.filter((item) => item.status === params.status);
  const start = (params.page - 1) * params.pageSize;
  return createPaginatedResponse(result.slice(start, start + params.pageSize), result.length, params.page, params.pageSize);
}

function buildStrategy(data: MarketingStrategyInput, status: MarketingAutomationStrategy['status']): MarketingAutomationStrategy {
  const preview = calculateAudience(data.triggerRules, data.ruleRelation);
  const date = new Date().toISOString();
  return { ...data, id: automationIdCounter++, status, targetCount: preview.total, createdAt: date, updatedAt: date };
}

export async function mockCreateAutomationStrategy(data: MarketingStrategyInput): Promise<MarketingAutomationStrategy> {
  const strategy = buildStrategy(data, 'enabled');
  automationStrategies = [strategy, ...automationStrategies];
  return strategy;
}

export async function mockSaveAutomationStrategyDraft(data: MarketingStrategyInput): Promise<MarketingAutomationStrategy> {
  const strategy = buildStrategy(data, 'draft');
  automationStrategies = [strategy, ...automationStrategies];
  return strategy;
}

export async function mockUpdateAutomationStrategy(id: number, data: MarketingStrategyInput): Promise<MarketingAutomationStrategy> {
  const index = automationStrategies.findIndex((item) => item.id === id);
  if (index < 0) throw { message: '营销策略不存在', code: 'STRATEGY_NOT_FOUND' };
  const current = automationStrategies[index];
  const targetCount = calculateAudience(data.triggerRules, data.ruleRelation).total;
  const updated = { ...current, ...data, targetCount, updatedAt: new Date().toISOString() };
  automationStrategies[index] = updated;
  return updated;
}

export async function mockEnableAutomationStrategy(id: number): Promise<MarketingAutomationStrategy> {
  const strategy = automationStrategies.find((item) => item.id === id);
  if (!strategy) throw { message: '营销策略不存在', code: 'STRATEGY_NOT_FOUND' };
  strategy.status = 'enabled';
  strategy.updatedAt = new Date().toISOString();
  return { ...strategy };
}

export async function mockPauseAutomationStrategy(id: number): Promise<MarketingAutomationStrategy> {
  const strategy = automationStrategies.find((item) => item.id === id);
  if (!strategy) throw { message: '营销策略不存在', code: 'STRATEGY_NOT_FOUND' };
  strategy.status = 'paused';
  strategy.updatedAt = new Date().toISOString();
  return { ...strategy };
}

export async function mockDeleteAutomationStrategy(id: number): Promise<void> {
  const exists = automationStrategies.some((item) => item.id === id);
  if (!exists) throw { message: '营销策略不存在', code: 'STRATEGY_NOT_FOUND' };
  automationStrategies = automationStrategies.filter((item) => item.id !== id);
  automationExecutions = automationExecutions.filter((item) => item.strategyId !== id);
}

export async function mockPreviewAutomationAudience(_id: number | 'draft', data: { triggerRules: MarketingTriggerRule[]; ruleRelation: MarketingRuleRelation }): Promise<AudiencePreview> {
  return calculateAudience(data.triggerRules, data.ruleRelation);
}

export async function mockExecuteAutomationStrategy(id: number): Promise<MarketingAutomationExecution> {
  const strategy = automationStrategies.find((item) => item.id === id);
  if (!strategy) throw { message: '营销策略不存在', code: 'STRATEGY_NOT_FOUND' };
  const preview = calculateAudience(strategy.triggerRules, strategy.ruleRelation);
  const execution: MarketingAutomationExecution = {
    id: automationExecutions.length + 1, strategyId: id, strategyName: strategy.name, status: 'success',
    triggeredCount: preview.total, reachedCount: preview.total, channel: strategy.actions.map((item) => item.channel).filter(Boolean).join('/') || '门店',
    executedAt: new Date().toLocaleString('zh-CN'),
  };
  const touches = preview.samples.map((customer, index) => ({
    id: execution.id * 1000 + index,
    customerId: customer.id,
    customerName: customer.name,
    predictedConversionScore: customer.predictedConversionScore || 30,
    predictedRevenue: customer.predictedRevenue || 0,
    channel: execution.channel,
    status: index % 5 === 0 ? 'converted' : 'reached',
    touchedAt: execution.executedAt,
    convertedAt: index % 5 === 0 ? execution.executedAt : undefined,
    conversionType: index % 5 === 0 ? 'order' : undefined,
    actualRevenue: index % 5 === 0 ? Math.round((customer.predictedRevenue || 0) * 1.08) : 0,
    attributionWindowDays: 30,
  }));
  execution.touches = touches;
  automationTouches[execution.id] = touches;
  automationExecutions = [execution, ...automationExecutions];
  strategy.lastExecutedAt = execution.executedAt;
  return execution;
}

export async function mockGetAutomationExecutionsPaginated(params: PaginationParams & { strategyId?: number }): Promise<PaginatedResponse<MarketingAutomationExecution>> {
  const result = params.strategyId ? automationExecutions.filter((item) => item.strategyId === params.strategyId) : automationExecutions;
  const start = (params.page - 1) * params.pageSize;
  return createPaginatedResponse(result.slice(start, start + params.pageSize), result.length, params.page, params.pageSize);
}

export async function mockGetAutomationExecutionById(id: number): Promise<MarketingAutomationExecution | undefined> {
  const execution = automationExecutions.find((item) => item.id === id);
  return execution ? { ...execution, touches: automationTouches[id] || execution.touches || [] } : undefined;
}

export async function mockGetAutomationEffects(): Promise<MarketingAutomationEffect[]> {
  return automationStrategies.map((strategy) => {
    const strategyTouches = Object.entries(automationTouches)
      .filter(([executionId]) => automationExecutions.find((execution) => execution.id === Number(executionId))?.strategyId === strategy.id)
      .flatMap(([, touches]) => touches);
    const reachedCount = strategyTouches.length || strategy.targetCount;
    const predictedConvertedCount = Math.round(strategyTouches.reduce((sum, item) => sum + item.predictedConversionScore / 100, 0));
    const actualConvertedCount = strategyTouches.filter((item) => item.status === 'converted').length;
    const predictedRevenue = strategyTouches.reduce((sum, item) => sum + item.predictedRevenue, 0);
    const actualRevenue = strategyTouches.reduce((sum, item) => sum + (item.actualRevenue || 0), 0);
    return {
      strategyId: strategy.id,
      strategyName: strategy.name,
      reachedCount,
      conversionRate: strategy.status === 'draft' ? '0%' : `${reachedCount ? Math.round(actualConvertedCount / reachedCount * 100) : 0}%`,
      returnRate: strategy.status === 'draft' ? '0%' : `${reachedCount ? Math.round(actualConvertedCount / reachedCount * 100) : 0}%`,
      revenue: actualRevenue || (strategy.status === 'draft' ? 0 : strategy.targetCount * 188),
      cost: strategy.status === 'draft' ? 0 : strategy.targetCount * 22,
      roi: strategy.status === 'draft' ? '-' : '8.5x',
      predictedConvertedCount,
      actualConvertedCount,
      predictedConversionRate: `${reachedCount ? Math.round(predictedConvertedCount / reachedCount * 100) : 0}%`,
      actualConversionRate: `${reachedCount ? Math.round(actualConvertedCount / reachedCount * 100) : 0}%`,
      predictedRevenue,
      actualRevenue,
      revenueDeviation: actualRevenue - predictedRevenue,
    };
  });
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
