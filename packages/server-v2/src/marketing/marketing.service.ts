import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

type PageQuery = { page?: number; pageSize?: number; status?: string; strategyId?: number };
type PredictionQuery = PageQuery & {
  storeId?: number;
  churnLevel?: string;
  ltvTier?: string;
  minRepurchaseScore?: number;
  minMarketingResponseScore?: number;
};

type PredictionReason = {
  type: 'churn' | 'repurchase' | 'marketing_response' | 'ltv';
  label: string;
  detail: string;
  impact: 'positive' | 'negative' | 'neutral';
  weight?: number;
};

const MODEL_VERSION = 'rules-v1';
const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 30;

@Injectable()
export class MarketingService {
  private readonly defaultRecommendationImage: string;

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
  ) {
    this.defaultRecommendationImage = this.config.get(
      'MARKETING_RECOMMENDATION_IMAGE_URL',
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400',
    );
  }

  async getRecommendations() {
    let latestRun: any = null;
    try {
      latestRun = await this.getLatestRunForRecommendations();
    } catch {
      latestRun = null;
    }

    if (!latestRun || latestRun.snapshotCount === 0) {
      try {
        const totalCustomers = await this.prisma.customer.count({ where: { deletedAt: null } });
        if (totalCustomers > 0) {
          await this.runPredictions();
          latestRun = await this.getLatestRunForRecommendations();
        }
      } catch {
        latestRun = null;
      }
    }

    const totalCustomers = latestRun?.customerCount ?? latestRun?.snapshotCount ?? 0;

    if (!latestRun || latestRun.snapshotCount === 0) {
      const totalCustomers = await this.prisma.customer.count();
      return this.recommendations.map((item) => ({
        ...item,
        reason: item.reason ?? item.description,
        matchScore: item.matchScore <= 1 ? Math.round(item.matchScore * 100) : item.matchScore,
        targetCustomerIds: [],
        targetCount: Math.max(0, Math.round(totalCustomers * 0.2)),
        targetCustomers: `目标客户 ${Math.max(0, Math.round(totalCustomers * 0.2))} 人`,
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
        totalCustomers,
        predictionRunId: undefined,
        modelVersion: MODEL_VERSION,
        predictionType: 'strategy',
        dataEvidence: ['暂无预测批次，先触发一次预测后可获得模型化推荐'],
      }));
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
    const cards = [];
    if (highChurnCount) {
      cards.push(this.buildRecommendationCard({
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
        tags: ['流失预警', '高优先级'],
        urgency: 'urgent',
        urgencyLabel: '紧急',
        dataEvidence: [
          `其中极高风险 ${criticalChurnCount} 人`,
          `平均流失分 ${averageChurnScore} 分`,
          `模型版本 ${latestRun.modelVersion}`,
        ],
        totalCustomers,
        run: latestRun,
      }));
    }

    if (repurchaseCount) {
      cards.push(this.buildRecommendationCard({
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
      cards.push(this.buildRecommendationCard({
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
      cards.push(this.buildRecommendationCard({
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

    return cards.length ? cards : this.recommendations;
  }

  private async getLatestRunForRecommendations() {
    const run = await this.prisma.predictionRun.findFirst({
      where: { status: 'completed' },
      orderBy: { finishedAt: 'desc' },
    });
    if (!run) return null;
    return { ...run, snapshotCount: run.customerCount ?? 0 };
  }

  private getDistributionCount(distribution: Array<{ label: string; count: number }> = [], label: string) {
    return Number(distribution.find((item) => item.label === label)?.count ?? 0);
  }

  async getRecommendationAudience(recommendationId: number) {
    const latestRun = await this.getLatestRunForRecommendations();
    const recommendation = this.getRecommendationAudienceMeta(recommendationId)
      ?? this.recommendations.find((item) => item.id === recommendationId);
    if (!recommendation) throw new NotFoundException('Recommendation not found');

    const predictionType = (recommendation as any).predictionType;
    const predictionRunId = (recommendation as any).predictionRunId ?? latestRun?.id;
    const where = this.getRecommendationAudienceWhere(predictionRunId, predictionType, (recommendation as any).targetCustomerIds);
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
            },
          },
        },
        orderBy: this.getRecommendationAudienceOrderBy(predictionType),
      });

      return snapshots.map((snapshot: any) => ({
        customerId: snapshot.customerId,
        name: snapshot.customer.name,
        phone: snapshot.customer.phone,
        segment: snapshot.customer.memberLevel || '普通会员',
        skinType: snapshot.customer.skinType,
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
    }

    const customers = await this.prisma.customer.findMany({
      take: 20,
      orderBy: { id: 'asc' },
    });

    return customers.map((customer: any) => ({
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
  }

  private getRecommendationAudienceMeta(recommendationId: number) {
    const meta: Record<number, any> = {
      1: { id: 1, predictionType: 'churn', description: '高流失风险客户' },
      2: { id: 2, predictionType: 'repurchase', description: '30 天复购窗口客户' },
      3: { id: 3, predictionType: 'marketing_response', description: '高营销响应客户' },
      4: { id: 4, predictionType: 'ltv', description: '高 LTV 客户' },
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
      default:
        return null;
    }
  }

  createRecommendation(dto: any) {
    const item = { id: this.nextRecommendationId(), status: 'active', matchScore: 0.75, ...dto };
    this.recommendations.unshift(item);
    return item;
  }

  updateRecommendation(id: number, dto: any) {
    const index = this.recommendations.findIndex((item) => item.id === id);
    if (index === -1) throw new NotFoundException('Recommendation not found');
    this.recommendations[index] = { ...this.recommendations[index], ...dto, id };
    return this.recommendations[index];
  }

  deleteRecommendation(id: number) {
    const index = this.recommendations.findIndex((item) => item.id === id);
    if (index === -1) throw new NotFoundException('Recommendation not found');
    this.recommendations.splice(index, 1);
    return { success: true };
  }

  async runPredictions(storeId?: number) {
    const where = { deletedAt: null, ...(storeId ? { storeId: Number(storeId) } : {}) };
    const run = await this.prisma.predictionRun.create({
      data: {
        storeId: storeId ? Number(storeId) : null,
        modelVersion: MODEL_VERSION,
        status: 'running',
        startedAt: new Date(),
        customerCount: 0,
      },
    });

    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        consumptionRecords: { orderBy: { consumeTime: 'asc' } },
        customerCards: true,
        healthProfile: true,
      },
      orderBy: { id: 'asc' },
    });

    const snapshots = customers.map((customer: any) => this.buildPredictionSnapshot(run.id, customer));
    if (snapshots.length) {
      await this.prisma.customerPredictionSnapshot.createMany({ data: snapshots });
    }

    const summary = this.summarizeSnapshots(snapshots);
    const completed = await this.prisma.predictionRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        finishedAt: new Date(),
        customerCount: snapshots.length,
        summaryJson: summary,
      },
    });

    return { run: completed, summary };
  }

  async getLatestPredictionSummary(storeId?: number) {
    const where = { status: 'completed', ...(storeId ? { storeId: Number(storeId) } : {}) };
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

  async findPredictionCustomers(query: PredictionQuery = {}) {
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const latestRun = await this.prisma.predictionRun.findFirst({
      where: { status: 'completed', ...(query.storeId ? { storeId: Number(query.storeId) } : {}) },
      orderBy: { finishedAt: 'desc' },
    });
    if (!latestRun) return { items: [], data: [], total: 0, page, pageSize };

    const where = {
      runId: latestRun.id,
      ...(query.storeId ? { storeId: Number(query.storeId) } : {}),
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

  async getCustomerPrediction(customerId: number) {
    const latest = await this.prisma.customerPredictionSnapshot.findFirst({
      where: { customerId },
      include: { customer: true, run: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) throw new NotFoundException('Prediction snapshot not found');

    const history = await this.prisma.customerPredictionSnapshot.findMany({
      where: { customerId },
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

  async findActivities(query: PageQuery = {}) {
    const { page = 1, pageSize = 20, status } = query;
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.prisma.marketingActivity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.marketingActivity.count({ where }),
    ]);
    return { items, data: items, total, page, pageSize };
  }

  private normalizeActivityData(dto: any) {
    const data: any = {};
    const stringFields = [
      'title',
      'description',
      'status',
      'conversion',
      'targetCustomers',
      'discount',
      'sourceRecommendationId',
      'aiGenerationId',
      'publishStatus',
    ];

    for (const field of stringFields) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }

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

    return data;
  }

  createActivity(dto: any) {
    return this.prisma.marketingActivity.create({ data: this.normalizeActivityData(dto) });
  }

  updateActivity(id: number, dto: any) {
    return this.prisma.marketingActivity.update({ where: { id }, data: this.normalizeActivityData(dto) });
  }

  async deleteActivity(id: number) {
    await this.prisma.marketingActivity.delete({ where: { id } });
    return { success: true };
  }

  getTriggerOptions() {
    return [
      { type: 'birthday', name: '生日触发', category: 'time' },
      { type: 'last_visit', name: '上次到店', category: 'behavior' },
      { type: 'dormant', name: '沉睡客户', category: 'behavior' },
      { type: 'consumption', name: '消费金额', category: 'behavior' },
      { type: 'member_level', name: '会员等级', category: 'attribute' },
      { type: 'skin_type', name: '肤质类型', category: 'attribute' },
      { type: 'holiday', name: '节日营销', category: 'time' },
      { type: 'seasonal', name: '季节护理', category: 'time' },
      { type: 'care_cycle', name: '护理周期', category: 'behavior' },
      { type: 'card_expiry', name: '次卡到期', category: 'behavior' },
      { type: 'visit_frequency', name: '到店频次', category: 'behavior' },
      { type: 'visit_gap', name: '到店间隔', category: 'behavior' },
      { type: 'service_interest', name: '项目偏好', category: 'behavior' },
      { type: 'new_customer', name: '新客转化', category: 'attribute' },
      { type: 'age_range', name: '年龄区间', category: 'attribute' },
    ];
  }

  async findStrategies(query: PageQuery = {}) {
    const { page = 1, pageSize = 20, status } = query;
    const where = status ? { status: status as any } : {};
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

  createStrategy(dto: any) {
    return this.prisma.marketingAutomationStrategy.create({
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status ?? 'draft',
        executionType: dto.executionType ?? 'manual',
        schedule: dto.schedule ?? {},
        triggerRules: dto.triggerRules ?? [],
        ruleRelation: dto.ruleRelation ?? 'AND',
        actions: dto.actions ?? [],
        targetCount: dto.targetCount ?? 0,
      },
    });
  }

  updateStrategy(id: number, dto: any) {
    return this.prisma.marketingAutomationStrategy.update({ where: { id }, data: dto });
  }

  async deleteStrategy(id: number) {
    await this.prisma.marketingAutomationStrategy.delete({ where: { id } });
    return { success: true };
  }

  enableStrategy(id: number) {
    return this.prisma.marketingAutomationStrategy.update({ where: { id }, data: { status: 'enabled' } });
  }

  pauseStrategy(id: number) {
    return this.prisma.marketingAutomationStrategy.update({ where: { id }, data: { status: 'paused' } });
  }

  async executeStrategy(id: number) {
    const strategy = await this.prisma.marketingAutomationStrategy.findUnique({ where: { id } });
    if (!strategy) throw new NotFoundException('Strategy not found');
    const audience = await this.buildAutomationAudience(strategy.triggerRules as any[], strategy.ruleRelation, strategy.actions);
    const reachedCount = audience.customers.length;

    const execution = await this.prisma.marketingAutomationExecution.create({
      data: {
        strategyId: id,
        strategyName: strategy.name,
        status: 'success',
        triggeredCount: audience.total,
        reachedCount,
        channel: this.extractPrimaryChannel(strategy.actions),
      },
    });
    if (audience.customers.length) {
      await this.prisma.marketingAutomationTouch.createMany({
        data: audience.customers.map((item: any) => ({
          executionId: execution.id,
          strategyId: id,
          customerId: item.id,
          predictionSnapshotId: item.prediction?.id ?? null,
          predictedConversionScore: item.predictedConversionScore,
          predictedRevenue: item.predictedRevenue,
          channel: this.extractPrimaryChannel(strategy.actions),
          status: 'reached',
          touchedAt: new Date(),
          attributionWindowDays: DEFAULT_ATTRIBUTION_WINDOW_DAYS,
        })),
      });
    }
    await this.prisma.marketingAutomationStrategy.update({
      where: { id },
      data: { lastExecutedAt: new Date(), targetCount: audience.total },
    });
    return execution;
  }

  async previewAudience(triggerRules: any[] = [], ruleRelation = 'AND', strategyId?: number) {
    const strategy = strategyId
      ? await this.prisma.marketingAutomationStrategy.findUnique({ where: { id: strategyId } })
      : null;
    const audience = await this.buildAutomationAudience(
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

  async findExecutions(query: PageQuery = {}) {
    const { page = 1, pageSize = 20, strategyId } = query;
    const where = strategyId ? { strategyId: Number(strategyId) } : {};
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

  async getExecutionById(id: number) {
    const execution = await this.prisma.marketingAutomationExecution.findUnique({
      where: { id },
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

  async getEffects() {
    const strategies = await this.prisma.marketingAutomationStrategy.findMany({
      include: {
        executions: true,
        touches: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return strategies.map((strategy: any) => {
      const reachedCount = strategy.touches.length || strategy.executions.reduce((sum: number, item: any) => sum + item.reachedCount, 0);
      const predictedConvertedCount = Math.round(strategy.touches.reduce((sum: number, item: any) => sum + item.predictedConversionScore / 100, 0));
      const actualConvertedCount = strategy.touches.filter((item: any) => item.status === 'converted').length;
      const predictedRevenue = strategy.touches.reduce((sum: number, item: any) => sum + Number(item.predictedRevenue ?? 0), 0);
      const actualRevenue = strategy.touches.reduce((sum: number, item: any) => sum + Number(item.actualRevenue ?? 0), 0);
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
      };
    });
  }

  async getStrategyEffects() {
    const strategies = await this.prisma.marketingAutomationStrategy.findMany({
      include: { executions: true },
      orderBy: { updatedAt: 'desc' },
    });

    return strategies.map((strategy) => {
      const reachedCount = strategy.executions.reduce((sum, item) => sum + item.reachedCount, 0);
      const triggeredCount = strategy.executions.reduce((sum, item) => sum + item.triggeredCount, 0);
      const couponUsedRate = triggeredCount ? `${Math.round((reachedCount / triggeredCount) * 100)}%` : '0%';
      const lastExecuted = strategy.lastExecutedAt?.toISOString().slice(0, 10) ?? '-';

      return {
        id: strategy.id,
        name: strategy.name,
        status: strategy.status === 'enabled' ? '启用' : strategy.status === 'paused' ? '停用' : '草稿',
        triggerCount: strategy.executions.length,
        reachedCount,
        couponUsedRate,
        returnRate: couponUsedRate,
        revenue: reachedCount * 380,
        lastExecuted,
      };
    });
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

  private async buildAutomationAudience(triggerRules: any[] = [], ruleRelation = 'AND', actions: any = []) {
    const totalCustomers = await this.prisma.customer.count({ where: { deletedAt: null } });
    const latestRun = await this.prisma.predictionRun.findFirst({
      where: { status: 'completed' },
      orderBy: { finishedAt: 'desc' },
    });
    const snapshots = latestRun
      ? await this.prisma.customerPredictionSnapshot.findMany({
          where: { runId: latestRun.id },
          include: { customer: { include: { store: true } } },
          orderBy: { marketingResponseScore: 'desc' },
        })
      : [];
    const matched = snapshots.filter((snapshot: any) => this.matchesRules(snapshot.customer, snapshot, triggerRules, ruleRelation));
    const fallbackCustomers = snapshots.length
      ? []
      : await this.prisma.customer.findMany({
          where: { deletedAt: null },
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
        case 'dormant':
        case 'last_visit':
          return Number(snapshot.featureJson?.lastVisitDays ?? 0) >= Number(params.daysInactive ?? params.daysSinceLastVisit ?? 60);
        case 'member_level':
          return params.levels?.length ? params.levels.includes(customer.memberLevel) : ['金卡会员', '钻石会员', 'VIP'].includes(customer.memberLevel);
        case 'skin_type':
          return params.skinTypes?.length ? params.skinTypes.includes(customer.skinType) : Boolean(customer.skinType);
        case 'visit_gap':
          return Number(snapshot.featureJson?.currentGapRatio ?? 0) >= Number(params.gapRatio ?? 1.5);
        case 'consumption':
          return Number(customer.totalSpent ?? 0) >= Number(params.minAmount ?? 1000);
        case 'card_expiry':
          return Number(snapshot.featureJson?.activeCardCount ?? 0) > 0;
        case 'new_customer':
          return Number(customer.visitCount ?? 0) <= Number(params.maxVisitCount ?? 2);
        default:
          return snapshot.marketingResponseScore >= 50 || snapshot.repurchase30dScore >= 50;
      }
    });
    return relation === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
  }

  private buildRecommendationCard(input: any) {
    const targetSnapshots = input.targetSnapshots ?? [];
    const targetCount = input.targetCount ?? targetSnapshots.length;
    return {
      id: input.id,
      title: input.title,
      reason: input.reason,
      targetCustomers: input.targetLabel ?? `${input.title.split('需要')[0]}（${targetCount}人）`,
      targetCount,
      targetCustomerIds: targetSnapshots.map((item: any) => item.customerId),
      expectedConversion: `预计转化率 ${Math.round(input.expectedConversionRate * 100)}%`,
      expectedRevenue: `预计营收 ¥${Math.round(input.expectedRevenue).toLocaleString()}`,
      strategy: input.strategy,
      discount: input.discount,
      duration: '建议周期: 30天',
      matchScore: input.matchScore ?? Math.min(98, Math.max(60, this.average(targetSnapshots.map((item: any) => item.marketingResponseScore)))),
      image: this.defaultRecommendationImage,
      tags: input.tags,
      category: input.category,
      triggerType: input.predictionType === 'churn' ? 'dormant' : input.predictionType === 'ltv' ? 'member_level' : 'care_cycle',
      preferAutoRule: true,
      urgency: input.urgency,
      urgencyLabel: input.urgencyLabel,
      source: input.source,
      predictionRunId: input.run.id,
      modelVersion: input.run.modelVersion,
      predictionType: input.predictionType,
      predictionRunFinishedAt: input.run.finishedAt ?? input.run.startedAt,
      dataEvidence: input.dataEvidence,
      totalCustomers: input.totalCustomers ?? input.run.customerCount ?? targetCount,
    };
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
