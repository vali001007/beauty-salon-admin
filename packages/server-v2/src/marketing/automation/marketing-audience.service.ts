import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

export type MarketingAudienceStrategy = {
  id: number;
  storeId: number;
  triggerRules: unknown;
  ruleRelation?: string | null;
  actions: unknown;
  predictionRunId?: number | null;
  audienceSnapshotId?: string | null;
};

export type PreviewAudienceInput = {
  triggerRules?: unknown[];
  ruleRelation?: string;
  actions?: unknown[];
  strategyId?: number;
};

export type MarketingAudienceCustomer = {
  id: number;
  storeId: number;
  name?: string | null;
  phone?: string | null;
  memberLevel?: string | null;
  totalSpent?: unknown;
  lastVisitDate?: Date | null;
  store?: { id?: number; name?: string | null } | null;
  prediction: Record<string, any> | null;
  predictedConversionScore: number;
  predictedRevenue: number;
  reason: string;
};

export type MarketingAudienceSource = {
  predictionRunId: number | null;
  audienceSnapshotId: string | null;
  ruleHash: string;
  totalCustomerCount: number;
  matchedCustomerCount: number;
  eligibleCustomerCount: number;
  frequencyCapFilteredCount: number;
  generatedAt: string;
};

export type MarketingAudienceResult = {
  customers: MarketingAudienceCustomer[];
  totalCustomers: number;
  total: number;
  source: MarketingAudienceSource;
};

@Injectable()
export class MarketingAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  async buildForStrategy(strategy: MarketingAudienceStrategy): Promise<MarketingAudienceResult> {
    const storeId = Number(strategy.storeId);
    const rules = Array.isArray(strategy.triggerRules) ? strategy.triggerRules : [];
    const actions = Array.isArray(strategy.actions) ? strategy.actions : [];
    const totalCustomers = await this.prisma.customer.count({ where: { storeId, deletedAt: null } });

    let predictionRunId = strategy.predictionRunId ?? null;
    let candidates: MarketingAudienceCustomer[] = [];

