import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

type LifecycleStage = 'lead' | 'new_customer' | 'trial' | 'member' | 'active' | 'growth' | 'at_risk' | 'dormant' | 'lost';
type OpportunityType = 'care_cycle_due' | 'card_expiring' | 'dormant_winback' | 'coupon_claimed_unused' | 'browse_abandonment';
type ExecutionMode = 'activity' | 'automation' | 'advisor_task';

type RebuildOptions = {
  predictionRunId?: number;
};

type OpportunitySeed = {
  opportunityType: OpportunityType;
  priority: 'P0' | 'P1' | 'P2';
  score: number;
  recommendedExecutionMode: ExecutionMode;
  channels: Array<{ channel: string; label: string; reason: string; priority: string }>;
  offer?: Record<string, any>;
  items?: Array<Record<string, any>>;
  evidence: string[];
  expiresAt?: Date | null;
};

const P0_OPPORTUNITY_TYPES: OpportunityType[] = [
  'care_cycle_due',
  'card_expiring',
  'dormant_winback',
  'coupon_claimed_unused',
  'browse_abandonment',
];

const OPPORTUNITY_LABELS: Record<OpportunityType, string> = {
  care_cycle_due: '护理周期到期',
  card_expiring: '次卡/套餐到期',
  dormant_winback: '沉睡客户召回',
  coupon_claimed_unused: '领券未核销',
  browse_abandonment: '浏览未预约',
};

const STAGE_LABELS: Record<LifecycleStage, string> = {
  lead: '线索',
  new_customer: '新客',
  trial: '体验客',
  member: '会员',
  active: '活跃客',
  growth: '成长客',
  at_risk: '预流失',
  dormant: '沉睡客',
  lost: '流失客',
};

@Injectable()
export class CustomerLifecycleOntologyService {
  constructor(private prisma: PrismaService) {}

