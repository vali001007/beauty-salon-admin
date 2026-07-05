import { Injectable } from '@nestjs/common';
import type { AgentEvidence, AgentToolExecutionContext, AgentToolResult } from '../../agent/agent.types.js';
import { formatBusinessDate } from '../../common/utils/business-time.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const DAY_MS = 86_400_000;

type AgentV2DateRange = {
  start: Date;
  end: Date;
  label: string;
  preset: string;
};

@Injectable()
export class AgentV2BusinessTrendQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const capabilityId = String(args.capabilityId ?? '');
    if (capabilityId === 'finance.revenue.trend') return this.getRevenueTrend(args, context);
    return {
      status: 'unsupported',
      title: '暂不支持的趋势查询',
      summary: `V2 趋势查询暂未支持 ${capabilityId || 'unknown'}。`,
      data: { capabilityId },
      evidence: this.evidence(['AgentV2CapabilityManifest'], '当前能力没有可执行趋势查询器。', [], 0),
      actions: [],
    };
  }

  private async getRevenueTrend(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolResult> {
    const range = this.resolveDateRange(args);
    const orders = await (this.prisma as any).productOrder.findMany({
      where: {
        storeId: context.storeId,
        createdAt: { gte: range.start, lt: range.end },
        status: { notIn: ['cancelled', 'void', '作废', '已取消'] },
      },
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        totalAmount: true,
        netAmount: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 5000,
    });

    const grouped = new Map<string, { date: string; revenue: number; orderCount: number }>();
    for (const order of orders as any[]) {
      const date = this.formatDate(order.createdAt);
      const current = grouped.get(date) ?? { date, revenue: 0, orderCount: 0 };
      current.revenue += this.toNumber(order.netAmount ?? order.totalAmount);
      current.orderCount += 1;
      grouped.set(date, current);
    }

    const rows = Array.from(grouped.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        date: row.date,
        revenue: Number(row.revenue.toFixed(2)),
        revenueText: this.formatMoney(row.revenue),
        orderCount: row.orderCount,
        avgOrderValue: row.orderCount > 0 ? Number((row.revenue / row.orderCount).toFixed(2)) : 0,
        avgOrderValueText: this.formatMoney(row.orderCount > 0 ? row.revenue / row.orderCount : 0),
      }));

    const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const totalOrderCount = rows.reduce((sum, row) => sum + row.orderCount, 0);
    const firstRevenue = rows[0]?.revenue ?? 0;
    const lastRevenue = rows[rows.length - 1]?.revenue ?? 0;
    const revenueChange = rows.length >= 2 ? lastRevenue - firstRevenue : 0;
    const revenueChangeRate = firstRevenue > 0 ? (revenueChange / firstRevenue) * 100 : 0;
    const trendDirection = revenueChange > 0 ? '上升' : revenueChange < 0 ? '下降' : '持平';
    const evidence = this.evidence(
      ['ProductOrder'],
      '营业额趋势 = ProductOrder.netAmount 按业务日期聚合；排除已取消或作废订单。',
      [`storeId=${context.storeId}`, this.rangeFilterText('ProductOrder.createdAt', range), 'status not in cancelled/void'],
      (orders as any[]).length,
      range,
      ['趋势只读取已落库订单，不自动补生成日结，也不修改订单或收银记录。'],
    );

    if (!rows.length) {
      return {
        status: 'no_data',
        title: '营业额趋势',
        summary: `${range.label}没有可用于趋势统计的订单。`,
        data: {
          items: rows,
          rows,
          chart: this.chart(rows),
          metrics: this.metrics(totalRevenue, totalOrderCount, revenueChange, revenueChangeRate, trendDirection),
          timeRange: this.serializeRange(range),
        },
        evidence,
        actions: [{ label: '查看订单明细', action: 'order:open-management', riskLevel: 'low' }],
      };
    }

    return {
      status: 'success',
      title: '营业额趋势',
      summary: `${range.label}营业额 ${this.formatMoney(totalRevenue)}，订单 ${totalOrderCount} 单，趋势${trendDirection}。`,
      data: {
        items: rows,
        rows,
        chart: this.chart(rows),
        metrics: this.metrics(totalRevenue, totalOrderCount, revenueChange, revenueChangeRate, trendDirection),
        timeRange: this.serializeRange(range),
      },
      evidence,
      actions: [{ label: '查看订单明细', action: 'order:open-management', riskLevel: 'low' }],
    };
  }

  private chart(rows: Array<Record<string, unknown>>) {
    return {
      chartType: 'line',
      title: '营业额趋势',
      data: rows,
      xKey: 'date',
      yKeys: ['revenue'],
    };
  }

  private metrics(totalRevenue: number, totalOrderCount: number, revenueChange: number, revenueChangeRate: number, trendDirection: string) {
    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalRevenueText: this.formatMoney(totalRevenue),
      orderCount: totalOrderCount,
      avgOrderValueText: this.formatMoney(totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0),
      revenueChange: Number(revenueChange.toFixed(2)),
      revenueChangeText: this.formatMoney(revenueChange),
      revenueChangeRate: Number(revenueChangeRate.toFixed(1)),
      revenueChangeRateText: `${Number(revenueChangeRate || 0).toFixed(1)}%`,
      trendDirection,
    };
  }

  private resolveDateRange(args: Record<string, unknown>): AgentV2DateRange {
    const input = args.timeRange;
    const now = new Date();
    if (typeof input === 'object' && input !== null && (input as any).startDate && (input as any).endDate) {
      return {
        start: new Date(String((input as any).startDate)),
        end: new Date(`${String((input as any).endDate).slice(0, 10)}T23:59:59.999Z`),
        label: String((input as any).label ?? '自定义时间'),
        preset: String((input as any).preset ?? 'custom'),
      };
    }
    const preset = typeof input === 'object' && input !== null ? String((input as any).preset ?? '') : String(input ?? '');
    if (preset === 'today') {
      const start = this.startOfDay(now);
      return { start, end: new Date(start.getTime() + DAY_MS), label: '今天', preset };
    }
    if (preset === 'this_week') return { start: this.startOfWeek(now), end: now, label: '本周', preset };
    if (preset === 'this_month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: '本月', preset };
    const days = this.extractRecentDays(String(args.question ?? '')) ?? (preset === 'last_30_days' ? 30 : 7);
    const start = this.startOfDay(new Date(now.getTime() - Math.max(0, days - 1) * DAY_MS));
    return { start, end: now, label: `近 ${days} 天`, preset: `last_${days}_days` };
  }

  private extractRecentDays(question: string) {
    const raw = question.match(/(?:最近|近)\s*([一二两三四五六七八九十\d]{1,3})\s*天/)?.[1];
    if (!raw) return null;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return Math.min(numeric, 90);
    const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    if (raw === '十') return 10;
    if (raw.startsWith('十')) return 10 + (map[raw.slice(1)] ?? 0);
    if (raw.includes('十')) {
      const [tens, ones] = raw.split('十');
      return (map[tens] ?? 1) * 10 + (map[ones] ?? 0);
    }
    return map[raw] ?? null;
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private startOfWeek(date: Date) {
    const day = date.getDay() || 7;
    const start = this.startOfDay(date);
    return new Date(start.getTime() - (day - 1) * DAY_MS);
  }

  private evidence(source: string[], metricDefinition: string, filters: string[], sampleSize: number, range?: AgentV2DateRange, limitations?: string[]): AgentEvidence {
    return {
      source,
      sourceTables: source,
      dateRange: range ? `${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}` : undefined,
      metricDefinition,
      filters,
      sampleSize,
      limitations: limitations ?? ['只读取当前账号授权范围内的已落库业务数据，不执行写入。'],
    };
  }

  private serializeRange(range: AgentV2DateRange) {
    return { start: this.formatDate(range.start), end: this.formatDate(range.end), label: range.label, preset: range.preset };
  }

  private rangeFilterText(field: string, range: AgentV2DateRange) {
    return `${field}=${this.formatDate(range.start)} 至 ${this.formatDate(range.end)}`;
  }

  private formatDate(value: unknown) {
    if (!value) return '';
    return formatBusinessDate(value as Date);
  }

  private toNumber(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  }

  private formatMoney(value: number) {
    return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
