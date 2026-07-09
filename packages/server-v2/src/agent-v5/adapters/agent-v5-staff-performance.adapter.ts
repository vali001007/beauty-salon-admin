import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuraResponseBlock } from '../../agent/agent.types.js';
import type { AgentV5AdapterResult, AgentV5VerticalAdapter, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5StaffPerformanceAdapter implements AgentV5VerticalAdapter {
  readonly adapterCode = 'staff_performance';

  constructor(private readonly prisma: PrismaService) {}

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    const range = this.monthRange();
    const [commissions, reservations] = await Promise.all([
      this.safeFindMany('commissionRecord', {
        where: { storeId: input.actor.storeId, createdAt: { gte: range.start, lt: range.end } },
        take: 100,
        orderBy: { createdAt: 'desc' },
      }),
      this.safeFindMany('reservation', {
        where: { storeId: input.actor.storeId, date: { gte: range.start, lt: range.end } },
        take: 100,
        orderBy: { date: 'desc' },
      }),
    ]);
    const summary = `本月员工业绩复盘：提成记录 ${commissions.length} 条，服务/预约记录 ${reservations.length} 条。`;
    return {
      status: commissions.length || reservations.length ? 'success' : 'no_data',
      title: '员工业绩诊断',
      summary,
      data: { commissions, reservations },
      evidence: {
        sources: ['CommissionRecord', 'Reservation'],
        domains: ['staff', 'service'],
        concepts: ['staff_performance'],
        filters: [`storeId=${input.actor.storeId}`, `month=${range.label}`],
        sampleSize: commissions.length + reservations.length,
        metrics: { commissionRecordCount: commissions.length, reservationCount: reservations.length },
        limitations: ['员工业绩 adapter 先做经营诊断，不直接改提成或薪酬结算。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '员工业绩诊断', content: summary },
        { kind: 'kpi_card', label: '提成记录', value: String(commissions.length), unit: '条' },
        { kind: 'kpi_card', label: '服务/预约', value: String(reservations.length), unit: '条' },
        ...this.tableBlocks(['员工', '类型', '金额/状态'], commissions.slice(0, 8).map((item) => [
          String(item.staffId ?? item.userId ?? item.beauticianId ?? '-'),
          String(item.type ?? item.sourceType ?? '-'),
          String(item.amount ?? item.commissionAmount ?? '-'),
        ]), '来源：CommissionRecord'),
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

  private monthRange() {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end, label: start.toISOString().slice(0, 7) };
  }
}