  async rebuild(storeId?: number, options: RebuildOptions = {}) {
    if (!this.lifecycleDelegatesReady()) return this.emptyRebuildResult('customer_lifecycle_schema_pending');

    const scopedStoreId = storeId ? Number(storeId) : undefined;
    const latestRun = await this.resolvePredictionRun(scopedStoreId, options.predictionRunId);
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null, ...(scopedStoreId ? { storeId: scopedStoreId } : {}) },
      include: {
        customerCards: { include: { card: true }, orderBy: { expiryDate: 'asc' } },
        consumptionRecords: { orderBy: { consumeTime: 'desc' }, take: 10 },
        marketingTouches: { orderBy: { touchedAt: 'desc' }, take: 10 },
        customerAppEvents: { orderBy: { occurredAt: 'desc' }, take: 20 },
        recommendationEvents: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { id: 'asc' },
    });
    if (!customers.length) return { rebuilt: true, reason: null, predictionRunId: latestRun?.id ?? null, snapshotCount: 0, opportunityCount: 0 };

    const customerIds = customers.map((customer: any) => Number(customer.id));
    const [predictionSnapshots, behaviorEvents, oldSnapshots] = await Promise.all([
      this.loadPredictionSnapshots(customerIds, latestRun?.id, scopedStoreId),
      this.loadBehaviorEvents(customerIds, scopedStoreId),
      (this.prisma as any).customerLifecycleSnapshot.findMany({ where: { customerId: { in: customerIds } } }),
    ]);
    const predictionByCustomer = new Map(predictionSnapshots.map((item: any) => [Number(item.customerId), item]));
    const behaviorByCustomer = this.groupByCustomer(behaviorEvents, 'customerId');
    const oldStageByCustomer = new Map(oldSnapshots.map((item: any) => [Number(item.customerId), item.lifecycleStage]));

    let snapshotCount = 0;
    let opportunityCount = 0;
    for (const customer of customers as any[]) {
      const prediction = predictionByCustomer.get(Number(customer.id)) ?? null;
      const behavior = behaviorByCustomer.get(Number(customer.id)) ?? [];
      const stageResult = this.classifyLifecycleStage(customer, prediction);
      const opportunities = this.buildOpportunities(customer, prediction, behavior, stageResult.stage);
      const evidence = this.uniqueStrings([
        ...stageResult.evidence,
        ...opportunities.flatMap((item) => item.evidence).slice(0, 6),
      ]);

      await (this.prisma as any).customerLifecycleSnapshot.upsert({
        where: { storeId_customerId: { storeId: Number(customer.storeId), customerId: Number(customer.id) } },
        create: {
          storeId: Number(customer.storeId),
          customerId: Number(customer.id),
          predictionRunId: latestRun?.id ?? null,
          predictionSnapshotId: prediction?.id ?? null,
          lifecycleStage: stageResult.stage,
          ltvTier: prediction?.ltvTier ?? stageResult.ltvTier,
          churnRiskLevel: prediction?.churnLevel ?? stageResult.churnRiskLevel,
          touchFatigueScore: stageResult.touchFatigueScore,
          assetSummaryJson: this.buildAssetSummary(customer),
          servicePreferenceJson: this.buildServicePreference(customer),
          evidenceJson: evidence,
          computedAt: new Date(),
        },
        update: {
          predictionRunId: latestRun?.id ?? null,
          predictionSnapshotId: prediction?.id ?? null,
          lifecycleStage: stageResult.stage,
          ltvTier: prediction?.ltvTier ?? stageResult.ltvTier,
          churnRiskLevel: prediction?.churnLevel ?? stageResult.churnRiskLevel,
          touchFatigueScore: stageResult.touchFatigueScore,
          assetSummaryJson: this.buildAssetSummary(customer),
          servicePreferenceJson: this.buildServicePreference(customer),
          evidenceJson: evidence,
          computedAt: new Date(),
        },
      });
      snapshotCount += 1;

      const oldStage = oldStageByCustomer.get(Number(customer.id));
      if (oldStage !== stageResult.stage) {
        await (this.prisma as any).customerLifecycleEvent.create({
          data: {
            storeId: Number(customer.storeId),
            customerId: Number(customer.id),
            fromStage: oldStage ?? null,
            toStage: stageResult.stage,
            eventType: oldStage ? 'stage_changed' : 'stage_initialized',
            sourceType: prediction ? 'prediction_snapshot' : 'customer_profile',
            sourceId: prediction?.id ? String(prediction.id) : String(customer.id),
            evidenceJson: stageResult.evidence,
            occurredAt: new Date(),
          },
        });
      }

      const activeTypes = new Set(opportunities.map((item) => item.opportunityType));
      await (this.prisma as any).customerOpportunity.updateMany({
        where: {
          storeId: Number(customer.storeId),
          customerId: Number(customer.id),
          opportunityType: { in: P0_OPPORTUNITY_TYPES },
          status: 'open',
          NOT: { opportunityType: { in: [...activeTypes] } },
        },
        data: { status: 'stale' },
      });

      for (const opportunity of opportunities) {
        await (this.prisma as any).customerOpportunity.upsert({
          where: {
            storeId_customerId_opportunityType: {
              storeId: Number(customer.storeId),
              customerId: Number(customer.id),
              opportunityType: opportunity.opportunityType,
            },
          },
          create: {
            storeId: Number(customer.storeId),
            customerId: Number(customer.id),
            predictionRunId: latestRun?.id ?? null,
            predictionSnapshotId: prediction?.id ?? null,
            opportunityType: opportunity.opportunityType,
            priority: opportunity.priority,
            status: 'open',
            score: opportunity.score,
            recommendedExecutionMode: opportunity.recommendedExecutionMode,
            recommendedChannelsJson: opportunity.channels,
            recommendedOfferJson: opportunity.offer ?? null,
            recommendedItemsJson: opportunity.items ?? [],
            evidenceJson: opportunity.evidence,
            expiresAt: opportunity.expiresAt ?? null,
          },
          update: {
            predictionRunId: latestRun?.id ?? null,
            predictionSnapshotId: prediction?.id ?? null,
            priority: opportunity.priority,
            status: 'open',
            score: opportunity.score,
            recommendedExecutionMode: opportunity.recommendedExecutionMode,
            recommendedChannelsJson: opportunity.channels,
            recommendedOfferJson: opportunity.offer ?? null,
            recommendedItemsJson: opportunity.items ?? [],
            evidenceJson: opportunity.evidence,
            expiresAt: opportunity.expiresAt ?? null,
          },
        });
        opportunityCount += 1;
      }
    }

    return { rebuilt: true, reason: null, predictionRunId: latestRun?.id ?? null, snapshotCount, opportunityCount };
  }

  async listOpportunities(query: any = {}, storeId?: number) {
    if (!this.lifecycleDelegatesReady()) return this.emptyPage('customer_lifecycle_schema_pending', query);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 20)));
    const where: any = {
      ...(storeId ? { storeId: Number(storeId) } : {}),
      ...(query.opportunityType ? { opportunityType: String(query.opportunityType) } : {}),
      ...(query.priority ? { priority: String(query.priority) } : {}),
      ...(query.status ? { status: String(query.status) } : { status: 'open' }),
      ...(query.customerId ? { customerId: Number(query.customerId) } : {}),
    };
    const [items, total] = await Promise.all([
      (this.prisma as any).customerOpportunity.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true, memberLevel: true, lastVisitDate: true, totalSpent: true } }, predictionSnapshot: true },
        orderBy: [{ priority: 'asc' }, { score: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (this.prisma as any).customerOpportunity.count({ where }),
    ]);
    return { items: items.map((item: any) => this.serializeOpportunity(item)), data: items.map((item: any) => this.serializeOpportunity(item)), total, page, pageSize };
  }

  async getCustomerContext(customerId: number, storeId?: number) {
    if (!this.lifecycleDelegatesReady()) return null;
    const where = { customerId: Number(customerId), ...(storeId ? { storeId: Number(storeId) } : {}) };
    const [snapshot, opportunities, events] = await Promise.all([
      (this.prisma as any).customerLifecycleSnapshot.findFirst({ where, orderBy: { computedAt: 'desc' } }),
      (this.prisma as any).customerOpportunity.findMany({ where: { ...where, status: 'open' }, orderBy: [{ priority: 'asc' }, { score: 'desc' }], take: 8 }),
      (this.prisma as any).customerLifecycleEvent.findMany({ where, orderBy: { occurredAt: 'desc' }, take: 5 }),
    ]);
    if (!snapshot && !opportunities.length) return null;
    return {
      snapshot: snapshot ? this.serializeSnapshot(snapshot) : null,
      opportunities: opportunities.map((item: any) => this.serializeOpportunity(item)),
      events: events.map((event: any) => ({
        id: event.id,
        fromStage: event.fromStage,
        toStage: event.toStage,
        toStageLabel: STAGE_LABELS[event.toStage as LifecycleStage] ?? event.toStage,
        eventType: event.eventType,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        evidence: this.asStringArray(event.evidenceJson),
        occurredAt: event.occurredAt,
      })),
    };
  }

  async buildRecommendationCards(storeId?: number, limit = 20) {
    if (!this.lifecycleDelegatesReady()) return [];
    const opportunities = await (this.prisma as any).customerOpportunity.findMany({
      where: { ...(storeId ? { storeId: Number(storeId) } : {}), status: 'open', opportunityType: { in: P0_OPPORTUNITY_TYPES } },
      include: { customer: true, predictionSnapshot: true, predictionRun: true },
      orderBy: [{ priority: 'asc' }, { score: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(20, limit * 5),
    });
    const grouped = new Map<string, any[]>();
    for (const item of opportunities) {
      if (!grouped.has(item.opportunityType)) grouped.set(item.opportunityType, []);
      grouped.get(item.opportunityType)!.push(item);
    }
    return [...grouped.entries()].map(([type, items], index) => this.buildCardFromOpportunityGroup(type as OpportunityType, items, index));
  }

  private buildCardFromOpportunityGroup(type: OpportunityType, items: any[], index: number) {
    const first = items[0];
    const customerIds = items.map((item) => Number(item.customerId));
    const avgScore = Math.round(items.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / Math.max(items.length, 1));
    const evidence = this.uniqueStrings(items.flatMap((item) => this.asStringArray(item.evidenceJson))).slice(0, 8);
    const run = first.predictionRun;
    const mode = first.recommendedExecutionMode ?? 'automation';
    const label = OPPORTUNITY_LABELS[type];
    const targetLabel = `${label}客户（${items.length}人）`;
    return {
      id: 9000 + index + 1,
      recommendationKey: `lifecycle:${type}`,
      title: `${items.length} 位客户命中${label}`,
      reason: evidence[0] ?? `客户命中${label}规则，建议及时承接。`,
      targetCustomers: targetLabel,
      targetCount: items.length,
      targetCustomerIds: customerIds,
      expectedConversion: `预计转化率 ${Math.max(18, Math.min(48, Math.round(avgScore / 2)))}%`,
      expectedRevenue: `预计营收 ¥${Math.round(items.reduce((sum, item) => sum + Number(item.predictionSnapshot?.ltv6m ?? 0), 0) * 0.08).toLocaleString('zh-CN')}`,
      strategy: this.strategyForOpportunity(type),
      discount: first.recommendedOfferJson?.label ?? '门店专属权益',
      duration: '建议周期: 30天',
      matchScore: Math.max(60, Math.min(98, avgScore)),
      image: undefined,
      tags: [label, '生命周期本体', 'P0'],
      category: type,
      source: 'customer_lifecycle',
      recommendationType: type,
      triggerType: type === 'card_expiring' ? 'card_expiry' : type,
      triggerRule: { type, params: this.triggerParamsForOpportunity(type), defaultEditable: true, reason: '基于客户生命周期机会自动生成，运营可在创建草稿时调整。' },
      priority: first.priority ?? 'P1',
      urgency: first.priority === 'P0' ? 'urgent' : 'recommended',
      urgencyLabel: first.priority === 'P0' ? '紧急' : '推荐',
      executionModes: mode === 'activity' ? ['activity', 'advisor_task'] : ['automation', 'advisor_task'],
      preferredMode: mode,
      modeReason: mode === 'automation' ? '该机会会随客户状态滚动变化，适合自动规则持续承接。' : '该机会适合先用一次性活动集中验证。',
      recommendedChannels: first.recommendedChannelsJson ?? [],
      recommendedActions: (first.recommendedChannelsJson ?? []).map((channel: any) => ({ type: 'consultant_task', value: first.recommendedOfferJson?.label ?? label, channel: channel.channel, reason: channel.reason })),
      offer: first.recommendedOfferJson ?? { type: 'member_privilege', label: '门店专属权益', reason: '生命周期机会默认使用低风险权益，避免过度促销。' },
      recommendedItems: first.recommendedItemsJson ?? [],
      audienceSnapshot: {
        predictionRunId: run?.id ?? first.predictionRunId ?? undefined,
        generatedAt: new Date().toISOString(),
        ruleSummary: targetLabel,
        customerIds,
        totalCustomers: items.length,
        sampleReasons: items.slice(0, 10).map((item) => ({ customerId: item.customerId, reason: this.asStringArray(item.evidenceJson)[0] ?? label, score: item.score })),
      },
      sourceSignals: ['customer_lifecycle_ontology', type],
      predictionRunId: run?.id ?? first.predictionRunId ?? undefined,
      modelVersion: run?.modelVersion ?? 'customer-lifecycle-ontology-p0',
      predictionType: type,
      predictionRunFinishedAt: run?.finishedAt ?? run?.startedAt ?? first.updatedAt,
      dataEvidence: evidence,
      totalCustomers: items.length,
      riskWarnings: ['P0 只生成建议和草稿，不自动发券、不自动群发、不修改客户资产。'],
    };
  }

  private classifyLifecycleStage(customer: any, prediction: any | null): { stage: LifecycleStage; ltvTier: string; churnRiskLevel: string; touchFatigueScore: number; evidence: string[] } {
    const visitCount = Number(customer.visitCount ?? 0);
    const totalSpent = Number(customer.totalSpent ?? 0);
    const lastVisitDays = this.daysSince(customer.lastVisitDate);
    const activeCards = this.activeCards(customer);
    const touchFatigueScore = this.calculateTouchFatigue(customer.marketingTouches ?? []);
    const evidence: string[] = [];
    let stage: LifecycleStage = 'active';

    if (visitCount <= 0 && totalSpent <= 0) {
      stage = 'lead';
      evidence.push('客户尚无到店或消费记录');
    } else if (visitCount <= 2 || this.daysSince(customer.createdAt) <= 30) {
      stage = 'new_customer';
      evidence.push('客户仍处于首购/新客观察期');
    } else if (activeCards.length > 0) {
      stage = 'member';
      evidence.push(`客户有 ${activeCards.length} 张有效卡项`);
    }
    if (visitCount > 2 && !activeCards.length && totalSpent > 0) {
      stage = 'trial';
      evidence.push('客户有体验或单次消费记录，但未沉淀有效卡项');
    }
    if ((prediction?.ltvTier && ['铂金', '黄金'].includes(prediction.ltvTier)) || totalSpent >= 20000) {
      stage = 'growth';
      evidence.push(`客户价值层级 ${prediction?.ltvTier ?? '高价值'}`);
    }
    if ((prediction?.churnScore ?? 0) >= 70 || lastVisitDays >= 90) {
      stage = lastVisitDays >= 180 ? 'dormant' : 'at_risk';
      evidence.push(lastVisitDays >= 9999 ? '缺少最近到店记录' : `距上次到店 ${lastVisitDays} 天`);
    }
    if (lastVisitDays >= 365 && (prediction?.marketingResponseScore ?? 0) < 30) {
      stage = 'lost';
      evidence.push('长期无到店且营销响应偏低');
    }

    return {
      stage,
      ltvTier: prediction?.ltvTier ?? (totalSpent >= 50000 ? '铂金' : totalSpent >= 25000 ? '黄金' : totalSpent >= 10000 ? '白银' : '青铜'),
      churnRiskLevel: prediction?.churnLevel ?? (lastVisitDays >= 180 ? '极高' : lastVisitDays >= 90 ? '高' : lastVisitDays >= 60 ? '中' : '低'),
      touchFatigueScore,
      evidence: this.uniqueStrings(evidence),
    };
  }

  private buildOpportunities(customer: any, prediction: any | null, behaviorEvents: any[], stage: LifecycleStage): OpportunitySeed[] {
    const opportunities: OpportunitySeed[] = [];
    const lastVisitDays = this.daysSince(customer.lastVisitDate);
    const responseScore = Number(prediction?.marketingResponseScore ?? 0);
    const repurchaseScore = Number(prediction?.repurchase30dScore ?? 0);
    const churnScore = Number(prediction?.churnScore ?? 0);
    const activeCards = this.activeCards(customer);
    const expiringCards = activeCards.filter((card: any) => this.daysUntil(card.expiryDate) <= 30);

    if (lastVisitDays >= 21 && repurchaseScore >= 45) {
      opportunities.push(this.opportunity('care_cycle_due', repurchaseScore + 8, 'P1', [
        `距上次到店 ${lastVisitDays} 天，已进入常见护理周期提醒窗口`,
        `30 天复购分 ${repurchaseScore} 分`,
      ]));
    }
    if (expiringCards.length || Number(prediction?.featureJson?.cardExpiryUrgencyScore ?? 0) >= 50) {
      opportunities.push(this.opportunity('card_expiring', Math.max(78, responseScore + 10), 'P0', [
        expiringCards.length ? `${expiringCards.length} 张有效卡项 30 天内到期或待使用` : '预测特征显示卡项到期风险较高',
        activeCards.length ? `有效卡项 ${activeCards.length} 张` : '需要顾问确认卡项状态',
      ]));
    }
    if (['at_risk', 'dormant', 'lost'].includes(stage) || churnScore >= 70) {
      opportunities.push(this.opportunity('dormant_winback', Math.max(churnScore, 70), 'P0', [
        `生命周期阶段：${STAGE_LABELS[stage] ?? stage}`,
        `流失风险 ${prediction?.churnLevel ?? '高'}，流失分 ${churnScore || '待计算'}`,
      ], 'activity'));
    }
    if (this.hasClaimedUnusedCoupon(behaviorEvents, customer.customerAppEvents ?? [])) {
      opportunities.push(this.opportunity('coupon_claimed_unused', Math.max(68, responseScore), 'P0', [
        '客户存在领券后未核销行为',
        `营销响应分 ${responseScore || '待计算'}`,
      ]));
    }
    if (this.hasBrowseAbandonment(behaviorEvents, customer.customerAppEvents ?? [])) {
      opportunities.push(this.opportunity('browse_abandonment', Math.max(70, responseScore), 'P0', [
        '客户近期浏览项目/活动但未形成预约或成交',
        `复购分 ${repurchaseScore || '待计算'}，营销响应分 ${responseScore || '待计算'}`,
      ]));
    }

    return opportunities.sort((a, b) => b.score - a.score);
  }

  private opportunity(type: OpportunityType, score: number, priority: 'P0' | 'P1' | 'P2', evidence: string[], mode: ExecutionMode = 'automation'): OpportunitySeed {
    const validDays = type === 'browse_abandonment' ? 7 : type === 'coupon_claimed_unused' ? 7 : 30;
    const expiresAt = new Date(Date.now() + validDays * 86400000);
    return {
      opportunityType: type,
      priority,
      score: Math.max(0, Math.min(100, Math.round(score))),
      recommendedExecutionMode: mode,
      channels: this.channelsForOpportunity(type),
      offer: this.offerForOpportunity(type),
      items: this.itemsForOpportunity(type),
      evidence,
      expiresAt,
    };
  }

  private channelsForOpportunity(type: OpportunityType) {
    const miniapp = { channel: 'miniapp', label: '小程序', reason: '直接承接权益、预约和核销入口。', priority: 'P0' };
    const advisor = { channel: 'store', label: '顾问跟进', reason: '需要人工确认需求和预约意向。', priority: 'P0' };
    const sms = { channel: 'sms', label: '短信', reason: '适合到期、沉睡或未读客户强提醒。', priority: 'P1' };
    if (type === 'dormant_winback' || type === 'card_expiring') return [advisor, miniapp, sms];
    return [miniapp, advisor];
  }

  private offerForOpportunity(type: OpportunityType) {
    const map: Record<OpportunityType, Record<string, any>> = {
      care_cycle_due: { type: 'money_off', label: '护理周期专享满500减80', threshold: 500, amount: 80, validDays: 21, reason: '小额权益配合护理周期提醒，避免过度让利。' },
      card_expiring: { type: 'gift', label: '续卡专享赠护理一次', validDays: 30, reason: '卡项场景优先用权益赠送推动核销和续卡。' },
      dormant_winback: { type: 'money_off', label: '回归专享满300减100', threshold: 300, amount: 100, validDays: 30, reason: '沉睡召回需要更强权益，但保留消费门槛。' },
      coupon_claimed_unused: { type: 'member_privilege', label: '已领权益核销提醒', validDays: 7, reason: '优先推动已领权益核销，不新增额外让利。' },
      browse_abandonment: { type: 'gift', label: '预约保留提醒 + 到店小礼', validDays: 3, reason: '浏览未预约更适合轻权益和顾问协助。' },
    };
    return map[type];
  }

  private itemsForOpportunity(type: OpportunityType) {
    const map: Record<OpportunityType, Array<Record<string, any>>> = {
      care_cycle_due: [{ type: 'project', name: '护理周期复购项目', category: '面部护理', reason: '匹配客户常见 21-30 天复购节奏。', confidence: 86 }],
      card_expiring: [{ type: 'card', name: '护理次卡续费方案', category: '卡项', reason: '客户已有卡项使用习惯，适合续卡或升级。', confidence: 84 }],
      dormant_winback: [{ type: 'project', name: '回店护理关怀方案', category: '面部护理', reason: '适合长期未到店客户恢复服务关系。', confidence: 82 }],
      coupon_claimed_unused: [{ type: 'project', name: '优惠券适配护理项目', category: '权益核销', reason: '围绕客户已领取权益推动预约核销。', confidence: 78 }],
      browse_abandonment: [{ type: 'project', name: '浏览意向项目', category: '预约召回', reason: '根据客户近期浏览意图推动继续预约。', confidence: 80 }],
    };
    return map[type];
  }

  private strategyForOpportunity(type: OpportunityType) {
    const map: Record<OpportunityType, string> = {
      care_cycle_due: '按护理周期提醒客户预约下一次服务，并搭配低门槛项目券。',
      card_expiring: '到期前提醒客户消耗剩余权益，到店后由顾问推荐续卡或升级。',
      dormant_winback: '对长期未到店客户做分层召回，先用顾问关怀再承接回归权益。',
      coupon_claimed_unused: '围绕客户已领取权益做核销提醒，减少重复发券和运营浪费。',
      browse_abandonment: '客户浏览项目或活动后及时提醒继续预约，必要时由顾问协助。',
    };
    return map[type];
  }

  private triggerParamsForOpportunity(type: OpportunityType) {
    const map: Record<OpportunityType, Record<string, any>> = {
      care_cycle_due: { daysAfterLastVisit: 28 },
      card_expiring: { daysBeforeExpiry: 30, remainingTimesGreaterThan: 0 },
      dormant_winback: { inactiveDays: 90 },
      coupon_claimed_unused: { hoursAfterClaim: 24, unusedOnly: true },
      browse_abandonment: { hoursAfterBrowse: 2, noBookingOnly: true },
    };
    return map[type];
  }

  private async resolvePredictionRun(storeId?: number, predictionRunId?: number) {
    if (predictionRunId) return this.prisma.predictionRun.findUnique({ where: { id: Number(predictionRunId) } });
    return this.prisma.predictionRun.findFirst({
      where: { status: 'completed', ...(storeId ? { storeId } : {}) },
      orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
    });
  }

  private async loadPredictionSnapshots(customerIds: number[], runId?: number, storeId?: number) {
    if (runId) {
      return this.prisma.customerPredictionSnapshot.findMany({ where: { runId, customerId: { in: customerIds } } });
    }
    return this.prisma.customerPredictionSnapshot.findMany({
      where: { customerId: { in: customerIds }, ...(storeId ? { storeId } : {}) },
      orderBy: { createdAt: 'desc' },
    }).then((items) => {
      const latest = new Map<number, any>();
      for (const item of items as any[]) if (!latest.has(Number(item.customerId))) latest.set(Number(item.customerId), item);
      return [...latest.values()];
    });
  }

  private async loadBehaviorEvents(customerIds: number[], storeId?: number) {
    const delegate = (this.prisma as any).customerBehaviorEvent;
    if (!delegate?.findMany) return [];
    return delegate.findMany({
      where: { customerId: { in: customerIds }, ...(storeId ? { storeId } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: Math.max(100, customerIds.length * 10),
    });
  }

  private hasClaimedUnusedCoupon(behaviorEvents: any[], appEvents: any[]) {
    const events = [...behaviorEvents, ...appEvents];
    const latestUsedAt = this.latestEventTime(events, /coupon_used|promotion_used|核销|使用/);
    const latestClaimedAt = this.latestEventTime(events, /coupon_claimed|promotion_claimed|领券|领取/);
    return Boolean(latestClaimedAt && (!latestUsedAt || latestClaimedAt > latestUsedAt));
  }

  private hasBrowseAbandonment(behaviorEvents: any[], appEvents: any[]) {
    const events = [...behaviorEvents, ...appEvents];
    const latestBrowseAt = this.latestEventTime(events, /browse|view|project_view|activity_view|page_view|浏览|查看/);
    const latestBookingAt = this.latestEventTime(events, /booking|appointment|reservation|预约|order_paid|coupon_used/);
    if (!latestBrowseAt) return false;
    return !latestBookingAt || latestBrowseAt > latestBookingAt;
  }

  private latestEventTime(events: any[], pattern: RegExp) {
    const matched = events
      .filter((event) => pattern.test(String(event.eventType ?? '')))
      .map((event) => new Date(event.occurredAt ?? event.createdAt))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    return matched[0]?.getTime();
  }

  private calculateTouchFatigue(touches: any[]) {
    const recent = touches.filter((touch) => this.daysSince(touch.touchedAt) <= 30);
    if (!recent.length) return 0;
    const converted = recent.filter((touch) => touch.convertedAt || touch.status === 'converted').length;
    return Math.max(0, Math.min(1, Number(((recent.length - converted) / Math.max(recent.length, 1)).toFixed(2))));
  }

  private activeCards(customer: any) {
    return (customer.customerCards ?? []).filter((card: any) => card.status === 'active' && Number(card.remainingTimes ?? 0) > 0);
  }

  private buildAssetSummary(customer: any) {
    const activeCards = this.activeCards(customer);
    return {
      activeCardCount: activeCards.length,
      expiringCardCount: activeCards.filter((card: any) => this.daysUntil(card.expiryDate) <= 30).length,
      remainingTimes: activeCards.reduce((sum: number, card: any) => sum + Number(card.remainingTimes ?? 0), 0),
      nearestExpiryDate: activeCards[0]?.expiryDate ?? null,
    };
  }

  private buildServicePreference(customer: any) {
    const counts = new Map<string, number>();
    for (const record of customer.consumptionRecords ?? []) {
      const name = String(record.consumeContent ?? record.consumeType ?? '').split(',')[0]?.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return {
      preferredProjects: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
      lastServiceAt: customer.consumptionRecords?.[0]?.consumeTime ?? customer.lastVisitDate ?? null,
    };
  }

  private serializeSnapshot(snapshot: any) {
    return {
      id: snapshot.id,
      storeId: snapshot.storeId,
      customerId: snapshot.customerId,
      predictionRunId: snapshot.predictionRunId,
      predictionSnapshotId: snapshot.predictionSnapshotId,
      lifecycleStage: snapshot.lifecycleStage,
      lifecycleStageLabel: STAGE_LABELS[snapshot.lifecycleStage as LifecycleStage] ?? snapshot.lifecycleStage,
      ltvTier: snapshot.ltvTier,
      churnRiskLevel: snapshot.churnRiskLevel,
      touchFatigueScore: Number(snapshot.touchFatigueScore ?? 0),
      assetSummary: snapshot.assetSummaryJson ?? {},
      servicePreference: snapshot.servicePreferenceJson ?? {},
      evidence: this.asStringArray(snapshot.evidenceJson),
      computedAt: snapshot.computedAt,
    };
  }

  private serializeOpportunity(item: any) {
    return {
      id: item.id,
      storeId: item.storeId,
      customerId: item.customerId,
      customer: item.customer,
      predictionRunId: item.predictionRunId,
      predictionSnapshotId: item.predictionSnapshotId,
      opportunityType: item.opportunityType,
      opportunityTypeLabel: OPPORTUNITY_LABELS[item.opportunityType as OpportunityType] ?? item.opportunityType,
      priority: item.priority,
      status: item.status,
      score: item.score,
      recommendedExecutionMode: item.recommendedExecutionMode,
      recommendedChannels: item.recommendedChannelsJson ?? [],
      recommendedOffer: item.recommendedOfferJson ?? null,
      recommendedItems: item.recommendedItemsJson ?? [],
      evidence: this.asStringArray(item.evidenceJson),
      expiresAt: item.expiresAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private lifecycleDelegatesReady() {
    return Boolean((this.prisma as any).customerLifecycleSnapshot?.upsert && (this.prisma as any).customerOpportunity?.upsert);
  }

  private emptyRebuildResult(reason: string) {
    return { rebuilt: false, reason, predictionRunId: null, snapshotCount: 0, opportunityCount: 0 };
  }

  private emptyPage(reason: string, query: any = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 20)));
    return { items: [], data: [], total: 0, page, pageSize, reason };
  }

  private groupByCustomer(items: any[], key: string) {
    const grouped = new Map<number, any[]>();
    for (const item of items ?? []) {
      const id = Number(item[key]);
      if (!id) continue;
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id)!.push(item);
    }
    return grouped;
  }

  private asStringArray(value: any) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : item?.detail ?? item?.label ?? JSON.stringify(item)).filter(Boolean);
    if (typeof value === 'string') return [value];
    return Object.values(value).map((item) => String(item)).filter(Boolean);
  }

  private uniqueStrings(values: Array<string | null | undefined>) {
    return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))];
  }

  private daysUntil(value?: Date | string | null) {
    if (!value) return 9999;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 9999;
    return Math.ceil((date.getTime() - Date.now()) / 86400000);
  }

  private daysSince(value?: Date | string | null) {
    if (!value) return 9999;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 9999;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  }
}
