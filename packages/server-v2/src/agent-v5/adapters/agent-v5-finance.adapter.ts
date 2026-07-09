import { Injectable } from '@nestjs/common';
import { AgentV5BusinessToolAdapter } from './agent-v5-business-tool.adapter.js';
import type { AgentV5AdapterResult, AgentV5VerticalAdapter, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5FinanceAdapter implements AgentV5VerticalAdapter {
  readonly adapterCode = 'finance';

  constructor(private readonly businessTool: AgentV5BusinessToolAdapter) {}

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    const base = await this.businessTool.financeMargin({ actor: input.actor });
    return {
      ...base,
      title: '财务收入与毛利复盘',
      evidence: {
        ...(base.evidence ?? {}),
        sources: Array.from(new Set([...(base.evidence?.sources ?? []), 'DailySettlement', 'OperationProfit'])),
        domains: Array.from(new Set([...(base.evidence?.domains ?? []), 'finance'])),
        concepts: Array.from(new Set([...(base.evidence?.concepts ?? []), 'finance_margin'])),
        limitations: [
          ...(base.evidence?.limitations ?? []),
          '财务 adapter 输出经营复盘口径，不替代正式结算和审计。',
        ],
      },
    };
  }
}
