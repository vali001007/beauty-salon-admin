import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainMarketingSkillsService {
  constructor(private readonly prisma?: PrismaService) {}

  async buildFollowUpPriorityRows(input: { storeId: number; asOf: Date }) {
    return (await this.buildFollowUpPrioritySnapshot(input)).rows;
  }

  async buildFollowUpPrioritySnapshot(input: { storeId: number; asOf: Date }) {
    if (!this.prisma) throw new Error('marketing_follow_up_prisma_not_configured');
    const opportunityRows = await this.prisma.$queryRaw<Array<{
      customerId: number;
      customerName: string;
      opportunityType: string;
      priority: string;
      score: number;
      updatedAt: Date;
    }>>(Prisma.sql`
      WITH ranked_opportunities AS (
        SELECT
          opportunity."customerId",
          customer."name" AS "customerName",
          opportunity."opportunityType",
          opportunity."priority",
          opportunity."score",
          opportunity."updatedAt",
          ROW_NUMBER() OVER (
            PARTITION BY opportunity."customerId"
            ORDER BY opportunity."score" DESC, opportunity."updatedAt" DESC, opportunity."id" DESC
          ) AS row_number
        FROM "CustomerOpportunity" opportunity
        INNER JOIN "Customer" customer ON customer."id" = opportunity."customerId"
        WHERE opportunity."storeId" = ${input.storeId}
          AND opportunity."status" = 'open'
          AND opportunity."createdAt" <= ${input.asOf}
          AND (opportunity."expiresAt" IS NULL OR opportunity."expiresAt" >= ${input.asOf})
          AND customer."deletedAt" IS NULL
      )
      SELECT
        "customerId",
        "customerName",
        "opportunityType",
        "priority",
        "score",
        "updatedAt"
      FROM ranked_opportunities
      WHERE row_number = 1
      ORDER BY "score" DESC, "updatedAt" DESC, "customerId" ASC
      LIMIT 5001
    `);
    const truncated = opportunityRows.length > 5000;
    const opportunities = opportunityRows.slice(0, 5000);
    const rows = opportunities.map((opportunity) => ({
      customerId: opportunity.customerId,
      customerName: opportunity.customerName,
      score: opportunity.score,
      opportunityType: opportunity.opportunityType,
      priority: opportunity.priority,
    }));
    return { rows, truncated, scannedOpportunityCount: opportunities.length };
  }

  draftAppointmentReminder(input: { customerName?: string; timeWindow?: string }) {
    const prefix = input.customerName ? `${input.customerName}您好` : '您好';
    return `${prefix}，店里${input.timeWindow ?? '近期'}有可预约空档，方便的话可以回复我帮您安排。`;
  }

  draftCustomerRecall(input: { customerName?: string; offer?: string }) {
    const prefix = input.customerName ? `${input.customerName}您好` : '您好';
    const offer = input.offer ? `，这次可为您预留${input.offer}` : '';
    return `${prefix}，最近护理节奏可以衔接起来了${offer}。方便的话回复我，我帮您安排合适时间。`;
  }

  draftCampaignPlan(input: { theme?: string }) {
    const theme = input.theme ?? '门店促销';
    return `${theme}活动方案：
1. 目标客群：优先触达近 90 天有消费记录的老客和会员。
2. 权益设计：用护理套餐加赠或预约礼替代大额折扣，先保护毛利。
3. 执行节奏：先小范围试发，再根据预约和核销反馈扩大触达。
4. 上线前检查：确认可预约档期、库存和员工接待能力。`;
  }

  async buildMarketingAnalytics(input: { storeId: number; startDate: Date; endDate: Date }) {
    if (!this.prisma) throw new Error('marketing_analytics_prisma_not_configured');
    const touchWhere: Prisma.MarketingAutomationTouchWhereInput = {
      customer: { storeId: input.storeId, deletedAt: null },
      touchedAt: { gte: input.startDate, lte: input.endDate },
    };
    const conversionWhere: Prisma.MarketingAutomationTouchWhereInput = {
      ...touchWhere,
      OR: [{ convertedAt: { not: null } }, { status: 'converted' }],
    };
    const attributionWhere: Prisma.MarketingAttributionWhereInput = {
      customer: { storeId: input.storeId, deletedAt: null },
      occurredAt: { gte: input.startDate, lte: input.endDate },
    };
    const [reachedCount, convertedCount, channelTotals, channelConversions, attributionGroups, strategyRows] = await Promise.all([
      this.prisma.marketingAutomationTouch.count({ where: touchWhere }),
      this.prisma.marketingAutomationTouch.count({ where: conversionWhere }),
      this.prisma.marketingAutomationTouch.groupBy({
        by: ['channel'],
        where: touchWhere,
        _count: { _all: true },
        _sum: { actualRevenue: true },
      }),
      this.prisma.marketingAutomationTouch.groupBy({
        by: ['channel'],
        where: conversionWhere,
        _count: { _all: true },
      }),
      this.prisma.marketingAttribution.groupBy({
        by: ['strategyId'],
        where: attributionWhere,
        _sum: { attributedRevenue: true },
      }),
      this.prisma.marketingAutomationStrategy.findMany({
        where: { storeId: input.storeId },
        orderBy: { updatedAt: 'desc' },
        take: 31,
      }),
    ]);
    const strategiesTruncated = strategyRows.length > 30;
    const strategies = strategyRows.slice(0, 30);
    const convertedByChannel = new Map(channelConversions.map((item) => [item.channel ?? '未记录渠道', item._count._all]));
    const channels = channelTotals.map((item) => {
      const channel = item.channel ?? '未记录渠道';
      const reached = item._count._all;
      const converted = convertedByChannel.get(channel) ?? 0;
      const revenue = this.toNumber(item._sum.actualRevenue);
      return { channel, reached, converted, revenue, conversionRate: reached ? converted / reached : 0 };
    }).sort((left, right) => right.converted - left.converted || right.revenue - left.revenue);
    const attributionStrategyIds = attributionGroups.map((item) => item.strategyId);
    const attributionStrategies = attributionStrategyIds.length
      ? await this.prisma.marketingAutomationStrategy.findMany({
          where: { storeId: input.storeId, id: { in: attributionStrategyIds } },
          select: { id: true, name: true },
        })
      : [];
    const strategyNames = new Map(attributionStrategies.map((strategy) => [strategy.id, strategy.name]));
    const attributionByStrategy = attributionGroups
      .map((item) => ({
        id: item.strategyId,
        name: strategyNames.get(item.strategyId) ?? `策略 ${item.strategyId}`,
        revenue: this.toNumber(item._sum.attributedRevenue),
      }))
      .sort((left, right) => right.revenue - left.revenue);
    const attributedRevenue = attributionByStrategy.reduce((sum, item) => sum + item.revenue, 0);
    return {
      reachedCount,
      convertedCount,
      conversionRate: reachedCount ? convertedCount / reachedCount : 0,
      attributedRevenue,
      channels,
      strategies: strategies.map((strategy) => ({
        id: strategy.id,
        name: strategy.name,
        status: strategy.status,
        executionType: strategy.executionType,
        schedule: strategy.schedule,
        triggerRules: strategy.triggerRules,
        actions: strategy.actions,
        lastExecutedAt: strategy.lastExecutedAt,
      })),
      attributionByStrategy,
      dataCoverage: {
        touchesTruncated: false,
        attributionsTruncated: false,
        strategiesTruncated,
        touchSampleSize: reachedCount,
        attributionSampleSize: attributionGroups.length,
      },
    };
  }

  private toNumber(value: unknown) {
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') return Number(value);
    if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
    return 0;
  }
}
