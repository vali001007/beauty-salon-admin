import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export type MetricSource = 'actual' | 'predicted' | 'estimated';
export type MarketingFactType =
  | 'exposure'
  | 'delivery'
  | 'open'
  | 'click'
  | 'lead'
  | 'conversion'
  | 'revenue'
  | 'revenue_refund'
  | 'cost';

export type MarketingFactDimensions = {
  recommendationInstanceId?: string | null;
  adoptionId?: number | null;
  activityId?: number | null;
  pageId?: number | null;
  strategyId?: number | null;
  executionId?: number | null;
  touchId?: number | null;
  deliveryJobId?: number | null;
  terminalFollowUpTaskId?: number | null;
  promotionId?: number | null;
  customerId?: number | null;
  orderId?: number | null;
  refundId?: number | null;
  channel?: string | null;
};

export type RecordMarketingFactInput = {
  storeId: number;
  factType: MarketingFactType;
  metricSource: MetricSource;
  sourceSystem: string;
  sourceEventId: string;
  countValue?: number;
  amountValue?: number;
  dimensions: MarketingFactDimensions;
  isPrimary?: boolean;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
};

export type MarketingMetric = {
  value: number;
  source: MetricSource;
  definition: string;
};

type EffectQuery = {
  objectType?: string;
  startDate?: Date | string;
  endDate?: Date | string;
};

@Injectable()
export class MarketingEffectFactService {
  constructor(private readonly prisma: PrismaService) {}

  recordFact(input: RecordMarketingFactInput, tx: any = this.prisma) {
    const data = {
      storeId: input.storeId,
      factType: input.factType,
      metricSource: input.metricSource,
      sourceSystem: input.sourceSystem,
      sourceEventId: input.sourceEventId,
      countValue: input.countValue ?? null,
      amountValue: input.amountValue ?? null,
      ...input.dimensions,
      isPrimary: input.isPrimary ?? true,
      metadataJson: input.metadata ?? undefined,
      occurredAt: input.occurredAt,
    };
    return tx.marketingEffectFact.upsert({
      where: {
        sourceSystem_sourceEventId_factType: {
          sourceSystem: input.sourceSystem,
          sourceEventId: input.sourceEventId,
          factType: input.factType,
        },
      },
      create: data,
      update: {},
    });
  }

  async getUnifiedEffects(storeId: number, query: EffectQuery = {}) {
    const occurredAt = this.dateRange(query.startDate, query.endDate);
    const facts = await this.prisma.marketingEffectFact.findMany({
      where: { storeId, ...(occurredAt ? { occurredAt } : {}) },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
    const primaryFacts = facts.filter((fact: any) => fact.isPrimary !== false);
    const summary = this.metrics(primaryFacts);
    return {
      summary,
      dimensions: {
        activities: this.group(facts, 'activityId', 'activity'),
        recommendations: this.group(facts, 'recommendationInstanceId', 'recommendation'),
        promotions: this.group(facts, 'promotionId', 'promotion'),
        pages: this.group(facts, 'pageId', 'page'),
        strategies: this.group(facts, 'strategyId', 'strategy'),
        channels: this.group(facts, 'channel', 'channel'),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  private group(facts: any[], field: string, type: string) {
    const groups = new Map<string, any[]>();
    for (const fact of facts) {
      const value = fact[field];
      if (value === null || value === undefined || value === '') continue;
      const key = String(value);
      const list = groups.get(key) ?? [];
      list.push(fact);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([id, values]) => ({
      id: /^\d+$/.test(id) ? Number(id) : id,
      objectType: type,
      name: `${type} #${id}`,
      ...this.metrics(values.filter((fact) => fact.isPrimary !== false)),
    }));
  }

  private metrics(facts: any[]) {
    const exposureFacts = facts.filter((fact) => ['exposure', 'delivery'].includes(fact.factType));
    const clickFacts = facts.filter((fact) => fact.factType === 'click');
    const conversionFacts = facts.filter((fact) => fact.factType === 'conversion');
    const revenueFacts = facts.filter((fact) => ['revenue', 'revenue_refund'].includes(fact.factType));
    const costFacts = facts.filter((fact) => fact.factType === 'cost');
    const revenue = this.sumAmount(revenueFacts);
    const cost = this.sumAmount(costFacts);
    return {
      exposure: this.countMetric(exposureFacts, '实际页面曝光和真实渠道投递次数'),
      clicks: this.countMetric(clickFacts, '营销页面和客户触点的实际点击次数'),
      conversions: this.countMetric(conversionFacts, '唯一主归因转化次数'),
      revenue: this.amountMetric(revenue, this.sourceOf(revenueFacts, 'actual'), '订单主归因收入减退款冲减'),
      cost: this.amountMetric(cost, this.sourceOf(costFacts, 'estimated'), '渠道或活动成本；缺少真实账单时为估算'),
      roi: this.amountMetric(cost > 0 ? this.round(revenue / cost) : 0, costFacts.some((fact) => fact.metricSource === 'estimated') ? 'estimated' : 'actual', '归因净收入除以营销成本'),
    };
  }

  private countMetric(facts: any[], definition: string): MarketingMetric {
    const value = facts.reduce((sum, fact) => sum + Number(fact.countValue ?? 1), 0);
    return { value: this.round(value), source: this.sourceOf(facts, 'actual'), definition };
  }

  private amountMetric(value: number, source: MetricSource, definition: string): MarketingMetric {
    return { value: this.round(value), source, definition };
  }

  private sumAmount(facts: any[]) {
    return facts.reduce((sum, fact) => sum + Number(fact.amountValue ?? 0), 0);
  }

  private sourceOf(facts: any[], fallback: MetricSource): MetricSource {
    if (facts.some((fact) => fact.metricSource === 'actual')) return 'actual';
    if (facts.some((fact) => fact.metricSource === 'predicted')) return 'predicted';
    if (facts.some((fact) => fact.metricSource === 'estimated')) return 'estimated';
    return fallback;
  }

  private dateRange(start?: Date | string, end?: Date | string) {
    if (!start && !end) return null;
    return {
      ...(start ? { gte: new Date(start) } : {}),
      ...(end ? { lte: new Date(end) } : {}),
    };
  }

  private round(value: number) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }
}
