import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AgentActor, AuraResponseBlock } from '../../agent/agent.types.js';
import type { AgentV5AdapterResult } from '../agent-v5.types.js';

@Injectable()
export class AgentV5BusinessToolAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async overview(input: { actor: AgentActor }): Promise<AgentV5AdapterResult> {
    const range = this.todayRange();
    const [orders, reservations, opportunities] = await Promise.all([
      this.safeCount('productOrder', { where: { storeId: input.actor.storeId, createdAt: { gte: range.start, lt: range.end } } }),
      this.safeCount('reservation', { where: { storeId: input.actor.storeId, date: { gte: range.start, lt: range.end } } }),
      this.safeCount('customerOpportunity', { where: { storeId: input.actor.storeId, status: 'open' } }),
    ]);
    const summary = `今日经营概览：订单 ${orders} 单，预约 ${reservations} 个，待处理生命周期机会 ${opportunities} 个。`;
    return {
      status: 'success',
      title: '全业务经营概览',
      summary,
      data: { orders, reservations, opportunities },
      evidence: {
        sources: ['ProductOrder', 'Reservation', 'CustomerOpportunity'],
        domains: ['store_business', 'order', 'reservation', 'customer'],
        concepts: ['business_overview'],
        filters: [`storeId=${input.actor.storeId}`, `date=${range.label}`],
        sampleSize: orders + reservations + opportunities,
        metrics: { orders, reservations, opportunities },
        limitations: ['经营概览先做轻量事实汇总，复杂财务口径仍走受控问数或财务指标服务。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '全业务经营概览', content: summary },
        { kind: 'kpi_card', label: '今日订单', value: String(orders), unit: '单' },
        { kind: 'kpi_card', label: '今日预约', value: String(reservations), unit: '个' },
        { kind: 'kpi_card', label: '生命周期机会', value: String(opportunities), unit: '个' },
      ],
    };
  }

  async inventoryRisk(input: { actor: AgentActor }): Promise<AgentV5AdapterResult> {
    const items = await this.safeFindMany('product', {
      where: { storeId: input.actor.storeId, status: 'active' },
      take: 30,
      orderBy: { updatedAt: 'desc' },
    });
    const risky = items
      .filter((item) => Number(item.currentStock ?? 0) <= Number(item.safetyStock ?? 0))
      .slice(0, 10);
    const summary = risky.length
      ? `发现 ${risky.length} 个商品低于或接近安全库存，建议优先结合生命周期机会做承接判断。`
      : '当前未发现明显低于安全库存的商品。';
    return {
      status: risky.length ? 'success' : 'no_data',
      title: '库存风险诊断',
      summary,
      data: { items: risky },
      evidence: {
        sources: ['Product'],
        domains: ['inventory'],
        concepts: ['inventory_risk'],
        filters: [`storeId=${input.actor.storeId}`, 'currentStock<=safetyStock'],
        sampleSize: risky.length,
        facts: risky.map((item) => ({
          source: 'Product',
          id: item.id,
          label: item.name ?? item.sku ?? `product_${item.id}`,
          value: `库存${item.currentStock ?? 0}/安全${item.safetyStock ?? 0}`,
        })),
        limitations: ['库存风险只做承接能力判断，不扣减库存。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '库存风险诊断', content: summary },
        ...this.tableBlocks(['商品', '当前库存', '安全库存'], risky.map((item) => [
          item.name ?? item.sku ?? '-',
          String(item.currentStock ?? 0),
          String(item.safetyStock ?? 0),
        ]), '来源：Product'),
      ],
    };
  }

  async reservationCoordination(input: { actor: AgentActor }): Promise<AgentV5AdapterResult> {
    const range = this.todayRange();
    const reservations = await this.safeFindMany('reservation', {
      where: { storeId: input.actor.storeId, date: { gte: range.start, lt: range.end } },
      take: 20,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const summary = reservations.length
      ? `今日有 ${reservations.length} 个预约，需要结合到店、核销和排班空档做承接。`
      : '今日暂无预约记录，可结合低峰产能机会安排客户跟进。';
    return {
      status: reservations.length ? 'success' : 'no_data',
      title: '预约与排班协同',
      summary,
      data: { reservations },
      evidence: {
        sources: ['Reservation'],
        domains: ['reservation', 'staff'],
        concepts: ['reservation_coordination'],
        filters: [`storeId=${input.actor.storeId}`, `date=${range.label}`],
        sampleSize: reservations.length,
        limitations: ['V5 只生成排班协同建议，不自动改排班。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '预约与排班协同', content: summary },
        ...this.tableBlocks(['时间', '客户', '项目', '状态'], reservations.slice(0, 10).map((item) => [
          item.startTime ?? '-',
          String(item.customerId ?? '-'),
          String(item.projectId ?? '-'),
          item.status ?? '-',
        ]), '来源：Reservation'),
      ],
    };
  }

  async financeMargin(input: { actor: AgentActor }): Promise<AgentV5AdapterResult> {
    const range = this.todayRange();
    const orders = await this.safeFindMany('productOrder', {
      where: { storeId: input.actor.storeId, createdAt: { gte: range.start, lt: range.end } },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    const netAmount = orders.reduce((sum, order) => sum + Number(order.netAmount ?? order.totalAmount ?? 0), 0);
    const summary = `今日收入口径订单 ${orders.length} 单，净收入约 ${Math.round(netAmount)} 元。毛利拆解需继续接财务成本口径。`;
    return {
      status: orders.length ? 'success' : 'no_data',
      title: '收入与毛利诊断',
      summary,
      data: { orders: orders.length, netAmount },
      evidence: {
        sources: ['ProductOrder'],
        domains: ['finance', 'order'],
        concepts: ['finance_margin'],
        filters: [`storeId=${input.actor.storeId}`, `date=${range.label}`],
        sampleSize: orders.length,
        metrics: { netAmount: Math.round(netAmount), orderCount: orders.length },
        limitations: ['此处为轻量经营口径，不替代正式财务报表。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '收入与毛利诊断', content: summary },
        { kind: 'kpi_card', label: '今日净收入', value: String(Math.round(netAmount)), unit: '元' },
        { kind: 'kpi_card', label: '订单数', value: String(orders.length), unit: '单' },
      ],
    };
  }

  private async safeCount(delegateName: string, args: Record<string, unknown>) {
    const delegate = (this.prisma as any)[delegateName];
    if (!delegate?.count) return 0;
    return Number(await delegate.count(args).catch(() => 0));
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
