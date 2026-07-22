import { ForbiddenException, Injectable } from '@nestjs/common';
import type { BrainCognitionResult } from '../cognition/brain-cognition.service.js';
import { BrainCognitionService } from '../cognition/brain-cognition.service.js';
import type { BrainQuestionIntentResult } from '../cognition/brain-question-intent.service.js';
import type { BrainRequestContext } from '../context/brain-request-context.js';
import type { BrainDomainAdapterKey, BrainDomainRole } from '../domain/brain-domain-adapter.types.js';
import type { BrainAgentRoleKey } from './brain-agent-card.registry.js';
import type { BrainTaskNode, BrainTaskPlan } from './brain-task.types.js';
import { BrainSkillRuntimeService } from '../skills/brain-skill-runtime.service.js';
import { BrainTraceService } from '../governance/brain-trace.service.js';
import type { BrainCapabilityRankedCandidate } from '../capability/brain-capability-retriever.service.js';
import type { BrainSemanticIntent } from '../cognition/brain-semantic-intent.types.js';
import type { BrainExecutionPlan } from '../planning/brain-execution-plan.schema.js';
import type { BrainRoleRuntimeContext } from '../role/brain-role-context-builder.service.js';
import type { BrainSupervisorPlannerAudit } from '../planning/brain-supervisor-planner.service.js';
import { BrainSupervisorPlannerService } from '../planning/brain-supervisor-planner.service.js';

interface PlanInput {
  intent: string;
  metrics: string[];
}

interface PlannedTask {
  roleKey: BrainAgentRoleKey;
  mode: 'single' | 'parallel' | 'summary';
  skillKeys: string[];
}

interface CompositeNodeTemplate {
  id: string;
  role: BrainDomainRole;
  adapterKey: BrainDomainAdapterKey;
  prompt: string;
  permissions: string[];
  dependencies?: string[];
}

interface CompositeRule {
  key: string;
  objective: string;
  match: (message: string, intent: BrainQuestionIntentResult, cognition: BrainCognitionResult) => boolean;
  nodes: CompositeNodeTemplate[];
}

