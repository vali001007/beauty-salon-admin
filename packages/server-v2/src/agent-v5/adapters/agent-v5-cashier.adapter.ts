import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuraResponseBlock } from '../../agent/agent.types.js';
import type { AgentV5AdapterResult, AgentV5VerticalAdapter, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5CashierAdapter implements AgentV5VerticalAdapter {
  readonly adapterCode = 'cashier';

  constructor(private readonly prisma: PrismaService) {}

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    const range = this.todayRange();
    const [orders, usageRecords] = await Promise.all([
      this.safeFindMany('productOrder', {
        where: { storeId: input.actor.storeId, createdAt: { gte: range.start, lt: range.end } },
        take: 30,
        orderBy: { createdAt: 'desc' },
      }),
      this.safeFindMany('cardUsageRecord', {
        where: { storeId: input.actor.storeId, createdAt: { gte: range.start, lt: range.end } },
        take: 30,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const netAmount = orders.reduce((sum, order) => sum + Number(order.netAmount ?? order.totalAmount ?? 0), 0);
    const summary = `今日收银复盘：订单 ${orders.length} 单，核销/扣次记录 ${usageRecords.length} 条，净收入口径约 ${Math.round(netAmount)} 元。`;
    return {
      status: orders.length || usageRecords.length ? 'success' : 'no_data',
      title: '收银核销复盘',
      summary,
      data: { orders, usageRecords, netAmount },
      evidence: {
        sources: ['ProductOrder', 'CardUsageRecord'],
        domains: ['order', 'finance'],
        concepts: ['cashier_reconciliation', 'card_usage'],
        filters: [`storeId=${input.actor.storeId}`, `date=${range.label}`],
        sampleSize: orders.length + usageRecords.length,
        metrics: { orderCount: orders.length, usageRecordCount: usageRecords.length, netAmount: Math.round(netAmount) },
        limitations: ['收银核销 adapter 只做事实复盘和异常提示，不执行退款、扣次、改订单。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '收银核销复盘', content: summary },
        { kind: 'kpi_card', label: '订单', value: String(orders.length), unit: '单' },
        { kind: 'kpi_card', label: '核销记录', value: String(usageRecords.length), unit: '条' },
        { kind: 'kpi_card', label: '净收入', value: String(Math.round(netAmount)), unit: '元' },
        ...this.tableBlocks(['订单', '客户', '金额', '状态'], orders.slice(0, 8).map((order) => [
          String(order.orderNo ?? order.id ?? '-'),
          String(order.customerId ?? '-'),
          String(order.netAmount ?? order.totalAmount ?? 0),
          String(order.status ?? '-'),
        ]), '来源：ProductOrder'),
      ],
    };
  }

  private async safeFindMany(delegateName: string, args: Record<string, unknown>): Promise<any[]> {
    const delegate = (this.prisma as any)[delegateName];
    if (!delegate?.findMany) return [];
    const rows = await delegate.findMany(args).catch(() => []);
    return Array.isArray(rows) ? rows : [];
  }

  private tableBlocks(columns: string[], rows: string[][], caption: string): AuraResponseBlock[] {
    return rows.length ? [{ kind: 'table', columns, rows, caption }] : [];
  }

  private todayRange() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, label: start.toISOString().slice(0, 10) };
  }
}
