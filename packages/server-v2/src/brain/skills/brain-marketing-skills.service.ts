import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class BrainMarketingSkillsService {
  constructor(private readonly prisma?: PrismaService) {}

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
    const [touches, attributions, strategies] = await Promise.all([
      this.prisma.marketingAutomationTouch.findMany({
        where: {
          customer: { storeId: input.storeId, deletedAt: null },
          touchedAt: { gte: input.startDate, lte: input.endDate },
        },
        select: { status: true, channel: true, convertedAt: true, actualRevenue: true, strategyId: true },
        take: 5000,
      }),
      this.prisma.marketingAttribution.findMany({
        where: {
          customer: { storeId: input.storeId, deletedAt: null },
          occurredAt: { gte: input.startDate, lte: input.endDate },
        },
        include: { strategy: { select: { id: true, name: true } } },
        take: 5000,
      }),
      this.prisma.marketingAutomationStrategy.findMany({
        where: { touches: { some: { customer: { storeId: input.storeId, deletedAt: null } } } },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
    ]);
    const channelMap = new Map<string, { reached: number; converted: number; revenue: number }>();
    for (const touch of touches) {
      const channel = touch.channel || '未记录渠道';
      const current = channelMap.get(channel) ?? { reached: 0, converted: 0, revenue: 0 };
      current.reached += 1;
      current.converted += touch.convertedAt || touch.status === 'converted' ? 1 : 0;
      current.revenue += this.toNumber(touch.actualRevenue);
      channelMap.set(channel, current);
    }
    const attributedRevenue = attributions.reduce((sum, item) => sum + this.toNumber(item.attributedRevenue), 0);
    const convertedCount = touches.filter((touch) => touch.convertedAt || touch.status === 'converted').length;
    return {
      reachedCount: touches.length,
      convertedCount,
      conversionRate: touches.length ? convertedCount / touches.length : 0,
      attributedRevenue,
      channels: [...channelMap.entries()]
        .map(([channel, value]) => ({ channel, ...value, conversionRate: value.reached ? value.converted / value.reached : 0 }))
        .sort((left, right) => right.converted - left.converted || right.revenue - left.revenue),
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
      attributionByStrategy: [...new Map(attributions.map((item) => [item.strategy.id, item.strategy.name])).entries()].map(([id, name]) => ({
        id,
        name,
        revenue: attributions.filter((item) => item.strategyId === id).reduce((sum, item) => sum + this.toNumber(item.attributedRevenue), 0),
      })),
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