const COMPOSITE_RULES: CompositeRule[] = [
  {
    key: 'profit_decline_diagnosis',
    objective: '诊断利润下降原因并给出行动建议',
    match: (message, intent) =>
      intent.intent === 'diagnosis' &&
      !/(员工|美容师|技师|个人)/.test(message) &&
      /(利润|毛利|收入|业绩).*(下降|下滑|变差|异常)|为什么.*(利润|毛利)/.test(message),
    nodes: [
      { id: 'finance', role: 'finance', adapterKey: 'finance_risk', prompt: '分析本周流水、退款、折扣和毛利风险', permissions: ['core:finance:view'] },
      { id: 'manager', role: 'store_manager', adapterKey: 'store_manager', prompt: '汇总本周经营概览、客户和预约异常', permissions: ['core:dashboard:view'] },
      { id: 'inventory', role: 'inventory', adapterKey: 'inventory_procurement', prompt: '检查缺货、临期和库存风险对经营的影响', permissions: ['core:inventory:stock'] },
      { id: 'marketing', role: 'marketing', adapterKey: 'marketing_growth', prompt: '检查客户流失、召回和营销侧异常', permissions: ['core:marketing:create'] },
    ],
  },
  {
    key: 'churn_recall_plan',
    objective: '识别高流失客户并生成召回方案',
    match: (message) => /(高流失|沉睡|好久没来|流失客户).*(召回|方案|跟进|找出)|找出.*(流失|沉睡).*客户/.test(message),
    nodes: [
      { id: 'customer_list', role: 'customer_service', adapterKey: 'customer_service', prompt: '找出沉睡、流失且值得优先跟进的客户名单', permissions: ['core:customer:view'] },
      { id: 'marketing_plan', role: 'marketing', adapterKey: 'marketing_growth', prompt: '为沉睡和流失客户生成分层召回方案', permissions: ['core:marketing:create'], dependencies: ['customer_list'] },
      { id: 'care_script', role: 'customer_service', adapterKey: 'customer_service', prompt: '生成克制的客户召回和关怀话术', permissions: ['core:customer:view'], dependencies: ['customer_list'] },
    ],
  },
  {
    key: 'capacity_gap_fill',
    objective: '识别预约空档、匹配客户并准备提醒',
    match: (message) => /(明天|今天|下午|上午).*(空档|空余|空位).*(客户|提醒|预约)|找.*客户.*填.*空档/.test(message),
    nodes: [
      { id: 'schedule', role: 'receptionist', adapterKey: 'front_desk', prompt: '列出明天下午预约安排和员工忙闲情况', permissions: ['core:store:reservations'] },
      { id: 'candidates', role: 'customer_service', adapterKey: 'customer_service', prompt: '找出近期需要回访或护理周期到期的客户', permissions: ['core:customer:view'] },
      { id: 'reminder', role: 'marketing', adapterKey: 'marketing_growth', prompt: '生成预约空档提醒文案，不直接发送', permissions: ['core:marketing:create'], dependencies: ['schedule', 'candidates'] },
    ],
  },
  {
    key: 'expiring_stock_campaign',
    objective: '评估临期库存并生成合规促销方案',
    match: (message) => /(临期|快过期|过期).*(促销|活动|怎么卖|处理方案)/.test(message),
    nodes: [
      { id: 'inventory', role: 'inventory', adapterKey: 'inventory_procurement', prompt: '列出临期库存风险和合规处置建议', permissions: ['core:inventory:expiry'] },
      { id: 'finance', role: 'finance', adapterKey: 'finance_risk', prompt: '评估折扣、毛利和财务风险边界', permissions: ['core:finance:view'], dependencies: ['inventory'] },
      { id: 'marketing', role: 'marketing', adapterKey: 'marketing_growth', prompt: '在库存和毛利边界内生成促销方案', permissions: ['core:marketing:create'], dependencies: ['inventory'] },
    ],
  },
  {
    key: 'year_end_multi_domain_review',
    objective: '从经营、客户和库存三个维度完成阶段盘点',
    match: (message) => /(年底|年末|年度).*(经营|客户).*(库存).*(盘点|复盘)|从经营、客户、库存三个维度/.test(message),
    nodes: [
      { id: 'manager', role: 'store_manager', adapterKey: 'store_manager', prompt: '汇总今年经营收入、订单、客户和项目趋势', permissions: ['core:dashboard:view'] },
      { id: 'customer_list', role: 'customer_service', adapterKey: 'customer_service', prompt: '汇总客户分层、沉睡和复购风险事实', permissions: ['core:customer:view'] },
      { id: 'inventory', role: 'inventory', adapterKey: 'inventory_procurement', prompt: '汇总库存金额、低库存、临期和采购风险', permissions: ['core:inventory:stock'] },
    ],
  },
  {
    key: 'full_store_improvement_review',
    objective: '识别门店主要经营问题并形成分域改进清单',
    match: (message) => /(所有的问题|全部问题|完整.*改进方案|门店.*全面.*诊断)/.test(message),
    nodes: [
      { id: 'manager', role: 'store_manager', adapterKey: 'store_manager', prompt: '诊断经营、客户和员工侧主要异常', permissions: ['core:dashboard:view'] },
      { id: 'finance', role: 'finance', adapterKey: 'finance_risk', prompt: '诊断收入、退款、折扣、成本和负债风险', permissions: ['core:finance:view'] },
      { id: 'inventory', role: 'inventory', adapterKey: 'inventory_procurement', prompt: '诊断低库存、临期、周转和采购风险', permissions: ['core:inventory:stock'] },
      { id: 'marketing', role: 'marketing', adapterKey: 'marketing_growth', prompt: '诊断客户分层、渠道转化和营销缺口', permissions: ['core:marketing:create'] },
      { id: 'front_desk', role: 'receptionist', adapterKey: 'front_desk', prompt: '诊断预约、到店、爽约和现场资源问题', permissions: ['core:store:reservations'] },
    ],
  },
];

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
    private readonly _cognition?: BrainCognitionService,
    private readonly _skillRuntime?: BrainSkillRuntimeService,
    private readonly _trace?: BrainTraceService,
    private readonly supervisor?: BrainSupervisorPlannerService,
  ) {}

  createModelExecutionPlan(input: {
    question: string;
    intent: BrainSemanticIntent;
    topK: readonly BrainCapabilityRankedCandidate[];
    audit: BrainSupervisorPlannerAudit;
    previousPlan?: BrainExecutionPlan;
    observations?: unknown[];
    roleContext?: BrainRoleRuntimeContext;
    deadlineAt?: number;
  }) {
    if (!this.supervisor) {
      return Promise.resolve({
        status: 'unavailable',
        errorCode: 'MODEL_UNAVAILABLE',
        reason: 'brain_supervisor_unavailable',
      } as const);
    }
    return this.supervisor.plan(input);
  }

  planTasks(input: PlanInput): { tasks: PlannedTask[] } {
    const legacyMap: Record<string, PlannedTask[]> = {
      diagnose_profit_drop: [
        { roleKey: 'finance', mode: 'parallel', skillKeys: ['query_revenue', 'query_margin'] },
        { roleKey: 'store_manager', mode: 'summary', skillKeys: ['summarize_actions'] },
      ],
    };
    return {
      tasks: legacyMap[input.intent] ?? [{ roleKey: 'store_manager', mode: 'single', skillKeys: ['answer_general'] }],
    };
  }

  createTaskPlan(input: {
    message: string;
    runtimeIntent: BrainQuestionIntentResult;
    cognition: BrainCognitionResult;
    context: BrainRequestContext;
  }): BrainTaskPlan | undefined {
    const rule = COMPOSITE_RULES.find((candidate) => candidate.match(input.message, input.runtimeIntent, input.cognition));
    if (!rule) return undefined;

    const nodes: BrainTaskNode[] = rule.nodes.map((node) => ({
      id: node.id,
      role: node.role,
      kind: 'adapter',
      adapterKey: node.adapterKey,
      intent: node.id.includes('list') || node.id === 'schedule' || node.id === 'candidates' ? 'list' : node.id.includes('script') || node.id === 'reminder' ? 'draft' : node.id.includes('plan') || node.id === 'marketing' ? 'recommendation' : 'diagnosis',
      answerShape: node.id.includes('list') || node.id === 'schedule' || node.id === 'candidates' ? 'list' : 'non_metric',
      prompt: node.prompt,
      dependencies: (node.dependencies ?? []).map((nodeId) => ({ nodeId, required: false })),
      requiredPermissions: node.permissions,
      timeoutMs: 8000,
      maxRetries: 1,
    }));
    nodes.push({
      id: 'supervisor_summary',
      role: 'supervisor',
      kind: 'summary',
      intent: 'diagnosis',
      answerShape: 'non_metric',
      prompt: '汇总已完成子任务',
      dependencies: rule.nodes.map((node) => ({ nodeId: node.id, required: false })),
      requiredPermissions: [],
      timeoutMs: 2000,
      maxRetries: 0,
    });

    const missing = nodes.flatMap((node) =>
      node.requiredPermissions.filter(
        (permission) =>
          input.context.deniedPermissions.includes(permission) ||
          (!input.context.permissions.includes('*') && !input.context.permissions.includes(permission)),
      ),
    );
    if (missing.length) throw new ForbiddenException(`missing_permission:${[...new Set(missing)].join(',')}`);

    return {
      planKey: rule.key,
      objective: rule.objective,
      reason: `matched_composite_rule:${rule.key}`,
      nodes,
      isComposite: true,
    };
  }
}
