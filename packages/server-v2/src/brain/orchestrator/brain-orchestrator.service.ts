import { Injectable } from '@nestjs/common';
import { BrainCognitionService } from '../cognition/brain-cognition.service.js';
import { BrainTraceService } from '../governance/brain-trace.service.js';
import { BrainSkillRuntimeService } from '../skills/brain-skill-runtime.service.js';
import type { BrainAgentRoleKey } from './brain-agent-card.registry.js';

interface PlanInput {
  intent: string;
  metrics: string[];
}

interface PlannedTask {
  roleKey: BrainAgentRoleKey;
  mode: 'single' | 'parallel' | 'summary';
  skillKeys: string[];
}

@Injectable()
export class BrainOrchestratorService {
  static readonly MVP_ROLE_KEYS = [
    'store_manager',
    'receptionist',
    'beautician',
    'marketing',
    'finance',
    'inventory',
    'customer_service',
  ] as const;

  constructor(
    private readonly cognition: BrainCognitionService,
    private readonly skillRuntime: BrainSkillRuntimeService,
    private readonly trace: BrainTraceService,
  ) {}

  planTasks(input: PlanInput): { tasks: PlannedTask[] } {
    if (input.intent === 'diagnose_profit_drop') {
      return {
        tasks: [
          { roleKey: 'finance', mode: 'parallel', skillKeys: ['query_revenue', 'query_margin'] },
          { roleKey: 'store_manager', mode: 'summary', skillKeys: ['summarize_actions'] },
        ],
      };
    }

    return { tasks: [{ roleKey: 'store_manager', mode: 'single', skillKeys: ['answer_general'] }] };
  }
}
