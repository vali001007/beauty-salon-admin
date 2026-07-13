import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuraResponseBlock } from '../../agent/agent.types.js';
import type { AgentV5AdapterResult, AgentV5VerticalAdapter, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5ReceptionAdapter implements AgentV5VerticalAdapter {
  readonly adapterCode = 'reception';

  constructor(private readonly prisma: PrismaService) {}

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    const customerName = input.route.entities.find((item) => item.type === 'Customer')?.name;
    const customers = await this.safeFindMany('customer', {
      where: {
        storeId: input.actor.storeId,
        ...(customerName ? { name: { contains: customerName } } : {}),
      },
      take: 8,
      orderBy: { updatedAt: 'desc' },
    });
    const customerIds = customers.map((item) => item.id).filter(Boolean);
    const cards = customerIds.length
      ? await this.safeFindMany('customerCard', {
        where: { storeId: input.actor.storeId, customerId: { in: customerIds } },
        take: 20,
        orderBy: { updatedAt: 'desc' },
      })
      : [];
    const summary = customers.length
      ? `已按前台查询口径找到 ${customers.length} 位客户，关联会员卡/权益 ${cards.length} 条。`
      : '当前没有匹配客户。可以补充客户姓名、手机号后四位或会员卡信息继续查。';
    return {
      status: customers.length ? 'success' : 'no_data',
      title: '前台客户查询',
      summary,
      data: { customers, cards },
      evidence: {
        sources: ['Customer', 'CustomerCard'],
        domains: ['customer'],
        concepts: ['customer', 'member_card'],
        filters: [`storeId=${input.actor.storeId}`, customerName ? `customerName~${customerName}` : 'latest_customers'],
        sampleSize: customers.length + cards.length,
        facts: customers.slice(0, 5).map((customer) => ({
          source: 'Customer',
          id: customer.id,
          label: customer.name ?? `customer_${customer.id}`,
          value: customer.level ?? customer.status ?? '',
        })),
        limitations: ['前台查询只返回可见客户与卡权益摘要，不展示完整手机号等高敏字段。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: '前台客户查询', content: summary },
        ...this.tableBlocks(['客户', '等级/状态', '会员卡数'], customers.map((customer) => [
          customer.name ?? `客户#${customer.id}`,
          customer.level ?? customer.status ?? '-',
          String(cards.filter((card) => Number(card.customerId) === Number(customer.id)).length),
        ]), '来源：Customer, CustomerCard'),
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
}
