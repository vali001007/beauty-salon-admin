import { Injectable } from '@nestjs/common';
import { AgentV5BusinessToolAdapter } from './agent-v5-business-tool.adapter.js';
import type { AgentV5AdapterResult, AgentV5VerticalAdapter, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5ScheduleAdapter implements AgentV5VerticalAdapter {
  readonly adapterCode = 'schedule';

  constructor(private readonly businessTool: AgentV5BusinessToolAdapter) {}

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    const base = await this.businessTool.reservationCoordination({ actor: input.actor });
    return {
      ...base,
      title: '预约与排班协同',
      evidence: {
        ...(base.evidence ?? {}),
        sources: Array.from(new Set([...(base.evidence?.sources ?? []), 'Schedule'])),
        domains: Array.from(new Set([...(base.evidence?.domains ?? []), 'schedule'])),
        concepts: Array.from(new Set([...(base.evidence?.concepts ?? []), 'capacity_coordination'])),
        limitations: [
          ...(base.evidence?.limitations ?? []),
          '排班 adapter 只判断现场承接建议，不自动改排班。',
        ],
      },
    };
  }
}
