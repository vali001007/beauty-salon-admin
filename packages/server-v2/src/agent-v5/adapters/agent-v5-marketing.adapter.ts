import { Injectable } from '@nestjs/common';
import { AgentV5LifecycleAdapter } from './agent-v5-lifecycle.adapter.js';
import type { AgentV5AdapterResult, AgentV5VerticalAdapter, AgentV5VerticalAdapterInput } from '../agent-v5.types.js';

@Injectable()
export class AgentV5MarketingAdapter implements AgentV5VerticalAdapter {
  readonly adapterCode = 'marketing';

  constructor(private readonly lifecycle: AgentV5LifecycleAdapter) {}

  async execute(input: AgentV5VerticalAdapterInput): Promise<AgentV5AdapterResult> {
    const base = await this.lifecycle.reviewAttribution({ actor: input.actor });
    return {
      ...base,
      title: '营销增长与归因诊断',
      summary: base.status === 'no_data'
        ? '当前暂无营销归因事件，可先重建生命周期归因或查看待触达机会。'
        : `${base.summary} 可继续按机会类型、触达渠道和客户阶段拆解。`,
      evidence: {
        ...(base.evidence ?? {}),
        sources: Array.from(new Set([...(base.evidence?.sources ?? []), 'MarketingActivity', 'RecommendationEvent'])),
        domains: Array.from(new Set([...(base.evidence?.domains ?? []), 'marketing'])),
        concepts: Array.from(new Set([...(base.evidence?.concepts ?? []), 'marketing_growth'])),
        limitations: [
          ...(base.evidence?.limitations ?? []),
          '营销增长 adapter 只生成诊断、计划和审批建议，不自动发券或群发。',
        ],
      },
    };
  }
}
