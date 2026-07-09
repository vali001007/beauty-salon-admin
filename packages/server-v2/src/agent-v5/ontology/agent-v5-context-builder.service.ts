import { Injectable } from '@nestjs/common';
import type { AgentActor } from '../../agent/agent.types.js';
import type { AgentV5RouteDecision } from '../agent-v5.types.js';

@Injectable()
export class AgentV5ContextBuilderService {
  build(input: { message: string; actor: AgentActor; route: AgentV5RouteDecision; context?: Record<string, unknown> }) {
    return {
      storeId: input.actor.storeId,
      userId: input.actor.userId,
      role: input.actor.role,
      personaCode: input.actor.personaCode,
      entrypoint: input.actor.entrypoint,
      route: input.route,
      timeRange: this.resolveTimeRange(input.message),
      boundary: 'agent_v5_independent_runtime_adapters_only',
      inheritedContext: input.context ?? {},
    };
  }

  private resolveTimeRange(message: string) {
    if (/今天|今日/.test(message)) return { preset: 'today', label: '今天' };
    if (/昨天/.test(message)) return { preset: 'yesterday', label: '昨天' };
    if (/本周|这周/.test(message)) return { preset: 'this_week', label: '本周' };
    if (/本月|这个月|这月/.test(message)) return { preset: 'this_month', label: '本月' };
    if (/最近.*30|近.*30/.test(message)) return { preset: 'last_30_days', label: '最近30天' };
    return { preset: 'auto', label: '自动识别' };
  }
}
