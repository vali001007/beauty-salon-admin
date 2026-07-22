import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductProjectRecommendationService } from './product-project-recommendation.service.js';
import { CustomerMarketingProfileService } from './customer-marketing-profile.service.js';
import { CustomerLifecycleOntologyService } from './customer-lifecycle-ontology.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';
import { MarketingChannelService } from './marketing-channel.service.js';
import { buildPredictionRunKey, getShanghaiBusinessDate, MARKETING_PREDICTION_MODEL_VERSION } from './prediction/marketing-prediction.types.js';
import { MarketingAudienceService, type MarketingAudienceResult } from './automation/marketing-audience.service.js';
import { MarketingExecutionService } from './automation/marketing-execution.service.js';
import { isMarketingFeatureEnabledForStore, MarketingFeatureFlagsService } from './marketing-feature-flags.service.js';
import { MarketingEffectFactService } from './attribution/marketing-effect-fact.service.js';
import { ATTRIBUTABLE_TOUCH_STATUS_SET } from './marketing-touch-status.constants.js';

type PageQuery = {
  storeId?: number;
  page?: number;
  pageSize?: number;
  status?: string;
  strategyId?: number;
  keyword?: string;
  source?: string;
  category?: string;
  scenario?: string;
  priority?: string;
};
type PredictionQuery = Omit<PageQuery, 'storeId'> & {
  storeId: number;
  churnLevel?: string;
  ltvTier?: string;
  minRepurchaseScore?: number;
  minMarketingResponseScore?: number;
};
type InvitationCandidateQuery = {
  storeId: number;
  limit?: number;
};
type UnifiedEffectObjectType = 'activity' | 'auto' | 'page' | 'promotion' | 'recommendation' | 'glow';
type UnifiedEffectQuery = {
  objectType?: string;
  objectId?: string | number;
  storeId: number;
};
type RecommendationQueryOptions = {
  scope?: string;
  type?: string;
  limit?: number;
  refresh?: boolean;
  matchPromotion?: boolean;
};
type RecommendationActionExecutionState = {
  done: boolean;
  count: number;
  lastAt?: string;
  label?: string;
  objectIds?: Array<number | string>;
};
type RecommendationExecutionState = {
  automation: RecommendationActionExecutionState;
  activity: RecommendationActionExecutionState;
  followUp: RecommendationActionExecutionState;
};
type UnifiedEffectItem = {
  id: string;
  objectId: number | string;
  objectType: UnifiedEffectObjectType;
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
  metrics?: Record<string, { value: number; source: 'actual' | 'predicted' | 'estimated'; definition: string }>;
  relatedObjectName?: string;
  audienceName?: string;
  promotionName?: string;
  channelName?: string;
  recommendationAttribution?: {
    sourceRecommendationId: string;
    recommendationKey?: string;
    recommendationType?: string;
    originalPromotion?: Record<string, any> | null;
    selectedPromotion?: Record<string, any> | null;
    promotionSwitched: boolean;
    originalOffer?: Record<string, any> | null;
    selectedOffer?: Record<string, any> | null;
  };
};

type PredictionReason = {
  type: 'churn' | 'repurchase' | 'marketing_response' | 'ltv';
  label: string;
  detail: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight?: number;
};

const MODEL_VERSION = MARKETING_PREDICTION_MODEL_VERSION;
const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 30;
const RULE_TEMPLATE_VERSION = '1.0.0';
const RECOMMENDATION_CACHE_TTL_MS = 5 * 60 * 1000;
const ACTIVITY_STATUS_ALIASES: Record<string, string> = {
  draft: 'draft',
  '草稿': 'draft',
  scheduled: 'scheduled',
  '即将开始': 'scheduled',
  active: 'active',
  '进行中': 'active',
  ended: 'ended',
  '已结束': 'ended',
  cancelled: 'cancelled',
  '已取消': 'cancelled',
};

@Injectable()
export class MarketingService {
  private readonly defaultRecommendationImage: string;
  private readonly dailyPredictionLocks = new Map<string, Promise<void>>();
  private readonly recommendationCache = new Map<string, { expiresAt: number; cards: any[] }>();
  private readonly recommendationPromotionCache = new Map<string, { expiresAt: number; items: any[] }>();

