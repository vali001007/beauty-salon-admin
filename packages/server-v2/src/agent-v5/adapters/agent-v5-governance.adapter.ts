import { Injectable } from '@nestjs/common';
import type { AgentActor } from '../../agent/agent.types.js';
import type { AgentV5AdapterResult, AgentV5RouteDecision } from '../agent-v5.types.js';
import { AgentV5FailureDiagnosisService } from '../eval/agent-v5-failure-diagnosis.service.js';

@Injectable()
export class AgentV5GovernanceAdapter {
  constructor(private readonly failureDiagnosis: AgentV5FailureDiagnosisService) {}

  diagnoseFailure(input: {
    actor: AgentActor;
    route: AgentV5RouteDecision;
    reason?: string;
  }): AgentV5AdapterResult {
    const diagnosis = this.failureDiagnosis.diagnose({
      route: input.route,
      reason: input.reason,
      status: input.reason ? 'failed' : 'no_data',
    }) ?? {
      code: 'ontology_route_gap' as const,
      message: '当前问题未命中已发布的 V5 Ontology 能力。',
      recoverable: true,
      nextSteps: ['补充业务域、时间范围或对象后重试。'],
    };
    return {
      status: diagnosis.recoverable ? 'no_data' : 'blocked',
      title: 'Agent V5 能力诊断',
      summary: diagnosis.message,
      data: diagnosis,
      evidence: {
        sources: ['BusinessOntologyRegistry', 'AgentV5SemanticRouter'],
        domains: ['governance'],
        concepts: ['agent_governance', 'failure_diagnosis'],
        filters: [`storeId=${input.actor.storeId}`, `intent=${input.route.intent}`],
        sampleSize: 1,
        facts: [{ source: 'AgentV5FailureDiagnosis', label: diagnosis.code, value: diagnosis.message }],
        limitations: ['能力诊断只解释路由、数据、权限和能力发布问题，不自动修改规则或权限。'],
      },
      renderedBlocks: [
        { kind: 'summary_text', title: 'Agent V5 能力诊断', content: diagnosis.message },
        {
          kind: 'data_gap',
          title: diagnosis.code,
          message: diagnosis.message,
          missingData: diagnosis.nextSteps,
        },
      ],
      actions: diagnosis.nextSteps.map((step, index) => ({
        label: step,
        action: `agent-v5:diagnosis-next-step:${index + 1}`,
        riskLevel: 'low' as const,
      })),
    };
  }
}
