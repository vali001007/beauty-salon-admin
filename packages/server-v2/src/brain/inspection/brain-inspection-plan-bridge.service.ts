import { Injectable } from '@nestjs/common';
import type { BrainRiskLevel } from '@prisma/client';
import { BrainCapabilityCatalogService } from '../capability/brain-capability-catalog.service.js';
import { BrainCapabilityRetrieverService } from '../capability/brain-capability-retriever.service.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import { BrainOrchestratorService } from '../orchestrator/brain-orchestrator.service.js';
import type { BrainExecutionPlanNode } from '../planning/brain-execution-plan.schema.js';

export interface BrainInspectionPlanningFinding {
  dedupeKey: string;
  ruleKey: string;
  domain: string;
  objectType: string;
  objectId: string;
  severity: BrainRiskLevel;
  title: string;
  evidence: Record<string, unknown>;
  suggestion: Record<string, unknown>;
}

@Injectable()
export class BrainInspectionPlanBridgeService {
  constructor(
    private readonly catalog: BrainCapabilityCatalogService,
    private readonly retriever: BrainCapabilityRetrieverService,
    private readonly orchestrator: BrainOrchestratorService,
  ) {}

  async planFinding(input: { storeId: number; finding: BrainInspectionPlanningFinding }) {
    const semanticIntent = this.toSemanticIntent(input.finding);
    const cards = await this.catalog.listEnabledCapabilities();
    const topK = this.retriever.retrieveTopKForSupervisor({
      intent: semanticIntent,
      question: this.plannerQuestion(input.finding),
      context: this.systemPlanningContext(input.storeId),
      cards,
      maxRisk: input.finding.severity,
    });
    if (!topK.length) {
      return { status: 'unsupported' as const, semanticIntent, reason: 'inspection_capability_not_available', actionPreviews: [] };
    }
    const planning = await this.orchestrator.createModelExecutionPlan({
      question: this.plannerQuestion(input.finding),
      intent: semanticIntent,
      topK,
      audit: { storeId: input.storeId, systemActor: 'brain_inspection' },
    });
    if (planning.status !== 'planned') {
      return {
        status: 'unavailable' as const,
        semanticIntent,
        reason: planning.reason,
        errorCode: planning.errorCode,
        actionPreviews: [],
      };
    }
    return {
      status: 'planned' as const,
      semanticIntent,
      plan: planning.plan,
      actionPreviews: this.uniqueActionPreviews(planning.plan.nodes),
    };
  }

  toSemanticIntent(finding: BrainInspectionPlanningFinding): BrainSemanticIntent {
    return {
      schemaVersion: '1.0',
      objective: `解释并处理巡检风险：${finding.title}`.slice(0, 500),
      domains: [finding.domain],
      intent: 'workflow',
      entities: [
        {
          entityType: finding.objectType,
          entityKey: finding.objectId,
          mention: finding.title,
          source: 'system',
          confidence: 1,
        },
      ],
      metrics: [],
      dimensions: [],
      filters: [],
      orderBy: [],
      answerShape: 'diagnosis',
      successCriteria: ['解释风险证据', '给出可执行建议', '写操作仅生成动作预览'],
      ambiguities: [],
      missingSlots: [],
      assumptions: ['system_generated_inspection_finding'],
      confidence: 1,
      decisionSummary: `inspection:${finding.ruleKey}:${finding.dedupeKey}`.slice(0, 500),
    };
  }

  private plannerQuestion(finding: BrainInspectionPlanningFinding) {
    return `门店主动巡检任务：${finding.ruleKey}；对象 ${finding.objectType}:${finding.objectId}；请解释风险、组合只读事实能力并仅生成动作预览。`;
  }

  private systemPlanningContext(storeId: number): BrainRequestContext {
    return {
      userId: 0,
      storeId,
      visibleStoreIds: [storeId],
      roles: ['*'],
      permissions: ['*'],
      deniedPermissions: [],
      requestId: `inspection_plan_${storeId}`,
      timezone: 'Asia/Shanghai',
    };
  }

  private uniqueActionPreviews(nodes: BrainExecutionPlanNode[]) {
    const seen = new Set<string>();
    return nodes.filter((node) => {
      if (!node.previewOnly) return false;
      const key = `${node.capabilityKey}@${node.capabilityVersion}:${this.stableStringify(node.args)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`).join(',')}}`;
  }
}