  private recommendations: any[] = [
    {
      id: 1,
      title: '高价值客户复购唤醒',
      description: '识别近期进入复购窗口的高价值会员，建议通过企业微信和短信组合触达。',
      scenario: 'repeat_purchase',
      priority: 'high',
      matchScore: 0.86,
      channel: 'wechat',
      status: 'active',
      actionText: '创建复购活动',
      audienceRule: { segment: 'high_value', daysSinceLastVisit: [30, 90] },
    },
  ];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private productProjectRecommendationService?: ProductProjectRecommendationService,
    @Optional() private customerMarketingProfileService?: CustomerMarketingProfileService,
    @Optional() private customerLifecycleOntologyService?: CustomerLifecycleOntologyService,
    @Optional() private marketingChannelService?: MarketingChannelService,
    @Optional() private marketingAudienceService?: MarketingAudienceService,
    @Optional() private marketingExecutionService?: MarketingExecutionService,
    @Optional() private marketingFeatureFlags?: MarketingFeatureFlagsService,
    @Optional() private marketingEffectFactService?: MarketingEffectFactService,
  ) {
    this.defaultRecommendationImage = this.config.get(
      'MARKETING_RECOMMENDATION_IMAGE_URL',
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400',
    );
  }

  async getRecommendations(storeId: number, options: RecommendationQueryOptions = {}) {
    if (!storeId) throw new BadRequestException('storeId is required');
    const cards = options.scope === 'product-project'
      ? await this.getCachedRecommendationCards(storeId, options, async () =>
        this.getProductProjectRecommendationCards(storeId, options.type, options.limit),
      )
      : await this.getCachedRecommendationCards(storeId, options, async () => this.buildCustomerRecommendationCards(storeId, options));

    const withExecutionState = await this.attachRecommendationExecutionStates(cards, storeId);
    return withExecutionState.map((card: any) => ({
      ...card,
      predictionFreshness: this.buildPredictionFreshness(card),
    }));
  }

  private emptyRecommendationActionState(): RecommendationActionExecutionState {
    return { done: false, count: 0, objectIds: [] };
  }

  private emptyRecommendationExecutionState(): RecommendationExecutionState {
    return {
      automation: this.emptyRecommendationActionState(),
      activity: this.emptyRecommendationActionState(),
      followUp: this.emptyRecommendationActionState(),
    };
  }

  private latestDate(...values: Array<Date | string | null | undefined>) {
    const dates = values
      .filter(Boolean)
      .map((value) => new Date(value as any))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    return dates[0]?.toISOString();
  }

  private mergeActionState(
    state: RecommendationActionExecutionState,
    item: { id?: number | string; label?: string; at?: Date | string | null },
  ) {
    const ids = new Set(state.objectIds ?? []);
    if (item.id !== undefined && item.id !== null) ids.add(item.id);
    return {
      done: true,
      count: Math.max(state.count, ids.size || state.count + 1),
      lastAt: this.latestDate(state.lastAt, item.at) ?? state.lastAt,
      label: item.label ?? state.label,
      objectIds: [...ids],
    };
  }

  private extractSourceRecommendationId(value: any) {
    const candidates = [
      value?.sourceRecommendationId,
      value?.offerJson?.attribution?.sourceRecommendationId,
      value?.sourceSignalsJson?.attribution?.sourceRecommendationId,
      value?.schedule?.attribution?.sourceRecommendationId,
      value?.snapshotJson?.attribution?.sourceRecommendationId,
      ...(Array.isArray(value?.actions) ? value.actions.map((action: any) => action?.attribution?.sourceRecommendationId) : []),
    ];
    const candidate = candidates.find((item) => item !== undefined && item !== null && String(item).trim());
    return candidate === undefined || candidate === null ? undefined : String(candidate);
  }

  private async attachRecommendationExecutionStates(cards: any[], storeId: number) {
    if (!Array.isArray(cards) || cards.length === 0) return cards;
    const ids = [...new Set(cards.map((card) => Number(card.id)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!ids.length) {
      return cards.map((card) => ({ ...card, executionState: this.emptyRecommendationExecutionState() }));
    }

    const idStrings = ids.map(String);
    const terminalFollowUpDelegate = (this.prisma as any).terminalFollowUpTask;
    const [activities, strategies, followUpTasks] = await Promise.all([
      this.safeFindMany(this.prisma.marketingActivity, {
        where: {
          storeId,
          sourceRecommendationId: { in: idStrings },
        } as any,
        select: { id: true, title: true, status: true, sourceRecommendationId: true, publishStatus: true, publishedAt: true, updatedAt: true },
      }),
      this.safeFindMany(this.prisma.marketingAutomationStrategy, {
        where: {
          storeId,
          source: 'recommendation',
        } as any,
        select: { id: true, name: true, status: true, schedule: true, actions: true, updatedAt: true, lastExecutedAt: true },
      }),
      this.safeFindMany(terminalFollowUpDelegate, {
        where: {
          recommendationId: { in: ids },
          deletedAt: null,
          storeId,
        },
        select: { id: true, title: true, recommendationId: true, status: true, assignedAt: true, createdAt: true, updatedAt: true },
      }),
    ]);

    const stateById = new Map<string, RecommendationExecutionState>();
    const ensure = (id: string) => {
      const current = stateById.get(id) ?? this.emptyRecommendationExecutionState();
      stateById.set(id, current);
      return current;
    };

    for (const activity of activities as any[]) {
      const sourceId = this.extractSourceRecommendationId(activity);
      if (!sourceId) continue;
      const current = ensure(sourceId);
      current.activity = this.mergeActionState(current.activity, {
        id: activity.id,
        label: activity.publishStatus === 'published' || this.normalizeActivityStatus(activity.status) === 'active'
          ? '活动已发布'
          : '活动已创建',
        at: activity.publishedAt ?? activity.updatedAt,
      });
    }

    for (const strategy of strategies as any[]) {
      const sourceId = this.extractSourceRecommendationId(strategy);
      if (!sourceId) continue;
      const current = ensure(sourceId);
      current.automation = this.mergeActionState(current.automation, {
        id: strategy.id,
        label: strategy.status === 'enabled' ? '自动触达已开启' : '自动触达已创建',
        at: strategy.lastExecutedAt ?? strategy.updatedAt,
      });
    }

    for (const task of followUpTasks as any[]) {
      const sourceId = task.recommendationId ? String(task.recommendationId) : undefined;
      if (!sourceId) continue;
      const current = ensure(sourceId);
      current.followUp = this.mergeActionState(current.followUp, {
        id: task.id,
        label: '跟进已下发',
        at: task.assignedAt ?? task.createdAt ?? task.updatedAt,
      });
    }

    return cards.map((card) => ({
      ...card,
      executionState: stateById.get(String(card.id)) ?? this.emptyRecommendationExecutionState(),
    }));
  }

  private async buildCustomerRecommendationCards(storeId: number, options: RecommendationQueryOptions = {}) {

    try {
      let latestRun: any = null;
      try {
        latestRun = options.refresh === true
          ? await this.ensureDailyRunForRecommendations(storeId)
          : await this.getLatestRunForRecommendations(storeId);
      } catch {
        latestRun = null;
      }

      if (!latestRun || latestRun.snapshotCount === 0) {
        try {
          const totalCustomers = await this.safeCustomerCount(storeId);
          if (totalCustomers > 0) {
            latestRun = await this.getLatestRunForRecommendations(storeId);
          }
        } catch {
          latestRun = null;
        }
      }

      const totalCustomers = latestRun?.customerCount ?? latestRun?.snapshotCount ?? 0;

      if (!latestRun || latestRun.snapshotCount === 0) {
        return this.limitRecommendationCards(this.mergeRecommendationCards(
          this.buildFallbackRecommendationCards(await this.safeCustomerCount(storeId)),
          storeId,
          options,
        ), options.limit);
      }

    const summary = latestRun.summaryJson ?? {};
    const churnDistribution = summary.churnDistribution ?? [];
    const repurchaseDistribution = summary.repurchaseDistribution ?? [];
    const marketingResponseDistribution = summary.marketingResponseDistribution ?? [];
    const ltvDistribution = summary.ltvDistribution ?? [];
    const highChurnCount = this.getDistributionCount(churnDistribution, '高') + this.getDistributionCount(churnDistribution, '极高');
    const criticalChurnCount = this.getDistributionCount(churnDistribution, '极高');
    const repurchaseCount = this.getDistributionCount(repurchaseDistribution, '70-100') + Math.round(this.getDistributionCount(repurchaseDistribution, '40-69') * 0.17);
    const marketingResponseCount = this.getDistributionCount(marketingResponseDistribution, '70-100');
    const highLtvCount = this.getDistributionCount(ltvDistribution, '铂金') + this.getDistributionCount(ltvDistribution, '黄金');
    const expectedLtv6m = Number(summary.expectedLtv6m ?? 0);
    const expectedLtv12m = Number(summary.expectedLtv12m ?? 0);
    const averageChurnScore = Number(summary.avgChurnScore ?? 0);
    const averageRepurchaseScore = Number(summary.avgRepurchase30dScore ?? 0);
    const averageMarketingResponseScore = Number(summary.avgMarketingResponseScore ?? 0);
    const includeRealtimeSignals = options.refresh === true;
    const [snapshotsForCards, behaviorSignals, realtimeSignals] = await Promise.all([
      includeRealtimeSignals ? this.getSnapshotsForRecommendationRun(latestRun.id, storeId) : Promise.resolve([]),
      includeRealtimeSignals ? this.getRecentBehaviorSignals(latestRun.storeId ?? storeId) : Promise.resolve(this.emptyBehaviorSignals()),
      includeRealtimeSignals ? this.getRealtimeSignals(latestRun.storeId ?? storeId) : Promise.resolve(this.emptyRealtimeSignals()),
    ]);
    const highChurnSnapshots = snapshotsForCards.filter((item: any) => ['高', '极高'].includes(item.churnLevel));
    const repurchaseSnapshots = snapshotsForCards.filter((item: any) => item.repurchase30dScore >= 65 && item.churnScore < 70);
    const marketingResponseSnapshots = snapshotsForCards.filter((item: any) => item.marketingResponseScore >= 70);
    const highLtvSnapshots = snapshotsForCards.filter((item: any) => ['铂金', '黄金'].includes(item.ltvTier));
    const cardExpirySnapshots = includeRealtimeSignals
      ? this.pickRealtimeSnapshots(
        snapshotsForCards,
        realtimeSignals.cardExpiry,
        (item: any) => Number(item.featureJson?.cardExpiryUrgencyScore ?? 0) >= 50,
      )
      : [];
    const careCycleSnapshots = includeRealtimeSignals
      ? this.pickRealtimeSnapshots(
        snapshotsForCards,
        realtimeSignals.careCycle,
        (item: any) => Number(item.featureJson?.lastVisitDays ?? 0) >= 21 && item.repurchase30dScore >= 55,
      )
      : [];
    const browseIntentSnapshots = includeRealtimeSignals
      ? this.pickBehaviorSnapshots(
        snapshotsForCards,
        behaviorSignals.browseAbandonment,
        (item: any) => item.marketingResponseScore >= 72 && item.repurchase30dScore >= 55,
      )
      : [];
    const couponExpirySnapshots = includeRealtimeSignals
      ? this.pickBehaviorSnapshots(
        snapshotsForCards,
        this.mergeSignalSets(behaviorSignals.couponClaimedUnused, realtimeSignals.couponClaimedUnused),
        (item: any) => item.marketingResponseScore >= 68 && item.repurchase30dScore >= 45,
      )
      : [];
    const bookingAbandonmentSnapshots = includeRealtimeSignals
      ? this.pickBehaviorSnapshots(
        snapshotsForCards,
        this.mergeSignalSets(behaviorSignals.bookingAbandonment, realtimeSignals.bookingAbandonment),
        (item: any) => item.marketingResponseScore >= 75,
      )
      : [];
    const buildCard = (input: any) => this.buildRecommendationCard({
      ...input,
      storeId,
      skipPromotionMatch: options.matchPromotion === false,
    });
    const cardPromises: Promise<any>[] = [];
    if (highChurnCount) {
      cardPromises.push(buildCard({
        id: 1,
        title: `${highChurnCount} 位高流失风险客户需要唤醒`,
        reason: `最新预测批次识别 ${highChurnCount} 位高流失风险客户，建议按风险等级分层触达。`,
        targetLabel: `高流失风险客户（${highChurnCount}人）`,
        targetCount: highChurnCount,
        matchScore: Math.max(60, Math.min(98, averageMarketingResponseScore)),
        expectedConversionRate: 0.28,
        expectedRevenue: expectedLtv6m * 0.18 * (highChurnCount / Math.max(totalCustomers, 1)),
        strategy: '通过专属回归优惠、顾问关怀和预约提醒挽回高风险客户',
        discount: '回归专享满300减100',
        category: 'churn-alert',
        source: 'churn',
        predictionType: 'churn',
        triggerType: 'dormant',
        priority: 'P0',
        executionModes: ['automation', 'activity'],
        preferredMode: 'automation',
        modeReason: '流失风险会持续变化，适合沉淀为自动唤醒规则；本月也可作为一次性回归活动。',
        offer: { type: 'money_off', label: '回归专享满300减100', threshold: 300, amount: 100, validDays: 30, reason: '高风险客户需要更强唤醒权益，但保留消费门槛避免过度低价。' },
        recommendedItems: [
          { type: 'project', name: '回店护理关怀方案', category: '面部护理', activityPrice: 380, reason: '适合长期未到店客户用低门槛恢复服务关系。', confidence: 86 },
        ],
        recommendedChannels: [
          { channel: 'sms', label: '短信', reason: '沉睡客户小程序活跃度不稳定，短信适合作为强提醒。', priority: 'P0' },
          { channel: 'miniapp', label: '小程序', reason: '配合预约入口和权益领取。', priority: 'P1' },
          { channel: 'store', label: '顾问跟进', reason: '极高风险客户建议顾问二次跟进。', priority: 'P1' },
        ],
        targetSnapshots: highChurnSnapshots,
        tags: ['流失预警', '高优先级'],
        urgency: 'urgent',
        urgencyLabel: '紧急',
        dataEvidence: [
          `高风险 ${highChurnCount - criticalChurnCount} 人，极高风险 ${criticalChurnCount} 人，合计 ${highChurnCount} 人`,
          `全店平均流失分 ${averageChurnScore} 分`,
        ],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (repurchaseCount) {
      cardPromises.push(buildCard({
        id: 2,
        title: `${repurchaseCount} 位客户进入 30 天复购窗口`,
        reason: '复购概率模型显示近期护理周期、到店间隔和次卡状态均适合转化。',
        targetLabel: `30 天复购窗口客户（${repurchaseCount}人）`,
        targetCount: repurchaseCount,
        matchScore: Math.max(60, Math.min(98, averageMarketingResponseScore + 29)),
        expectedConversionRate: 0.36,
        expectedRevenue: expectedLtv6m * 0.12 * (repurchaseCount / Math.max(totalCustomers, 1)),
        strategy: '推荐护理周期提醒、项目搭配券和小程序预约入口',
        discount: '复购专享满500减80',
        category: 'high-conversion',
        source: 'strategy',
        predictionType: 'repurchase',
        triggerType: 'care_cycle',
        priority: 'P1',
        executionModes: ['automation'],
        preferredMode: 'automation',
        modeReason: '复购窗口和护理周期按客户滚动变化，最适合配置为自动规则。',
        offer: { type: 'money_off', label: '复购专享满500减80', threshold: 500, amount: 80, validDays: 21, reason: '复购客户不需要过强折扣，小额券配合护理周期提醒更稳。' },
        recommendedItems: [
          { type: 'project', name: '护理周期复购方案', category: '面部护理', activityPrice: 480, reason: '结合护理周期推动下一次预约。', confidence: 88 },
        ],
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '复购提醒需要直接带预约入口。', priority: 'P0' },
          { channel: 'sms', label: '短信', reason: '对未读小程序消息客户补充提醒。', priority: 'P1' },
        ],
        targetSnapshots: repurchaseSnapshots,
        tags: ['复购机会', '高转化'],
        urgency: 'recommended',
        urgencyLabel: '推荐',
        dataEvidence: [
          `平均复购分 ${averageRepurchaseScore} 分`,
          `平均营销响应 ${averageMarketingResponseScore} 分`,
          `预测批次 ${latestRun.finishedAt?.toISOString() ?? latestRun.startedAt.toISOString()}`,
        ],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (marketingResponseCount) {
      cardPromises.push(buildCard({
        id: 3,
        title: `${marketingResponseCount} 位客户适合活动转化`,
        reason: '营销响应分较高，适合用优惠券、微信/小程序组合触达快速验证。',
        targetLabel: `高营销响应客户（${marketingResponseCount}人）`,
        targetCount: marketingResponseCount,
        matchScore: Math.max(60, Math.min(98, averageMarketingResponseScore + 31)),
        expectedConversionRate: 0.42,
        expectedRevenue: expectedLtv6m * 0.15 * (marketingResponseCount / Math.max(totalCustomers, 1)),
        strategy: '优先推送限时护理体验活动，并沉淀客户级触达效果',
        discount: '限时体验价 + 预约礼包',
        category: 'seasonal',
        source: 'strategy',
        predictionType: 'marketing_response',
        triggerType: 'holiday_campaign',
        priority: 'P1',
        executionModes: ['activity', 'automation'],
        preferredMode: 'activity',
        modeReason: '高响应客户适合快速发起限时活动验证，也可复制为长期高响应人群触达规则。',
        offer: { type: 'trial_price', label: '限时体验价 + 预约礼包', validDays: 14, reason: '高响应客户适合用限时权益促进快速预约。' },
        recommendedItems: [
          { type: 'project', name: '限时护理体验方案', category: '体验活动', activityPrice: 298, reason: '适合高营销响应客户快速决策。', confidence: 84 },
          { type: 'product', name: '修护面膜套装', category: '护肤品', activityPrice: 128, reason: '活动到店后可搭配转化商品。', confidence: 72 },
        ],
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '适合活动页承接、领券和预约。', priority: 'P0' },
          { channel: 'wechat', label: '微信', reason: '适合活动氛围和顾问转发。', priority: 'P1' },
        ],
        targetSnapshots: marketingResponseSnapshots,
        tags: ['活动转化', '预测名单'],
        urgency: 'recommended',
        urgencyLabel: '推荐',
        dataEvidence: [
          `平均响应分 ${averageMarketingResponseScore} 分`,
          `预计转化人数 ${Math.round(marketingResponseCount * 0.42)} 人`,
          `模型版本 ${latestRun.modelVersion}`,
        ],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (highLtvCount) {
      cardPromises.push(buildCard({
        id: 4,
        title: `${highLtvCount} 位高 LTV 客户需要维护`,
        reason: 'LTV 分层显示这些客户未来 12 个月价值高，建议提供权益维护与预约优先权。',
        targetLabel: `高 LTV 客户（${highLtvCount}人）`,
        targetCount: highLtvCount,
        matchScore: Math.max(60, Math.min(98, averageMarketingResponseScore + 30)),
        expectedConversionRate: 0.55,
        expectedRevenue: expectedLtv12m * (highLtvCount / Math.max(totalCustomers, 1)),
        strategy: '为高价值客户提供专属护理方案、季度礼包和顾问跟进',
        discount: 'VIP专属权益',
        category: 'ltv-nurture',
        source: 'ltv',
        predictionType: 'ltv',
        triggerType: 'vip_privilege_care',
        priority: 'P2',
        executionModes: ['automation', 'activity'],
        preferredMode: 'automation',
        modeReason: '高 LTV 客户需要长期权益维护，季度专属活动也可作为补充。',
        offer: { type: 'member_privilege', label: 'VIP专属权益', validDays: 90, reason: '高价值客户优先权益和顾问服务，避免过度低价促销。' },
        recommendedItems: [
          { type: 'package', name: '季度高端护理礼遇', category: 'VIP权益', reason: '适合高价值客户持续维护和消费升级。', confidence: 90 },
        ],
        recommendedChannels: [
          { channel: 'store', label: '顾问跟进', reason: '高价值客户更适合一对一服务。', priority: 'P0' },
          { channel: 'wechat', label: '微信', reason: '适合发送权益说明和预约确认。', priority: 'P1' },
        ],
        targetSnapshots: highLtvSnapshots,
        tags: ['LTV维护', '高价值'],
        urgency: 'opportunity',
        urgencyLabel: '机会',
        dataEvidence: [
          `铂金 ${this.getDistributionCount(ltvDistribution, '铂金')} 人`,
          `黄金 ${this.getDistributionCount(ltvDistribution, '黄金')} 人`,
          `预计12个月价值 ¥${Math.round(expectedLtv12m).toLocaleString()}`,
        ],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (cardExpirySnapshots.length) {
      cardPromises.push(buildCard({
        id: 5,
        title: `${cardExpirySnapshots.length} 位客户次卡/套餐需要提醒使用`,
        reason: '客户仍有有效卡项，且存在剩余次数较少或临近到期信号，建议优先提醒核销并推荐续卡。',
        targetLabel: `次卡/套餐待使用客户（${cardExpirySnapshots.length}人）`,
        targetCount: cardExpirySnapshots.length,
        matchScore: Math.max(70, Math.min(96, this.average(cardExpirySnapshots.map((item: any) => item.marketingResponseScore)) + 12)),
        expectedConversionRate: 0.38,
        expectedRevenue: cardExpirySnapshots.reduce((sum: number, item: any) => sum + Number(item.ltv6m ?? 0), 0) * 0.08,
        strategy: '到期前提醒客户消耗剩余权益，并在到店时推荐续卡或升级套餐',
        discount: '续卡专享赠护理一次',
        category: 'member-care',
        source: 'strategy',
        predictionType: 'strategy',
        triggerType: 'card_expiry',
        priority: 'P0',
        executionModes: ['automation'],
        preferredMode: 'automation',
        modeReason: '卡项到期和剩余次数是持续变化事件，适合自动提醒和续卡触达。',
        offer: { type: 'gift', label: '续卡专享赠护理一次', validDays: 30, reason: '权益类赠送比直接打折更适合卡项续费场景。' },
        recommendedItems: [
          { type: 'card', name: '护理次卡续费方案', category: '卡项', reason: '客户已有卡项使用习惯，适合续卡或升级。', confidence: 86 },
        ],
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '直接承接卡项查询、预约和续费入口。', priority: 'P0' },
          { channel: 'sms', label: '短信', reason: '到期提醒需要更高触达率。', priority: 'P1' },
        ],
        targetSnapshots: cardExpirySnapshots,
        tags: ['次卡到期', '权益提醒'],
        urgency: 'urgent',
        urgencyLabel: '紧急',
        dataEvidence: [
          `有效卡项客户 ${cardExpirySnapshots.length} 人`,
          '剩余次数低或 30 天内到期优先',
          `模型版本 ${latestRun.modelVersion}`,
        ],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (careCycleSnapshots.length) {
      cardPromises.push(buildCard({
        id: 6,
        title: `${careCycleSnapshots.length} 位客户护理周期已到复购提醒点`,
        reason: '客户距离上次到店已超过常见护理周期，且复购/营销响应分较高，适合推送预约提醒。',
        targetLabel: `护理周期到期客户（${careCycleSnapshots.length}人）`,
        targetCount: careCycleSnapshots.length,
        matchScore: Math.max(65, Math.min(96, this.average(careCycleSnapshots.map((item: any) => item.repurchase30dScore)) + 8)),
        expectedConversionRate: 0.34,
        expectedRevenue: careCycleSnapshots.reduce((sum: number, item: any) => sum + Number(item.ltv6m ?? 0), 0) * 0.07,
        strategy: '按上次护理后的 28 天周期推送预约提醒，搭配小额项目券',
        discount: '护理周期专享满500减80',
        category: 'high-conversion',
        source: 'strategy',
        predictionType: 'repurchase',
        triggerType: 'care_cycle',
        priority: 'P1',
        executionModes: ['automation'],
        preferredMode: 'automation',
        modeReason: '护理周期是客户级滚动事件，适合长期自动规则。',
        offer: { type: 'money_off', label: '护理周期专享满500减80', threshold: 500, amount: 80, validDays: 21, reason: '小额优惠配合预约入口即可推动复购。' },
        recommendedItems: [
          { type: 'project', name: '护理周期复购项目', category: '面部护理', activityPrice: 480, reason: '匹配 21-30 天常见复购节奏。', confidence: 88 },
        ],
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '直接承接预约。', priority: 'P0' },
          { channel: 'wechat', label: '微信', reason: '顾问可补充护理建议。', priority: 'P2' },
        ],
        targetSnapshots: careCycleSnapshots,
        tags: ['护理周期', '复购提醒'],
        urgency: 'recommended',
        urgencyLabel: '推荐',
        dataEvidence: [
          `平均复购分 ${this.average(careCycleSnapshots.map((item: any) => item.repurchase30dScore))} 分`,
          '排除高流失客户后优先提醒复购窗口客户',
        ],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (browseIntentSnapshots.length) {
      cardPromises.push(buildCard({
        id: 7,
        title: `${browseIntentSnapshots.length} 位客户适合小程序浏览未预约触达`,
        reason: '当前尚未接入完整小程序行为事件，先用高响应 + 高复购客户作为浏览意图规则的种子人群；接入埋点后将切换为真实浏览未预约事件。',
        targetLabel: `高意图种子客户（${browseIntentSnapshots.length}人）`,
        targetCount: browseIntentSnapshots.length,
        matchScore: Math.max(70, Math.min(98, this.average(browseIntentSnapshots.map((item: any) => item.marketingResponseScore)) + 10)),
        expectedConversionRate: 0.4,
        expectedRevenue: browseIntentSnapshots.reduce((sum: number, item: any) => sum + Number(item.ltv6m ?? 0), 0) * 0.09,
        strategy: '客户浏览项目/活动页后 24 小时未预约时，推送项目案例、体验券和预约入口',
        discount: '浏览专属体验券',
        category: 'high-conversion',
        source: 'strategy',
        predictionType: 'marketing_response',
        triggerType: 'browse_abandonment',
        priority: 'P1',
        executionModes: ['automation'],
        preferredMode: 'automation',
        modeReason: '浏览未预约是典型行为事件，必须由自动规则实时承接。',
        offer: { type: 'trial_price', label: '浏览专属体验券', validDays: 7, reason: '浏览后短时间内给轻权益，强化预约决策。' },
        recommendedItems: [
          { type: 'project', name: '浏览项目同类体验方案', category: '行为推荐', activityPrice: 298, reason: '接入真实浏览事件后按项目详情页自动匹配。', confidence: 80 },
        ],
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '浏览行为发生在小程序，最适合原渠道召回。', priority: 'P0' },
          { channel: 'sms', label: '短信', reason: '24 小时未响应后可补充提醒。', priority: 'P2' },
        ],
        targetSnapshots: browseIntentSnapshots,
        tags: ['浏览未预约', '行为触发'],
        urgency: 'recommended',
        urgencyLabel: '推荐',
        dataEvidence: [
          '当前为高意图种子规则，后续接入 CustomerBehaviorEvent 后切换为真实浏览事件',
          `平均营销响应 ${this.average(browseIntentSnapshots.map((item: any) => item.marketingResponseScore))} 分`,
        ],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (couponExpirySnapshots.length) {
      cardPromises.push(buildCard({
        id: 10,
        title: `${couponExpirySnapshots.length} 位客户适合优惠券到期提醒`,
        reason: '当前优惠券资产表尚未独立接入，先以高响应客户作为券到期规则种子；接入券资产后将按 D-7/D-3/D-1 真实到期时间命中。',
        targetLabel: `优惠券到期提醒种子客户（${couponExpirySnapshots.length}人）`,
        targetCount: couponExpirySnapshots.length,
        matchScore: Math.max(68, Math.min(96, this.average(couponExpirySnapshots.map((item: any) => item.marketingResponseScore)) + 8)),
        expectedConversionRate: 0.33,
        expectedRevenue: couponExpirySnapshots.reduce((sum: number, item: any) => sum + Number(item.ltv6m ?? 0), 0) * 0.06,
        strategy: '优惠券到期前分三段提醒客户使用，并搭配适配项目预约入口',
        discount: '优惠券到期提醒',
        category: 'high-conversion',
        source: 'strategy',
        predictionType: 'marketing_response',
        triggerType: 'coupon_expiry',
        priority: 'P0',
        executionModes: ['automation'],
        preferredMode: 'automation',
        modeReason: '优惠券到期是时间敏感事件，适合自动规则按到期日滚动触发。',
        offer: { type: 'money_off', label: '优惠券到期提醒', validDays: 7, reason: '用客户已持有权益推动核销，避免额外让利。' },
        recommendedItems: [{ type: 'project', name: '优惠券适配护理项目', category: '权益核销', reason: '后续按券适用项目自动匹配。', confidence: 78 }],
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '展示券状态、适用项目和预约入口。', priority: 'P0' },
          { channel: 'sms', label: '短信', reason: 'D-1 可补充强提醒。', priority: 'P1' },
        ],
        targetSnapshots: couponExpirySnapshots,
        tags: ['优惠券到期', '权益核销'],
        urgency: 'urgent',
        urgencyLabel: '紧急',
        dataEvidence: ['券资产表接入前采用高响应种子客户，接入后按真实优惠券到期时间命中。'],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (bookingAbandonmentSnapshots.length) {
      cardPromises.push(buildCard({
        id: 11,
        title: `${bookingAbandonmentSnapshots.length} 位客户适合预约放弃召回`,
        reason: '当前预约放弃埋点尚未完全接入，先以高营销响应客户作为规则种子；接入 booking_started/booking_abandoned 后将按真实事件触发。',
        targetLabel: `预约放弃召回种子客户（${bookingAbandonmentSnapshots.length}人）`,
        targetCount: bookingAbandonmentSnapshots.length,
        matchScore: Math.max(72, Math.min(98, this.average(bookingAbandonmentSnapshots.map((item: any) => item.marketingResponseScore)) + 9)),
        expectedConversionRate: 0.36,
        expectedRevenue: bookingAbandonmentSnapshots.reduce((sum: number, item: any) => sum + Number(item.ltv6m ?? 0), 0) * 0.08,
        strategy: '客户进入预约流程后 2 小时未提交时，推荐继续预约、相邻时段或顾问协助',
        discount: '预约保留提醒 + 到店小礼',
        category: 'high-conversion',
        source: 'strategy',
        predictionType: 'marketing_response',
        triggerType: 'booking_abandonment',
        priority: 'P0',
        executionModes: ['automation'],
        preferredMode: 'automation',
        modeReason: '预约放弃是强行为意图事件，必须自动实时召回。',
        offer: { type: 'gift', label: '预约保留提醒 + 到店小礼', validDays: 3, reason: '预约放弃场景更适合轻权益和顾问协助。' },
        recommendedItems: [{ type: 'project', name: '预约流程中断项目', category: '预约召回', reason: '接入真实事件后按客户选择过的项目和时间自动匹配。', confidence: 82 }],
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '回到原预约流程继续提交。', priority: 'P0' },
          { channel: 'sms', label: '短信', reason: '2 小时未完成后补充提醒。', priority: 'P1' },
        ],
        targetSnapshots: bookingAbandonmentSnapshots,
        tags: ['预约放弃', '行为召回'],
        urgency: 'urgent',
        urgencyLabel: '紧急',
        dataEvidence: ['预约放弃埋点接入前采用高响应种子客户，接入后按 booking_abandoned 事件命中。'],
        totalCustomers,
        run: latestRun,
      }));
    }

    cardPromises.push(...this.buildCalendarScenarioCards({
      storeId,
      latestRun,
      totalCustomers,
      snapshots: marketingResponseSnapshots.length ? marketingResponseSnapshots : snapshotsForCards.slice(0, 80),
      averageMarketingResponseScore,
      expectedLtv6m,
      skipPromotionMatch: options.matchPromotion === false,
    }));
    const cards = await Promise.all(cardPromises);
    const lifecycleCards = await this.getLifecycleRecommendationCards(storeId, options);

      return this.limitRecommendationCards(this.mergeRecommendationCards(
        [...lifecycleCards, ...(cards.length ? cards : this.buildFallbackRecommendationCards(totalCustomers, latestRun))],
        storeId,
        options,
      ), options.limit);
    } catch {
      return this.limitRecommendationCards(this.mergeRecommendationCards(
        this.buildFallbackRecommendationCards(await this.safeCustomerCount(storeId)),
        storeId,
        options,
      ), options.limit);
    }
  }

  private mergeRecommendationCards(customerCards: any[], storeId: number, options: RecommendationQueryOptions = {}) {
    const scope = options.scope ?? 'all';
    const visibleCustomerCards = scope === 'product-project' ? [] : customerCards;
    const cards = [...visibleCustomerCards];
    if (!options.type) return cards;
    return cards.filter((card: any) => card.recommendationType === options.type || card.triggerType === options.type || card.predictionType === options.type);
  }

  private async getProductProjectRecommendationCards(storeId: number, type?: string, limit?: number) {
    try {
      return await this.productProjectRecommendationService?.getCards(storeId, { type, limit }) ?? [];
    } catch {
      return [];
    }
  }

  async getRecommendationCoverage(storeId: number, now = new Date()) {
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('storeId is required');
    const [totalCustomers, predictionRun] = await Promise.all([
      this.prisma.customer.count({ where: { storeId, deletedAt: null } }),
      this.prisma.predictionRun.findFirst({
        where: { storeId, status: 'completed' },
        orderBy: [{ businessDate: 'desc' }, { finishedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, customerCount: true, startedAt: true, finishedAt: true },
      }),
    ]);
    const predictedCustomers = Number(predictionRun?.customerCount ?? 0);
    const generatedAt = predictionRun?.finishedAt ?? predictionRun?.startedAt ?? null;
    const ageHours = generatedAt ? (now.getTime() - generatedAt.getTime()) / 3600000 : null;
    return {
      totalCustomers,
      predictedCustomers,
      coverageRate: totalCustomers > 0 ? Number(((predictedCustomers / totalCustomers) * 100).toFixed(2)) : 0,
      predictionRunId: predictionRun?.id ?? null,
      generatedAt: generatedAt?.toISOString() ?? null,
      freshness: ageHours === null ? 'missing' as const : ageHours > 30 ? 'stale' as const : 'fresh' as const,
    };
  }

  private async getLifecycleRecommendationCards(storeId: number, options: RecommendationQueryOptions = {}) {
    if (!this.customerLifecycleOntologyService) return [];
    if (options.type && !['care_cycle_due', 'card_expiring', 'dormant_winback', 'coupon_claimed_unused', 'browse_abandonment'].includes(options.type)) {
      return [];
    }
    try {
      const cards = await this.customerLifecycleOntologyService.buildRecommendationCards(storeId, options.limit ?? 20);
      return options.type ? cards.filter((card: any) => card.recommendationType === options.type || card.triggerType === options.type) : cards;
    } catch {
      return [];
    }
  }

  private limitRecommendationCards(cards: any[], limit?: number) {
    const normalizedLimit = Math.max(1, Math.min(50, Number(limit ?? 20)));
    return cards.slice(0, normalizedLimit);
  }

  private normalizeRecommendationScope(scope?: string) {
    return scope === 'product-project' ? 'product-project' : 'customer';
  }

  private buildRecommendationCacheKey(storeId: number, options: RecommendationQueryOptions, runId?: number | null) {
    const scope = this.normalizeRecommendationScope(options.scope);
    const type = options.type || 'all';
    const limit = Math.max(1, Math.min(50, Number(options.limit ?? 20)));
    return `${storeId}:${scope}:${type}:${limit}:${runId ?? 'no-run'}:${MODEL_VERSION}`;
  }

  private async getCachedRecommendationCards(storeId: number, options: RecommendationQueryOptions, build: () => Promise<any[]>) {
    const latestRun = await this.getLatestRunForRecommendations(storeId).catch(() => null);
    const cacheKey = this.buildRecommendationCacheKey(storeId, options, latestRun?.id);
    const now = Date.now();
    if (!options.refresh) {
      const memoryHit = this.recommendationCache.get(cacheKey);
      if (memoryHit && memoryHit.expiresAt > now) return memoryHit.cards;
      const snapshot = await this.readRecommendationSnapshot(cacheKey);
      if (snapshot) {
        this.recommendationCache.set(cacheKey, { expiresAt: now + RECOMMENDATION_CACHE_TTL_MS, cards: snapshot });
        return snapshot;
      }
    }

    const cards = await build();
    this.recommendationCache.set(cacheKey, { expiresAt: now + RECOMMENDATION_CACHE_TTL_MS, cards });
    void this.writeRecommendationSnapshot(cacheKey, storeId, options, latestRun?.id, cards);
    return cards;
  }

  private async readRecommendationSnapshot(cacheKey: string) {
    const delegate = (this.prisma as any).marketingRecommendationSnapshot;
    if (!delegate?.findUnique) return null;
    try {
      const snapshot = await delegate.findUnique({ where: { cacheKey } });
      if (!snapshot) return null;
      if (snapshot.expiresAt && new Date(snapshot.expiresAt).getTime() < Date.now()) return null;
      return Array.isArray(snapshot.cardsJson) ? snapshot.cardsJson : null;
    } catch {
      return null;
    }
  }

  private async writeRecommendationSnapshot(cacheKey: string, storeId: number, options: RecommendationQueryOptions, runId: number | undefined, cards: any[]) {
    const delegate = (this.prisma as any).marketingRecommendationSnapshot;
    if (!delegate?.upsert) return;
    const scope = this.normalizeRecommendationScope(options.scope);
    const expiresAt = new Date(Date.now() + RECOMMENDATION_CACHE_TTL_MS);
    try {
      await delegate.upsert({
        where: { cacheKey },
        create: {
          cacheKey,
          storeId,
          scope,
          type: options.type ?? null,
          predictionRunId: runId ?? null,
          cardsJson: cards,
          cardCount: cards.length,
          sourceVersion: MODEL_VERSION,
          generatedAt: new Date(),
          expiresAt,
        },
        update: {
          cardsJson: cards,
          cardCount: cards.length,
          predictionRunId: runId ?? null,
          sourceVersion: MODEL_VERSION,
          generatedAt: new Date(),
          expiresAt,
        },
      });
    } catch {
      // 推荐快照只是性能优化，写入失败不影响实时结果返回。
    }
  }

  private async safeCustomerCount(storeId: number) {
    try {
      return await this.prisma.customer.count({ where: { deletedAt: null, storeId } });
    } catch {
      try {
        return await this.prisma.customer.count({ where: { storeId } });
      } catch {
        return 0;
      }
    }
  }

  private buildFallbackRecommendationCards(totalCustomers = 0, latestRun?: any) {
    const targetCount = Math.max(0, Math.round(totalCustomers * 0.2));
    return this.recommendations.map((item) => ({
      ...item,
      reason: item.reason ?? item.description,
      matchScore: item.matchScore <= 1 ? Math.round(item.matchScore * 100) : item.matchScore,
      targetCustomerIds: [],
      targetCount,
      targetCustomers: `目标客户 ${targetCount} 人`,
      expectedConversion: '预计转化率 20%',
      expectedRevenue: '预计营收 ¥0',
      strategy: item.description,
      discount: '门店专属权益',
      duration: '建议周期: 30天',
      image: this.defaultRecommendationImage,
      tags: ['兼容推荐'],
      category: 'high-conversion',
      source: 'strategy',
      urgency: 'recommended',
      urgencyLabel: '推荐',
      preferAutoRule: false,
      executionModes: ['activity'],
      preferredMode: 'activity',
      modeReason: '暂无可用预测批次时先作为一次性活动建议，刷新预测后可生成自动规则。',
      priority: 'P2',
      recommendedChannels: [
        { channel: 'miniapp', label: '小程序', reason: '用于活动页和预约入口承接。', priority: 'P0' },
      ],
      offer: { type: 'member_privilege', label: '门店专属权益', validDays: 30, reason: '兼容推荐默认权益。' },
      recommendedItems: [
        { type: 'project', name: '会员护理推荐方案', category: '面部护理', reason: item.description, confidence: 60 },
      ],
      audienceSnapshot: {
        predictionRunId: latestRun?.id,
        generatedAt: new Date().toISOString(),
        ruleSummary: '暂无预测命中名单，未固化客户名单',
        customerIds: [],
        totalCustomers: targetCount,
        sampleReasons: [],
      },
      sourceSignals: ['fallback', 'strategy'],
      totalCustomers,
      predictionRunId: latestRun?.id,
      modelVersion: latestRun?.modelVersion ?? MODEL_VERSION,
      predictionType: 'strategy',
      predictionRunFinishedAt: latestRun?.finishedAt ?? latestRun?.startedAt,
      dataEvidence: ['预测数据暂不可用，先展示可创建活动的兼容推荐，避免运营流程中断'],
      isFallback: true,
    }));
  }

  private async ensureDailyRunForRecommendations(storeId: number) {
    const todayRun = await this.getLatestRunForRecommendations(storeId, { todayOnly: true });
    if ((todayRun?.snapshotCount ?? 0) > 0) return todayRun;

    const totalCustomers = await this.safeCustomerCount(storeId);
    if (totalCustomers <= 0) return todayRun;

    const { start } = this.getShanghaiBusinessDayRange();
    const lockKey = `${storeId}:${formatBusinessDate(start)}`;
    let lock = this.dailyPredictionLocks.get(lockKey);
    if (!lock) {
      lock = this.runPredictions(storeId).then(() => undefined);
      this.dailyPredictionLocks.set(lockKey, lock);
      lock.finally(() => this.dailyPredictionLocks.delete(lockKey)).catch(() => undefined);
    }

    await lock;
    return this.getLatestRunForRecommendations(storeId, { todayOnly: true });
  }

  private getShanghaiBusinessDayRange(now = new Date()) {
    const dayMs = 24 * 60 * 60 * 1000;
    const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
    const startMs = Math.floor((now.getTime() + shanghaiOffsetMs) / dayMs) * dayMs - shanghaiOffsetMs;
    return {
      start: new Date(startMs),
      end: new Date(startMs + dayMs),
    };
  }

  private async getLatestRunForRecommendations(storeId: number, options: { todayOnly?: boolean } = {}) {
    const { start, end } = this.getShanghaiBusinessDayRange();
    const run = await this.prisma.predictionRun.findFirst({
      where: {
        status: 'completed',
        storeId,
        ...(options.todayOnly ? { finishedAt: { gte: start, lt: end } } : {}),
      },
      orderBy: { finishedAt: 'desc' },
    });
    if (!run) return null;
    return { ...run, snapshotCount: run.customerCount ?? 0 };
  }

  private getDistributionCount(distribution: Array<{ label: string; count: number }> = [], label: string) {
    return Number(distribution.find((item) => item.label === label)?.count ?? 0);
  }

  private async getSnapshotsForRecommendationRun(runId: number, storeId: number) {
    return this.prisma.customerPredictionSnapshot.findMany({
      where: { runId, storeId },
      take: 500,
      orderBy: [{ marketingResponseScore: 'desc' }, { repurchase30dScore: 'desc' }],
    });
  }

  private async getRecentBehaviorSignals(storeId: number) {
    const empty = this.emptyBehaviorSignals();
    const delegate = (this.prisma as any).customerBehaviorEvent;
    if (!delegate?.findMany) return empty;
    const since = new Date();
    since.setDate(since.getDate() - 7);
    let events: any[] = [];
    try {
      events = await delegate.findMany({
        where: {
          storeId,
          occurredAt: { gte: since },
          eventType: {
            in: [
              'miniapp_project_viewed',
              'miniapp_product_viewed',
              'activity_page_viewed',
              'booking_started',
              'booking_abandoned',
              'booking_completed',
              'coupon_claimed',
              'coupon_viewed',
              'coupon_redeemed',
              'order_paid',
            ],
          },
        },
        take: 1000,
        orderBy: { occurredAt: 'desc' },
      });
    } catch {
      return empty;
    }
    const bookedOrPurchased = new Set<number>();
    for (const event of events) {
      if (['booking_completed', 'order_paid', 'coupon_redeemed'].includes(event.eventType)) {
        bookedOrPurchased.add(Number(event.customerId));
      }
    }
    const signals = {
      browseAbandonment: new Set<number>(),
      bookingAbandonment: new Set<number>(),
      couponClaimedUnused: new Set<number>(),
    };
    for (const event of events) {
      const customerId = Number(event.customerId);
      if (bookedOrPurchased.has(customerId)) continue;
      if (['miniapp_project_viewed', 'miniapp_product_viewed', 'activity_page_viewed'].includes(event.eventType)) {
        signals.browseAbandonment.add(customerId);
      }
      if (['booking_started', 'booking_abandoned'].includes(event.eventType)) {
        signals.bookingAbandonment.add(customerId);
      }
      if (['coupon_claimed', 'coupon_viewed'].includes(event.eventType)) {
        signals.couponClaimedUnused.add(customerId);
      }
    }
    return signals;
  }

  private async getRealtimeSignals(storeId: number) {
    const empty = this.emptyRealtimeSignals();
    const now = new Date();
    const careCycleThreshold = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const bookingWindow = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const customerWhere = { storeId, deletedAt: null };

    const safeFindMany = async (delegateName: string, args: any) => {
      const delegate = (this.prisma as any)[delegateName];
      if (!delegate?.findMany) return [];
      try {
        return await delegate.findMany(args);
      } catch {
        return [];
      }
    };

    const [lowRemainingCards, lowRemainingUsageRecords, oldCompletedReservations, recentReservations, abandonedReservations, couponEvents] = await Promise.all([
      safeFindMany('customerCard', {
        where: {
          status: 'active',
          remainingTimes: { gt: 0, lte: 2 },
          expiryDate: { gte: now },
          customer: customerWhere,
        },
        select: { customerId: true },
        take: 2000,
      }),
      safeFindMany('cardUsageRecord', {
        where: {
          remainingTimes: { gt: 0, lte: 2 },
          customer: customerWhere,
        },
        select: { customerId: true },
        take: 2000,
      }),
      safeFindMany('reservation', {
        where: {
          storeId,
          status: { in: ['completed', 'done', 'finished'] },
          date: { lte: careCycleThreshold },
          customer: customerWhere,
        },
        select: { customerId: true, date: true },
        take: 3000,
      }),
      safeFindMany('reservation', {
        where: {
          storeId,
          status: { notIn: ['cancelled', 'canceled'] },
          date: { gt: careCycleThreshold },
          customer: customerWhere,
        },
        select: { customerId: true },
        take: 3000,
      }),
      safeFindMany('reservation', {
        where: {
          storeId,
          status: { in: ['cancelled', 'canceled'] },
          date: { gte: bookingWindow },
          customer: customerWhere,
        },
        select: { customerId: true },
        take: 2000,
      }),
      safeFindMany('recommendationEvent', {
        where: {
          storeId,
          eventType: { in: ['coupon_claimed', 'coupon_viewed', 'promotion_claimed', 'promotion_viewed'] },
          createdAt: { gte: bookingWindow },
          customer: customerWhere,
        },
        select: { customerId: true, eventType: true },
        take: 2000,
      }),
    ]);

    for (const item of [...lowRemainingCards, ...lowRemainingUsageRecords]) {
      if (item?.customerId) empty.cardExpiry.add(Number(item.customerId));
    }

    const recentlyVisited = new Set<number>();
    for (const item of recentReservations) {
      if (item?.customerId) recentlyVisited.add(Number(item.customerId));
    }
    for (const item of oldCompletedReservations) {
      const customerId = Number(item?.customerId);
      if (customerId && !recentlyVisited.has(customerId)) empty.careCycle.add(customerId);
    }

    for (const item of abandonedReservations) {
      if (item?.customerId) empty.bookingAbandonment.add(Number(item.customerId));
    }
    for (const item of couponEvents) {
      if (item?.customerId) empty.couponClaimedUnused.add(Number(item.customerId));
    }

    return empty;
  }

  private emptyBehaviorSignals() {
    return {
      browseAbandonment: new Set<number>(),
      bookingAbandonment: new Set<number>(),
      couponClaimedUnused: new Set<number>(),
    };
  }

  private emptyRealtimeSignals() {
    return {
      cardExpiry: new Set<number>(),
      careCycle: new Set<number>(),
      bookingAbandonment: new Set<number>(),
      couponClaimedUnused: new Set<number>(),
    };
  }

  private pickBehaviorSnapshots(snapshots: any[], customerIds: Set<number>, fallback: (snapshot: any) => boolean) {
    const eventMatched = customerIds.size
      ? snapshots.filter((snapshot: any) => customerIds.has(Number(snapshot.customerId)))
      : [];
    return eventMatched.length ? eventMatched : snapshots.filter(fallback);
  }

  private pickRealtimeSnapshots(snapshots: any[], customerIds: Set<number>, fallback: (snapshot: any) => boolean) {
    const realtimeMatched = customerIds.size
      ? snapshots.filter((snapshot: any) => customerIds.has(Number(snapshot.customerId)))
      : [];
    return realtimeMatched.length ? realtimeMatched : snapshots.filter(fallback);
  }

  private mergeSignalSets(...sets: Set<number>[]) {
    const merged = new Set<number>();
    for (const set of sets) {
      for (const value of set) merged.add(Number(value));
    }
    return merged;
  }

  private buildCalendarScenarioCards(input: {
    storeId: number;
    latestRun: any;
    totalCustomers: number;
    snapshots: any[];
    averageMarketingResponseScore: number;
    expectedLtv6m: number;
    skipPromotionMatch?: boolean;
  }) {
    const { storeId, latestRun, totalCustomers, snapshots, averageMarketingResponseScore, expectedLtv6m } = input;
    if (!snapshots.length) return [];
    const now = new Date();
    const month = now.getMonth() + 1;
    const season = this.getSeason(month);
    const holiday = this.getUpcomingHoliday(month);
    const seasonalTheme = this.getSeasonalCareTheme(season);
    const seasonalSnapshots = snapshots.slice(0, Math.max(1, Math.min(snapshots.length, Math.round(totalCustomers * 0.25))));
    const cards = [
      this.buildRecommendationCard({
        id: 8,
        title: `${seasonalTheme.title}适合提前启动`,
        reason: `${season}季肤况变化明显，建议按肤质和近期护理节奏发起${seasonalTheme.focus}主题。`,
        targetLabel: `${seasonalTheme.audience}（${seasonalSnapshots.length}人）`,
        targetCount: seasonalSnapshots.length,
        matchScore: Math.max(62, Math.min(94, averageMarketingResponseScore + 8)),
        expectedConversionRate: 0.3,
        expectedRevenue: expectedLtv6m * 0.1,
        strategy: seasonalTheme.strategy,
        discount: seasonalTheme.offerLabel,
        category: 'seasonal',
        source: 'strategy',
        predictionType: 'marketing_response',
        triggerType: 'seasonal_skin_care',
        priority: 'P2',
        executionModes: ['activity', 'automation'],
        preferredMode: 'activity',
        modeReason: '季节换肤有明确主题和周期，适合作为活动页承接；也可沉淀为季节规则。',
        offer: seasonalTheme.offer,
        recommendedItems: seasonalTheme.items,
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '适合活动页、项目介绍和预约入口。', priority: 'P0' },
          { channel: 'wechat', label: '微信', reason: '适合顾问转发护理建议。', priority: 'P1' },
        ],
        targetSnapshots: seasonalSnapshots,
        tags: ['季节护肤', seasonalTheme.focus],
        urgency: 'opportunity',
        urgencyLabel: '机会',
        dataEvidence: [
          `${season}季护理主题：${seasonalTheme.focus}`,
          `目标客户按营销响应分和复购分排序，取前 ${seasonalSnapshots.length} 人`,
        ],
        totalCustomers,
        storeId,
        run: latestRun,
        skipPromotionMatch: input.skipPromotionMatch,
      }),
    ];

    if (holiday) {
      const holidaySnapshots = snapshots.slice(0, Math.max(1, Math.min(snapshots.length, Math.round(totalCustomers * 0.18))));
      cards.push(this.buildRecommendationCard({
        id: 9,
        title: `${holiday}主题营销活动建议`,
        reason: `${holiday}前适合提前 15-30 天预热，优先触达营销响应高、近期可复购的客户。`,
        targetLabel: `${holiday}活动目标客户（${holidaySnapshots.length}人）`,
        targetCount: holidaySnapshots.length,
        matchScore: Math.max(65, Math.min(96, averageMarketingResponseScore + 12)),
        expectedConversionRate: 0.32,
        expectedRevenue: expectedLtv6m * 0.12,
        strategy: `创建${holiday}限定护理活动，搭配小程序活动页、节日礼包和预约入口`,
        discount: `${holiday}专享护理礼遇`,
        category: 'seasonal',
        source: 'strategy',
        predictionType: 'marketing_response',
        triggerType: 'holiday_campaign',
        priority: 'P2',
        executionModes: ['activity'],
        preferredMode: 'activity',
        modeReason: '节假日营销有明确开始/结束时间，更适合一次性活动。',
        offer: { type: 'bundle', label: `${holiday}专享护理礼遇`, validDays: 21, reason: '节日活动适合组合权益和礼包表达。' },
        recommendedItems: [
          { type: 'package', name: `${holiday}护理礼遇套餐`, category: '节日活动', reason: '适合节日氛围和礼品化表达。', confidence: 82 },
        ],
        recommendedChannels: [
          { channel: 'miniapp', label: '小程序', reason: '活动页承接。', priority: 'P0' },
          { channel: 'moments', label: '朋友圈', reason: '节日活动适合裂变传播。', priority: 'P1' },
          { channel: 'group', label: '社群', reason: '适合活动预热和名额提醒。', priority: 'P2' },
        ],
        targetSnapshots: holidaySnapshots,
        tags: ['节假日', '活动营销'],
        urgency: 'opportunity',
        urgencyLabel: '机会',
        dataEvidence: [
          `当前临近 ${holiday}`,
          '按高营销响应客户优先生成活动受众',
        ],
        totalCustomers,
        storeId,
        run: latestRun,
        skipPromotionMatch: input.skipPromotionMatch,
      }));
    }

    return cards;
  }

  private getSeason(month: number) {
    if (month >= 3 && month <= 5) return '春';
    if (month >= 6 && month <= 8) return '夏';
    if (month >= 9 && month <= 11) return '秋';
    return '冬';
  }

  private getUpcomingHoliday(month: number) {
    const holidays: Record<number, string> = {
      1: '春节',
      2: '情人节',
      3: '女神节',
      5: '母亲节/520',
      6: '端午节/618',
      7: '七夕',
      8: '七夕',
      9: '中秋节',
      10: '国庆节',
      11: '双十一',
      12: '双十二/圣诞',
    };
    return holidays[month] ?? holidays[month + 1] ?? null;
  }

  private getSeasonalCareTheme(season: string) {
    const themes: Record<string, any> = {
      春: {
        title: '春敏修护护理季',
        focus: '敏感修护',
        audience: '敏感/屏障修护客户',
        strategy: '针对春季敏感、泛红和屏障脆弱客户推出温和修护护理方案',
        offerLabel: '敏感修护套餐 8.5 折',
        offer: { type: 'percentage_off', label: '敏感修护套餐 8.5 折', discountRate: 85, validDays: 30, reason: '春季敏感修护适合温和折扣和专业护理方案。' },
        items: [{ type: 'project', name: '敏感肌舒缓修护护理', category: '面部护理', activityPrice: 398, reason: '春季换肤高频需求。', confidence: 84 }],
      },
      夏: {
        title: '夏季防晒控油护理季',
        focus: '防晒控油',
        audience: '油性/混合肌客户',
        strategy: '围绕控油清洁、防晒修护和晒后舒缓，发起夏季护理活动',
        offerLabel: '控油清洁护理体验价',
        offer: { type: 'trial_price', label: '控油清洁护理体验价', validDays: 30, reason: '夏季护理适合体验价快速拉动预约。' },
        items: [{ type: 'project', name: '控油清洁焕肤护理', category: '面部护理', activityPrice: 298, reason: '夏季出油和防晒修护场景匹配。', confidence: 86 }],
      },
      秋: {
        title: '秋季补水修护护理季',
        focus: '补水修护',
        audience: '干性/混合肌客户',
        strategy: '换季干燥前提前推荐深层补水、屏障修护和抗初老护理',
        offerLabel: '补水修护套餐立减 120',
        offer: { type: 'money_off', label: '补水修护套餐立减 120', threshold: 500, amount: 120, validDays: 30, reason: '秋季补水护理客单适中，满减更便于套餐化。' },
        items: [{ type: 'project', name: '深层补水屏障修护', category: '面部护理', activityPrice: 398, reason: '换季补水与屏障修护需求明显。', confidence: 86 }],
      },
      冬: {
        title: '冬季深层滋养护理季',
        focus: '深层滋养',
        audience: '干性/抗衰需求客户',
        strategy: '针对冬季干燥、细纹和身体护理需求，推荐滋养护理和热石 SPA',
        offerLabel: '深层滋养护理礼包',
        offer: { type: 'bundle', label: '深层滋养护理礼包', validDays: 30, reason: '冬季适合护理 + 产品组合权益。' },
        items: [{ type: 'package', name: '深层滋养护理礼包', category: '护理套餐', activityPrice: 580, reason: '冬季滋养和抗干燥场景匹配。', confidence: 84 }],
      },
    };
    return themes[season] ?? themes.秋;
  }

  async getRecommendationAudience(recommendationId: number, storeId: number) {
    if (this.productProjectRecommendationService?.isProductProjectRecommendationId(recommendationId)) {
      return this.productProjectRecommendationService.getAudience(recommendationId, storeId);
    }

    const latestRun =
      (await this.getLatestRunForRecommendations(storeId, { todayOnly: true })) ??
      (await this.getLatestRunForRecommendations(storeId));
    const recommendation = this.getRecommendationAudienceMeta(recommendationId)
      ?? this.recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) throw new NotFoundException('Recommendation not found');
    const assigneeRole = this.getRecommendationAssigneeRole(recommendation);

    const predictionType = (recommendation as any).predictionType;
    const predictionRunId = (recommendation as any).predictionRunId ?? latestRun?.id;
    const audienceWhere = this.getRecommendationAudienceWhere(predictionRunId, predictionType, (recommendation as any).targetCustomerIds);
    const where = audienceWhere ? { ...audienceWhere, storeId } : null;
    if (where) {
      const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
        where,
        select: {
          customerId: true,
          churnScore: true,
          churnLevel: true,
          repurchase30dScore: true,
          marketingResponseScore: true,
          ltv6m: true,
          ltv12m: true,
          ltvTier: true,
          reasonJson: true,
          customer: {
            select: {
              name: true,
              phone: true,
              memberLevel: true,
              skinType: true,
              visitCount: true,
              totalSpent: true,
              lastVisitDate: true,
              store: { select: { name: true } },
            },
          },
        },
        orderBy: this.getRecommendationAudienceOrderBy(predictionType),
      });

      const profiles = snapshots.map((snapshot: any) => ({
        customerId: snapshot.customerId,
        name: snapshot.customer.name,
        phone: snapshot.customer.phone,
        segment: snapshot.customer.memberLevel || '普通会员',
        skinType: snapshot.customer.skinType,
        storeName: snapshot.customer.store?.name ?? '',
        lastVisitDate: snapshot.customer.lastVisitDate?.toISOString?.().slice(0, 10) ?? '',
        visitCount: snapshot.customer.visitCount ?? 0,
        totalSpent: Number(snapshot.customer.totalSpent ?? 0),
        recommendationId,
        matchReason: this.formatTopReason(snapshot.reasonJson),
        churnScore: snapshot.churnScore,
        churnLevel: snapshot.churnLevel,
        repurchase30dScore: snapshot.repurchase30dScore,
        marketingResponseScore: snapshot.marketingResponseScore,
        ltv6m: Number(snapshot.ltv6m ?? 0),
        ltv12m: Number(snapshot.ltv12m ?? 0),
        ltvTier: snapshot.ltvTier,
        reasons: snapshot.reasonJson,
      }));
      const filteredProfiles = await this.filterRecommendationAudienceProfiles(profiles, { storeId, recommendationId });
      return this.enrichRecommendationAudienceAssignees(filteredProfiles, storeId, assigneeRole);
    }

    const customers = await this.prisma.customer.findMany({
      where: { storeId, deletedAt: null },
      take: 20,
      orderBy: { id: 'asc' },
    });

    const profiles = customers.map((customer: any) => ({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      segment: customer.memberLevel || '普通会员',
      skinType: customer.skinType,
      visitCount: customer.visitCount ?? 0,
      totalSpent: Number(customer.totalSpent ?? 0),
      recommendationId,
      matchReason: (recommendation as any).description ?? (recommendation as any).reason,
    }));
    const filteredProfiles = await this.filterRecommendationAudienceProfiles(profiles, { storeId, recommendationId });
    return this.enrichRecommendationAudienceAssignees(filteredProfiles, storeId, assigneeRole);
  }

  private async filterRecommendationAudienceProfiles<T extends { customerId?: number }>(
    profiles: T[],
    options: { storeId: number; recommendationId?: number },
  ) {
    const customerIds = [...new Set(profiles.map((profile) => Number(profile.customerId)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!customerIds.length) return profiles;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const storeWhere = { storeId: options.storeId };
    const excludedCustomerIds = new Set<number>();
    const touchEventPattern = /push|sms|touch|message|coupon_claimed|promotion_claimed|promotion_sent|marketing|follow_up/i;

    const [
      recentAutomationTouches,
      recentFollowUps,
      appEvents30d,
      futureReservations,
    ] = await Promise.all([
      this.safeFindMany((this.prisma as any).marketingAutomationTouch, {
        where: {
          customerId: { in: customerIds },
          touchedAt: { gte: sevenDaysAgo },
          execution: { storeId: options.storeId },
          ...(options.recommendationId ? { predictionSnapshot: { is: { customerId: { in: customerIds } } } } : {}),
        },
        select: { customerId: true },
      }),
      this.safeFindMany((this.prisma as any).terminalFollowUpTask, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          deletedAt: null,
          status: { notIn: ['cancelled', 'canceled', 'expired'] },
          createdAt: { gte: sevenDaysAgo },
        },
        select: { customerId: true },
      }),
      this.safeFindMany((this.prisma as any).customerAppEvent, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          occurredAt: { gte: thirtyDaysAgo },
        },
        select: { customerId: true, eventType: true, occurredAt: true },
      }),
      this.safeFindMany((this.prisma as any).reservation, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          date: { gte: startOfToday },
          status: { notIn: ['cancelled', 'canceled', 'completed', 'no_show'] },
        },
        select: { customerId: true },
      }),
    ]);

    for (const touch of recentAutomationTouches) excludedCustomerIds.add(Number(touch.customerId));
    for (const task of recentFollowUps) excludedCustomerIds.add(Number(task.customerId));
    for (const reservation of futureReservations) excludedCustomerIds.add(Number(reservation.customerId));

    const touchEventCountByCustomer = new Map<number, number>();
    for (const event of appEvents30d) {
      const customerId = Number(event.customerId);
      if (!customerId || !touchEventPattern.test(String(event.eventType ?? ''))) continue;
      touchEventCountByCustomer.set(customerId, (touchEventCountByCustomer.get(customerId) ?? 0) + 1);
      const occurredAt = event.occurredAt ? new Date(event.occurredAt) : null;
      if (occurredAt && occurredAt >= sevenDaysAgo) excludedCustomerIds.add(customerId);
    }
    for (const [customerId, count] of touchEventCountByCustomer) {
      if (count >= 3) excludedCustomerIds.add(customerId);
    }

    return profiles.filter((profile) => !excludedCustomerIds.has(Number(profile.customerId)));
  }

  private getRecommendationAssigneeRole(recommendation: any) {
    const text = [
      recommendation?.recommendationType,
      recommendation?.triggerType,
      recommendation?.source,
      recommendation?.title,
      recommendation?.reason,
      recommendation?.description,
    ].filter(Boolean).join(' ');
    if (/expiry|inventory|stock|capacity|临期|库存|低峰|排期|产能|补货/.test(text)) return 'manager';
    if (/booking|appointment|reservation|预约|浏览|放弃|到店/.test(text)) return 'reception';
    return 'consultant';
  }

  private async enrichRecommendationAudienceAssignees<T extends { customerId?: number }>(
    profiles: T[],
    storeId: number,
    assigneeRole = 'consultant',
  ) {
    const customerIds = [...new Set(profiles.map((profile) => Number(profile.customerId)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!customerIds.length) return profiles;

    const storeWhere = { storeId };
    const beauticianUserSelect = {
      id: true,
      name: true,
      username: true,
      status: true,
      deletedAt: true,
      stores: { select: { storeId: true } },
    };
    const beauticianSelect = {
      id: true,
      name: true,
      userId: true,
      user: { select: beauticianUserSelect },
    };
    const [serviceTasks, reservations, fallbackBeauticians, fallbackUsers] = await Promise.all([
      this.safeFindMany((this.prisma as any).serviceTask, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          beauticianId: { not: null },
        },
        include: { beautician: { select: beauticianSelect } },
        orderBy: [{ completedAt: 'desc' }, { appointmentTime: 'desc' }],
      }),
      this.safeFindMany((this.prisma as any).reservation, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          beauticianId: { not: null },
        },
        include: { beautician: { select: beauticianSelect } },
        orderBy: { date: 'desc' },
      }),
      this.safeFindMany((this.prisma as any).beautician, {
        where: {
          ...storeWhere,
          status: 'active',
          userId: { not: null },
          user: {
            status: 'active',
            deletedAt: null,
            stores: { some: { storeId } },
          },
        },
        select: beauticianSelect,
        orderBy: [{ userId: 'desc' }, { id: 'asc' }],
        take: 1,
      }),
      this.safeFindMany((this.prisma as any).user, {
        where: {
          deletedAt: null,
          status: 'active',
          stores: { some: { storeId } },
        },
        include: { roles: { include: { role: true } } },
        orderBy: { id: 'asc' },
        take: 50,
      }),
    ]);

    const getSystemUserFromBeautician = (beautician: any) => {
      const user = beautician?.user;
      if (!user || user.status !== 'active' || user.deletedAt) return null;
      if (!user.stores?.some((store: any) => Number(store.storeId) === Number(storeId))) return null;
      return user;
    };
    const getUserDisplayName = (user: any) => user?.name || user?.username || '系统用户';

    const assigneeByCustomer = new Map<number, Record<string, unknown>>();
    for (const task of serviceTasks) {
      const customerId = Number(task.customerId);
      if (!customerId || assigneeByCustomer.has(customerId) || !task.beautician) continue;
      const assigneeUser = getSystemUserFromBeautician(task.beautician);
      if (!assigneeUser) continue;
      assigneeByCustomer.set(customerId, {
        preferredAssigneeRole: 'consultant',
        preferredAssigneeRoleLabel: '顾问/美容师',
        preferredAssigneeName: getUserDisplayName(assigneeUser),
        preferredAssigneeUserId: assigneeUser.id,
        preferredAssigneeBeauticianId: task.beautician.id,
        preferredAssigneeReason: '最近服务美容师',
      });
    }
    for (const reservation of reservations) {
      const customerId = Number(reservation.customerId);
      if (!customerId || assigneeByCustomer.has(customerId) || !reservation.beautician) continue;
      const assigneeUser = getSystemUserFromBeautician(reservation.beautician);
      if (!assigneeUser) continue;
      assigneeByCustomer.set(customerId, {
        preferredAssigneeRole: 'consultant',
        preferredAssigneeRoleLabel: '顾问/美容师',
        preferredAssigneeName: getUserDisplayName(assigneeUser),
        preferredAssigneeUserId: assigneeUser.id,
        preferredAssigneeBeauticianId: reservation.beautician.id,
        preferredAssigneeReason: '最近预约美容师',
      });
    }
    const fallbackBeautician = fallbackBeauticians.find((beautician: any) => getSystemUserFromBeautician(beautician));
    const fallbackBeauticianUser = getSystemUserFromBeautician(fallbackBeautician);
    const roleSignals: Record<string, string[]> = {
      manager: ['store_manager', 'manager', '店长'],
      reception: ['reception', 'frontdesk', 'cashier', '前台'],
      consultant: ['consultant', 'advisor', 'beautician', '顾问', '美容师'],
    };
    const fallbackUser =
      fallbackUsers.find((user: any) =>
        user.roles?.some(({ role }: any) => {
          const text = `${role.key} ${role.name}`.toLowerCase();
          return (roleSignals[assigneeRole] ?? roleSignals.consultant).some((signal) => text.includes(signal.toLowerCase()));
        }),
      ) ?? fallbackUsers[0];

    return profiles.map((profile) => ({
      ...profile,
      ...(assigneeByCustomer.get(Number(profile.customerId)) ??
        (assigneeRole === 'consultant' && fallbackBeautician && fallbackBeauticianUser
          ? {
              preferredAssigneeRole: 'consultant',
              preferredAssigneeRoleLabel: '顾问/美容师',
              preferredAssigneeName: getUserDisplayName(fallbackBeauticianUser),
              preferredAssigneeUserId: fallbackBeauticianUser.id,
              preferredAssigneeBeauticianId: fallbackBeautician.id,
              preferredAssigneeReason: '无历史服务人，按门店兜底分派',
            }
          : fallbackUser
            ? {
                preferredAssigneeRole: assigneeRole,
                preferredAssigneeRoleLabel: assigneeRole === 'manager' ? '店长' : assigneeRole === 'reception' ? '前台' : '顾问/美容师',
                preferredAssigneeName: fallbackUser.name || fallbackUser.username,
                preferredAssigneeUserId: fallbackUser.id,
                preferredAssigneeBeauticianId: undefined,
                preferredAssigneeReason:
                  assigneeRole === 'manager'
                    ? '经营协调类任务，按店长兜底分派'
                    : assigneeRole === 'reception'
                      ? '预约邀约类任务，按前台兜底分派'
                      : '无历史服务人，按门店员工兜底分派',
              }
            : {})),
    }));
  }

  private async safeFindMany(delegate: any, args: any) {
    if (!delegate?.findMany) return [];
    try {
      const result = await delegate.findMany(args);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.warn('recommendation audience exclusion query failed', error);
      return [];
    }
  }

  private getRecommendationAudienceMeta(recommendationId: number) {
    const meta: Record<number, any> = {
      1: { id: 1, predictionType: 'churn', description: '高流失风险客户' },
      2: { id: 2, predictionType: 'repurchase', description: '30 天复购窗口客户' },
      3: { id: 3, predictionType: 'marketing_response', description: '高营销响应客户' },
      4: { id: 4, predictionType: 'ltv', description: '高 LTV 客户' },
      5: { id: 5, predictionType: 'card_expiry', description: '次卡/套餐待使用客户' },
      6: { id: 6, predictionType: 'care_cycle', description: '护理周期到期客户' },
      7: { id: 7, predictionType: 'browse_abandonment', description: '小程序浏览未预约种子客户' },
      8: { id: 8, predictionType: 'seasonal_skin_care', description: '季节护肤目标客户' },
      9: { id: 9, predictionType: 'holiday_campaign', description: '节假日活动目标客户' },
      10: { id: 10, predictionType: 'coupon_expiry', description: '优惠券到期提醒客户' },
      11: { id: 11, predictionType: 'booking_abandonment', description: '预约放弃召回客户' },
    };
    return meta[recommendationId] ?? null;
  }

  private getRecommendationAudienceOrderBy(predictionType?: string) {
    switch (predictionType) {
      case 'churn':
        return { churnScore: 'desc' as const };
      case 'repurchase':
        return { repurchase30dScore: 'desc' as const };
      case 'ltv':
        return { ltv12m: 'desc' as const };
      case 'marketing_response':
      default:
        return { marketingResponseScore: 'desc' as const };
    }
  }

  private getRecommendationAudienceWhere(runId?: number, predictionType?: string, targetCustomerIds?: number[]) {
    if (!runId) return null;
    if (targetCustomerIds?.length) {
      return { runId, customerId: { in: targetCustomerIds } };
    }
    switch (predictionType) {
      case 'churn':
        return { runId, churnLevel: { in: ['高', '极高'] } };
      case 'repurchase':
        return { runId, repurchase30dScore: { gte: 65 }, churnScore: { lt: 70 } };
      case 'marketing_response':
        return { runId, marketingResponseScore: { gte: 70 } };
      case 'ltv':
        return { runId, ltvTier: { in: ['铂金', '黄金'] } };
      case 'card_expiry':
        return { runId, marketingResponseScore: { gte: 50 } };
      case 'care_cycle':
        return { runId, repurchase30dScore: { gte: 55 } };
      case 'browse_abandonment':
        return { runId, marketingResponseScore: { gte: 72 }, repurchase30dScore: { gte: 55 } };
      case 'coupon_expiry':
        return { runId, marketingResponseScore: { gte: 68 }, repurchase30dScore: { gte: 45 } };
      case 'booking_abandonment':
        return { runId, marketingResponseScore: { gte: 75 } };
      case 'seasonal_skin_care':
      case 'holiday_campaign':
        return { runId, marketingResponseScore: { gte: 60 } };
      default:
        return null;
    }
  }

  createRecommendation(dto: any, storeId: number) {
    const item = { id: this.nextRecommendationId(), status: 'active', matchScore: 0.75, ...dto, storeId };
    this.recommendations.unshift(item);
    return item;
  }

  updateRecommendation(id: number, dto: any, storeId: number) {
    const index = this.recommendations.findIndex((item) => item.id === id && Number(item.storeId) === storeId);
    if (index === -1) throw new NotFoundException('Recommendation not found');
    this.recommendations[index] = { ...this.recommendations[index], ...dto, id, storeId };
    return this.recommendations[index];
  }

  deleteRecommendation(id: number, storeId: number) {
    const index = this.recommendations.findIndex((item) => item.id === id && Number(item.storeId) === storeId);
    if (index === -1) throw new NotFoundException('Recommendation not found');
    this.recommendations.splice(index, 1);
    return { success: true };
  }

  async adoptRecommendation(id: number, storeId: number, dto: any = {}) {
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('storeId is required');
    if (dto?.mode) {
      return this.adoptRecommendationTransactional(id, storeId, dto);
    }
    const recommendation = await this.getRecommendationCardById(id, storeId);
    let event = null;
    if (dto.customerId) {
      event = await this.prisma.recommendationEvent.create({
        data: {
          storeId,
          customerId: Number(dto.customerId),
          recommendationId: id,
          eventType: 'accepted',
          note: dto.note ?? `采纳推荐：${recommendation.title}`,
          payload: {
            actionTarget: dto.targetType ?? dto.actionTarget ?? recommendation.preferredMode,
            sourcePage: dto.sourcePage ?? 'marketing_recommendation',
            audienceSnapshotId: dto.audienceSnapshotId,
            predictionRunId: recommendation.predictionRunId,
          },
        },
      });
    }
    return {
      success: true,
      recommendationId: id,
      adoptedAt: new Date().toISOString(),
      preferredMode: recommendation.preferredMode,
      event,
    };
  }

  private async adoptRecommendationTransactional(id: number, storeId: number, dto: any) {
    const recommendation = await this.getRecommendationCardById(id, storeId);
    if (dto.mode === 'activity') {
      return this.prisma.$transaction(async (tx) => {
        const adoption = await tx.marketingRecommendationAdoption.create({
          data: {
            storeId,
            recommendationId: id,
            mode: 'activity',
            status: 'draft',
            predictionRunId: recommendation.predictionRunId ? Number(recommendation.predictionRunId) : null,
            snapshotJson: recommendation,
          },
        });
        const period = this.defaultActivityPeriod();
        const activity = await tx.marketingActivity.create({
          data: {
            storeId,
            title: dto.activity?.title || recommendation.title,
            description: recommendation.reason ?? recommendation.description,
            status: dto.activity?.publishPage ? 'active' : 'draft',
            startDate: new Date(dto.activity?.startDate || period.startDate),
            endDate: new Date(dto.activity?.endDate || period.endDate),
            targetCustomers: recommendation.targetCustomers,
            discount: recommendation.offer?.label ?? recommendation.discount,
            sourceRecommendationId: String(id),
            predictionRunId: recommendation.predictionRunId ? String(recommendation.predictionRunId) : null,
            audienceSnapshotJson: recommendation.audienceSnapshot ?? {},
            sourceSignalsJson: { signals: recommendation.sourceSignals ?? [], adoptionId: adoption.id },
            offerJson: recommendation.offer ?? {},
            recommendedItemsJson: recommendation.recommendedItems ?? [],
            publishStatus: dto.activity?.publishPage ? 'published' : null,
            publishedAt: dto.activity?.publishPage ? new Date() : null,
          },
        });

        let page: any = null;
        if (dto.activity?.publishPage) {
          const slug = `recommendation-${id}-${storeId}-${adoption.id}`;
          const pageSchema = recommendation.pageSchema ?? {
            title: recommendation.title,
            description: recommendation.reason ?? recommendation.description,
            offer: recommendation.offer?.label ?? recommendation.discount,
          };
          page = await tx.marketingPage.create({
            data: {
              storeId,
              activityId: activity.id,
              sourceType: 'activity',
              sourceId: String(activity.id),
              title: activity.title,
              slug,
              pageSchema,
              snapshotJson: { recommendationId: id, adoptionId: adoption.id },
              status: 'published',
              publishedAt: new Date(),
            },
          });
          await tx.marketingPageVersion.create({
            data: { pageId: page.id, version: 1, pageSchema, snapshotJson: { recommendationId: id, adoptionId: adoption.id }, changeSummary: '推荐采纳首次发布' },
          });
        }

        const completed = await tx.marketingRecommendationAdoption.update({
          where: { id: adoption.id },
          data: { status: page ? 'published' : 'draft', activityId: activity.id, pageId: page?.id ?? null },
        });
        return {
          adoptionId: completed.id,
          recommendationId: id,
          mode: 'activity',
          status: completed.status,
          activityId: activity.id,
          pageId: page?.id,
        };
      });
    }

    if (dto.mode === 'automation') {
      const freshness = this.buildPredictionFreshness(recommendation);
      if (freshness.status !== 'fresh') throw new BadRequestException('预测数据已过期，刷新预测后才能启用自动策略');
      const draft = await this.createRecommendationAutomationDraft(id, storeId);
      return this.prisma.$transaction(async (tx) => {
        const strategy = await tx.marketingAutomationStrategy.create({
          data: { ...draft.strategyInput, storeId, status: 'enabled' } as any,
        });
        const adoption = await tx.marketingRecommendationAdoption.create({
          data: { storeId, recommendationId: id, mode: 'automation', status: 'enabled', strategyId: strategy.id, predictionRunId: recommendation.predictionRunId ? Number(recommendation.predictionRunId) : null, snapshotJson: recommendation },
        });
        return { adoptionId: adoption.id, recommendationId: id, mode: 'automation', status: 'enabled', strategyId: strategy.id };
      });
    }

    if (dto.mode === 'terminal_follow_up') {
      const customerIds = Array.from(new Set<number>(
        (dto.customerIds ?? recommendation.targetCustomerIds ?? recommendation.audienceSnapshot?.customerIds ?? [])
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0),
      ));
      if (!customerIds.length) throw new BadRequestException('推荐受众为空，无法创建终端跟进任务');
      const assignmentByCustomerId = new Map<number, any>();
      for (const assignment of Array.isArray(dto.assignments) ? dto.assignments : []) {
        const customerId = Number(assignment?.customerId);
        if (Number.isInteger(customerId) && customerId > 0) assignmentByCustomerId.set(customerId, assignment);
      }
      const deliveryResults = await Promise.allSettled(customerIds.map((customerId: number) => {
        if (!this.marketingChannelService) return Promise.resolve({ status: 'failed' as const, errorCode: 'channel_service_unavailable' });
        const assignment = assignmentByCustomerId.get(customerId);
        return this.marketingChannelService.deliver({
          channel: 'terminal',
          storeId,
          customerId,
          strategyId: 0,
          assigneeRole: assignment?.assigneeRole,
          assigneeUserId: assignment?.assigneeUserId ? Number(assignment.assigneeUserId) : undefined,
          assigneeBeauticianId: assignment?.assigneeBeauticianId ? Number(assignment.assigneeBeauticianId) : undefined,
          title: recommendation.title,
          content: recommendation.reason ?? recommendation.description,
        });
      }));
      const deliveries: Array<{ customerId: number; status: 'delivered' | 'failed'; externalId?: string; errorCode?: string; duplicated?: boolean }> = deliveryResults
        .map((result, index) => result.status === 'fulfilled'
          ? { customerId: customerIds[index], ...result.value }
          : { customerId: customerIds[index], status: 'failed', errorCode: String((result.reason as any)?.code ?? 'terminal_task_not_created') });
      const successfulDeliveries = deliveries.filter((item) => item.status === 'delivered' && item.externalId);
      const taskIds = successfulDeliveries.map((item) => Number(item.externalId));
      const duplicatedCustomerIds = successfulDeliveries.filter((item) => item.duplicated).map((item) => item.customerId);
      const failedDeliveries = deliveries.filter((item) => item.status !== 'delivered' || !item.externalId);
      const failedCustomerIds = failedDeliveries.map((item) => item.customerId);
      const status = failedCustomerIds.length === 0
        ? 'dispatched'
        : taskIds.length > 0
          ? 'partial_failed'
          : 'failed';
      const adoption = await this.prisma.marketingRecommendationAdoption.create({
        data: {
          storeId,
          recommendationId: id,
          mode: 'terminal_follow_up',
          status,
          followUpTaskIds: taskIds,
          predictionRunId: recommendation.predictionRunId ? Number(recommendation.predictionRunId) : null,
          snapshotJson: {
            ...recommendation,
            deliveryResult: {
              requestedCustomerIds: customerIds,
              duplicatedCustomerIds,
              failedCustomerIds,
              failures: failedDeliveries.map((item) => ({ customerId: item.customerId, errorCode: item.errorCode ?? 'terminal_task_not_created' })),
            },
          },
        },
      });
      return {
        adoptionId: adoption.id,
        recommendationId: id,
        mode: 'terminal_follow_up',
        status,
        followUpTaskIds: taskIds,
        failedCustomerIds,
        duplicatedCustomerIds,
        items: successfulDeliveries.map((item) => ({
          id: Number(item.externalId),
          customerId: item.customerId,
          duplicated: Boolean(item.duplicated),
        })),
        total: customerIds.length,
        createdCount: successfulDeliveries.length - duplicatedCustomerIds.length,
        duplicatedCount: duplicatedCustomerIds.length,
        failedCount: failedDeliveries.length,
        failures: failedDeliveries.map((item) => ({
          customerId: item.customerId,
          message: item.errorCode ?? 'terminal_task_not_created',
        })),
      };
    }
    throw new BadRequestException('Unsupported recommendation adoption mode');
  }

  async createRecommendationActivityDraft(id: number, storeId: number) {
    const recommendation = await this.getRecommendationCardById(id, storeId);
    const period = this.defaultActivityPeriod();
    const primaryItem = recommendation.recommendedItems?.[0];
    const attribution = this.buildRecommendationAttribution(id, recommendation);
    const promotionIds = this.uniqueNumbers([
      recommendation.offer?.promotionId,
      recommendation.primaryPromotion?.promotionId,
      ...(recommendation.alternativePromotions ?? []).map((item: any) => item.promotionId),
    ]);
    return {
      recommendationId: id,
      sourceRecommendationId: String(id),
      predictionRunId: recommendation.predictionRunId ? String(recommendation.predictionRunId) : undefined,
      attribution,
      formDefaults: {
        title: recommendation.title,
        description: recommendation.reason,
        status: 'draft',
        startDate: period.startDate,
        endDate: period.endDate,
        targetCustomers: recommendation.targetCustomers,
        discount: recommendation.offer?.label ?? recommendation.discount,
        sourceRecommendationId: String(id),
        predictionRunId: recommendation.predictionRunId ? String(recommendation.predictionRunId) : undefined,
        audienceSnapshotJson: recommendation.audienceSnapshot,
        sourceSignalsJson: {
          signals: recommendation.sourceSignals ?? [],
          attribution,
          primaryPromotion: recommendation.primaryPromotion ?? null,
          alternativePromotions: recommendation.alternativePromotions ?? [],
          offerFitBreakdown: recommendation.offerFitBreakdown ?? null,
          originalOffer: recommendation.offer ?? null,
        },
        offerJson: {
          ...(recommendation.offer ?? {}),
          attribution,
          primaryPromotion: recommendation.primaryPromotion ?? null,
          alternativePromotions: recommendation.alternativePromotions ?? [],
          offerFitBreakdown: recommendation.offerFitBreakdown ?? null,
        },
        primaryPromotionId: recommendation.offer?.promotionId,
        promotionIdsJson: promotionIds,
        recommendedItemsJson: recommendation.recommendedItems ?? [],
        inventorySnapshotJson: recommendation.inventorySnapshot,
        capacitySnapshotJson: recommendation.capacitySnapshot,
        riskWarningsJson: recommendation.riskWarnings ?? [],
      },
      pageSeed: {
        campaignName: recommendation.title,
        targetAudience: recommendation.targetCustomers,
        offer: recommendation.offer?.label ?? recommendation.discount,
        projectNames: recommendation.recommendedItems?.filter((item: any) => item.type === 'project').map((item: any) => item.name) ?? [],
        productNames: recommendation.recommendedItems?.filter((item: any) => item.type === 'product').map((item: any) => item.name) ?? [],
        primaryItemName: primaryItem?.name,
        usableTimeRange: recommendation.offer?.usableTimeRange,
        riskWarnings: recommendation.riskWarnings ?? [],
        startDate: period.startDate,
        endDate: period.endDate,
      },
      recommendation,
    };
  }

  async createRecommendationAutomationDraft(id: number, storeId: number) {
    const recommendation = await this.getRecommendationCardById(id, storeId);
    const attribution = this.buildRecommendationAttribution(id, recommendation);
    const triggerRule = recommendation.triggerRule ?? (
      recommendation.triggerType
        ? {
            type: recommendation.triggerType,
            params: this.defaultTriggerParams(recommendation.triggerType),
            parameterSource: 'system_default',
          }
        : null
    );
    const actions = (recommendation.recommendedActions?.length ? recommendation.recommendedActions : [{
      type: 'coupon',
      value: recommendation.offer?.label ?? recommendation.discount,
      channel: recommendation.recommendedChannels?.[0]?.channel ?? 'miniapp',
    }]).map((action: any, index: number) => ({
      type: action.type === 'consultant_task' ? 'push' : action.type,
      value: action.value,
      promotionId: action.promotionId ?? recommendation.offer?.promotionId,
      promotionName: action.promotionName ?? recommendation.offer?.promotionName,
      channel: action.channel ?? recommendation.recommendedChannels?.[index]?.channel ?? recommendation.recommendedChannels?.[0]?.channel ?? 'miniapp',
      attribution,
    }));
    const triggerRules = triggerRule ? [{
      type: triggerRule.type,
      params: triggerRule.params ?? {},
      parameterSource: 'system_default',
    }] : [];
    const preview = triggerRules.length ? await this.previewAudience(triggerRules, 'AND', undefined, storeId) : null;
    return {
      recommendationId: id,
      sourceRecommendationId: String(id),
      predictionRunId: recommendation.predictionRunId ? String(recommendation.predictionRunId) : undefined,
      attribution,
      strategyInput: {
        name: recommendation.title,
        description: recommendation.reason,
        executionType: 'auto',
        source: 'recommendation',
        schedule: {
          type: 'daily',
          time: '09:00',
          attribution,
          frequencyCap: this.recommendationFrequencyCap(recommendation),
        },
        triggerRules,
        ruleRelation: 'AND',
        actions,
        targetCount: recommendation.targetCount ?? recommendation.audienceSnapshot?.totalCustomers ?? preview?.total ?? 0,
      },
      preview,
      recommendation,
    };
  }

  private buildRecommendationAttribution(id: number, recommendation: any) {
    return {
      source: 'recommendation',
      sourceRecommendationId: String(id),
      recommendationKey: recommendation.recommendationKey,
      recommendationType: recommendation.recommendationType,
      triggerType: recommendation.triggerType,
      predictionRunId: recommendation.predictionRunId ? String(recommendation.predictionRunId) : undefined,
      modelVersion: recommendation.modelVersion,
      audienceSnapshot: recommendation.audienceSnapshot ?? null,
      audienceRule: recommendation.audienceRule ?? null,
      audienceTags: recommendation.audienceTags ?? [],
      sourceSignals: recommendation.sourceSignals ?? [],
      primaryPromotion: recommendation.primaryPromotion ?? null,
      alternativePromotions: recommendation.alternativePromotions ?? [],
      offerFitBreakdown: recommendation.offerFitBreakdown ?? null,
      originalOffer: recommendation.offer ?? null,
      recommendedItems: recommendation.recommendedItems ?? [],
      inventorySnapshot: recommendation.inventorySnapshot ?? null,
      capacitySnapshot: recommendation.capacitySnapshot ?? null,
      riskWarnings: recommendation.riskWarnings ?? [],
      generatedAt: new Date().toISOString(),
    };
  }

  private recommendationFrequencyCap(recommendation: any) {
    const isUrgent = recommendation.priority === 'P0' || recommendation.urgency === 'urgent';
    const isFatigueRisk = (recommendation.riskWarnings ?? []).some((warning: string) => /疲劳|频次|触达/.test(String(warning)));
    return {
      sameCustomerDays: isFatigueRisk ? 14 : isUrgent ? 3 : 7,
      sameChannelDays: isFatigueRisk ? 3 : 1,
      maxTouchesPerCustomer: isFatigueRisk ? 1 : 2,
    };
  }

  async recordCustomerBehaviorEvent(storeId: number, dto: any) {
    const data = {
      storeId,
      customerId: Number(dto.customerId),
      eventType: dto.eventType,
      targetType: dto.targetType ?? null,
      targetId: dto.targetId != null ? String(dto.targetId) : null,
      sessionId: dto.sessionId ?? null,
      metadataJson: dto.metadataJson ?? dto.metadata ?? {},
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    };
    if (!data.storeId || !data.customerId || !data.eventType) {
      throw new NotFoundException('storeId, customerId and eventType are required');
    }
    const delegate = (this.prisma as any).customerBehaviorEvent;
    if (!delegate?.create) {
      return { id: `behavior-event-${Date.now()}`, ...data, createdAt: new Date() };
    }
    return delegate.create({ data });
  }

  private async getRecommendationCardById(id: number, storeId: number) {
    const cards = await this.getRecommendations(storeId);
    const recommendation = cards.find((item: any) => item.id === id)
      ?? this.recommendations.find((item) => item.id === id && Number(item.storeId) === storeId);
    if (!recommendation) throw new NotFoundException('Recommendation not found');
    return recommendation;
  }

  private defaultActivityPeriod() {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    return {
      startDate: formatBusinessDate(start),
      endDate: formatBusinessDate(end),
    };
  }

  async runPredictions(storeId: number) {
    const { start, end } = this.getShanghaiBusinessDayRange();
    const businessDate = getShanghaiBusinessDate();
    const runKey = buildPredictionRunKey(Number(storeId), businessDate);
    const existingRun = await this.prisma.predictionRun.findFirst({
      where: {
        storeId: Number(storeId),
        status: 'completed',
        startedAt: { gte: start, lt: end },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (existingRun) return { run: existingRun, summary: existingRun.summaryJson ?? {}, reused: true };

    const run = await this.prisma.predictionRun.create({
      data: {
        storeId: Number(storeId),
        businessDate: new Date(`${businessDate}T00:00:00.000Z`),
        runKey,
        scopeStatus: 'store_scoped',
        modelVersion: MODEL_VERSION,
        status: 'running',
        startedAt: new Date(),
        customerCount: 0,
      },
    });

    const populated = await this.populatePredictionRun(run.id, Number(storeId));
    return { ...populated, reused: false };
  }

  async populatePredictionRun(runId: number, storeId: number) {
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('storeId is required');
    const where = { deletedAt: null, storeId };
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        consumptionRecords: { orderBy: { consumeTime: 'asc' } },
        customerCards: true,
        healthProfile: true,
        marketingTouches: {
          where: {
            touchedAt: { gte: thirtyDaysAgo },
            OR: [{ status: 'converted' }, { convertedAt: { not: null } }],
          },
          select: { id: true, status: true, convertedAt: true, actualRevenue: true, touchedAt: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    const snapshots = customers.map((customer: any) => this.buildPredictionSnapshot(runId, customer));
    if (snapshots.length) {
      await this.prisma.customerPredictionSnapshot.createMany({ data: snapshots });
    }

    const summary = this.summarizeSnapshots(snapshots);
    const completed = await this.prisma.predictionRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        customerCount: snapshots.length,
        summaryJson: summary,
      },
    });

    const lifecycle = this.customerLifecycleOntologyService
      ? await this.customerLifecycleOntologyService.rebuild(storeId, { predictionRunId: completed.id, includeServiceCycles: true, includeFulfillmentChecks: true, includeAttribution: true }).catch((error) => ({ rebuilt: false, reason: error?.message ?? 'customer_lifecycle_rebuild_failed' }))
      : { rebuilt: false, reason: 'customer_lifecycle_service_unavailable' };

    return { run: completed, summary, lifecycle };
  }

  private buildPredictionFreshness(source: any) {
    if (!source?.predictionRunId) {
      return { predictionRunId: null, generatedAt: null, ageHours: null, status: 'missing' as const };
    }
    const generatedAt = source?.predictionRunFinishedAt ?? source?.generatedAt ?? source?.audienceSnapshot?.generatedAt ?? null;
    const timestamp = generatedAt ? new Date(generatedAt).getTime() : Number.NaN;
    const ageHours = Number.isFinite(timestamp) ? Math.max(0, Math.round(((Date.now() - timestamp) / 3600000) * 10) / 10) : null;
    return {
      predictionRunId: source?.predictionRunId ? Number(source.predictionRunId) : null,
      generatedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
      ageHours,
      status: ageHours == null ? 'missing' : ageHours <= 30 ? 'fresh' : 'stale',
    } as const;
  }

  rebuildLifecycleOntology(storeId: number, predictionRunId?: number, options: any = {}) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ rebuilt: false, reason: 'customer_lifecycle_service_unavailable', predictionRunId: null, snapshotCount: 0, opportunityCount: 0 });
    return this.customerLifecycleOntologyService.rebuild(storeId, { predictionRunId, ...options });
  }

  getLifecycleOpportunities(query: any, storeId: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ items: [], data: [], total: 0, page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 20), reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.listOpportunities(query, storeId);
  }

  getCustomerLifecycleContext(customerId: number, storeId: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve(null);
    return this.customerLifecycleOntologyService.getCustomerContext(customerId, storeId);
  }

  getLifecycleServiceCycles(query: any, storeId: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ items: [], data: [], total: 0, page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 20), reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.listServiceCycles(query, storeId);
  }

  getLifecycleOpportunityFulfillment(id: number, storeId: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ items: [], reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.getOpportunityFulfillment(id, storeId);
  }

  getLifecycleAttribution(query: any, storeId: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ items: [], data: [], total: 0, page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 20), reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.listAttributionEvents(query, storeId);
  }

  getLifecycleQuality(storeId: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve(null);
    return this.customerLifecycleOntologyService.getQualitySnapshot(storeId);
  }

  getLifecycleRules(query: any, storeId: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ items: [], data: [], total: 0, page: 1, pageSize: 0, reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.listRules(query, storeId);
  }

  createLifecycleRule(input: any, storeId: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ created: false, reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.createRule(input, storeId);
  }

  publishLifecycleRule(id: number, storeId: number, userId?: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ published: false, reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.publishRule(id, storeId, userId);
  }

  rollbackLifecycleRule(id: number, storeId: number, userId?: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ rolledBack: false, reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.rollbackRule(id, storeId, userId);
  }

  createLifecycleBusinessPlan(input: any, storeId: number, userId?: number) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ created: false, reason: 'customer_lifecycle_service_unavailable' });
    return this.customerLifecycleOntologyService.createBusinessPlan(input, storeId, userId);
  }

  submitLifecycleBusinessPlanActions(id: number, storeId: number, input?: any, userId?: number): Promise<any>;
  submitLifecycleBusinessPlanActions(id: number, input?: any, userId?: number): Promise<any>;
  async submitLifecycleBusinessPlanActions(
    id: number,
    storeIdOrInput: number | any,
    inputOrUserId: any = {},
    explicitUserId?: number,
  ) {
    if (!this.customerLifecycleOntologyService) return Promise.resolve({ submitted: false, reason: 'customer_lifecycle_service_unavailable' });
    if (typeof storeIdOrInput === 'number') {
      return this.customerLifecycleOntologyService.submitBusinessPlanActions(
        id,
        storeIdOrInput,
        inputOrUserId ?? {},
        explicitUserId,
      );
    }

    const plan = await this.prisma.lifecycleBusinessPlan.findUnique({
      where: { id },
      select: { storeId: true },
    });
    if (!plan) return { submitted: false, reason: 'lifecycle_business_plan_not_found' };
    return this.customerLifecycleOntologyService.submitBusinessPlanActions(
      id,
      plan.storeId,
      storeIdOrInput ?? {},
      typeof inputOrUserId === 'number' ? inputOrUserId : undefined,
    );
  }

  async getLatestPredictionSummary(storeId: number) {
    const where = { status: 'completed', storeId };
    const run = await this.prisma.predictionRun.findFirst({
      where,
      orderBy: { finishedAt: 'desc' },
    });
    if (!run) return null;

    return {
      run,
      summary: run.summaryJson ?? {},
    };
  }

  async findPredictionCustomers(query: PredictionQuery) {
    if (!query.storeId) throw new BadRequestException('storeId is required');
    const storeId = Number(query.storeId);
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const latestRun = await this.prisma.predictionRun.findFirst({
      where: { status: 'completed', storeId },
      orderBy: { finishedAt: 'desc' },
    });
    if (!latestRun) return { items: [], data: [], total: 0, page, pageSize };

    const where = {
      runId: latestRun.id,
      storeId,
      ...(query.churnLevel ? { churnLevel: query.churnLevel } : {}),
      ...(query.ltvTier ? { ltvTier: query.ltvTier } : {}),
      ...(query.minRepurchaseScore ? { repurchase30dScore: { gte: Number(query.minRepurchaseScore) } } : {}),
      ...(query.minMarketingResponseScore ? { marketingResponseScore: { gte: Number(query.minMarketingResponseScore) } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customerPredictionSnapshot.findMany({
        where,
        include: { customer: true, run: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ churnScore: 'desc' }, { marketingResponseScore: 'desc' }],
      }),
      this.prisma.customerPredictionSnapshot.count({ where }),
    ]);

    const mapped = items.map((item: any) => this.serializePredictionSnapshot(item));
    return { items: mapped, data: mapped, total, page, pageSize };
  }

  async getCustomerPrediction(customerId: number, storeId: number) {
    const latest = await this.prisma.customerPredictionSnapshot.findFirst({
      where: { customerId, storeId },
      include: { customer: true, run: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) throw new NotFoundException('Prediction snapshot not found');

    const history = await this.prisma.customerPredictionSnapshot.findMany({
      where: { customerId, storeId },
      take: 8,
      orderBy: { createdAt: 'desc' },
    });

    return {
      snapshot: this.serializePredictionSnapshot(latest),
      history: history.map((item: any) => ({
        id: item.id,
        runId: item.runId,
        churnScore: item.churnScore,
        repurchase30dScore: item.repurchase30dScore,
        marketingResponseScore: item.marketingResponseScore,
        ltv6m: Number(item.ltv6m ?? 0),
        ltv12m: Number(item.ltv12m ?? 0),
        createdAt: item.createdAt,
      })),
    };
  }

  async getInvitationCandidates(query: InvitationCandidateQuery) {
    if (!query.storeId) throw new BadRequestException('storeId is required');
    const storeId = Number(query.storeId);
    const limit = Math.max(1, Math.min(Number(query.limit ?? 10), 30));
    const latestRun = await this.prisma.predictionRun.findFirst({
      where: { status: 'completed', storeId },
      orderBy: { finishedAt: 'desc' },
    });

    if (latestRun) {
      const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
        where: { runId: latestRun.id, storeId },
        include: { customer: { include: { healthProfile: true } } },
        take: limit,
        orderBy: [
          { marketingResponseScore: 'desc' },
          { repurchase30dScore: 'desc' },
          { churnScore: 'desc' },
        ],
      });
      if (snapshots.length) {
        return {
          items: snapshots.map((item: any) => this.toInvitationCandidateFromSnapshot(item)),
          generatedAt: new Date().toISOString(),
          source: 'prediction',
        };
      }
    }

    const customers = await this.prisma.customer.findMany({
      where: { storeId },
      include: { healthProfile: true },
      take: limit,
      orderBy: [
        { lastVisitDate: 'asc' },
        { totalSpent: 'desc' },
        { visitCount: 'desc' },
      ],
    });

    return {
      items: customers.map((customer: any) => this.toInvitationCandidateFromCustomer(customer)),
      generatedAt: new Date().toISOString(),
      source: 'customer_profile',
      emptyReason: customers.length ? undefined : '当前门店暂无可邀约客户，请先补充客户资料或导入消费记录。',
    };
  }

  async findActivities(query: PageQuery = {}) {
    const { page = 1, pageSize = 20, status, storeId } = query;
    if (!storeId) throw new BadRequestException('storeId is required');
    const where = {
      storeId,
      ...(status ? { status: this.normalizeActivityStatus(status) } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.marketingActivity.findMany({
        where,
        include: { primaryPromotion: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.marketingActivity.count({ where }),
    ]);
    const refreshedItems = await this.attachActivityMetrics(items, storeId);
    return { items: refreshedItems, data: refreshedItems, total, page, pageSize };
  }

  async getActivityById(id: number, storeId: number) {
    const activity = await this.prisma.marketingActivity.findFirst({
      where: { id, storeId },
      include: { primaryPromotion: true },
    });
    if (!activity) throw new NotFoundException('Marketing activity not found');
    return this.refreshActivityMetrics(id, storeId, activity);
  }

  async refreshActivityMetrics(activityId: number, storeId: number, activity?: any) {
    const current = activity ?? (await this.prisma.marketingActivity.findFirst({ where: { id: activityId, storeId } }));
    if (!current) throw new NotFoundException('Marketing activity not found');
    const [result] = await this.attachActivityMetrics([current], storeId);
    return result;
  }

  private async attachActivityMetrics(activities: any[], storeId: number) {
    if (!activities.length) return [];
    const activityIds = activities.map((activity) => Number(activity.id)).filter((id) => Number.isInteger(id) && id > 0);
    const pages = await this.prisma.marketingPage.findMany({
      where: {
        storeId,
        OR: [
          { activityId: { in: activityIds } },
          { sourceType: 'activity', sourceId: { in: activityIds.map(String) } },
        ],
      },
      select: {
        id: true,
        activityId: true,
        sourceType: true,
        sourceId: true,
        leads: { select: { status: true, convertedAt: true } },
        attributions: { select: { orderId: true } },
      },
    });
    const pagesByActivityId = new Map<number, any[]>();
    for (const page of pages as any[]) {
      const activityId = Number(page.activityId ?? (page.sourceType === 'activity' ? page.sourceId : 0));
      if (!Number.isInteger(activityId) || activityId <= 0) continue;
      const grouped = pagesByActivityId.get(activityId) ?? [];
      grouped.push(page);
      pagesByActivityId.set(activityId, grouped);
    }

    return activities.map((activity) => {
      const activityPages = pagesByActivityId.get(Number(activity.id)) ?? [];
      const leads = activityPages.flatMap((page) => page.leads ?? []);
      const attributedOrderIds = new Set(
        activityPages.flatMap((page) => page.attributions ?? [])
          .map((attribution: any) => Number(attribution.orderId))
          .filter((orderId: number) => Number.isInteger(orderId) && orderId > 0),
      );
      const leadCount = leads.length;
      const convertedLeadCount = leads.filter((lead: any) => lead.convertedAt || ['converted', 'booked', 'paid'].includes(String(lead.status))).length;
      const participants = leadCount || Number(activity.participants ?? 0);
      const convertedCount = Math.max(convertedLeadCount, attributedOrderIds.size);
      const conversionRate = participants ? Math.round((convertedCount / participants) * 1000) / 10 : 0;
      return {
        ...activity,
        participants,
        conversion: participants ? `${conversionRate}%` : activity.conversion ?? '0%',
      };
    });
  }

  private parsePromotionIdsFromInput(dto: any) {
    const ids = new Set<number>();
    const add = (value: unknown) => {
      const id = Number(value);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    };

    add(dto.primaryPromotionId);
    add(dto.promotionId);

    const rawIds = Array.isArray(dto.promotionIdsJson)
      ? dto.promotionIdsJson
      : Array.isArray(dto.promotionIds)
        ? dto.promotionIds
        : [];
    rawIds.forEach(add);

    const offer = dto.offerJson && typeof dto.offerJson === 'object' ? dto.offerJson : null;
    if (offer) add((offer as any).promotionId);

    return Array.from(ids);
  }

  private async getUsablePromotions(ids: number[], storeId: number) {
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
    if (!uniqueIds.length) return [];
    const promotions = await this.prisma.promotion.findMany({ where: { id: { in: uniqueIds } } });
    if (promotions.length !== uniqueIds.length) {
      const found = new Set(promotions.map((item: any) => item.id));
      const missing = uniqueIds.filter((id) => !found.has(id));
      throw new BadRequestException(`权益资产不存在：${missing.join(', ')}`);
    }

    const crossStore = promotions.find((promotion: any) => promotion.storeId != null && Number(promotion.storeId) !== storeId);
    if (crossStore) throw new BadRequestException('权益资产不属于当前门店');

    const now = new Date();
    const invalid = promotions.find((promotion: any) => {
      if (promotion.status !== 'active') return true;
      if (promotion.approvalStatus !== 'approved') return true;
      if (promotion.startAt && promotion.startAt > now) return true;
      if (promotion.endAt && promotion.endAt < now) return true;
      if (promotion.maxIssueCount != null && Number(promotion.issuedCount ?? 0) >= Number(promotion.maxIssueCount)) return true;
      return false;
    });
    if (invalid) {
      throw new BadRequestException(`权益资产「${invalid.name}」未通过审核、未发布、已过期或已达发放上限，不能继续投放`);
    }
    return promotions;
  }

  private parsePromotionIdsFromActions(actions: any) {
    if (!Array.isArray(actions)) return [];
    const ids = new Set<number>();
    actions.forEach((action) => {
      const id = Number(action?.promotionId);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    });
    return Array.from(ids);
  }

  private async assertUsableActionPromotions(actions: any, storeId: number) {
    const promotionIds = this.parsePromotionIdsFromActions(actions);
    if (!promotionIds.length) return;
    await this.getUsablePromotions(promotionIds, storeId);
  }

  private async matchDefaultPromotionForScenario(scenario: string | null | undefined, storeId: number) {
    if (!scenario) return null;
    const now = new Date();
    const candidates = await this.prisma.promotion.findMany({
      where: {
        status: 'active',
        approvalStatus: 'approved',
        scenario,
        OR: [{ storeId }, { storeId: null }],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }).catch(() => []);
    const usableCandidates = candidates.filter((promotion: any) =>
      promotion.maxIssueCount == null || Number(promotion.issuedCount ?? 0) < Number(promotion.maxIssueCount),
    );
    return usableCandidates.find((promotion: any) => storeId && promotion.storeId === Number(storeId))
      ?? usableCandidates[0]
      ?? null;
  }

  private async attachDefaultPromotionToActions(actions: any[] = [], scenario: string | null | undefined, storeId: number) {
    if (!Array.isArray(actions) || actions.length === 0) return actions;
    if (actions.some((action) => action?.promotionId)) return actions;
    const promotion = await this.matchDefaultPromotionForScenario(scenario, storeId);
    if (!promotion) return actions;
    return actions.map((action) => {
      if (!['coupon', 'discount', 'gift', 'miniapp'].includes(String(action?.type))) return action;
      return {
        ...action,
        promotionId: promotion.id,
        promotionName: promotion.name,
        value: action.value || promotion.discountText,
      };
    });
  }

  private buildPromotionOfferSnapshot(offerJson: any, promotion: any) {
    return {
      ...(offerJson && typeof offerJson === 'object' ? offerJson : {}),
      type: offerJson?.type ?? promotion.type,
      label: promotion.discountText,
      promotionId: promotion.id,
      promotionName: promotion.name,
      validDays: promotion.validDays ?? offerJson?.validDays,
      reason: offerJson?.reason ?? '来自权益资产库，活动投放和效果复盘可按权益维度追踪。',
    };
  }

  private async normalizeActivityData(dto: any, storeId: number) {
    const data: any = {};
    const stringFields = [
      'title',
      'description',
      'status',
      'conversion',
      'targetCustomers',
      'discount',
      'sourceRecommendationId',
      'predictionRunId',
      'audienceSnapshotId',
      'aiGenerationId',
      'publishStatus',
    ];

    for (const field of stringFields) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }
    if (dto.status !== undefined) data.status = this.normalizeActivityStatus(dto.status);

    if (dto.participants !== undefined) {
      data.participants = Number(dto.participants) || 0;
    }
    if (dto.startDate !== undefined) {
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.endDate !== undefined) {
      data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    }
    if (dto.publishedAt !== undefined) {
      data.publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : null;
    }
    if (dto.pageSchema !== undefined) {
      data.pageSchema = dto.pageSchema;
    }
    if (dto.audienceSnapshotJson !== undefined) {
      data.audienceSnapshotJson = dto.audienceSnapshotJson;
    }
    if (dto.sourceSignalsJson !== undefined) {
      data.sourceSignalsJson = dto.sourceSignalsJson;
    }
    if (dto.offerJson !== undefined) {
      data.offerJson = dto.offerJson;
    }
    const promotionIds = this.parsePromotionIdsFromInput(dto);
    if (promotionIds.length) {
      const promotions = await this.getUsablePromotions(promotionIds, storeId);
      const primaryPromotionId = Number(dto.primaryPromotionId ?? dto.promotionId ?? dto.offerJson?.promotionId ?? promotionIds[0]);
      const primaryPromotion = promotions.find((promotion: any) => promotion.id === primaryPromotionId) ?? promotions[0];
      data.primaryPromotionId = primaryPromotion.id;
      data.promotionIdsJson = promotionIds;
      data.discount = dto.discount || primaryPromotion.discountText;
      data.offerJson = this.buildPromotionOfferSnapshot(data.offerJson, primaryPromotion);
    } else if (dto.primaryPromotionId === null || dto.promotionId === null) {
      data.primaryPromotionId = null;
      data.promotionIdsJson = [];
    } else if (dto.promotionIdsJson !== undefined || dto.promotionIds !== undefined) {
      data.promotionIdsJson = promotionIds;
    }
    if (dto.recommendedItemsJson !== undefined) {
      data.recommendedItemsJson = dto.recommendedItemsJson;
    }

    return data;
  }

  private normalizeActivityStatus(status?: string) {
    if (!status) return 'draft';
    return ACTIVITY_STATUS_ALIASES[String(status)] ?? 'draft';
  }

  private countReachedTouches(strategy: any) {
    const touches = Array.isArray(strategy?.touches) ? strategy.touches : [];
    return touches.filter((touch: any) => ATTRIBUTABLE_TOUCH_STATUS_SET.has(String(touch?.status))).length;
  }

  private sumActualTouchRevenue(touches: any[] = []) {
    return this.roundMoney(touches
      .filter((touch: any) => ATTRIBUTABLE_TOUCH_STATUS_SET.has(String(touch?.status)))
      .reduce((sum: number, touch: any) => sum + Number(touch?.actualRevenue ?? 0), 0));
  }

  async createActivity(dto: any, storeId: number) {
    return this.prisma.marketingActivity.create({
      data: { ...(await this.normalizeActivityData(dto, storeId)), storeId },
      include: { primaryPromotion: true },
    });
  }

  async updateActivity(id: number, dto: any, storeId: number) {
    await this.getActivityById(id, storeId);
    return this.prisma.marketingActivity.update({
      where: { id },
      data: await this.normalizeActivityData(dto, storeId),
      include: { primaryPromotion: true },
    });
  }

  async deleteActivity(id: number, storeId: number) {
    await this.getActivityById(id, storeId);
    await this.prisma.marketingActivity.delete({ where: { id } });
    return { success: true };
  }

  private buildDefaultTriggerOptions() {
    const option = (type: string, category: string, label: string, description: string, priority: string, defaultParams: any, paramSchema: any[] = []) => ({
      type,
      name: label,
      category,
      label,
      description,
      priority,
      defaultParams,
      paramSchema,
    });
    const numberField = (key: string, label: string, suffix = '天', min = 0, max = 365) => ({ key, label, type: 'number', min, max, suffix });
    const booleanField = (key: string, label: string) => ({ key, label, type: 'boolean' });
    const multiChannelField = { key: 'channels', label: '触达渠道', type: 'multi_select', options: [
      { label: '短信', value: 'sms' },
      { label: '小程序', value: 'miniapp' },
      { label: '微信', value: 'wechat' },
      { label: '门店话术', value: 'store' },
      { label: '社群', value: 'group' },
      { label: '朋友圈', value: 'moments' },
    ] };

    return [
      option('coupon_expiry', '时间触发', '优惠券即将到期', '优惠券 D-7/D-3/D-1 到期提醒，推动预约和核销。', 'P0',
        { beforeDays: 7, remindSteps: [7, 3, 1], excludeBooked: true, channels: ['miniapp', 'sms'] },
        [numberField('beforeDays', '提前提醒'), booleanField('excludeBooked', '排除已有预约客户'), multiChannelField]),
      option('card_expiry', '行为触发', '次卡/套餐即将到期', '次卡或套餐剩余次数较少、临近到期时提醒使用或续费。', 'P0',
        { beforeDays: 30, remainingTimes: 1, cardType: 'all', actionIntent: 'use_or_renew', channels: ['miniapp', 'sms'] },
        [numberField('beforeDays', '到期提前'), numberField('remainingTimes', '剩余次数阈值', '次', 0, 20), multiChannelField]),
      option('booking_abandonment', '行为触发', '预约放弃', '客户进入预约流程后未提交，自动召回继续预约。', 'P0',
        { windowHours: 2, recommendAdjacentSlots: true, channels: ['miniapp', 'sms'] },
        [{ key: 'windowHours', label: '放弃后', type: 'number', min: 1, max: 72, suffix: '小时' }, booleanField('recommendAdjacentSlots', '推荐相邻时段'), multiChannelField]),
      option('dormant', '行为触发', '沉睡客户唤醒', '超过指定天数未到店，排除近期购买或已有预约客户。', 'P0',
        { days: 60, excludePurchasedRecently: true, excludeBooked: true, wakeLevel: 'medium', channels: ['sms', 'miniapp'] },
        [numberField('days', '未到店超过'), booleanField('excludePurchasedRecently', '排除近期已购'), booleanField('excludeBooked', '排除已有预约'), multiChannelField]),
      option('product_expiry_clearance', '行为触发', '商品临期消化', '商品批次临期且自然销量无法覆盖时，生成项目搭赠、会员权益或顾问跟进。', 'P0',
        { beforeDays: 60, minGapQty: 5, excludeDaysToExpiryLessThan: 7, channels: ['miniapp', 'store'] },
        [numberField('beforeDays', '临期窗口'), numberField('minGapQty', '最小缺口数量', '件', 0, 10000), numberField('excludeDaysToExpiryLessThan', '小于此天数仅经营提醒'), multiChannelField]),
      option('project_idle_capacity', '行为触发', '美容师排期不满', '未来 1-7 天低峰可预约工时充足且预约占用率低时，推荐低峰权益或顾问邀约。', 'P0',
        { windowDays: 7, maxUtilizationRate: 0.6, minIdleMinutes: 120, timeRanges: ['14:00-17:00'], channels: ['miniapp', 'store'] },
        [numberField('windowDays', '观察窗口'), { key: 'maxUtilizationRate', label: '最高占用率', type: 'number', min: 0, max: 1, suffix: '' }, { key: 'minIdleMinutes', label: '最少空闲分钟', type: 'number', min: 30, max: 1440, suffix: '分钟' }, multiChannelField]),
      option('care_cycle', '时间触发', '护理周期到期', '上次护理后按 21-45 天周期提醒复购预约。', 'P0',
        { cycleDays: 28, lastServiceType: 'facial_care', remindDaysBefore: 3, channels: ['miniapp', 'sms'] },
        [numberField('cycleDays', '护理周期'), numberField('remindDaysBefore', '提前提醒'), multiChannelField]),
      option('browse_abandonment', '行为触发', '小程序浏览未预约', '浏览项目/活动页后 24 小时未预约，自动推送项目案例和体验券。', 'P1',
        { windowHours: 24, minViewCount: 1, targetType: 'project', excludeBooked: true, channels: ['miniapp'] },
        [{ key: 'windowHours', label: '浏览后', type: 'number', min: 1, max: 168, suffix: '小时' }, { key: 'minViewCount', label: '最低浏览次数', type: 'number', min: 1, max: 20, suffix: '次' }, booleanField('excludeBooked', '排除已有预约'), multiChannelField]),
      option('coupon_claimed_unused', '行为触发', '领券未核销', '客户领券后未预约或未核销，自动提醒使用。', 'P1',
        { unusedDays: 3, excludePurchasedRecently: true, channels: ['miniapp', 'sms'] },
        [numberField('unusedDays', '领券后未使用'), booleanField('excludePurchasedRecently', '排除近期已购'), multiChannelField]),
      option('seasonal_skin_care', '时间触发', '季节换肤护理', '按春敏、夏季控油防晒、秋冬补水修护生成季节护理推荐。', 'P2',
        { season: 'current', leadDays: 15, skinTypes: 'auto_by_season', projectCategories: 'auto_by_season', channels: ['miniapp', 'wechat'] },
        [numberField('leadDays', '提前预热'), multiChannelField]),
      option('seasonal', '时间触发', '季节护理', '兼容旧版季节护理规则，默认映射到季节换肤护理。', 'P2',
        { season: 'current', leadDays: 15, skinTypes: 'auto_by_season', projectCategories: 'auto_by_season', channels: ['miniapp', 'wechat'] },
        [numberField('leadDays', '提前预热'), multiChannelField]),
      option('holiday_campaign', '时间触发', '节假日营销', '节日前 15-30 天预热女神节、母亲节、520、七夕等主题活动。', 'P2',
        { holiday: 'auto_upcoming_major_holiday', leadDays: 21, channels: ['miniapp', 'wechat'] },
        [numberField('leadDays', '提前预热'), multiChannelField]),
      option('holiday', '时间触发', '节日营销', '兼容旧版节日营销规则，默认映射到节假日营销活动。', 'P2',
        { holiday: 'auto_upcoming_major_holiday', leadDays: 21, channels: ['miniapp', 'wechat'] },
        [numberField('leadDays', '提前预热'), multiChannelField]),
      option('vip_privilege_care', '属性触发', '高价值客户权益维护', '铂金/黄金/VIP 客户季度权益、生日或周年关怀。', 'P2',
        { levels: ['gold', 'platinum', 'diamond'], actionIntent: 'privilege_care', channels: ['wechat', 'store'] },
        [{ key: 'levels', label: '会员等级', type: 'multi_select', options: [
          { label: '金卡会员', value: 'gold' },
          { label: '白金会员', value: 'platinum' },
          { label: '钻石会员', value: 'diamond' },
        ] }, multiChannelField]),
      option('product_replenishment', '行为触发', '商品补货提醒', '按护肤品消耗周期提醒补货或搭配护理。', 'P0',
        { replenishmentDays: 45, productCategory: 'skin_care', excludePurchasedRecently: true, sameProductOnly: true, channels: ['miniapp', 'wechat'] },
        [numberField('replenishmentDays', '预计消耗周期'), booleanField('excludePurchasedRecently', '排除近期已购'), booleanField('sameProductOnly', '同款优先'), multiChannelField]),
      option('referral_campaign', '行为触发', '老带新/闺蜜同行', '稳定客户、分享意愿强客户触发裂变活动。', 'P3',
        { minVisitCount: 3, rewardType: 'coupon', channels: ['miniapp', 'moments', 'group'] },
        [{ key: 'minVisitCount', label: '最低到店次数', type: 'number', min: 1, max: 100, suffix: '次' }, multiChannelField]),
      option('birthday', '时间触发', '生日触发', '生日月或生日前自动触达生日权益。', 'P1',
        { offsetDays: -7, dateScope: 'birthday_month', channels: ['miniapp', 'sms'] },
        [numberField('offsetDays', '生日偏移天数', '天', -30, 30), multiChannelField]),
      option('last_visit', '行为触发', '最近消费时间', '最近到店超过指定天数时触发轻唤醒。', 'P1',
        { operator: 'greater_than', days: 30, excludeBooked: true, channels: ['sms', 'miniapp'] },
        [numberField('days', '未到店超过'), booleanField('excludeBooked', '排除已有预约'), multiChannelField]),
      option('consumption', '行为触发', '消费金额', '累计或周期消费达到门槛，触发会员权益或升级。', 'P2',
        { period: 'cumulative', operator: 'greater_than_or_equal', amount: 5000, tierAction: 'vip_care' },
        [{ key: 'amount', label: '消费金额', type: 'number', min: 0, max: 1000000, suffix: '元' }]),
      option('member_level', '属性触发', '会员等级', '按会员等级触发权益维护。', 'P2',
        { levels: ['gold', 'platinum', 'diamond'], actionIntent: 'privilege_care', channels: ['wechat', 'store'] },
        [{ key: 'levels', label: '会员等级', type: 'multi_select', options: [
          { label: '金卡会员', value: 'gold' },
          { label: '白金会员', value: 'platinum' },
          { label: '钻石会员', value: 'diamond' },
        ] }, multiChannelField]),
      option('skin_type', '属性触发', '肤质类型', '按肤质触发护肤方案推荐。', 'P2',
        { skinTypes: ['dry', 'oily', 'sensitive', 'combination'], sourcePriority: ['aura_lite', 'health_profile', 'manual'], recommendMode: 'skin_care_plan' },
        [{ key: 'skinTypes', label: '肤质类型', type: 'multi_select', options: [
          { label: '干性肌肤', value: 'dry' },
          { label: '油性肌肤', value: 'oily' },
          { label: '敏感肌肤', value: 'sensitive' },
          { label: '混合肌肤', value: 'combination' },
        ] }]),
      option('visit_frequency', '行为触发', '到店频次', '观察窗口内到店次数变化。', 'P2',
        { windowDays: 90, operator: 'less_than', count: 2, compareToPreviousWindow: true },
        [numberField('windowDays', '观察窗口'), { key: 'count', label: '次数阈值', type: 'number', min: 0, max: 100, suffix: '次' }]),
      option('visit_gap', '行为触发', '到店间隔异常', '当前到店间隔超过个人历史均值倍数。', 'P1',
        { gapRatio: 1.5, minDays: 45, excludeNewCustomer: true },
        [{ key: 'gapRatio', label: '间隔倍数', type: 'number', min: 1, max: 10, suffix: '倍' }, numberField('minDays', '最小间隔')]),
      option('service_interest', '行为触发', '项目偏好', '按历史项目偏好推荐相关项目或套餐。', 'P2',
        { windowDays: 180, minCount: 2, projectCategory: 'last_top_category', recommendMode: 'related_project' },
        [numberField('windowDays', '观察窗口'), { key: 'minCount', label: '最低次数', type: 'number', min: 1, max: 20, suffix: '次' }]),
      option('new_customer', '属性触发', '新客转化', '新客建档后首单或二次到店引导。', 'P1',
        { withinDays: 7, hasNoOrder: true, touchDay: 3, defaultAction: 'first_order_coupon' },
        [numberField('withinDays', '建档后窗口'), numberField('touchDay', '第几天触达')]),
      option('age_range', '属性触发', '年龄区间', '按年龄段推荐抗初老、维稳等主题。', 'P3',
        { minAge: 25, maxAge: 40, theme: 'anti_aging_entry', channels: ['miniapp', 'wechat'] },
        [{ key: 'minAge', label: '最小年龄', type: 'number', min: 0, max: 100, suffix: '岁' }, { key: 'maxAge', label: '最大年龄', type: 'number', min: 0, max: 100, suffix: '岁' }, multiChannelField]),
    ];
  }

  async getTriggerOptions() {
    const delegate = this.ruleTemplateDelegate();
    if (delegate?.findMany) {
      try {
        await this.ensureSystemRuleTemplates();
        const templates = await delegate.findMany({
          where: { source: 'system', status: { not: 'archived' } },
          orderBy: [{ priority: 'asc' }, { id: 'asc' }],
        });
        if (templates.length) return templates.map((template: any) => this.mapTemplateToTriggerOption(template));
      } catch {
        return this.buildDefaultTriggerOptions();
      }
    }
    return this.buildDefaultTriggerOptions();
  }

  private ruleTemplateDelegate() {
    return (this.prisma as any).marketingRuleTemplate;
  }

  private strategyDelegate() {
    return (this.prisma as any).marketingAutomationStrategy;
  }

  private mapCategoryToCode(category: string) {
    if (category === '时间触发') return 'time';
    if (category === '属性触发') return 'attribute';
    return 'behavior';
  }

  private mapCategoryToLabel(category: string) {
    if (category === 'time') return '时间触发';
    if (category === 'attribute') return '属性触发';
    return '行为触发';
  }

  private mapRulePriorityFilter(priority?: string) {
    if (!priority || priority === 'all') return [];
    if (priority === 'urgent' || priority === '紧急') return ['P0'];
    if (priority === 'recommended' || priority === '推荐') return ['P1'];
    if (priority === 'opportunity' || priority === '机会') return ['P2', 'P3'];
    return String(priority)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private inferScenario(type: string) {
    const scenarioByType: Record<string, string> = {
      coupon_expiry: '到期提醒',
      card_expiry: '到期提醒',
      care_cycle: '到期提醒',
      dormant: '流失召回',
      last_visit: '流失召回',
      visit_gap: '流失召回',
      browse_abandonment: '转化召回',
      coupon_claimed_unused: '转化召回',
      booking_abandonment: '转化召回',
      birthday: '会员经营',
      member_level: '会员经营',
      vip_privilege_care: '会员经营',
      skin_type: '个性化推荐',
      service_interest: '个性化推荐',
      seasonal_skin_care: '个性化推荐',
      seasonal: '个性化推荐',
      product_replenishment: '个性化推荐',
      new_customer: '转化召回',
      referral_campaign: '裂变营销',
      holiday: '活动营销',
      holiday_campaign: '活动营销',
    };
    return scenarioByType[type] ?? '自动营销';
  }

  private inferDataDependencies(type: string) {
    const dependenciesByType: Record<string, string[]> = {
      coupon_expiry: ['优惠券', '预约记录'],
      coupon_claimed_unused: ['优惠券', '订单记录', '预约记录'],
      card_expiry: ['客户卡项', '核销记录'],
      care_cycle: ['服务记录', '项目记录'],
      dormant: ['客户档案', '消费记录', '预约记录'],
      last_visit: ['客户档案', '消费记录'],
      visit_gap: ['消费记录', '客户画像'],
      browse_abandonment: ['Ami Glow 小程序行为', '预约记录'],
      booking_abandonment: ['预约流程行为', '预约记录'],
      birthday: ['客户档案'],
      member_level: ['客户档案'],
      vip_privilege_care: ['客户档案', '消费记录'],
      skin_type: ['肌肤档案', 'Ami Aura Lite 检测'],
      service_interest: ['项目订单', '消费记录'],
      product_replenishment: ['商品订单', '商品消耗周期'],
      new_customer: ['客户档案', '订单记录'],
    };
    return dependenciesByType[type] ?? ['客户档案'];
  }

  private inferRecommendedActions(option: any) {
    const channels = Array.isArray(option.defaultParams?.channels) ? option.defaultParams.channels : ['miniapp'];
    const valueByType: Record<string, string> = {
      dormant: '回归专享满300减80',
      card_expiry: '次卡续费/消耗提醒',
      coupon_expiry: '优惠券即将到期提醒',
      coupon_claimed_unused: '已领优惠券使用提醒',
      browse_abandonment: '项目体验券',
      booking_abandonment: '继续预约提醒',
      birthday: '生日月专属权益',
      care_cycle: '护理周期复购提醒',
    };
    return channels.map((channel: string) => ({
      type: channel === 'sms' ? 'sms' : 'push',
      value: valueByType[option.type] ?? option.label,
      channel,
    }));
  }

  private inferScheduleDefault(option: any) {
    if (['browse_abandonment', 'booking_abandonment'].includes(option.type)) {
      return { type: 'realtime' };
    }
    return { type: 'daily', time: option.type === 'birthday' ? '08:00' : '09:00' };
  }

  private inferFrequencyCap(option: any) {
    return {
      sameCustomerDays: ['birthday', 'card_expiry', 'coupon_expiry'].includes(option.type) ? 1 : 7,
      sameChannelDays: 1,
      maxTouchesPerDay: 1,
    };
  }

  private buildDefaultRuleTemplates() {
    return this.buildDefaultTriggerOptions().map((option: any) => {
      const category = this.mapCategoryToCode(option.category);
      return {
        code: `system_${option.type}`,
        name: option.label,
        description: option.description,
        source: 'system',
        category,
        categoryLabel: option.category,
        scenario: this.inferScenario(option.type),
        priority: option.priority,
        status: option.priority === 'P0' || ['birthday', 'care_cycle', 'last_visit', 'visit_gap', 'member_level', 'skin_type', 'new_customer'].includes(option.type)
          ? 'recommended'
          : 'disabled',
        version: RULE_TEMPLATE_VERSION,
        triggerType: option.type,
        paramSchema: option.paramSchema,
        defaultParams: option.defaultParams,
        recommendedActions: this.inferRecommendedActions(option),
        scheduleDefault: this.inferScheduleDefault(option),
        frequencyCap: this.inferFrequencyCap(option),
        dataDependencies: this.inferDataDependencies(option.type),
        recommendationReason: option.description,
      };
    });
  }

  private mapTemplateToTriggerOption(template: any) {
    return {
      type: template.triggerType,
      name: template.name,
      category: template.categoryLabel ?? this.mapCategoryToLabel(template.category),
      label: template.name,
      description: template.description ?? '',
      priority: template.priority,
      defaultParams: template.defaultParams ?? {},
      paramSchema: template.paramSchema ?? [],
    };
  }

  private serializeRuleTemplate(template: any, effect?: any) {
    return {
      ...template,
      categoryLabel: template.categoryLabel ?? this.mapCategoryToLabel(template.category),
      paramSchema: template.paramSchema ?? [],
      defaultParams: template.defaultParams ?? {},
      recommendedActions: template.recommendedActions ?? [],
      scheduleDefault: template.scheduleDefault ?? { type: 'daily', time: '09:00' },
      frequencyCap: template.frequencyCap ?? {},
      dataDependencies: template.dataDependencies ?? [],
      effect: effect ?? template.effect,
    };
  }

  private async ensureSystemRuleTemplates() {
    const delegate = this.ruleTemplateDelegate();
    if (!delegate?.count || !delegate?.createMany) return;
    const count = await delegate.count({ where: { source: 'system' } });
    if (count > 0) return;
    await delegate.createMany({
      data: this.buildDefaultRuleTemplates(),
      skipDuplicates: true,
    });
  }

  private async fallbackRuleTemplates(query: PageQuery = {}) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 10);
    const keyword = String(query.keyword ?? '').trim().toLowerCase();
    let items = this.buildDefaultRuleTemplates().map((template, index) => ({
      ...template,
      id: index + 1,
      storeId: null,
      baseTemplateId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    if (query.source && query.source !== 'all') items = items.filter((item) => item.source === query.source);
    if (query.category && query.category !== 'all') items = items.filter((item) => item.category === query.category || item.categoryLabel === query.category);
    if (query.scenario && query.scenario !== 'all') items = items.filter((item) => item.scenario === query.scenario);
    const priorityValues = this.mapRulePriorityFilter(query.priority);
    if (priorityValues.length) items = items.filter((item) => priorityValues.includes(item.priority));
    if (query.status && query.status !== 'all') items = items.filter((item) => item.status === query.status);
    if (keyword) {
      items = items.filter((item) => [item.name, item.description, item.triggerType, item.scenario].some((value) => String(value ?? '').toLowerCase().includes(keyword)));
    }
    const total = items.length;
    const pageItems = items.slice((page - 1) * pageSize, page * pageSize).map((item) => this.serializeRuleTemplate(item));
    return { items: pageItems, data: pageItems, total, page, pageSize };
  }

  async findRuleTemplates(storeId: number, query: PageQuery = {}) {
    const delegate = this.ruleTemplateDelegate();
    if (!delegate?.findMany) return this.fallbackRuleTemplates(query);
    try {
      await this.ensureSystemRuleTemplates();
      const page = Number(query.page ?? 1);
      const pageSize = Number(query.pageSize ?? 10);
      const keyword = String(query.keyword ?? '').trim();
      const priorityValues = this.mapRulePriorityFilter(query.priority);
      const where: any = {
        OR: [{ storeId: null }, { storeId }],
        ...(query.source && query.source !== 'all' ? { source: query.source } : {}),
        ...(query.category && query.category !== 'all' ? { category: query.category } : {}),
        ...(query.scenario && query.scenario !== 'all' ? { scenario: query.scenario } : {}),
        ...(priorityValues.length ? { priority: { in: priorityValues } } : {}),
        ...(query.status && query.status !== 'all' ? { status: query.status } : { status: { not: 'archived' } }),
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword, mode: 'insensitive' } },
                { description: { contains: keyword, mode: 'insensitive' } },
                { triggerType: { contains: keyword, mode: 'insensitive' } },
                { scenario: { contains: keyword, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        delegate.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
        }),
        delegate.count({ where }),
      ]);
      const effects = await this.getRuleEffectsForTemplates(items.map((item: any) => item.id), storeId);
      const mapped = items.map((item: any) => this.serializeRuleTemplate(item, effects.get(item.id)));
      return { items: mapped, data: mapped, total, page, pageSize };
    } catch {
      return this.fallbackRuleTemplates(query);
    }
  }

  async getRuleTemplateById(id: number, storeId: number) {
    const delegate = this.ruleTemplateDelegate();
    if (delegate?.findFirst) {
      try {
        const template = await delegate.findFirst({ where: { id, OR: [{ storeId: null }, { storeId }] } });
        if (template) {
          const effect = await this.getRuleTemplateEffects(id, storeId);
          return this.serializeRuleTemplate(template, effect);
        }
      } catch {
        // If Prisma Client was generated but the migration has not been applied yet,
        // keep read-only rule browsing alive through the built-in template catalog.
      }
    }
    const fallback = (await this.fallbackRuleTemplates({ page: 1, pageSize: 100 })).items.find((item: any) => item.id === id);
    if (!fallback) throw new NotFoundException('Rule template not found');
    return fallback;
  }

  async cloneRuleTemplate(id: number, storeId: number, dto: any = {}) {
    const delegate = this.ruleTemplateDelegate();
    if (!delegate?.create) throw new NotFoundException('Rule template storage is not available');
    await this.ensureSystemRuleTemplates();
    const template = await delegate.findFirst({ where: { id, OR: [{ storeId: null }, { storeId }] } });
    if (!template) throw new NotFoundException('Rule template not found');
    const cloned = await delegate.create({
      data: {
        code: `${template.code}_copy_${Date.now()}`,
        name: dto.name ?? `${template.name}（我的规则）`,
        description: dto.description ?? template.description,
        source: 'store',
        category: template.category,
        categoryLabel: template.categoryLabel,
        scenario: template.scenario,
        priority: template.priority,
        status: dto.status ?? 'draft',
        version: template.version ?? RULE_TEMPLATE_VERSION,
        baseTemplateId: template.id,
        storeId,
        triggerType: template.triggerType,
        paramSchema: template.paramSchema,
        defaultParams: dto.defaultParams ?? template.defaultParams,
        recommendedActions: dto.recommendedActions ?? template.recommendedActions,
        scheduleDefault: dto.scheduleDefault ?? template.scheduleDefault,
        frequencyCap: dto.frequencyCap ?? template.frequencyCap,
        dataDependencies: template.dataDependencies,
        recommendationReason: template.recommendationReason,
        createdBy: dto.createdBy ? Number(dto.createdBy) : null,
      },
    });
    return this.serializeRuleTemplate(cloned);
  }

  createRuleTemplate(storeId: number, dto: any) {
    const delegate = this.ruleTemplateDelegate();
    if (!delegate?.create) throw new NotFoundException('Rule template storage is not available');
    return delegate.create({
      data: {
        code: dto.code ?? `store_${dto.triggerType}_${Date.now()}`,
        name: dto.name,
        description: dto.description ?? '',
        source: 'store',
        category: dto.category ?? this.mapCategoryToCode(dto.categoryLabel ?? '行为触发'),
        categoryLabel: dto.categoryLabel ?? this.mapCategoryToLabel(dto.category),
        scenario: dto.scenario ?? this.inferScenario(dto.triggerType),
        priority: dto.priority ?? 'P1',
        status: dto.status ?? 'draft',
        version: dto.version ?? RULE_TEMPLATE_VERSION,
        baseTemplateId: dto.baseTemplateId ? Number(dto.baseTemplateId) : null,
        storeId,
        triggerType: dto.triggerType,
        paramSchema: dto.paramSchema ?? [],
        defaultParams: dto.defaultParams ?? {},
        recommendedActions: dto.recommendedActions ?? [],
        scheduleDefault: dto.scheduleDefault ?? { type: 'daily', time: '09:00' },
        frequencyCap: dto.frequencyCap ?? { sameCustomerDays: 7, sameChannelDays: 1 },
        dataDependencies: dto.dataDependencies ?? this.inferDataDependencies(dto.triggerType),
        recommendationReason: dto.recommendationReason ?? dto.description ?? '',
        createdBy: dto.createdBy ? Number(dto.createdBy) : null,
      },
    });
  }

  async updateRuleTemplate(id: number, storeId: number, dto: any) {
    const delegate = this.ruleTemplateDelegate();
    if (!delegate?.update) throw new NotFoundException('Rule template storage is not available');
    const template = await delegate.findFirst({ where: { id, storeId } });
    if (!template) throw new NotFoundException('Rule template not found');
    if (template.source === 'system') throw new NotFoundException('System rule templates must be cloned before editing');
    const updated = await delegate.update({
      where: { id },
      data: {
        name: dto.name ?? template.name,
        description: dto.description ?? template.description,
        scenario: dto.scenario ?? template.scenario,
        priority: dto.priority ?? template.priority,
        status: dto.status ?? template.status,
        paramSchema: dto.paramSchema ?? template.paramSchema,
        defaultParams: dto.defaultParams ?? template.defaultParams,
        recommendedActions: dto.recommendedActions ?? template.recommendedActions,
        scheduleDefault: dto.scheduleDefault ?? template.scheduleDefault,
        frequencyCap: dto.frequencyCap ?? template.frequencyCap,
        dataDependencies: dto.dataDependencies ?? template.dataDependencies,
        recommendationReason: dto.recommendationReason ?? template.recommendationReason,
      },
    });
    return this.serializeRuleTemplate(updated);
  }

  async previewRuleTemplateAudience(id: number, storeId: number) {
    const template = await this.getRuleTemplateById(id, storeId);
    return this.previewAudience([{
      type: template.triggerType,
      params: template.defaultParams ?? {},
      parameterSource: template.source === 'system' ? 'system_default' : 'customized',
    }], 'AND', undefined, storeId);
  }

  async enableRuleTemplate(id: number, storeId: number, dto: any = {}) {
    const template = await this.getRuleTemplateById(id, storeId);
    const preview = await this.previewRuleTemplateAudience(id, storeId);
    const actions = await this.attachDefaultPromotionToActions(
      dto.actions ?? template.recommendedActions ?? [],
      template.scenario,
      storeId,
    );
    await this.assertUsableActionPromotions(actions, storeId);
    const strategy = await this.strategyDelegate().create({
      data: {
        name: dto.name ?? template.name,
        storeId,
        description: dto.description ?? template.description,
        status: 'enabled',
        executionType: dto.executionType ?? 'auto',
        source: 'rule_library',
        ruleTemplateId: template.id,
        ruleTemplateVersion: template.version ?? RULE_TEMPLATE_VERSION,
        schedule: dto.schedule ?? template.scheduleDefault ?? { type: 'daily', time: '09:00' },
        triggerRules: [{
          type: template.triggerType,
          params: dto.defaultParams ?? template.defaultParams ?? {},
          parameterSource: template.source === 'system' ? 'system_default' : 'customized',
        }],
        ruleRelation: 'AND',
        actions,
        targetCount: preview.total ?? preview.estimatedCount ?? 0,
      },
    });
    const delegate = this.ruleTemplateDelegate();
    if (delegate?.update && template.source === 'store') {
      await delegate.update({ where: { id }, data: { status: 'enabled' } });
    }
    return { strategy, preview, template };
  }

  async disableRuleTemplate(id: number, storeId: number) {
    const delegate = this.ruleTemplateDelegate();
    if (!delegate?.update) throw new NotFoundException('Rule template storage is not available');
    const template = await delegate.findFirst({ where: { id, storeId } });
    if (!template) throw new NotFoundException('Rule template not found');
    const updated = await delegate.update({ where: { id }, data: { status: 'disabled' } });
    await this.strategyDelegate().updateMany?.({
      where: { ruleTemplateId: id, storeId, status: 'enabled' },
      data: { status: 'paused' },
    });
    return this.serializeRuleTemplate(updated);
  }

  private async getRuleEffectsForTemplates(ids: number[], storeId: number) {
    if (!ids.length) return new Map<number, any>();
    let strategies: any[] = [];
    try {
      strategies = await this.strategyDelegate().findMany?.({
        where: { ruleTemplateId: { in: ids }, storeId },
        include: { executions: true, touches: true },
      }) ?? [];
    } catch {
      strategies = [];
    }
    const strategiesByTemplate = new Map<number, any[]>();
    for (const strategy of strategies) {
      const templateId = Number(strategy.ruleTemplateId);
      if (!Number.isInteger(templateId)) continue;
      const grouped = strategiesByTemplate.get(templateId) ?? [];
      grouped.push(strategy);
      strategiesByTemplate.set(templateId, grouped);
    }
    return new Map(ids.map((id) => [id, this.summarizeRuleTemplateEffect(id, strategiesByTemplate.get(id) ?? [])]));
  }

  async getRuleTemplateEffects(id: number, storeId: number) {
    let strategies: any[] = [];
    try {
      strategies = await this.strategyDelegate().findMany?.({
        where: { ruleTemplateId: id, storeId },
        include: { executions: true, touches: true },
      }) ?? [];
    } catch {
      strategies = [];
    }
    return this.summarizeRuleTemplateEffect(id, strategies);
  }

  private summarizeRuleTemplateEffect(id: number, strategies: any[]) {
    const strategyCount = strategies.length;
    const activeStrategyCount = strategies.filter((strategy: any) => strategy.status === 'enabled').length;
    const reachedCount = strategies.reduce((sum: number, strategy: any) => sum + this.countReachedTouches(strategy), 0);
    const convertedCount = strategies.reduce((sum: number, strategy: any) => sum + (strategy.touches?.filter((item: any) => item.status === 'converted').length ?? 0), 0);
    const revenue = this.roundMoney(strategies.reduce(
      (sum: number, strategy: any) => sum + this.sumActualTouchRevenue(strategy.touches ?? []),
      0,
    ));
    const cost = this.roundMoney(reachedCount * 2);
    const lastExecutedAt = strategies
      .map((strategy: any) => strategy.lastExecutedAt)
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime())[0];
    return {
      ruleTemplateId: id,
      strategyCount,
      activeStrategyCount,
      reachedCount,
      convertedCount,
      conversionRate: reachedCount ? `${Math.round((convertedCount / reachedCount) * 1000) / 10}%` : '0%',
      returnCount: convertedCount,
      revenue,
      cost,
      roi: revenue > 0 ? `${Math.round((revenue / Math.max(cost, 1)) * 10) / 10}x` : '0',
      lastExecutedAt,
      metrics: {
        revenue: { value: revenue, source: 'actual', definition: '来自有效触达后的订单归因净收入，退款会同步冲减' },
        cost: { value: cost, source: 'estimated', definition: '按每次有效触达 2 元估算，不代表实际渠道账单' },
      },
    };
  }

  async findStrategies(query: PageQuery = {}) {
    const { page = 1, pageSize = 20, status, storeId } = query;
    if (!storeId) throw new BadRequestException('storeId is required');
    const where = { storeId, ...(status ? { status: status as any } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.marketingAutomationStrategy.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.marketingAutomationStrategy.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async createStrategy(dto: any, storeId: number) {
    const actions = this.attachStrategyAttributionToActions(dto.actions ?? [], dto);
    await this.assertUsableActionPromotions(actions, storeId);
    return this.prisma.marketingAutomationStrategy.create({
      data: {
        storeId,
        name: dto.name,
        description: dto.description,
        status: dto.status ?? 'draft',
        executionType: dto.executionType ?? 'manual',
        source: dto.source ?? 'manual',
        schedule: dto.schedule ?? {},
        triggerRules: dto.triggerRules ?? [],
        ruleRelation: dto.ruleRelation ?? 'AND',
        actions,
        targetCount: dto.targetCount ?? 0,
      },
    });
  }

  private async getStrategyById(id: number, storeId: number) {
    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({ where: { id, storeId } });
    if (!strategy) throw new NotFoundException('Strategy not found');
    return strategy;
  }

  async updateStrategy(id: number, dto: any, storeId: number) {
    await this.getStrategyById(id, storeId);
    if (dto.actions !== undefined) {
      dto.actions = this.attachStrategyAttributionToActions(dto.actions, dto);
      await this.assertUsableActionPromotions(dto.actions, storeId);
    }
    return this.prisma.marketingAutomationStrategy.update({ where: { id }, data: dto });
  }

  private attachStrategyAttributionToActions(actions: any[] = [], dto: any = {}) {
    if (!Array.isArray(actions)) return [];
    const attribution = dto.attribution ?? dto.schedule?.attribution;
    if (!attribution) return actions;
    return actions.map((action) => ({
      ...action,
      attribution: action?.attribution ?? attribution,
    }));
  }

  async deleteStrategy(id: number, storeId: number) {
    await this.getStrategyById(id, storeId);
    await this.prisma.marketingAutomationStrategy.delete({ where: { id } });
    return { success: true };
  }

  async enableStrategy(id: number, storeId: number) {
    const strategy = await this.getStrategyById(id, storeId);
    await this.assertUsableActionPromotions(strategy.actions, storeId);
    return this.prisma.marketingAutomationStrategy.update({ where: { id }, data: { status: 'enabled' } });
  }

  async pauseStrategy(id: number, storeId: number) {
    await this.getStrategyById(id, storeId);
    return this.prisma.marketingAutomationStrategy.update({ where: { id }, data: { status: 'paused' } });
  }

  async executeStrategy(id: number, storeId: number, idempotencyKey = `manual-${Date.now()}`) {
    if (
      isMarketingFeatureEnabledForStore(this.marketingFeatureFlags, 'deliveryJobEngine', storeId)
      && this.marketingExecutionService
    ) {
      return this.marketingExecutionService.start(id, storeId, idempotencyKey);
    }
    const existingExecution = await this.prisma.marketingAutomationExecution.findUnique({
      where: { strategyId_idempotencyKey: { strategyId: id, idempotencyKey } },
    });
    if (existingExecution) return existingExecution;

    const strategy = await this.prisma.marketingAutomationStrategy.findFirst({ where: { id, storeId } });
    if (!strategy) throw new NotFoundException('Strategy not found');
    await this.assertUsableActionPromotions(strategy.actions, storeId);
    const audience = await this.buildAutomationAudience(storeId, strategy.triggerRules as any[], strategy.ruleRelation, strategy.actions);
    const channel = this.extractPrimaryChannel(strategy.actions);
    const eligibleCustomers = await this.filterTouchFatigue(storeId, id, channel, audience.customers);
    const actionPromotions = this.extractActionPromotions(strategy.actions);

    const execution = await this.prisma.marketingAutomationExecution.create({
      data: {
        storeId,
        strategyId: id,
        idempotencyKey,
        strategyName: strategy.name,
        status: 'running',
        triggeredCount: audience.total,
        queuedCount: eligibleCustomers.length,
        reachedCount: 0,
        failedCount: 0,
        channel,
      } as any,
    });

    let reachedCount = 0;
    let failedCount = 0;
    const deliveredCustomers: any[] = [];
    for (const item of eligibleCustomers) {
      const touch = await this.prisma.marketingAutomationTouch.create({
        data: {
          executionId: execution.id,
          strategyId: id,
          customerId: item.id,
          predictionSnapshotId: item.prediction?.id ?? null,
          predictedConversionScore: item.predictedConversionScore,
          predictedRevenue: item.predictedRevenue,
          channel,
          status: 'queued',
          attemptCount: 1,
          touchedAt: new Date(),
          attributionWindowDays: DEFAULT_ATTRIBUTION_WINDOW_DAYS,
        } as any,
      });

      const delivery = this.marketingChannelService
        ? await this.marketingChannelService.deliver({
            channel: ['terminal', 'in_app', 'sms', 'wechat'].includes(channel) ? channel as any : 'in_app',
            storeId,
            customerId: item.id,
            strategyId: id,
            executionId: execution.id,
            title: strategy.name,
            content: this.extractPrimaryActionContent(strategy.actions),
          }).catch((error) => ({ status: 'failed' as const, errorCode: error?.code ?? 'delivery_failed' }))
        : { status: 'failed' as const, errorCode: 'channel_service_unavailable' };

      if (delivery.status === 'delivered') {
        reachedCount += 1;
        deliveredCustomers.push(item);
      } else failedCount += 1;
      await this.prisma.marketingAutomationTouch.update({
        where: { id: touch.id },
        data: {
          status: delivery.status,
          errorCode: delivery.errorCode ?? null,
          errorMessage: null,
        } as any,
      });
    }

    if (deliveredCustomers.length > 0) {
      await this.recordAutomationPromotionClaims(storeId, strategy, execution, deliveredCustomers, actionPromotions, channel);
    }
    const status = failedCount === 0 ? 'success' : reachedCount === 0 ? 'failed' : 'partial_failed';
    const completedExecution = await this.prisma.marketingAutomationExecution.update({
      where: { id: execution.id },
      data: { status, reachedCount, failedCount } as any,
    });
    await this.prisma.marketingAutomationStrategy.update({
      where: { id },
      data: { lastExecutedAt: new Date(), targetCount: audience.total },
    });
    return completedExecution;
  }

  private extractPrimaryActionContent(actions: any) {
    if (!Array.isArray(actions)) return '您有一条门店服务提醒';
    const action = actions[0] ?? {};
    return String(action.content ?? action.value ?? action.message ?? '您有一条门店服务提醒');
  }

  private extractActionPromotions(actions: any) {
    if (!Array.isArray(actions)) return [];
    const seen = new Set<number>();
    return actions
      .map((action) => {
        const promotionId = Number(action?.promotionId);
        if (!Number.isFinite(promotionId) || promotionId <= 0 || seen.has(promotionId)) return null;
        seen.add(promotionId);
        return {
          promotionId,
          promotionName: action?.promotionName,
          value: action?.value,
          type: action?.type,
          attribution: action?.attribution,
        };
      })
      .filter(Boolean);
  }

  private async recordAutomationPromotionClaims(
    storeId: number,
    strategy: any,
    execution: any,
    customers: any[],
    promotions: any[],
    channel?: string,
  ) {
    if (!customers.length || !promotions.length) return;
    const eventDelegate = (this.prisma as any).customerAppEvent;
    const promotionDelegate = (this.prisma as any).promotion;
    const now = new Date();

    if (eventDelegate?.createMany) {
      await eventDelegate.createMany({
        data: customers.flatMap((customer) => promotions.map((promotion) => ({
          storeId,
          customerId: customer.id,
          eventType: 'promotion_claimed',
          channel,
          targetType: 'promotion',
          targetId: String(promotion.promotionId),
          source: 'marketing_automation',
          metadataJson: {
            strategyId: strategy.id,
            strategyName: strategy.name,
            executionId: execution.id,
            promotionName: promotion.promotionName,
            actionType: promotion.type,
            actionValue: promotion.value,
            attribution: promotion.attribution ?? strategy.schedule?.attribution ?? null,
          },
          occurredAt: now,
        }))),
        skipDuplicates: true,
      });
    }

    if (promotionDelegate?.updateMany) {
      await Promise.all(promotions.map((promotion) =>
        promotionDelegate.updateMany({
          where: { id: promotion.promotionId },
          data: { issuedCount: { increment: customers.length } },
        }),
      ));
    }
  }

  private async filterTouchFatigue(storeId: number, strategyId: number, channel: string, customers: any[]) {
    const delegate = (this.prisma as any).marketingAutomationTouch;
    if (!delegate?.findMany || customers.length === 0) return customers;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const customerIds = customers.map((customer) => customer.id);
    const touches = await delegate.findMany({
      where: {
        customerId: { in: customerIds },
        execution: { storeId },
        OR: [
          { strategyId, touchedAt: { gte: sevenDaysAgo } },
          { channel, touchedAt: { gte: oneDayAgo } },
        ],
      },
      select: { customerId: true },
    });
    const fatigued = new Set(touches.map((touch: any) => touch.customerId));
    return customers.filter((customer) => !fatigued.has(customer.id));
  }

  async previewAudience(triggerRules: any[] = [], ruleRelation = 'AND', strategyId?: number, storeId?: number) {
    if (!storeId) throw new BadRequestException('storeId is required');
    const strategy = strategyId
      ? await this.prisma.marketingAutomationStrategy.findFirst({ where: { id: strategyId, storeId } })
      : null;
    if (strategyId && !strategy) throw new NotFoundException('Strategy not found');

    if (this.marketingAudienceService && storeId) {
      const audience = strategy
        ? await this.marketingAudienceService.buildForStrategy(strategy as any)
        : await this.marketingAudienceService.previewForStore(storeId, { triggerRules, ruleRelation });
      return this.toAudiencePreview(audience, ruleRelation, strategyId);
    }

    const audience = await this.buildAutomationAudience(
      storeId,
      triggerRules,
      ruleRelation,
      strategy?.actions ?? [],
    );
    const estimatedConvertedCount = Math.round(
      audience.customers.reduce((sum: number, item: any) => sum + item.predictedConversionScore / 100, 0),
    );
    const estimatedRevenue = audience.customers.reduce((sum: number, item: any) => sum + item.predictedRevenue, 0);

    return {
      strategyId,
      estimatedCount: audience.total,
      totalCustomers: audience.totalCustomers,
      total: audience.total,
      estimatedReachedCount: audience.customers.length,
      estimatedConvertedCount,
      estimatedRevenue,
      ruleRelation,
      samples: audience.customers.slice(0, 10).map((customer: any) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        memberLevel: customer.memberLevel,
        storeName: customer.store?.name ?? '',
        totalSpent: Number(customer.totalSpent ?? 0),
        lastVisitDate: customer.lastVisitDate?.toISOString?.().slice(0, 10) ?? '',
        reason: customer.reason,
        churnScore: customer.prediction?.churnScore ?? 0,
        repurchase30dScore: customer.prediction?.repurchase30dScore ?? 0,
        marketingResponseScore: customer.prediction?.marketingResponseScore ?? 0,
        ltvTier: customer.prediction?.ltvTier ?? '青铜',
        predictedConversionScore: customer.predictedConversionScore,
        predictedRevenue: customer.predictedRevenue,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  private toAudiencePreview(audience: MarketingAudienceResult, ruleRelation: string, strategyId?: number) {
    const estimatedConvertedCount = Math.round(
      audience.customers.reduce((sum, item) => sum + item.predictedConversionScore / 100, 0),
    );
    const estimatedRevenue = audience.customers.reduce((sum, item) => sum + item.predictedRevenue, 0);
    return {
      strategyId,
      estimatedCount: audience.total,
      totalCustomers: audience.totalCustomers,
      total: audience.total,
      estimatedReachedCount: audience.customers.length,
      estimatedConvertedCount,
      estimatedRevenue,
      ruleRelation,
      audienceSource: audience.source,
      samples: audience.customers.slice(0, 10).map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        memberLevel: customer.memberLevel,
        storeName: customer.store?.name ?? '',
        totalSpent: Number(customer.totalSpent ?? 0),
        lastVisitDate: customer.lastVisitDate?.toISOString?.().slice(0, 10) ?? '',
        reason: customer.reason,
        churnScore: customer.prediction?.churnScore ?? 0,
        repurchase30dScore: customer.prediction?.repurchase30dScore ?? 0,
        marketingResponseScore: customer.prediction?.marketingResponseScore ?? 0,
        ltvTier: customer.prediction?.ltvTier ?? '青铜',
        predictedConversionScore: customer.predictedConversionScore,
        predictedRevenue: customer.predictedRevenue,
      })),
      generatedAt: audience.source.generatedAt,
    };
  }

  async findExecutions(query: PageQuery = {}) {
    const { page = 1, pageSize = 20, strategyId, storeId } = query;
    if (!storeId) throw new BadRequestException('storeId is required');
    const where = { storeId, ...(strategyId ? { strategyId: Number(strategyId) } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.marketingAutomationExecution.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { executedAt: 'desc' },
      }),
      this.prisma.marketingAutomationExecution.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  async getExecutionById(id: number, storeId: number) {
    const execution = await this.prisma.marketingAutomationExecution.findFirst({
      where: { id, storeId },
      include: {
        touches: {
          include: { customer: true, predictionSnapshot: true },
          orderBy: { touchedAt: 'desc' },
        },
      },
    });
    if (!execution) throw new NotFoundException('Execution not found');
    return {
      ...execution,
      touches: execution.touches.map((touch: any) => ({
        id: touch.id,
        customerId: touch.customerId,
        customerName: touch.customer?.name ?? '',
        predictionSnapshotId: touch.predictionSnapshotId,
        predictedConversionScore: touch.predictedConversionScore,
        predictedRevenue: Number(touch.predictedRevenue ?? 0),
        channel: touch.channel,
        status: touch.status,
        touchedAt: touch.touchedAt,
        convertedAt: touch.convertedAt,
        conversionType: touch.conversionType,
        actualRevenue: Number(touch.actualRevenue ?? 0),
        attributionWindowDays: touch.attributionWindowDays,
      })),
    };
  }

  async getEffects(storeId: number) {
    const strategies = await this.prisma.marketingAutomationStrategy.findMany({
      where: { storeId },
      include: {
        executions: true,
        touches: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return strategies.map((strategy: any) => {
      const reachedCount = this.countReachedTouches(strategy);
      const predictedConvertedCount = Math.round(strategy.touches.reduce((sum: number, item: any) => sum + item.predictedConversionScore / 100, 0));
      const actualConvertedCount = strategy.touches.filter((item: any) => item.status === 'converted').length;
      const predictedRevenue = strategy.touches.reduce((sum: number, item: any) => sum + Number(item.predictedRevenue ?? 0), 0);
      const actualRevenue = this.sumActualTouchRevenue(strategy.touches);
      const conversionRate = reachedCount ? Math.round((actualConvertedCount / reachedCount) * 1000) / 10 : 0;
      const predictedConversionRate = reachedCount ? Math.round((predictedConvertedCount / reachedCount) * 1000) / 10 : 0;

      return {
        strategyId: strategy.id,
        strategyName: strategy.name,
        reachedCount,
        conversionRate: `${conversionRate}%`,
        returnRate: `${conversionRate}%`,
        revenue: actualRevenue,
        cost: reachedCount * 2,
        roi: actualRevenue > 0 ? `${Math.round((actualRevenue / Math.max(reachedCount * 2, 1)) * 10) / 10}x` : '0',
        predictedConvertedCount,
        actualConvertedCount,
        predictedConversionRate: `${predictedConversionRate}%`,
        actualConversionRate: `${conversionRate}%`,
        predictedRevenue,
        actualRevenue,
        revenueDeviation: actualRevenue - predictedRevenue,
        metrics: {
          revenue: { value: actualRevenue, source: 'actual', definition: '来自有效触达后的订单归因净收入，退款会同步冲减' },
          cost: { value: reachedCount * 2, source: 'estimated', definition: '按每次有效触达 2 元估算，不代表实际渠道账单' },
        },
      };
    });
  }

  async getStrategyEffects(storeId: number) {
    const strategies = await this.prisma.marketingAutomationStrategy.findMany({
      where: { storeId },
      include: { executions: true, touches: true },
      orderBy: { updatedAt: 'desc' },
    });

    return strategies.map((strategy) => {
      const reachedCount = this.countReachedTouches(strategy);
      const triggeredCount = strategy.executions.reduce((sum, item) => sum + item.triggeredCount, 0);
      const couponUsedRate = triggeredCount ? `${Math.round((reachedCount / triggeredCount) * 100)}%` : '0%';
      const lastExecuted = strategy.lastExecutedAt ? formatBusinessDate(strategy.lastExecutedAt) : '-';
      const revenue = this.sumActualTouchRevenue(strategy.touches ?? []);
      const estimatedCost = this.roundMoney(reachedCount * 2);

      return {
        id: strategy.id,
        name: strategy.name,
        status: strategy.status === 'enabled' ? '启用' : strategy.status === 'paused' ? '停用' : '草稿',
        triggerCount: strategy.executions.length,
        reachedCount,
        couponUsedRate,
        returnRate: couponUsedRate,
        revenue,
        estimatedCost,
        revenueMetric: { value: revenue, source: 'actual', definition: '来自有效触达后的订单归因净收入，退款会同步冲减' },
        costMetric: { value: estimatedCost, source: 'estimated', definition: '按每次有效触达 2 元估算，不代表实际渠道账单' },
        lastExecuted,
      };
    });
  }

  async getUnifiedEffects(query: UnifiedEffectQuery): Promise<any> {
    if (!query.storeId) throw new BadRequestException('storeId is required');
    if (
      isMarketingFeatureEnabledForStore(this.marketingFeatureFlags, 'effectFactRead', query.storeId)
      && this.marketingEffectFactService
    ) {
      return this.marketingEffectFactService.getUnifiedEffects(query.storeId, query as any);
    }
    const objectType = this.normalizeEffectObjectType(query.objectType);
    const objectId = query.objectId != null && query.objectId !== '' ? String(query.objectId) : '';
    const builders: Array<Promise<UnifiedEffectItem[]>> = [];

    if (!objectType || objectType === 'activity') builders.push(this.buildActivityEffectItems(query.storeId));
    if (!objectType || objectType === 'auto') builders.push(this.buildAutomationEffectItems(query.storeId));
    if (!objectType || objectType === 'page') builders.push(this.buildPageEffectItems(query.storeId));
    if (!objectType || objectType === 'promotion') builders.push(this.buildPromotionEffectItems(query.storeId));
    if (!objectType || objectType === 'recommendation') builders.push(this.buildRecommendationEffectItems(query.storeId));
    if (!objectType || objectType === 'glow') builders.push(this.buildGlowEffectItems(query.storeId));

    const allItems = (await Promise.all(builders))
      .flat()
      .sort((a, b) => b.revenue - a.revenue || b.exposureCount - a.exposureCount);
    const filteredItems = objectId ? allItems.filter((item) => String(item.objectId) === objectId) : allItems;
    const items = filteredItems.map((item) => this.attachMetricSources(item));
    const summary = this.summarizeUnifiedEffectItems(items);
    const emptyReasons = this.buildUnifiedEffectEmptyReasons(items);

    return {
      items,
      summary,
      emptyReasons,
      generatedAt: new Date().toISOString(),
    };
  }

  private attachMetricSources(item: UnifiedEffectItem): UnifiedEffectItem {
    return {
      ...item,
      metrics: {
        exposure: { value: item.exposureCount, source: 'actual', definition: '来自页面事件、终端任务或站内通知的真实触达记录' },
        conversion: { value: item.conversionCount, source: 'actual', definition: '来自订单归因、预约或留资转化记录' },
        revenue: { value: item.revenue, source: 'actual', definition: '已归因订单净收入，退款会同步冲减' },
        cost: { value: item.cost, source: 'estimated', definition: '按曝光与点击单价估算，不代表实际渠道账单' },
      },
    };
  }

  private normalizeEffectObjectType(type?: string): UnifiedEffectObjectType | undefined {
    if (!type || type === 'all') return undefined;
    return ['activity', 'auto', 'page', 'promotion', 'recommendation', 'glow'].includes(type)
      ? (type as UnifiedEffectObjectType)
      : undefined;
  }

  private summarizeUnifiedEffectItems(items: UnifiedEffectItem[]) {
    const exposureCount = items.reduce((sum, item) => sum + item.exposureCount, 0);
    const clickCount = items.reduce((sum, item) => sum + item.clickCount, 0);
    const conversionCount = items.reduce((sum, item) => sum + item.conversionCount, 0);
    const revenue = this.roundMoney(items.reduce((sum, item) => sum + item.revenue, 0));
    const cost = this.roundMoney(items.reduce((sum, item) => sum + item.cost, 0));
    return {
      totalObjects: items.length,
      exposureCount,
      clickCount,
      conversionCount,
      revenue,
      cost,
      roi: this.formatRoi(revenue, cost),
    };
  }

  private buildUnifiedEffectEmptyReasons(items: UnifiedEffectItem[]) {
    const emptyReasons: Partial<Record<UnifiedEffectObjectType, string>> = {};
    const fallback: Record<UnifiedEffectObjectType, string> = {
      activity: '暂无营销活动效果数据，请先创建活动并发布营销页面。',
      auto: '暂无自动营销执行数据，请先启用规则并产生触达记录。',
      page: '暂无营销页面曝光/点击数据，请先发布页面或接入页面埋点。',
      promotion: '暂无优惠活动领券/核销数据，请先在小程序或收银侧接入优惠事件。',
      recommendation: '暂无推荐来源归因数据，请先从智能推荐创建活动或自动触达。',
      glow: '暂无 Ami Glow 曝光/点击数据，请确认小程序行为埋点已接入。',
    };

    (['activity', 'auto', 'page', 'promotion', 'recommendation', 'glow'] as UnifiedEffectObjectType[]).forEach((type) => {
      const typeItems = items.filter((item) => item.objectType === type);
      if (typeItems.length === 0) {
        emptyReasons[type] = fallback[type];
        return;
      }
      if (typeItems.every((item) => item.exposureCount === 0 && item.clickCount === 0 && item.conversionCount === 0)) {
        emptyReasons[type] = typeItems[0]?.emptyReason ?? fallback[type];
      }
    });

    return emptyReasons;
  }

  private async buildActivityEffectItems(storeId: number): Promise<UnifiedEffectItem[]> {
    const activities = await this.prisma.marketingActivity.findMany({ where: { storeId }, orderBy: { updatedAt: 'desc' } });
    if (!activities.length) return [];
    const activityIds = activities.map((activity: any) => activity.id);
    const pages = await this.prisma.marketingPage.findMany({
      where: {
        storeId,
        OR: [
          { activityId: { in: activityIds } },
          { sourceType: 'activity', sourceId: { in: activityIds.map(String) } },
        ],
      },
      include: { events: true, leads: true, attributions: true },
    });
    const pagesByActivityId = new Map<number, any[]>();
    for (const page of pages as any[]) {
      const activityId = Number(page.activityId ?? (page.sourceType === 'activity' ? page.sourceId : 0));
      if (!activityId) continue;
      const current = pagesByActivityId.get(activityId) ?? [];
      current.push(page);
      pagesByActivityId.set(activityId, current);
    }

    return activities.map((activity: any) => {
        const activityPages = pagesByActivityId.get(activity.id) ?? [];
        const events = activityPages.flatMap((page: any) => page.events ?? []);
        const leads = activityPages.flatMap((page: any) => page.leads ?? []);
        const attributions = activityPages.flatMap((page: any) => page.attributions ?? []);
        const exposureCount = events.filter((event: any) => this.isExposureEvent(event.eventType)).length || activity.participants || 0;
        const clickCount = events.filter((event: any) => this.isClickEvent(event.eventType)).length;
        const attributedConversions = attributions.length;
        const leadConversions = leads.filter((lead: any) => lead.convertedAt || ['converted', 'booked', 'paid'].includes(lead.status)).length;
        const fallbackConversions = Math.round((activity.participants || 0) * this.parsePercent(activity.conversion) / 100);
        const conversionCount = attributedConversions || leadConversions || fallbackConversions;
        const revenue = this.roundMoney(attributions.reduce((sum: number, item: any) => sum + Number(item.attributedRevenue ?? 0), 0));
        const cost = this.estimateMarketingCost(exposureCount, clickCount);
        const lastEventAt = this.getLatestDate(events.map((event: any) => event.occurredAt));

        return {
          id: `activity-${activity.id}`,
          objectId: activity.id,
          objectType: 'activity',
          objectTypeLabel: '营销活动',
          objectName: activity.title,
          status: activity.status,
          exposureCount,
          clickCount,
          conversionCount,
          revenue,
          cost,
          roi: this.formatRoi(revenue, cost),
          conversionRate: this.formatRate(conversionCount, exposureCount),
          dateRange: [activity.startDate, activity.endDate].filter(Boolean).join(' 至 '),
          lastEventAt,
          detailPath: `/customer-marketing/activity-effect/${activity.id}`,
          emptyReason: events.length === 0 && exposureCount === 0 ? '该活动暂无页面曝光或参与数据。' : undefined,
          metricsSource: activityPages.length > 0 ? '活动关联营销页面事件、留资与归因' : '活动基础参与数据',
          audienceName: activity.targetCustomers,
          promotionName: activity.primaryPromotion?.name ?? activity.offerJson?.promotionName,
          channelName: this.extractChannelLabel(activity.recommendedChannelsJson ?? activity.sourceSignalsJson?.channels),
        };
      });
  }

  private async buildAutomationEffectItems(storeId: number): Promise<UnifiedEffectItem[]> {
    const strategies = await this.prisma.marketingAutomationStrategy.findMany({
      where: { storeId },
      include: {
        executions: true,
        touches: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return strategies.map((strategy: any) => {
      const reachedCount = this.countReachedTouches(strategy);
      const clickCount = strategy.touches.filter((touch: any) => ['clicked', 'converted'].includes(touch.status)).length;
      const conversionCount = strategy.touches.filter((touch: any) => touch.status === 'converted' || touch.convertedAt).length;
      const revenue = this.sumActualTouchRevenue(strategy.touches);
      const cost = this.roundMoney(reachedCount * 2);

      return {
        id: `auto-${strategy.id}`,
        objectId: strategy.id,
        objectType: 'auto',
        objectTypeLabel: '自动营销',
        objectName: strategy.name,
        status: strategy.status,
        exposureCount: reachedCount,
        clickCount,
        conversionCount,
        revenue,
        cost,
        roi: this.formatRoi(revenue, cost),
        conversionRate: this.formatRate(conversionCount, reachedCount),
        dateRange: strategy.lastExecutedAt ? `最近执行 ${formatBusinessDate(strategy.lastExecutedAt)}` : undefined,
        lastEventAt: strategy.lastExecutedAt?.toISOString(),
        detailPath: '/customer-marketing/automation',
        emptyReason: reachedCount === 0 ? '该自动营销规则暂无执行或触达记录。' : undefined,
        metricsSource: '自动营销执行、触达与转化记录',
        audienceName: strategy.schedule?.attribution?.audienceSnapshot?.ruleSummary
          ?? strategy.schedule?.attribution?.targetAudience
          ?? (strategy.targetCount ? `目标人群 ${strategy.targetCount} 人` : undefined),
        promotionName: this.extractPromotionNameFromActions(strategy.actions),
        channelName: this.extractChannelLabel(strategy.actions),
      };
    });
  }

  private async buildPageEffectItems(storeId: number): Promise<UnifiedEffectItem[]> {
    const pages = await this.prisma.marketingPage.findMany({
      where: { storeId },
      include: { events: true, leads: true, attributions: true },
      orderBy: { updatedAt: 'desc' },
    });

    return pages.map((page: any) => {
      const events = page.events ?? [];
      const leads = page.leads ?? [];
      const attributions = page.attributions ?? [];
      const exposureCount = events.filter((event: any) => this.isExposureEvent(event.eventType)).length;
      const clickCount = events.filter((event: any) => this.isClickEvent(event.eventType)).length;
      const conversionCount =
        attributions.length || leads.filter((lead: any) => lead.convertedAt || ['converted', 'booked', 'paid'].includes(lead.status)).length;
      const revenue = this.roundMoney(attributions.reduce((sum: number, item: any) => sum + Number(item.attributedRevenue ?? 0), 0));
      const cost = this.estimateMarketingCost(exposureCount, clickCount);

      return {
        id: `page-${page.id}`,
        objectId: page.id,
        objectType: 'page',
        objectTypeLabel: '营销页面',
        objectName: page.title,
        status: page.status,
        exposureCount,
        clickCount,
        conversionCount,
        revenue,
        cost,
        roi: this.formatRoi(revenue, cost),
        conversionRate: this.formatRate(conversionCount, exposureCount),
        dateRange: page.publishedAt ? `发布于 ${formatBusinessDate(page.publishedAt)}` : undefined,
        lastEventAt: this.getLatestDate(events.map((event: any) => event.occurredAt)),
        detailPath: '/customer-marketing/assets',
        emptyReason: events.length === 0 ? '该营销页面暂无浏览、点击或留资事件。' : undefined,
        metricsSource: '营销页面事件、留资与订单归因',
        audienceName: page.snapshotJson?.audienceSnapshot?.ruleSummary ?? page.snapshotJson?.targetAudience,
        promotionName: page.snapshotJson?.offerJson?.promotionName ?? page.snapshotJson?.offer,
        channelName: this.extractChannelLabel(page.snapshotJson?.selectedChannels),
      };
    });
  }

  private async buildPromotionEffectItems(storeId: number): Promise<UnifiedEffectItem[]> {
    const [promotions, strategies] = await Promise.all([
      this.prisma.promotion.findMany({
        where: { OR: [{ storeId }, { storeId: null }] },
        include: { marketingActivities: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.marketingAutomationStrategy.findMany({
        where: { storeId },
        include: { touches: true, executions: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const promotionIds = promotions.map((promotion: any) => String(promotion.id));
    const promotionEvents = promotionIds.length > 0
      ? await this.prisma.customerAppEvent.findMany({
        where: {
          storeId,
          targetType: { in: ['promotion', 'coupon'] },
          targetId: { in: promotionIds },
        },
        orderBy: { occurredAt: 'desc' },
      })
      : [];
    const eventsByPromotionId = new Map<string, any[]>();
    for (const event of promotionEvents as any[]) {
      const key = String(event.targetId);
      eventsByPromotionId.set(key, [...(eventsByPromotionId.get(key) ?? []), event]);
    }

    return promotions.map((promotion: any) => {
        const events = eventsByPromotionId.get(String(promotion.id)) ?? [];
        const relatedStrategies = strategies.filter((strategy: any) =>
          Array.isArray(strategy.actions)
          && strategy.actions.some((action: any) => Number(action?.promotionId) === promotion.id),
        );
        const activityExposureCount = (promotion.marketingActivities ?? []).reduce((sum: number, activity: any) => sum + Number(activity.participants ?? 0), 0);
        const strategyExposureCount = relatedStrategies.reduce(
          (sum: number, strategy: any) => sum + this.countReachedTouches(strategy),
          0,
        );
        const strategyConversionCount = relatedStrategies.reduce(
          (sum: number, strategy: any) => sum + (strategy.touches?.filter((touch: any) => touch.status === 'converted' || touch.convertedAt).length ?? 0),
          0,
        );
        const strategyRevenue = relatedStrategies.reduce(
          (sum: number, strategy: any) => sum + this.sumActualTouchRevenue(strategy.touches ?? []),
          0,
        );
        const eventRevenue = events.reduce((sum: number, event: any) => {
          const metadata = event.metadataJson && typeof event.metadataJson === 'object' ? event.metadataJson : {};
          return sum + Number(metadata.revenueAmount ?? metadata.orderAmount ?? metadata.amount ?? 0);
        }, 0);
        const exposureCount = events.filter((event: any) => this.isExposureEvent(event.eventType)).length;
        const clickCount = events.filter((event: any) => this.isClickEvent(event.eventType) || event.eventType.includes('claim')).length;
        const eventConversionCount = events.filter((event: any) => this.isConversionEvent(event.eventType) || event.eventType.includes('redeem')).length;
        const conversionCount = (eventConversionCount + strategyConversionCount) || Number(promotion.usedCount ?? 0);
        const totalExposureCount = exposureCount || activityExposureCount + strategyExposureCount;
        const cost = this.estimateMarketingCost(totalExposureCount, clickCount);
        const relatedNames = [
          ...(promotion.marketingActivities ?? []).map((activity: any) => activity.title),
          ...relatedStrategies.map((strategy: any) => strategy.name),
        ];

        return {
          id: `promotion-${promotion.id}`,
          objectId: promotion.id,
          objectType: 'promotion',
          objectTypeLabel: '权益资产',
          objectName: promotion.name,
          status: promotion.status,
          exposureCount: totalExposureCount,
          clickCount,
          conversionCount,
          revenue: this.roundMoney(strategyRevenue + eventRevenue),
          cost,
          roi: this.formatRoi(strategyRevenue + eventRevenue, cost),
          conversionRate: this.formatRate(conversionCount, totalExposureCount || clickCount),
          dateRange: [promotion.startAt ? formatBusinessDate(promotion.startAt) : undefined, promotion.endAt ? formatBusinessDate(promotion.endAt) : undefined]
            .filter(Boolean)
            .join(' 至 '),
          lastEventAt: events[0]?.occurredAt?.toISOString(),
          detailPath: '/customer-marketing/assets?tab=promotions',
          emptyReason: events.length === 0 && relatedNames.length === 0 ? '该权益资产暂无活动、自动触达或小程序行为数据；收入归因需收银侧补充权益核销关联。' : undefined,
          metricsSource: relatedNames.length
            ? `权益关联 ${promotion.marketingActivities?.length ?? 0} 个活动、${relatedStrategies.length} 个自动触达`
            : '小程序权益浏览、领取与核销事件',
          relatedObjectName: relatedNames.slice(0, 3).join('、'),
          audienceName: this.extractAudienceLabelFromEvents(events),
          promotionName: promotion.name,
          channelName: this.extractChannelLabel([
            ...events.map((event: any) => event.channel),
            ...relatedStrategies.flatMap((strategy: any) => strategy.actions ?? []),
          ]),
        };
      });
  }

  private async buildRecommendationEffectItems(storeId: number): Promise<UnifiedEffectItem[]> {
    const [activities, strategies, pages] = await Promise.all([
      this.prisma.marketingActivity.findMany({
        where: { storeId },
        orderBy: { updatedAt: 'desc' },
        include: { primaryPromotion: true },
      }),
      this.prisma.marketingAutomationStrategy.findMany({
        where: { storeId },
        include: { executions: true, touches: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.marketingPage.findMany({
        where: { storeId },
        include: { events: true, leads: true, attributions: true },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const bucket = new Map<string, any>();
    const ensure = (sourceId: string, seed: any = {}) => {
      const current = bucket.get(sourceId) ?? {
        sourceRecommendationId: sourceId,
        recommendationKey: seed.recommendationKey,
        recommendationType: seed.recommendationType,
        triggerType: seed.triggerType,
        objectName: seed.objectName ?? `推荐 ${sourceId}`,
        promotionNames: new Set<string>(),
        relatedNames: new Set<string>(),
        exposureCount: 0,
        clickCount: 0,
        conversionCount: 0,
        revenue: 0,
        cost: 0,
        lastDates: [] as Array<Date | string | null | undefined>,
        sources: new Set<string>(),
        attributions: [] as any[],
        channels: new Set<string>(),
        audienceName: seed.audienceSnapshot?.ruleSummary ?? seed.audienceSnapshot?.targetLabel ?? seed.targetAudience,
      };
      bucket.set(sourceId, current);
      return current;
    };

    for (const activity of activities as any[]) {
      const attribution = this.extractRecommendationAttribution(activity);
      const sourceId = attribution?.sourceRecommendationId ?? activity.sourceRecommendationId;
      if (!sourceId) continue;
      const item = ensure(String(sourceId), {
        ...attribution,
        objectName: activity.title,
      });
      item.attributions.push(attribution);
      item.audienceName ||= attribution?.audienceSnapshot?.ruleSummary ?? attribution?.audienceSnapshot?.targetLabel ?? activity.targetCustomers;
      this.collectChannels(item.channels, activity.recommendedChannelsJson ?? activity.sourceSignalsJson?.channels);
      item.relatedNames.add(activity.title);
      item.sources.add('活动');
      if (activity.primaryPromotion?.name) item.promotionNames.add(activity.primaryPromotion.name);
      if (activity.offerJson?.promotionName) item.promotionNames.add(activity.offerJson.promotionName);
      const participants = Number(activity.participants ?? attribution?.audienceSnapshot?.totalCustomers ?? 0);
      const fallbackConversions = Math.round(participants * this.parsePercent(activity.conversion) / 100);
      item.exposureCount += participants;
      item.conversionCount += fallbackConversions;
      item.cost += this.estimateMarketingCost(participants, 0);
      item.lastDates.push(activity.updatedAt);
    }

    for (const strategy of strategies as any[]) {
      const attribution = this.extractRecommendationAttribution(strategy);
      const sourceId = attribution?.sourceRecommendationId;
      if (!sourceId) continue;
      const item = ensure(String(sourceId), {
        ...attribution,
        objectName: strategy.name,
      });
      item.attributions.push(attribution);
      item.audienceName ||= attribution?.audienceSnapshot?.ruleSummary ?? attribution?.targetAudience ?? strategy.schedule?.attribution?.targetAudience;
      this.collectChannels(item.channels, strategy.actions);
      item.relatedNames.add(strategy.name);
      item.sources.add('自动触达');
      const promotionNames = this.uniqueStrings((strategy.actions ?? []).map((action: any) => action?.promotionName));
      promotionNames.forEach((name) => item.promotionNames.add(name));
      const reachedCount = this.countReachedTouches(strategy);
      const clickCount = strategy.touches?.filter((touch: any) => ['clicked', 'converted'].includes(touch.status)).length ?? 0;
      const conversionCount = strategy.touches?.filter((touch: any) => touch.status === 'converted' || touch.convertedAt).length ?? 0;
      const revenue = this.sumActualTouchRevenue(strategy.touches ?? []);
      item.exposureCount += reachedCount;
      item.clickCount += clickCount;
      item.conversionCount += conversionCount;
      item.revenue += revenue;
      item.cost += this.roundMoney(reachedCount * 2);
      item.lastDates.push(strategy.lastExecutedAt, strategy.updatedAt);
    }

    for (const page of pages as any[]) {
      const attribution = this.extractRecommendationAttribution(page);
      const sourceId = attribution?.sourceRecommendationId ?? page.sourceRecommendationId;
      if (!sourceId) continue;
      const item = ensure(String(sourceId), {
        ...attribution,
        objectName: page.title,
      });
      item.attributions.push(attribution);
      item.audienceName ||= attribution?.audienceSnapshot?.ruleSummary ?? page.snapshotJson?.targetAudience;
      this.collectChannels(item.channels, page.snapshotJson?.selectedChannels);
      item.relatedNames.add(page.title);
      item.sources.add('推广页');
      const events = page.events ?? [];
      const leads = page.leads ?? [];
      const attributions = page.attributions ?? [];
      const exposureCount = events.filter((event: any) => this.isExposureEvent(event.eventType)).length;
      const clickCount = events.filter((event: any) => this.isClickEvent(event.eventType)).length;
      const conversionCount =
        attributions.length || leads.filter((lead: any) => lead.convertedAt || ['converted', 'booked', 'paid'].includes(lead.status)).length;
      const revenue = attributions.reduce((sum: number, attributionRecord: any) => sum + Number(attributionRecord.attributedRevenue ?? 0), 0);
      item.exposureCount += exposureCount;
      item.clickCount += clickCount;
      item.conversionCount += conversionCount;
      item.revenue += revenue;
      item.cost += this.estimateMarketingCost(exposureCount, clickCount);
      item.lastDates.push(...events.map((event: any) => event.occurredAt), page.updatedAt);
    }

    return [...bucket.values()].map((item) => {
      const cost = this.roundMoney(item.cost);
      const revenue = this.roundMoney(item.revenue);
      return {
        id: `recommendation-${item.sourceRecommendationId}`,
        objectId: item.sourceRecommendationId,
        objectType: 'recommendation',
        objectTypeLabel: '智能推荐',
        objectName: item.objectName,
        status: 'attributed',
        exposureCount: item.exposureCount,
        clickCount: item.clickCount,
        conversionCount: item.conversionCount,
        revenue,
        cost,
        roi: this.formatRoi(revenue, cost),
        conversionRate: this.formatRate(item.conversionCount, item.exposureCount || item.clickCount),
        lastEventAt: this.getLatestDate(item.lastDates),
        detailPath: `/customer-marketing/intelligent-recommendation?sourceRecommendationId=${encodeURIComponent(item.sourceRecommendationId)}`,
        emptyReason: item.exposureCount === 0 && item.conversionCount === 0 ? '该推荐已被采纳，但暂无曝光、触达或成交归因。' : undefined,
        metricsSource: `推荐来源归因：${[...item.sources].join('、') || '活动/自动触达'}`,
        relatedObjectName: [
          ...[...item.relatedNames].slice(0, 3),
          ...[...item.promotionNames].slice(0, 2).map((name) => `权益：${name}`),
        ].join('、'),
        audienceName: item.audienceName,
        promotionName: [...item.promotionNames][0],
        channelName: this.extractChannelLabel(item.channels),
        recommendationAttribution: this.buildRecommendationEffectAttribution(item),
      } satisfies UnifiedEffectItem;
    });
  }

  private buildRecommendationEffectAttribution(item: any) {
    const attributions = Array.isArray(item.attributions) ? item.attributions.filter(Boolean) : [];
    const selectedAttribution = attributions.find((entry: any) => entry?.selectedPromotion || entry?.promotionSwitched)
      ?? attributions[0]
      ?? {};
    const selectedPromotion = selectedAttribution.selectedPromotion
      ?? selectedAttribution.primaryPromotion
      ?? null;
    const originalPromotion = selectedAttribution.originalPromotion
      ?? selectedAttribution.primaryPromotion
      ?? null;
    const selectedOffer = selectedAttribution.selectedOffer
      ?? null;
    const originalOffer = selectedAttribution.originalOffer
      ?? null;
    const promotionSwitched = Boolean(
      selectedAttribution.promotionSwitched
      ?? (
        selectedPromotion?.promotionId
        && originalPromotion?.promotionId
        && selectedPromotion.promotionId !== originalPromotion.promotionId
      ),
    );

    return {
      sourceRecommendationId: String(item.sourceRecommendationId),
      recommendationKey: selectedAttribution.recommendationKey ?? item.recommendationKey,
      recommendationType: selectedAttribution.recommendationType ?? item.recommendationType,
      originalPromotion,
      selectedPromotion,
      promotionSwitched,
      originalOffer,
      selectedOffer,
    };
  }

  private extractRecommendationAttribution(source: any) {
    const candidates = [
      source?.schedule?.attribution,
      source?.offerJson?.attribution,
      source?.sourceSignalsJson?.attribution,
      source?.snapshotJson?.attribution,
      ...(Array.isArray(source?.actions) ? source.actions.map((action: any) => action?.attribution) : []),
    ].filter((item) => item && typeof item === 'object');
    const attribution = candidates[0] ?? {};
    const sourceRecommendationId =
      attribution.sourceRecommendationId
      ?? source?.sourceRecommendationId
      ?? source?.offerJson?.attribution?.sourceRecommendationId
      ?? source?.sourceSignalsJson?.attribution?.sourceRecommendationId;
    if (!sourceRecommendationId) return null;
    return {
      ...attribution,
      sourceRecommendationId: String(sourceRecommendationId),
    };
  }

  private async buildGlowEffectItems(storeId: number): Promise<UnifiedEffectItem[]> {
    const configs = await this.prisma.amiGlowDisplayConfig.findMany({
      where: { storeId },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    if (!configs.length) return [];
    const events = await this.prisma.customerAppEvent.findMany({
      where: {
        storeId,
        source: 'ami_glow',
        OR: configs.map((config: any) => ({
          targetType: config.objectType,
          targetId: String(config.objectId),
        })),
      },
      orderBy: { occurredAt: 'desc' },
    });
    const eventsByTarget = new Map<string, any[]>();
    for (const event of events as any[]) {
      const key = `${event.targetType}:${event.targetId}`;
      const grouped = eventsByTarget.get(key) ?? [];
      grouped.push(event);
      eventsByTarget.set(key, grouped);
    }

    return configs.map((config: any) => {
        const configEvents = eventsByTarget.get(`${config.objectType}:${config.objectId}`) ?? [];
        const exposureCount = configEvents.filter((event: any) => this.isExposureEvent(event.eventType)).length;
        const clickCount = configEvents.filter((event: any) => this.isClickEvent(event.eventType)).length;
        const conversionCount = configEvents.filter((event: any) => this.isConversionEvent(event.eventType)).length;
        const cost = this.estimateMarketingCost(exposureCount, clickCount, 0.05, 0.2);

        return {
          id: `glow-${config.id}`,
          objectId: config.id,
          objectType: 'glow',
          objectTypeLabel: 'Ami Glow',
          objectName: config.summary || `${this.getGlowObjectTypeLabel(config.objectType)} #${config.objectId}`,
          status: config.publishStatus,
          exposureCount,
          clickCount,
          conversionCount,
          revenue: 0,
          cost,
          roi: this.formatRoi(0, cost),
          conversionRate: this.formatRate(conversionCount, exposureCount || clickCount),
          dateRange: [config.startAt ? formatBusinessDate(config.startAt) : undefined, config.endAt ? formatBusinessDate(config.endAt) : undefined]
            .filter(Boolean)
            .join(' 至 '),
          lastEventAt: configEvents[0]?.occurredAt?.toISOString(),
          detailPath: '/customer-marketing/assets',
          emptyReason: configEvents.length === 0 ? '该小程序推荐位暂无曝光、点击或预约事件。' : undefined,
          metricsSource: 'Ami Glow 小程序行为事件',
        };
      });
  }

  private isExposureEvent(eventType?: string) {
    return ['view', 'page_view', 'exposure', 'show', 'impression', 'display', 'browse'].some((keyword) =>
      String(eventType ?? '').toLowerCase().includes(keyword),
    );
  }

  private isClickEvent(eventType?: string) {
    return ['click', 'tap', 'cta', 'share', 'claim'].some((keyword) => String(eventType ?? '').toLowerCase().includes(keyword));
  }

  private isConversionEvent(eventType?: string) {
    return ['convert', 'booking', 'reservation', 'reserved', 'order_paid', 'paid', 'redeem', 'used', 'lead_submit'].some((keyword) =>
      String(eventType ?? '').toLowerCase().includes(keyword),
    );
  }

  private extractPromotionNameFromActions(actions: any) {
    if (!Array.isArray(actions)) return undefined;
    return actions.find((action) => action?.promotionName)?.promotionName;
  }

  private extractAudienceLabelFromEvents(events: any[] = []) {
    const metadata = events
      .map((event) => event?.metadataJson)
      .find((item) => item && typeof item === 'object' && (item.audienceName || item.targetAudience || item.segment));
    return metadata?.audienceName ?? metadata?.targetAudience ?? metadata?.segment;
  }

  private collectChannels(target: Set<string>, input: any) {
    this.extractChannelValues(input).forEach((channel) => target.add(channel));
  }

  private extractChannelLabel(input: any) {
    const labels = this.extractChannelValues(input);
    return labels.length ? labels.slice(0, 3).join('、') : undefined;
  }

  private extractChannelValues(input: any): string[] {
    if (!input) return [];
    if (input instanceof Set) return this.uniqueStrings([...input].map((item) => String(item))).map((value) => this.channelLabel(value));
    const items = Array.isArray(input) ? input : [input];
    return this.uniqueStrings(items.flatMap((item) => {
      if (!item) return [];
      if (typeof item === 'string') return [item];
      if (typeof item === 'object') return [item.label, item.channel].filter(Boolean);
      return [];
    })).map((value) => this.channelLabel(value));
  }

  private channelLabel(value: string) {
    const map: Record<string, string> = {
      sms: '短信',
      miniapp: '小程序',
      wechat: '微信',
      group: '社群',
      store: '到店',
      moments: '朋友圈',
      terminal: '终端',
    };
    return map[value] ?? value;
  }

  private parsePercent(value?: string | number | null) {
    if (typeof value === 'number') return value;
    const parsed = Number(String(value ?? '').replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatRate(part: number, total: number) {
    return total > 0 ? `${Math.round((part / total) * 1000) / 10}%` : '0%';
  }

  private formatRoi(revenue: number, cost: number) {
    if (!revenue || !cost) return '0';
    return `${Math.round((revenue / Math.max(cost, 1)) * 10) / 10}x`;
  }

  private estimateMarketingCost(exposureCount: number, clickCount: number, exposureUnitCost = 0.2, clickUnitCost = 0.5) {
    return this.roundMoney(exposureCount * exposureUnitCost + clickCount * clickUnitCost);
  }

  private roundMoney(value: number) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  private getLatestDate(values: Array<Date | string | null | undefined>) {
    const latest = values
      .map((value) => (value ? new Date(value).getTime() : 0))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a)[0];
    return latest ? new Date(latest).toISOString() : undefined;
  }

  private getGlowObjectTypeLabel(objectType?: string) {
    const labels: Record<string, string> = {
      project: '项目',
      product: '商品',
      promotion: '优惠',
      activity: '活动',
      page: '页面',
    };
    return labels[String(objectType ?? '')] ?? '推荐对象';
  }

  private buildPredictionSnapshot(runId: number, customer: any) {
    const now = new Date();
    const records = [...(customer.consumptionRecords ?? [])].sort(
      (a, b) => new Date(a.consumeTime).getTime() - new Date(b.consumeTime).getTime(),
    );
    const lastVisitDays = this.daysBetween(customer.lastVisitDate, now);
    const avgVisitGap = this.calculateAverageVisitGap(records);
    const currentGapRatio = Math.round((lastVisitDays / Math.max(avgVisitGap, 7)) * 10) / 10;
    const trend = this.calculateSpendTrend(records);
    const activeCardCount = (customer.customerCards ?? []).filter(
      (card: any) => card.status === 'active' && card.remainingTimes > 0 && new Date(card.expiryDate) >= now,
    ).length;
    const cardExpiryUrgencyScore = this.calculateCardExpiryUrgencyScore(customer.customerCards ?? [], now);
    const recentTouchConversions = (customer.marketingTouches ?? []).filter(
      (touch: any) => touch.status === 'converted' || touch.convertedAt,
    ).length;

    const churn = this.calculateChurnScore({
      lastVisitDays,
      avgVisitGap,
      trend,
      memberLevel: customer.memberLevel,
      activeCardCount,
    });
    const repurchaseScore = this.calculateRepurchaseScore({
      churnScore: churn.score,
      lastVisitDays,
      avgVisitGap,
      trend,
      activeCardCount,
      memberLevel: customer.memberLevel,
      recordCount: records.length,
    });
    const monthlyAvg = this.calculateMonthlyAverage(customer, records, now);
    const ltv = this.calculateLtv(monthlyAvg, trend, churn.score, Number(customer.totalSpent ?? 0));
    const marketingResponseScore = this.calculateMarketingResponseScore({
      repurchaseScore,
      churnScore: churn.score,
      memberLevel: customer.memberLevel,
      skinType: customer.healthProfile?.skinType ?? customer.skinType ?? customer.skinCondition,
      activeCardCount,
      totalSpent: Number(customer.totalSpent ?? 0),
      recentTouchConversions,
    });
    const reasons: PredictionReason[] = [
      ...churn.reasons,
      {
        type: 'repurchase',
        label: `${repurchaseScore} 分`,
        detail: activeCardCount > 0 ? '仍有有效次卡，适合推动预约或核销' : '按到店周期与消费趋势计算 30 天复购概率',
        impact: repurchaseScore >= 65 ? 'positive' : 'neutral',
        weight: repurchaseScore,
      },
      {
        type: 'marketing_response',
        label: `${marketingResponseScore} 分`,
        detail: '综合复购概率、会员等级、肤质档案和促销敏感度估算活动响应',
        impact: marketingResponseScore >= 70 ? 'positive' : 'neutral',
        weight: marketingResponseScore,
      },
      {
        type: 'ltv',
        label: ltv.tier,
        detail: `月均消费约 ¥${Math.round(monthlyAvg).toLocaleString()}，趋势为${trend}`,
        impact: ltv.tier === '铂金' || ltv.tier === '黄金' ? 'positive' : 'neutral',
      },
    ];

    return {
      runId,
      customerId: customer.id,
      storeId: customer.storeId,
      modelVersion: MODEL_VERSION,
      churnScore: churn.score,
      churnLevel: churn.level,
      repurchase30dScore: repurchaseScore,
      marketingResponseScore,
      ltv6m: ltv.ltv6m,
      ltv12m: ltv.ltv12m,
      ltvTier: ltv.tier,
      featureJson: {
        lastVisitDays,
        avgVisitGap,
        currentGapRatio,
        spendTrend: trend,
        monthlyAvg: Math.round(monthlyAvg),
        memberLevel: customer.memberLevel,
        skinType: customer.healthProfile?.skinType ?? customer.skinType ?? customer.skinCondition ?? '未分类',
        activeCardCount,
        cardExpiryUrgencyScore,
        recentTouchConversions,
        recordCount: records.length,
      },
      reasonJson: reasons,
      recommendedActionsJson: this.recommendActions(churn.level, repurchaseScore, marketingResponseScore, ltv.tier),
      createdAt: now,
    };
  }

  private serializePredictionSnapshot(item: any) {
    return {
      id: item.id,
      runId: item.runId,
      customerId: item.customerId,
      storeId: item.storeId,
      modelVersion: item.modelVersion,
      churnScore: item.churnScore,
      churnLevel: item.churnLevel,
      repurchase30dScore: item.repurchase30dScore,
      marketingResponseScore: item.marketingResponseScore,
      ltv6m: Number(item.ltv6m ?? 0),
      ltv12m: Number(item.ltv12m ?? 0),
      ltvTier: item.ltvTier,
      featureJson: item.featureJson,
      reasonJson: item.reasonJson,
      recommendedActionsJson: item.recommendedActionsJson,
      createdAt: item.createdAt,
      customer: item.customer
        ? {
            id: item.customer.id,
            name: item.customer.name,
            phone: item.customer.phone,
            memberLevel: item.customer.memberLevel,
            totalSpent: Number(item.customer.totalSpent ?? 0),
            visitCount: item.customer.visitCount,
            lastVisitDate: item.customer.lastVisitDate,
          }
        : undefined,
      run: item.run
        ? {
            id: item.run.id,
            modelVersion: item.run.modelVersion,
            startedAt: item.run.startedAt,
            finishedAt: item.run.finishedAt,
          }
        : undefined,
    };
  }

  private toInvitationCandidateFromSnapshot(item: any) {
    const customer = item.customer ?? {};
    const feature = item.featureJson ?? {};
    const reasons = Array.isArray(item.reasonJson) ? item.reasonJson : [];
    const topReason = this.formatTopReason(reasons);
    const skinType = customer.healthProfile?.skinType ?? customer.skinType ?? customer.skinCondition ?? feature.skinType;
    const lastVisitDays = Number(feature.lastVisitDays ?? 0);
    const evidence = [
      topReason,
      Number.isFinite(lastVisitDays) && lastVisitDays > 0 ? `距上次到店 ${lastVisitDays} 天` : '',
      `复购意愿 ${Math.round(Number(item.repurchase30dScore ?? 0))} 分`,
      `活动响应 ${Math.round(Number(item.marketingResponseScore ?? 0))} 分`,
      skinType ? `肤质/状态：${skinType}` : '',
    ].filter(Boolean);

    return {
      customerId: item.customerId,
      customerName: customer.name ?? `客户${item.customerId}`,
      memberLevel: customer.memberLevel ?? undefined,
      phoneMasked: this.maskPhone(customer.phone),
      skinType: skinType || undefined,
      lastVisitDate: customer.lastVisitDate?.toISOString?.().slice(0, 10) ?? undefined,
      preferredProjectNames: this.pickInvitationProjectNames(item),
      reason: topReason || '客户近期具备护理跟进价值，建议由顾问确认需求后邀约。',
      evidence: evidence.slice(0, 5),
      priority: this.toInvitationPriority(item),
    };
  }

  private toInvitationCandidateFromCustomer(customer: any) {
    const skinType = customer.healthProfile?.skinType ?? customer.skinType ?? customer.skinCondition;
    const lastVisitDays = this.daysBetween(customer.lastVisitDate, new Date());
    const evidence = [
      lastVisitDays ? `距上次到店 ${lastVisitDays} 天` : '暂无最近到店记录',
      customer.memberLevel ? `会员等级：${customer.memberLevel}` : '',
      Number(customer.totalSpent ?? 0) > 0 ? `累计消费 ${Math.round(Number(customer.totalSpent))} 元` : '',
      skinType ? `肤质/状态：${skinType}` : '',
    ].filter(Boolean);

    return {
      customerId: customer.id,
      customerName: customer.name,
      memberLevel: customer.memberLevel ?? undefined,
      phoneMasked: this.maskPhone(customer.phone),
      skinType: skinType || undefined,
      lastVisitDate: customer.lastVisitDate?.toISOString?.().slice(0, 10) ?? undefined,
      preferredProjectNames: skinType ? [`${skinType}护理方案`] : ['到店护理评估'],
      reason: lastVisitDays && lastVisitDays >= 30
        ? `客户 ${lastVisitDays} 天未到店，适合安排护理关怀和预约提醒。`
        : '基于真实客户资料生成候选，建议顾问结合近期需求做邀约。',
      evidence: evidence.slice(0, 5),
      priority: lastVisitDays && lastVisitDays >= 45 ? 'P0' : 'P1',
    };
  }

  private maskPhone(phone?: string | null) {
    const raw = String(phone ?? '').trim();
    return raw.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') || undefined;
  }

  private pickInvitationProjectNames(item: any) {
    const actions = Array.isArray(item.recommendedActionsJson) ? item.recommendedActionsJson : [];
    const projectNames = actions
      .map((action: unknown) => String(action ?? '').trim())
      .filter(Boolean)
      .map((action: string) => action.replace(/^(推荐|邀约|发送|提醒)/, '').replace(/(优惠|权益|提醒|邀约)$/, '').trim())
      .filter(Boolean)
      .slice(0, 2);
    if (projectNames.length) return projectNames;

    const skinType = item.customer?.healthProfile?.skinType ?? item.customer?.skinType ?? item.featureJson?.skinType;
    if (skinType) return [`${skinType}护理方案`];
    if (Number(item.repurchase30dScore ?? 0) >= 60) return ['护理周期复购方案'];
    if (Number(item.churnScore ?? 0) >= 70) return ['回店护理关怀方案'];
    return ['到店护理评估'];
  }

  private toInvitationPriority(item: any) {
    if (Number(item.marketingResponseScore ?? 0) >= 75 || Number(item.churnScore ?? 0) >= 80) return 'P0';
    if (Number(item.repurchase30dScore ?? 0) >= 60 || Number(item.churnScore ?? 0) >= 60) return 'P1';
    return 'P2';
  }

  private summarizeSnapshots(snapshots: any[]) {
    const distribution = (field: string, labels: string[]) =>
      labels.map((label) => ({
        label,
        count: snapshots.filter((item) => item[field] === label).length,
      }));
    const scoreDistribution = (field: string) => [
      { label: '0-39', count: snapshots.filter((item) => item[field] < 40).length },
      { label: '40-69', count: snapshots.filter((item) => item[field] >= 40 && item[field] < 70).length },
      { label: '70-100', count: snapshots.filter((item) => item[field] >= 70).length },
    ];

    return {
      modelVersion: MODEL_VERSION,
      customerCount: snapshots.length,
      churnDistribution: distribution('churnLevel', ['低', '中', '高', '极高']),
      repurchaseDistribution: scoreDistribution('repurchase30dScore'),
      marketingResponseDistribution: scoreDistribution('marketingResponseScore'),
      ltvDistribution: distribution('ltvTier', ['铂金', '黄金', '白银', '青铜']),
      avgChurnScore: this.average(snapshots.map((item) => item.churnScore)),
      avgRepurchase30dScore: this.average(snapshots.map((item) => item.repurchase30dScore)),
      avgMarketingResponseScore: this.average(snapshots.map((item) => item.marketingResponseScore)),
      expectedLtv6m: Math.round(snapshots.reduce((sum, item) => sum + Number(item.ltv6m ?? 0), 0)),
      expectedLtv12m: Math.round(snapshots.reduce((sum, item) => sum + Number(item.ltv12m ?? 0), 0)),
    };
  }

  private async buildAutomationAudience(storeId: number, triggerRules: any[] = [], ruleRelation = 'AND', actions: any = []) {
    const totalCustomers = await this.prisma.customer.count({ where: { storeId, deletedAt: null } });
    const latestRun = await this.prisma.predictionRun.findFirst({
      where: { storeId, status: 'completed' },
      orderBy: { finishedAt: 'desc' },
    });
    const snapshots = latestRun
      ? await this.prisma.customerPredictionSnapshot.findMany({
          where: { runId: latestRun.id, storeId },
          include: { customer: { include: { store: true } } },
          orderBy: { marketingResponseScore: 'desc' },
        })
      : [];
    const matched = snapshots.filter((snapshot: any) => this.matchesRules(snapshot.customer, snapshot, triggerRules, ruleRelation));
    const fallbackCustomers = snapshots.length
      ? []
      : await this.prisma.customer.findMany({
          where: { storeId, deletedAt: null },
          include: { store: true },
          take: triggerRules.length ? Math.max(1, Math.round(totalCustomers * 0.3)) : totalCustomers,
          orderBy: { id: 'asc' },
        });
    const customers = matched.length
      ? matched.map((snapshot: any) => ({ ...snapshot.customer, prediction: snapshot }))
      : fallbackCustomers.map((customer: any) => ({ ...customer, prediction: null }));

    return {
      totalCustomers,
      total: customers.length,
      customers: customers.map((customer: any) => {
        const predictedConversionScore = this.calculateStrategyConversionScore(customer.prediction, actions);
        const predictedRevenue = Math.round((Number(customer.prediction?.ltv6m ?? customer.totalSpent ?? 0) || 800) * (predictedConversionScore / 100) * 0.18);
        return {
          ...customer,
          predictedConversionScore,
          predictedRevenue,
          reason: customer.prediction ? this.formatTopReason(customer.prediction.reasonJson) : '按触发规则命中',
        };
      }),
    };
  }

  private matchesRules(customer: any, snapshot: any, triggerRules: any[], relation: string) {
    if (!triggerRules.length) return true;
    const checks = triggerRules.map((rule) => {
      const params = rule.params ?? {};
      switch (rule.type) {
        case 'coupon_expiry':
        case 'coupon_claimed_unused':
          return snapshot.marketingResponseScore >= 60 && snapshot.repurchase30dScore >= 45;
        case 'browse_abandonment':
          return snapshot.marketingResponseScore >= 72 && snapshot.repurchase30dScore >= 55;
        case 'booking_abandonment':
          return snapshot.marketingResponseScore >= 65;
        case 'seasonal_skin_care':
        case 'holiday_campaign':
          return snapshot.marketingResponseScore >= 60;
        case 'vip_privilege_care':
          return ['铂金', '黄金'].includes(snapshot.ltvTier) || ['金卡会员', '钻石会员', 'VIP'].includes(customer.memberLevel);
        case 'product_replenishment':
          return snapshot.marketingResponseScore >= 55 && Number(customer.totalSpent ?? 0) >= Number(params.minSpent ?? 1000);
        case 'referral_campaign':
          return Number(customer.visitCount ?? 0) >= Number(params.minVisitCount ?? 3) && snapshot.marketingResponseScore >= 55;
        case 'dormant':
        case 'last_visit':
          return Number(snapshot.featureJson?.lastVisitDays ?? 0) >= Number(params.days ?? params.daysInactive ?? params.daysSinceLastVisit ?? 60);
        case 'member_level':
          return params.levels?.length ? params.levels.includes(customer.memberLevel) : ['金卡会员', '钻石会员', 'VIP'].includes(customer.memberLevel);
        case 'skin_type':
          return params.skinTypes?.length ? params.skinTypes.includes(customer.skinType) : Boolean(customer.skinType);
        case 'visit_gap':
          return Number(snapshot.featureJson?.currentGapRatio ?? 0) >= Number(params.gapRatio ?? params.multiplier ?? 1.5);
        case 'consumption':
          return Number(customer.totalSpent ?? 0) >= Number(params.amount ?? params.minAmount ?? 1000);
        case 'card_expiry':
        case 'package_remaining':
          return Number(snapshot.featureJson?.cardExpiryUrgencyScore ?? 0) >= 50 || Number(snapshot.featureJson?.activeCardCount ?? 0) > 0;
        case 'care_cycle':
          return Number(snapshot.featureJson?.lastVisitDays ?? 0) >= Number(params.cycleDays ?? 28) - Number(params.remindDaysBefore ?? 3);
        case 'new_customer':
          return Number(customer.visitCount ?? 0) <= Number(params.maxVisitCount ?? 2);
        default:
          return snapshot.marketingResponseScore >= 50 || snapshot.repurchase30dScore >= 50;
      }
    });
    return relation === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
  }

  private async resolveRecommendationTargetSnapshots(input: any) {
    if (Array.isArray(input.targetSnapshots) && input.targetSnapshots.length) return input.targetSnapshots;
    const runId = Number(input.run?.id ?? input.predictionRunId);
    if (!Number.isFinite(runId) || !input.predictionType) return [];
    const where = this.getRecommendationAudienceWhere(runId, input.predictionType, input.targetCustomerIds);
    if (!where) return [];
    return this.prisma.customerPredictionSnapshot.findMany({
      where,
      select: {
        customerId: true,
        churnScore: true,
        churnLevel: true,
        repurchase30dScore: true,
        marketingResponseScore: true,
        ltv6m: true,
        ltv12m: true,
        ltvTier: true,
        featureJson: true,
        reasonJson: true,
      },
      orderBy: this.getRecommendationAudienceOrderBy(input.predictionType),
    });
  }

  private replaceRecommendationCount(text: string | undefined, count: number) {
    if (!text) return text;
    if (/^\d+\s*位/.test(text)) return text.replace(/^\d+\s*位/, `${count} 位`);
    if (/（\d+\s*人）/.test(text)) return text.replace(/（\d+\s*人）/, `（${count}人）`);
    if (/\(\d+\s*人\)/.test(text)) return text.replace(/\(\d+\s*人\)/, `（${count}人）`);
    return text;
  }

  private async buildRecommendationCard(input: any) {
    const storeId = Number(input.storeId ?? input.run?.storeId);
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('storeId is required');
    const rawTargetSnapshots = await this.resolveRecommendationTargetSnapshots(input);
    const rawAudienceCustomerIds = input.targetCustomerIds ?? rawTargetSnapshots.map((item: any) => item.customerId);
    const eligibleAudience = await this.filterRecommendationAudienceProfiles(
      rawAudienceCustomerIds.map((customerId: number) => ({ customerId })),
      { storeId, recommendationId: input.id },
    );
    const eligibleCustomerIds = new Set(eligibleAudience.map((item: any) => Number(item.customerId)));
    const targetSnapshots = rawTargetSnapshots.filter((item: any) => eligibleCustomerIds.has(Number(item.customerId)));
    const audienceCustomerIds = rawAudienceCustomerIds.filter((customerId: number) => eligibleCustomerIds.has(Number(customerId)));
    const targetCount = audienceCustomerIds.length;
    const triggerType = input.triggerType ?? (input.predictionType === 'churn' ? 'dormant' : input.predictionType === 'ltv' ? 'member_level' : 'care_cycle');
    const executionModes = input.executionModes ?? (triggerType ? ['automation'] : ['activity']);
    const preferredMode = input.preferredMode ?? (executionModes.includes('automation') ? 'automation' : 'activity');
    const offer = input.offer ?? this.inferOffer(input.discount);
    const recommendedChannels = input.recommendedChannels ?? this.inferRecommendedChannels(preferredMode, input.urgency);
    const recommendedItems = input.recommendedItems ?? this.inferRecommendedItems(input.category, input.strategy);
    const title =
      this.replaceRecommendationCount(input.title, targetCount) ??
      String(input.strategy ?? input.category ?? '智能营销推荐');
    const targetLabel = this.replaceRecommendationCount(input.targetLabel, targetCount);
    const promotionMatch = input.skipPromotionMatch
      ? {
        items: [],
        selected: null,
        audienceTags: input.audienceTags ?? [],
        audienceRule: input.audienceRule ?? { relation: 'AND', include: [], exclude: [] },
        profileEvidence: [],
      }
      : await this.matchRecommendationPromotion({
        ...input,
        triggerType,
        preferredMode,
        offer,
        recommendedItems,
        recommendedChannels,
        targetSnapshots,
        targetCustomerIds: audienceCustomerIds,
      });
    const selectedPromotion = promotionMatch.selected;
    const enrichedOffer = selectedPromotion
      ? {
          ...offer,
          promotionId: selectedPromotion.promotionId,
          promotionName: selectedPromotion.promotionName,
          type: selectedPromotion.type ?? offer?.type,
          label: selectedPromotion.discountText ?? offer?.label,
          validDays: selectedPromotion.promotion?.validDays ?? offer?.validDays,
          reason: selectedPromotion.fitReason ?? offer?.reason,
          fitScore: selectedPromotion.fitScore,
          riskWarnings: selectedPromotion.riskWarnings ?? [],
        }
      : offer;
    return {
      id: input.id,
      title,
      reason: input.reason,
      targetCustomers: targetLabel ?? `${title.split('需要')[0]}（${targetCount}人）`,
      targetCount,
      targetCustomerIds: audienceCustomerIds,
      expectedConversion: `预计转化率 ${Math.round(input.expectedConversionRate * 100)}%`,
      expectedRevenue: `预计营收 ¥${Math.round(input.expectedRevenue).toLocaleString()}`,
      strategy: input.strategy,
      discount: input.discount,
      duration: '建议周期: 30天',
      matchScore: input.matchScore ?? Math.min(98, Math.max(60, this.average(targetSnapshots.map((item: any) => item.marketingResponseScore)))),
      image: this.defaultRecommendationImage,
      tags: input.tags,
      category: input.category,
      triggerType,
      triggerRule: triggerType
        ? {
            type: triggerType,
            params: this.defaultTriggerParams(triggerType),
            defaultEditable: true,
            reason: input.modeReason ?? '基于推荐卡命中原因自动生成触发规则，运营可继续调整参数。',
          }
        : undefined,
      preferAutoRule: preferredMode === 'automation',
      executionModes,
      preferredMode,
      modeReason: input.modeReason ?? (preferredMode === 'automation' ? '该推荐适合按客户状态长期自动触发。' : '该推荐适合用活动页集中承接。'),
      priority: input.priority ?? (input.urgency === 'urgent' ? 'P0' : input.urgency === 'recommended' ? 'P1' : 'P2'),
      recommendedChannels,
      recommendedActions: input.recommendedActions ?? recommendedChannels.map((channel: any) => ({
        type: enrichedOffer?.type === 'member_privilege' ? 'push' : 'coupon',
        value: enrichedOffer?.label ?? input.discount,
        promotionId: enrichedOffer?.promotionId,
        promotionName: enrichedOffer?.promotionName,
        channel: channel.channel,
        reason: channel.reason,
      })),
      offer: enrichedOffer,
      primaryPromotion: selectedPromotion,
      alternativePromotions: promotionMatch.items.slice(selectedPromotion ? 1 : 0, selectedPromotion ? 4 : 3),
      offerFitBreakdown: selectedPromotion?.scoreBreakdown,
      recommendedItems,
      audienceTags: promotionMatch.audienceTags,
      audienceRule: promotionMatch.audienceRule,
      audienceSnapshot: {
        predictionRunId: input.run.id,
        generatedAt: new Date().toISOString(),
        ruleSummary: targetLabel ?? input.reason,
        customerIds: audienceCustomerIds,
        totalCustomers: targetCount,
        sampleReasons: targetSnapshots.slice(0, 10).map((item: any) => ({
          customerId: item.customerId,
          reason: this.formatTopReason(item.reasonJson),
          score: item.marketingResponseScore ?? item.repurchase30dScore ?? item.churnScore ?? 0,
        })),
      },
      sourceSignals: input.sourceSignals ?? [input.predictionType, triggerType, input.category].filter(Boolean),
      urgency: input.urgency,
      urgencyLabel: input.urgencyLabel,
      source: input.source,
      predictionRunId: input.run.id,
      modelVersion: input.run.modelVersion,
      predictionType: input.predictionType,
      predictionRunFinishedAt: input.run.finishedAt ?? input.run.startedAt,
      dataEvidence: [
        ...(input.dataEvidence ?? []),
        ...(promotionMatch.profileEvidence ?? []),
        ...(selectedPromotion ? [`权益匹配：${selectedPromotion.promotionName}，匹配分 ${selectedPromotion.fitScore}`] : []),
      ],
      totalCustomers: input.totalCustomers ?? input.run.customerCount ?? targetCount,
      riskWarnings: [
        ...(input.riskWarnings ?? []),
        ...(selectedPromotion?.riskWarnings ?? []),
      ],
    };
  }

  private async matchRecommendationPromotion(input: any) {
    const storeId = Number(input.storeId ?? input.run?.storeId);
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('storeId is required');
    const promotions = await this.getRecommendationPromotions(storeId);
    const profileContext = await this.buildRecommendationProfileContext(storeId, input.targetCustomerIds);
    if (!promotions.length) {
      return {
        items: [],
        selected: null,
        audienceTags: profileContext.audienceTags,
        audienceRule: profileContext.audienceRule,
        profileEvidence: profileContext.profileEvidence,
      };
    }

    const scenario = this.offerScenario(input.triggerType, input.recommendationType);
    const projectIds = (input.recommendedItems ?? []).filter((item: any) => item.type === 'project' && item.id).map((item: any) => Number(item.id));
    const productIds = (input.recommendedItems ?? []).filter((item: any) => item.type === 'product' && item.id).map((item: any) => Number(item.id));
    const customerTags = this.uniqueStrings([...this.recommendationCustomerTags(input), ...profileContext.audienceTags]);
    const channelTags = (input.recommendedChannels ?? []).map((item: any) => item.label ?? item.channel).filter(Boolean);
    const scored = promotions
      .map((promotion: any) => {
        const score = this.scoreRecommendationPromotion(promotion, {
          scenario,
          recommendationType: input.recommendationType,
          executionMode: input.preferredMode,
          customerTags,
          projectIds,
          productIds,
          channelTags,
          context: {
            usableTimeRange: input.offer?.usableTimeRange,
            inventoryCap: input.inventorySnapshot?.gapQty,
          },
        });
        return {
          promotionId: promotion.id,
          promotionName: promotion.name,
          name: promotion.name,
          discountText: promotion.discountText,
          type: promotion.type,
          scenario: promotion.scenario,
          source: promotion.source,
          fitScore: score.score,
          fitLevel: this.fitLevel(score.score),
          fitReason: score.reasons.length ? score.reasons.join('、') : '通用权益，可作为营销承接备选',
          fitReasons: score.reasons,
          riskWarnings: score.riskWarnings,
          scoreBreakdown: score.breakdown,
          estimatedCost: promotion.estimatedCost === null || promotion.estimatedCost === undefined ? undefined : Number(promotion.estimatedCost),
          promotion: this.normalizePromotionForRecommendation(promotion),
        };
      })
      .filter((item) => item.fitScore >= 35)
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 5);

    return {
      items: scored,
      selected: scored[0] ?? null,
      audienceTags: profileContext.audienceTags,
      audienceRule: profileContext.audienceRule,
      profileEvidence: profileContext.profileEvidence,
    };
  }

  private async buildRecommendationProfileContext(storeId: number, customerIds?: number[]) {
    const normalizedIds = this.uniqueNumbers(customerIds ?? []).slice(0, 80);
    if (!this.customerMarketingProfileService || !normalizedIds.length) {
      return {
        audienceTags: [],
        audienceRule: { relation: 'AND', include: [], exclude: [] },
        profileEvidence: [],
      };
    }
    try {
      const profiles = await this.customerMarketingProfileService.buildProfiles(storeId, normalizedIds);
      const dimensions = [
        ['生命周期', 'lifecycleTags'],
        ['消费价值', 'valueTags'],
        ['行为意图', 'behaviorTags'],
        ['服务偏好', 'preferenceTags'],
        ['肤质问题', 'skinTags'],
        ['卡项状态', 'cardTags'],
        ['商品周期', 'productCycleTags'],
        ['预约容量', 'capacityTags'],
        ['渠道偏好', 'channelTags'],
        ['触达疲劳', 'fatigueTags'],
      ] as const;
      const include = dimensions
        .map(([dimension, key]) => {
          const tags = this.topTags(profiles.flatMap((profile: any) => profile[key] ?? []), 6);
          return tags.length ? { dimension, tags } : null;
        })
        .filter(Boolean);
      const audienceTags = this.uniqueStrings(include.flatMap((item: any) => item.tags));
      const profileEvidence = profiles
        .flatMap((profile) => profile.evidence ?? [])
        .slice(0, 5)
        .map((item) => `画像证据：${item}`);
      return {
        audienceTags,
        audienceRule: {
          relation: 'AND',
          include,
          exclude: audienceTags.includes('触达疲劳') ? [{ dimension: '触达疲劳', tags: ['触达疲劳'] }] : [],
        },
        profileEvidence,
      };
    } catch {
      return {
        audienceTags: [],
        audienceRule: { relation: 'AND', include: [], exclude: [] },
        profileEvidence: [],
      };
    }
  }

  private async getRecommendationPromotions(storeId: number) {
    const cacheKey = String(storeId);
    const cached = this.recommendationPromotionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.items;

    try {
      const now = new Date();
      const where: any = {
        status: 'active',
        approvalStatus: 'approved',
        OR: [{ storeId: null }],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      };
      where.OR.push({ storeId });
      const items = await this.prisma.promotion.findMany({
        where,
        orderBy: [{ source: 'asc' }, { updatedAt: 'desc' }],
        take: 120,
      });
      const enrichedItems = await this.attachPromotionEffectSummaries(items, storeId);
      this.recommendationPromotionCache.set(cacheKey, { expiresAt: Date.now() + 60_000, items: enrichedItems });
      return enrichedItems;
    } catch {
      return [];
    }
  }

  private async attachPromotionEffectSummaries(promotions: any[], storeId: number) {
    const promotionIds = this.uniqueNumbers(promotions.map((promotion) => promotion.id));
    if (!promotionIds.length) return promotions;
    try {
      const [strategies, events] = await Promise.all([
        this.prisma.marketingAutomationStrategy.findMany({
          where: { storeId },
          include: { touches: true, executions: true },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.customerAppEvent.findMany({
          where: {
            storeId,
            targetType: { in: ['promotion', 'coupon'] },
            targetId: { in: promotionIds.map(String) },
          },
          orderBy: { occurredAt: 'desc' },
        }),
      ]);
      const summaries = new Map<number, any>();
      const ensure = (promotionId: number) => {
        const current = summaries.get(promotionId) ?? {
          exposureCount: 0,
          clickCount: 0,
          conversionCount: 0,
          revenue: 0,
          sourceCount: 0,
        };
        summaries.set(promotionId, current);
        return current;
      };

      for (const strategy of strategies as any[]) {
        const actions = Array.isArray(strategy.actions) ? strategy.actions : [];
        const relatedIds = this.uniqueNumbers(actions.map((action: any) => action?.promotionId)).filter((id) => promotionIds.includes(id));
        if (!relatedIds.length) continue;
        const exposureCount = this.countReachedTouches(strategy);
        const clickCount = strategy.touches?.filter((touch: any) => ['clicked', 'converted'].includes(touch.status)).length ?? 0;
        const conversionCount = strategy.touches?.filter((touch: any) => touch.status === 'converted' || touch.convertedAt).length ?? 0;
        const revenue = this.sumActualTouchRevenue(strategy.touches ?? []);
        for (const id of relatedIds) {
          const summary = ensure(id);
          summary.exposureCount += exposureCount;
          summary.clickCount += clickCount;
          summary.conversionCount += conversionCount;
          summary.revenue += revenue;
          summary.sourceCount += 1;
        }
      }

      for (const event of events as any[]) {
        const promotionId = Number(event.targetId);
        if (!promotionIds.includes(promotionId)) continue;
        const summary = ensure(promotionId);
        if (this.isExposureEvent(event.eventType)) summary.exposureCount += 1;
        if (this.isClickEvent(event.eventType)) summary.clickCount += 1;
        if (this.isConversionEvent(event.eventType)) summary.conversionCount += 1;
        const metadata = event.metadataJson && typeof event.metadataJson === 'object' ? event.metadataJson : {};
        summary.revenue += Number(metadata.revenueAmount ?? metadata.orderAmount ?? metadata.amount ?? 0);
        summary.sourceCount += 1;
      }

      return promotions.map((promotion) => {
        const summary = summaries.get(Number(promotion.id));
        if (!summary) return promotion;
        const conversionBase = Math.max(summary.exposureCount || summary.clickCount, 1);
        return {
          ...promotion,
          effectSummary: {
            ...(promotion.effectSummary && typeof promotion.effectSummary === 'object' ? promotion.effectSummary : {}),
            ...summary,
            conversionRate: Math.round((summary.conversionCount / conversionBase) * 1000) / 10,
            roi: this.formatRoi(summary.revenue, this.estimateMarketingCost(summary.exposureCount, summary.clickCount)),
            source: 'unified_effects',
          },
        };
      });
    } catch {
      return promotions;
    }
  }

  private scoreRecommendationPromotion(promotion: any, dto: any) {
    const breakdown = {
      scenarioScore: 0,
      audienceScore: 0,
      behaviorIntentScore: 0,
      itemFitScore: 0,
      timingUrgencyScore: 0,
      valueProtectionScore: 0,
      channelFitScore: 0,
      operationFitScore: 0,
      historicalEffectScore: 0,
      fatiguePenalty: 0,
      marginRiskPenalty: 0,
      conflictPenalty: 0,
    };
    const reasons: string[] = [];
    const riskWarnings: string[] = [];
    const metadata = this.asObject(promotion.metadata);
    const grossMarginGuard = this.asObject(promotion.grossMarginGuard);
    const scenario = String(dto.scenario || dto.recommendationType || '');
    const customerTags = this.uniqueStrings(dto.customerTags ?? []);
    const audienceTags = Array.isArray(promotion.audienceTags) ? promotion.audienceTags.map(String) : [];

    if (scenario && promotion.scenario === scenario) {
      breakdown.scenarioScore = 100;
      reasons.push('适用场景匹配');
    } else if (scenario && this.scenarioFamily(promotion.scenario) === this.scenarioFamily(scenario)) {
      breakdown.scenarioScore = 70;
      reasons.push('权益场景相近');
    } else {
      breakdown.scenarioScore = scenario ? 20 : 45;
    }

    const audienceHits = this.countTagHits(customerTags, [
      ...audienceTags,
      ...this.metadataTags(metadata, ['lifecycleTags', 'valueTags', 'includeTags']),
    ]);
    breakdown.audienceScore = audienceHits ? Math.min(100, 55 + audienceHits * 15) : (customerTags.length ? 25 : 45);
    if (audienceHits) reasons.push('适用客户标签匹配');

    const behaviorHits = this.countTagHits(customerTags, this.metadataTags(metadata, ['behaviorTags']));
    breakdown.behaviorIntentScore = behaviorHits ? Math.min(100, 60 + behaviorHits * 20) : (this.scenarioFamily(scenario) === 'behavior' ? 70 : 35);
    if (behaviorHits) reasons.push('行为意图匹配');

    const projectIds = Array.isArray(dto.projectIds) ? dto.projectIds.map(Number).filter(Boolean) : [];
    const promotionProjects = Array.isArray(promotion.applicableProjectIds) ? promotion.applicableProjectIds.map(Number) : [];
    if (projectIds.length && promotionProjects.length) {
      const matchedProjects = promotionProjects.filter((id: number) => projectIds.includes(id));
      if (matchedProjects.length) {
        breakdown.itemFitScore += 90;
        reasons.push('适用项目匹配');
      } else {
        breakdown.itemFitScore -= 35;
        riskWarnings.push('推荐项目与权益适用项目不一致');
      }
    } else if (!promotionProjects.length) {
      breakdown.itemFitScore += 45;
    }

    const itemTagHits = this.countTagHits(customerTags, this.metadataTags(metadata, ['preferenceTags', 'skinTags', 'cardTags', 'productCycleTags']));
    if (itemTagHits) {
      breakdown.itemFitScore += Math.min(100, 45 + itemTagHits * 18);
      reasons.push('项目/肤质/卡项标签匹配');
    }

    const highValue = customerTags.some((tag) => /VIP|高\s*LTV|高价值|铂金|黄金|钻石/.test(tag));
    const offerStrength = String(metadata.offerStrength || '');
    if (highValue && ['member_privilege', 'gift'].includes(String(promotion.type))) {
      breakdown.valueProtectionScore += 90;
      reasons.push('高价值客户匹配服务型权益');
    } else if (highValue && offerStrength === 'strong') {
      breakdown.marginRiskPenalty += 25;
      riskWarnings.push('高价值客户不建议默认使用强折扣权益');
    } else {
      breakdown.valueProtectionScore += offerStrength === 'strong' ? 55 : 45;
    }

    const channelHits = this.countTagHits(this.uniqueStrings(dto.channelTags ?? []), this.metadataTags(metadata, ['channelTags']));
    breakdown.channelFitScore = channelHits ? Math.min(100, 55 + channelHits * 20) : 45;
    if (channelHits) reasons.push('触达渠道匹配');

    const preferredModes = this.toStringArray(metadata.preferredExecutionModes);
    if (dto.executionMode && preferredModes.length) {
      if (preferredModes.includes(dto.executionMode) || preferredModes.includes('both')) {
        breakdown.operationFitScore += 85;
        reasons.push('执行方式匹配');
      } else {
        breakdown.conflictPenalty += 20;
        riskWarnings.push('该权益更适合其他执行方式');
      }
    } else {
      breakdown.operationFitScore += 45;
    }

    if (this.truthy(grossMarginGuard.usableTimeRangeRequired) && !dto.context?.usableTimeRange) {
      breakdown.operationFitScore -= 20;
      riskWarnings.push('低峰权益发布前需绑定可用日期/时段');
    }
    if (this.truthy(grossMarginGuard.inventoryCapRequired) && !dto.context?.inventoryCap) {
      riskWarnings.push('库存消化权益发布前需设置库存上限');
    }

    const validDays = Number(promotion.validDays ?? 0);
    breakdown.timingUrgencyScore = validDays > 0 && validDays <= 7 ? 85 : (['coupon_expiry', 'card_expiry', 'project_idle_capacity', 'product_expiry_clearance'].includes(scenario) ? 78 : 45);

    const effectSummary = this.asObject(promotion.effectSummary);
    const historicalConversionRate = Number(effectSummary.conversionRate ?? 0);
    const historicalConversionCount = Number(effectSummary.conversionCount ?? 0);
    const issuedCount = Number(promotion.issuedCount ?? 0);
    const usedCount = Number(promotion.usedCount ?? 0);
    if (historicalConversionRate > 0 || historicalConversionCount > 0) {
      breakdown.historicalEffectScore = this.clamp(
        Math.max(historicalConversionRate * 5, Math.min(100, 45 + historicalConversionCount * 8)),
        40,
        100,
      );
      reasons.push('历史转化表现较好');
    } else {
      breakdown.historicalEffectScore = issuedCount > 0 ? Math.min(100, Math.round((usedCount / Math.max(issuedCount, 1)) * 100)) : 40;
      if (breakdown.historicalEffectScore >= 50) reasons.push('历史核销表现较好');
    }
    if (promotion.maxIssueCount && promotion.issuedCount >= promotion.maxIssueCount) {
      breakdown.conflictPenalty += 80;
      riskWarnings.push('已达到发放上限');
    }

    const excludeHits = this.countTagHits(customerTags, this.metadataTags(metadata, ['excludeTags']));
    if (excludeHits) {
      breakdown.conflictPenalty += 60;
      riskWarnings.push('客户命中该权益排除标签');
    }
    if (customerTags.some((tag) => /已领未核销|已领券/.test(tag)) && !['coupon_claimed_unused', 'coupon_expiry'].includes(scenario)) {
      breakdown.conflictPenalty += 20;
      riskWarnings.push('客户已有未核销权益，避免重复让利');
    }

    const score = this.clamp(
      breakdown.scenarioScore * 0.22
      + breakdown.audienceScore * 0.18
      + breakdown.behaviorIntentScore * 0.14
      + this.clamp(breakdown.itemFitScore, 0, 100) * 0.12
      + breakdown.timingUrgencyScore * 0.1
      + this.clamp(breakdown.valueProtectionScore, 0, 100) * 0.1
      + breakdown.channelFitScore * 0.06
      + this.clamp(breakdown.operationFitScore, 0, 100) * 0.04
      + breakdown.historicalEffectScore * 0.04
      - breakdown.fatiguePenalty
      - breakdown.marginRiskPenalty
      - breakdown.conflictPenalty,
      0,
      100,
    );

    return { score, reasons, riskWarnings, breakdown };
  }

  private offerScenario(triggerType?: string, recommendationType?: string) {
    if (triggerType === 'dormant') return 'churn_winback';
    if (triggerType === 'care_cycle') return 'care_cycle_due';
    if (triggerType === 'coupon_expiry') return 'coupon_claimed_unused';
    if (triggerType === 'booking_abandonment') return 'first_booking';
    if (triggerType === 'holiday_campaign') return 'store_anniversary';
    return triggerType ?? recommendationType ?? '';
  }

  private scenarioFamily(value?: string | null) {
    const scenario = String(value || '');
    if (/churn|dormant|winback|last_visit/.test(scenario)) return 'winback';
    if (/cycle|repurchase|revisit|second_visit/.test(scenario)) return 'repurchase';
    if (/vip|ltv|member|birthday/.test(scenario)) return 'member';
    if (/browse|booking|coupon|new_customer|first_booking/.test(scenario)) return 'behavior';
    if (/product_expiry|inventory|replenishment|bundle/.test(scenario)) return 'product';
    if (/idle|capacity|low_peak/.test(scenario)) return 'capacity';
    return scenario;
  }

  private recommendationCustomerTags(input: any) {
    const tags = [
      ...(input.tags ?? []),
      input.targetLabel,
      input.category,
      input.triggerType,
      input.recommendationType,
      input.predictionType,
      ...(input.sourceSignals ?? []),
      ...(input.targetSnapshots ?? []).flatMap((snapshot: any) => [
        snapshot.ltvTier,
        snapshot.customer?.memberLevel,
        snapshot.customer?.skinType,
        snapshot.churnLevel,
        Number(snapshot.churnScore ?? 0) >= 80 ? '流失高风险' : '',
        Number(snapshot.marketingResponseScore ?? 0) >= 70 ? '高响应客户' : '',
        Number(snapshot.repurchase30dScore ?? 0) >= 60 ? '复购窗口' : '',
      ]),
    ];
    if (input.triggerType === 'card_expiry') tags.push('次卡到期', '套餐到期');
    if (input.triggerType === 'coupon_expiry') tags.push('已领券', '已领未核销');
    if (input.triggerType === 'browse_abandonment') tags.push('浏览未预约', '预约意向');
    if (input.triggerType === 'booking_abandonment') tags.push('预约放弃');
    if (input.triggerType === 'care_cycle') tags.push('护理周期到期');
    if (input.triggerType === 'vip_privilege_care') tags.push('VIP', '高 LTV', '高价值客户');
    if (input.triggerType === 'project_idle_capacity') tags.push('低峰可约', '美容师空档');
    if (input.triggerType === 'product_expiry_clearance') tags.push('临期库存适配');
    return this.uniqueStrings(tags);
  }

  private normalizePromotionForRecommendation(promotion: any) {
    return {
      ...promotion,
      thresholdAmount: promotion.thresholdAmount === null || promotion.thresholdAmount === undefined ? null : Number(promotion.thresholdAmount),
      discountAmount: promotion.discountAmount === null || promotion.discountAmount === undefined ? null : Number(promotion.discountAmount),
      estimatedCost: promotion.estimatedCost === null || promotion.estimatedCost === undefined ? null : Number(promotion.estimatedCost),
      startAt: promotion.startAt?.toISOString?.() ?? promotion.startAt,
      endAt: promotion.endAt?.toISOString?.() ?? promotion.endAt,
      createdAt: promotion.createdAt?.toISOString?.() ?? promotion.createdAt,
      updatedAt: promotion.updatedAt?.toISOString?.() ?? promotion.updatedAt,
    };
  }

  private metadataTags(metadata: Record<string, unknown>, keys: string[]) {
    return keys.flatMap((key) => this.toStringArray(metadata[key]));
  }

  private countTagHits(left: string[], right: string[]) {
    if (!left.length || !right.length) return 0;
    let hits = 0;
    for (const item of left) {
      if (right.some((tag) => this.tagMatches(item, tag))) hits += 1;
    }
    return hits;
  }

  private tagMatches(left: string, right: string) {
    const a = String(left || '').trim().toLowerCase();
    const b = String(right || '').trim().toLowerCase();
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a);
  }

  private uniqueStrings(values: unknown[]) {
    return [...new Set(values.flatMap((value) => this.toStringArray(value)).map((value) => value.trim()).filter(Boolean))];
  }

  private uniqueNumbers(values: unknown[]) {
    return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))];
  }

  private topTags(tags: string[], limit: number) {
    const counts = new Map<string, number>();
    for (const tag of tags.map((item) => String(item).trim()).filter(Boolean)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, limit)
      .map(([tag]) => tag);
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (value === null || value === undefined || value === '') return [];
    return [String(value)];
  }

  private asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  private truthy(value: unknown) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private fitLevel(score: number) {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 35) return 'backup';
    return 'not_recommended';
  }

  private inferOffer(discount: string) {
    if (/满(\d+)减(\d+)/.test(discount)) {
      const [, threshold, amount] = discount.match(/满(\d+)减(\d+)/) ?? [];
      return {
        type: 'money_off',
        label: discount,
        threshold: Number(threshold),
        amount: Number(amount),
        validDays: 30,
        reason: '从推荐优惠文案解析为满减权益。',
      };
    }
    if (discount.includes('体验')) {
      return { type: 'trial_price', label: discount, validDays: 14, reason: '体验价适合活动拉新或浏览转化。' };
    }
    if (discount.includes('VIP') || discount.includes('权益')) {
      return { type: 'member_privilege', label: discount, validDays: 90, reason: '会员权益适合高价值客户维护。' };
    }
    return { type: 'gift', label: discount || '门店专属权益', validDays: 30, reason: '默认按门店权益承接。' };
  }

  private inferRecommendedChannels(preferredMode: string, urgency?: string) {
    if (preferredMode === 'activity') {
      return [
        { channel: 'miniapp', label: '小程序', reason: '活动页、领券和预约入口统一承接。', priority: 'P0' },
        { channel: 'wechat', label: '微信', reason: '适合顾问转发活动内容。', priority: 'P1' },
      ];
    }
    return [
      { channel: 'miniapp', label: '小程序', reason: '自动规则优先通过小程序承接预约和权益。', priority: 'P0' },
      { channel: urgency === 'urgent' ? 'sms' : 'wechat', label: urgency === 'urgent' ? '短信' : '微信', reason: urgency === 'urgent' ? '紧急场景需要更强触达。' : '适合补充顾问跟进。', priority: 'P1' },
    ];
  }

  private inferRecommendedItems(category: string, strategy: string) {
    if (category === 'ltv-nurture') {
      return [{ type: 'package', name: 'VIP专属护理方案', category: '会员权益', reason: strategy, confidence: 82 }];
    }
    if (category === 'seasonal') {
      return [{ type: 'project', name: '季节护理推荐项目', category: '季节护理', reason: strategy, confidence: 78 }];
    }
    return [{ type: 'project', name: '推荐护理方案', category: '面部护理', reason: strategy, confidence: 75 }];
  }

  private defaultTriggerParams(triggerType: string) {
    const params: Record<string, any> = {
      dormant: { days: 60, excludePurchasedRecently: true, excludeBooked: true, wakeLevel: 'medium' },
      dormant_winback: { days: 90, excludePurchasedRecently: true, excludeBooked: true, wakeLevel: 'medium' },
      care_cycle: { cycleDays: 28, lastServiceType: 'facial_care', remindDaysBefore: 3, channels: ['miniapp', 'sms'] },
      care_cycle_due: { cycleDays: 28, lastServiceType: 'facial_care', remindDaysBefore: 3, channels: ['miniapp', 'sms'] },
      card_expiry: { beforeDays: 30, remainingTimes: 1, cardType: 'all', actionIntent: 'use_or_renew' },
      card_expiring: { beforeDays: 30, remainingTimes: 1, cardType: 'all', actionIntent: 'use_or_renew' },
      coupon_expiry: { beforeDays: 7, remindSteps: [7, 3, 1], excludeBooked: true },
      coupon_claimed_unused: { unusedDays: 3, excludePurchasedRecently: true, channels: ['miniapp', 'sms'] },
      browse_abandonment: { windowHours: 24, minViewCount: 1, targetType: 'project', excludeBooked: true },
      booking_abandonment: { windowHours: 2, recommendAdjacentSlots: true, channels: ['miniapp', 'sms'] },
      seasonal_skin_care: { season: 'current', leadDays: 15, skinTypes: 'auto_by_season', projectCategories: 'auto_by_season' },
      holiday_campaign: { holiday: 'auto_upcoming_major_holiday', leadDays: 21, channels: ['miniapp', 'wechat'] },
      vip_privilege_care: { levels: ['gold', 'platinum', 'diamond'], actionIntent: 'privilege_care', channels: ['wechat', 'store'] },
      member_level: { levels: ['gold', 'platinum', 'diamond'], actionIntent: 'privilege_care', channels: ['wechat', 'store'] },
      new_customer: { withinDays: 7, hasNoOrder: true, touchDay: 3, defaultAction: 'first_order_coupon' },
      product_expiry_clearance: { beforeDays: 60, minGapQty: 5, excludeDaysToExpiryLessThan: 7, channels: ['miniapp', 'store'] },
      project_idle_capacity: { windowDays: 7, maxUtilizationRate: 0.6, minIdleMinutes: 120, timeRanges: ['14:00-17:00'], channels: ['miniapp', 'store'] },
      project_cycle_due: { cycleDays: 28, lastServiceType: 'project', excludeBooked: true, channels: ['miniapp', 'sms'] },
      product_replenishment: { replenishmentDays: 45, excludePurchasedRecently: true, sameProductOnly: true, channels: ['miniapp', 'wechat'] },
    };
    return params[triggerType] ?? {};
  }

  private calculateChurnScore(input: any) {
    let score = 0;
    const reasons: PredictionReason[] = [];
    const gapRatio = input.lastVisitDays / Math.max(input.avgVisitGap, 7);
    if (gapRatio > 3) {
      score += 40;
      reasons.push({ type: 'churn', label: '+40', detail: `当前到店间隔是平均值的 ${gapRatio.toFixed(1)} 倍`, impact: 'negative', weight: 40 });
    } else if (gapRatio > 2) {
      score += 30;
      reasons.push({ type: 'churn', label: '+30', detail: '到店间隔明显偏长', impact: 'negative', weight: 30 });
    } else if (gapRatio > 1.5) {
      score += 15;
      reasons.push({ type: 'churn', label: '+15', detail: '到店间隔略高于个人均值', impact: 'negative', weight: 15 });
    }
    if (input.lastVisitDays > 180) {
      score += 25;
      reasons.push({ type: 'churn', label: '+25', detail: '超过 180 天未到店', impact: 'negative', weight: 25 });
    } else if (input.lastVisitDays > 90) {
      score += 18;
      reasons.push({ type: 'churn', label: '+18', detail: '超过 90 天未到店', impact: 'negative', weight: 18 });
    } else if (input.lastVisitDays > 60) {
      score += 10;
      reasons.push({ type: 'churn', label: '+10', detail: '超过 60 天未到店', impact: 'negative', weight: 10 });
    }
    if (input.trend === '下降') {
      score += 20;
      reasons.push({ type: 'churn', label: '+20', detail: '近阶段消费频率或金额下降', impact: 'negative', weight: 20 });
    }
    if (['普通会员', '无', undefined, null].includes(input.memberLevel)) score += 10;
    if (['金卡会员', '钻石会员', 'VIP'].includes(input.memberLevel)) score -= 5;
    if (input.activeCardCount > 0) {
      score -= 10;
      reasons.push({ type: 'churn', label: '-10', detail: '仍有有效次卡，可降低流失风险', impact: 'positive', weight: -10 });
    }
    score = this.clamp(Math.round(score), 0, 100);
    const level = score >= 75 ? '极高' : score >= 55 ? '高' : score >= 30 ? '中' : '低';
    if (!reasons.length) reasons.push({ type: 'churn', label: '稳定', detail: '暂无明显流失风险特征', impact: 'neutral' });
    return { score, level, reasons };
  }

  private calculateCardExpiryUrgencyScore(cards: any[], now: Date) {
    const activeCards = cards.filter((card: any) => card.status === 'active' && new Date(card.expiryDate) >= now);
    if (!activeCards.length) return 0;
    return Math.max(
      ...activeCards.map((card: any) => {
        const daysToExpiry = this.daysBetween(now, card.expiryDate);
        const remainingTimes = Number(card.remainingTimes ?? 0);
        let score = 20;
        if (daysToExpiry <= 7) score += 45;
        else if (daysToExpiry <= 30) score += 30;
        else if (daysToExpiry <= 60) score += 12;
        if (remainingTimes <= 1) score += 25;
        else if (remainingTimes <= 3) score += 12;
        return this.clamp(score, 0, 100);
      }),
    );
  }

  private calculateRepurchaseScore(input: any) {
    let score = 45;
    if (input.lastVisitDays <= Math.max(input.avgVisitGap * 1.2, 21)) score += 18;
    if (input.activeCardCount > 0) score += 15;
    if (input.recordCount >= 4) score += 10;
    if (['金卡会员', '钻石会员', 'VIP'].includes(input.memberLevel)) score += 8;
    if (input.trend === '上升') score += 10;
    if (input.trend === '下降') score -= 12;
    if (input.churnScore >= 70) score -= 25;
    if (input.lastVisitDays > 120) score -= 12;
    return this.clamp(Math.round(score), 0, 100);
  }

  private calculateMarketingResponseScore(input: any) {
    let score = Math.round(input.repurchaseScore * 0.55 + (100 - input.churnScore) * 0.2);
    if (['金卡会员', '钻石会员', 'VIP'].includes(input.memberLevel)) score += 8;
    if (input.skinType) score += 6;
    if (input.activeCardCount > 0) score += 6;
    if (input.totalSpent >= 10000) score += 8;
    score += Math.min(Number(input.recentTouchConversions ?? 0) * 5, 15);
    return this.clamp(score, 0, 100);
  }

  private calculateStrategyConversionScore(snapshot: any, actions: any) {
    if (!snapshot) return 30;
    const actionBonus = Array.isArray(actions) && actions.some((action) => ['coupon', 'discount'].includes(action.type)) ? 8 : 0;
    return this.clamp(Math.round(snapshot.marketingResponseScore * 0.7 + snapshot.repurchase30dScore * 0.2 + actionBonus), 5, 95);
  }

  private calculateLtv(monthlyAvg: number, trend: string, churnScore: number, historicalTotal: number) {
    const trendMultiplier = trend === '上升' ? 1.15 : trend === '下降' ? 0.75 : 1;
    const churnDiscount = churnScore >= 75 ? 0.25 : churnScore >= 55 ? 0.55 : churnScore >= 30 ? 0.8 : 1;
    const ltv6m = Math.round(monthlyAvg * 6 * trendMultiplier * churnDiscount);
    const ltv12m = Math.round(monthlyAvg * 12 * trendMultiplier * churnDiscount * 0.95);
    const totalPredicted = historicalTotal + ltv12m;
    const tier = totalPredicted >= 80000 ? '铂金' : totalPredicted >= 30000 ? '黄金' : totalPredicted >= 10000 ? '白银' : '青铜';
    return { ltv6m, ltv12m, tier };
  }

  private calculateAverageVisitGap(records: any[]) {
    if (records.length < 2) return 30;
    const gaps = [];
    for (let index = 1; index < records.length; index += 1) {
      const gap = this.daysBetween(records[index - 1].consumeTime, records[index].consumeTime);
      if (gap > 0) gaps.push(gap);
    }
    return gaps.length ? Math.round(gaps.reduce((sum, item) => sum + item, 0) / gaps.length) : 30;
  }

  private calculateSpendTrend(records: any[]) {
    if (records.length < 4) return '稳定';
    const mid = Math.floor(records.length / 2);
    const early = records.slice(0, mid).reduce((sum, item) => sum + Number(item.amount ?? 0), 0) / mid;
    const late = records.slice(mid).reduce((sum, item) => sum + Number(item.amount ?? 0), 0) / (records.length - mid);
    if (late > early * 1.2) return '上升';
    if (late < early * 0.75) return '下降';
    return '稳定';
  }

  private calculateMonthlyAverage(customer: any, records: any[], now: Date) {
    const firstDate = records[0]?.consumeTime ?? customer.createdAt;
    const months = Math.max(1, Math.ceil(this.daysBetween(firstDate, now) / 30));
    return Number(customer.totalSpent ?? 0) / months;
  }

  private recommendActions(churnLevel: string, repurchaseScore: number, marketingResponseScore: number, ltvTier: string) {
    const actions = [];
    if (['高', '极高'].includes(churnLevel)) actions.push('顾问关怀 + 回归优惠');
    if (repurchaseScore >= 65) actions.push('护理周期提醒 + 预约入口');
    if (marketingResponseScore >= 70) actions.push('小程序券包 + 微信触达');
    if (['铂金', '黄金'].includes(ltvTier)) actions.push('VIP权益维护');
    return actions.length ? actions : ['保持常规会员运营'];
  }

  private formatTopReason(reasons: any) {
    return Array.isArray(reasons) && reasons[0]?.detail ? reasons[0].detail : '基于最新预测快照命中';
  }

  private daysBetween(start: Date | string | null | undefined, end: Date | string) {
    if (!start) return 999;
    return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
  }

  private average(values: number[]) {
    const valid = values.filter((item) => Number.isFinite(item));
    if (!valid.length) return 0;
    return Math.round(valid.reduce((sum, item) => sum + item, 0) / valid.length);
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  private nextRecommendationId() {
    return Math.max(0, ...this.recommendations.map((item) => item.id)) + 1;
  }

  private extractPrimaryChannel(actions: any) {
    if (Array.isArray(actions) && actions[0]?.channel) return actions[0].channel;
    return 'sms';
  }
}