    if (strategy.audienceSnapshotId) {
      const members = await this.prisma.marketingRecommendationAudienceMember.findMany({
        where: {
          snapshotId: strategy.audienceSnapshotId,
          storeId,
          customer: { storeId, deletedAt: null },
        },
        include: { customer: { include: { store: true } } },
        orderBy: { rank: 'asc' },
      });
      candidates = members.map((member: any) => this.toAudienceCustomer(
        member.customer,
        this.toPersistedPrediction(member.predictionData),
        actions,
        member.reasonJson,
      ));
    } else {
      const latestRun = await this.prisma.predictionRun.findFirst({
        where: { storeId, status: 'completed' },
        orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }],
      });
      predictionRunId = latestRun?.id ?? null;

      if (latestRun) {
        const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
          where: {
            runId: latestRun.id,
            storeId,
            customer: { storeId, deletedAt: null },
          },
          include: { customer: { include: { store: true } } },
          orderBy: [{ marketingResponseScore: 'desc' }, { customerId: 'asc' }],
        });
        candidates = snapshots
          .filter((snapshot: any) => this.matchesRules(snapshot.customer, snapshot, rules, strategy.ruleRelation ?? 'AND'))
          .map((snapshot: any) => this.toAudienceCustomer(snapshot.customer, snapshot, actions, snapshot.reasonJson));
      }
    }

    const channel = this.extractPrimaryChannel(actions);
    const eligibleCustomers = await this.filterTouchFatigue(storeId, strategy.id, channel, candidates);
    const generatedAt = new Date().toISOString();
    return {
      customers: eligibleCustomers,
      totalCustomers,
      total: eligibleCustomers.length,
      source: {
        predictionRunId,
        audienceSnapshotId: strategy.audienceSnapshotId ?? null,
        ruleHash: this.ruleHash(rules, strategy.ruleRelation ?? 'AND'),
        totalCustomerCount: totalCustomers,
        matchedCustomerCount: candidates.length,
        eligibleCustomerCount: eligibleCustomers.length,
        frequencyCapFilteredCount: candidates.length - eligibleCustomers.length,
        generatedAt,
      },
    };
  }

  async previewForStore(storeId: number, input: PreviewAudienceInput): Promise<MarketingAudienceResult> {
    return this.buildForStrategy({
      id: input.strategyId ?? 0,
      storeId,
      triggerRules: input.triggerRules ?? [],
      ruleRelation: input.ruleRelation ?? 'AND',
      actions: input.actions ?? [],
    });
  }

  private async filterTouchFatigue(
    storeId: number,
    strategyId: number,
    channel: string,
    customers: MarketingAudienceCustomer[],
  ) {
    if (customers.length === 0) return customers;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const touches = await this.prisma.marketingAutomationTouch.findMany({
      where: {
        customerId: { in: customers.map((customer) => customer.id) },
        execution: { storeId },
        OR: [
          { strategyId, touchedAt: { gte: sevenDaysAgo } },
          { channel, touchedAt: { gte: oneDayAgo } },
        ],
      },
      select: { customerId: true },
    });
    const fatiguedCustomerIds = new Set(touches.map((touch) => Number(touch.customerId)));
    return customers.filter((customer) => !fatiguedCustomerIds.has(customer.id));
  }

  private toAudienceCustomer(customer: any, prediction: any, actions: unknown[], reasonJson?: unknown): MarketingAudienceCustomer {
    const predictedConversionScore = this.calculateConversionScore(prediction, actions);
    const predictedRevenue = Math.round(
      (Number(prediction?.ltv6m ?? customer.totalSpent ?? 0) || 800) * (predictedConversionScore / 100) * 0.18,
    );
    return {
      ...customer,
      id: Number(customer.id),
      storeId: Number(customer.storeId),
      prediction,
      predictedConversionScore,
      predictedRevenue,
      reason: this.formatReason(reasonJson),
    };
  }

  private toPersistedPrediction(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const prediction = value as Record<string, any>;
    return {
      ...prediction,
      id: prediction.predictionSnapshotId ?? prediction.id ?? null,
    };
  }

  private calculateConversionScore(prediction: any, actions: unknown[]) {
    const response = Number(prediction?.marketingResponseScore ?? prediction?.repurchase30dScore ?? 45);
    const actionBoost = actions.length > 0 ? 5 : 0;
    return Math.max(0, Math.min(100, Math.round(response + actionBoost)));
  }

  private extractPrimaryChannel(actions: unknown[]) {
    const action = actions.find((item) => item && typeof item === 'object') as Record<string, any> | undefined;
    const channel = String(action?.channel ?? (action?.type === 'terminal' ? 'terminal' : 'in_app'));
    return ['terminal', 'in_app', 'sms', 'wechat'].includes(channel) ? channel : 'in_app';
  }

  private matchesRules(customer: any, snapshot: any, triggerRules: unknown[], relation: string) {
    if (triggerRules.length === 0) return true;
    const checks = triggerRules.map((rawRule) => {
      const rule = rawRule && typeof rawRule === 'object' ? rawRule as Record<string, any> : {};
      const params = rule.params ?? {};
      switch (rule.type) {
        case 'coupon_expiry':
        case 'coupon_claimed_unused':
          return Number(snapshot.marketingResponseScore) >= 60 && Number(snapshot.repurchase30dScore) >= 45;
        case 'browse_abandonment':
          return Number(snapshot.marketingResponseScore) >= 72 && Number(snapshot.repurchase30dScore) >= 55;
        case 'booking_abandonment':
          return Number(snapshot.marketingResponseScore) >= 65;
        case 'seasonal_skin_care':
        case 'holiday_campaign':
          return Number(snapshot.marketingResponseScore) >= 60;
        case 'vip_privilege_care':
          return ['铂金', '黄金'].includes(snapshot.ltvTier) || ['金卡会员', '钻石会员', 'VIP'].includes(customer.memberLevel);
        case 'product_replenishment':
          return Number(snapshot.marketingResponseScore) >= 55 && Number(customer.totalSpent ?? 0) >= Number(params.minSpent ?? 1000);
        case 'referral_campaign':
          return Number(customer.visitCount ?? 0) >= Number(params.minVisitCount ?? 3) && Number(snapshot.marketingResponseScore) >= 55;
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
          return Number(snapshot.marketingResponseScore) >= 50 || Number(snapshot.repurchase30dScore) >= 50;
      }
    });
    return relation === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
  }

  private formatReason(value: unknown) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean).slice(0, 2).join('；') || '按门店规则命中';
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const first = Object.values(record).flatMap((item) => Array.isArray(item) ? item : [item]).find(Boolean);
      if (first) return String(first);
    }
    if (typeof value === 'string' && value.trim()) return value;
    return '按门店规则命中';
  }

  private ruleHash(rules: unknown[], relation: string) {
    return createHash('sha256')
      .update(this.stableStringify({ relation, rules }))
      .digest('hex')
      .slice(0, 24);
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }
}
