import { Injectable } from '@nestjs/common';
import { AgentV5BusinessToolAdapter } from './agent-v5-business-tool.adapter.js';
import type { AgentV5AdapterResult, AgentV5VerticalAdapter, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5BeauticianAdapter implements AgentV5VerticalAdapter {
  readonly adapterCode = 'beautician';

  constructor(private readonly businessTool: AgentV5BusinessToolAdapter) {}

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    const base = await this.businessTool.reservationCoordination({ actor: input.actor });
    return {
      ...base,
      title: '美容师今日服务',
      summary: base.status === 'no_data'
        ? '今日暂无预约服务记录，可结合低峰产能做客户关怀。'
        : `${base.summary} 美容师视角建议优先核对护理项目、客户禁忌和耗材准备。`,
      evidence: {
        ...(base.evidence ?? {}),
        sources: Array.from(new Set([...(base.evidence?.sources ?? []), 'BeauticianServiceContext'])),
        domains: Array.from(new Set([...(base.evidence?.domains ?? []), 'staff', 'service'])),
        concepts: Array.from(new Set([...(base.evidence?.concepts ?? []), 'beautician_service'])),
        limitations: [
          ...(base.evidence?.limitations ?? []),
          '美容师 adapter 只做服务准备和跟进建议，不自动改排班或客户档案。',
        ],
      },
    };
  }
}
