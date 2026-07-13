import { Injectable } from '@nestjs/common';
import { AgentV5BusinessToolAdapter } from './agent-v5-business-tool.adapter.js';
import type { AgentV5AdapterResult, AgentV5VerticalAdapter, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5InventorySupplyAdapter implements AgentV5VerticalAdapter {
  readonly adapterCode = 'inventory_supply';

  constructor(private readonly businessTool: AgentV5BusinessToolAdapter) {}

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    const base = await this.businessTool.inventoryRisk({ actor: input.actor });
    return {
      ...base,
      title: '库存与供应承接风险',
      evidence: {
        ...(base.evidence ?? {}),
        sources: Array.from(new Set([...(base.evidence?.sources ?? []), 'ProjectBomItem', 'StockMovement'])),
        domains: Array.from(new Set([...(base.evidence?.domains ?? []), 'inventory', 'supply'])),
        concepts: Array.from(new Set([...(base.evidence?.concepts ?? []), 'inventory_supply_risk'])),
        limitations: [
          ...(base.evidence?.limitations ?? []),
          '库存供应 adapter 只做承接能力判断，不扣减库存、不自动下采购单。',
        ],
      },
    };
  }
}
