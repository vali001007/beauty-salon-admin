import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import {
  annotateQuestionBankCoverage,
  parseAgentEvalQuestionMarkdown,
  selectRemainingSupportedQuestionBankCases,
  type AgentEvalQuestionCase,
  type AgentQuestionBankPersona,
  type AgentQuestionOutputKind,
} from '../src/agent/agent-eval-question-bank.js';
import { AgentPlannerService } from '../src/agent/agent-planner.service.js';
import { BusinessTaskCompilerService } from '../src/agent/business-task/business-task-compiler.service.js';
import { BusinessTaskPreParserService } from '../src/agent/business-task/business-task-preparser.service.js';
import { CapabilityRegistryService } from '../src/agent/capabilities/capability-registry.service.js';
import { AgentSkillsRegistryService } from '../src/agent/skills/index.js';
import { createInMemoryBusinessMetricCatalog } from '../src/semantic-data/business-metric-catalog.testing.js';
import { LEGACY_SEMANTIC_METRICS } from '../src/semantic-data/legacy-semantic-metric.fixture.js';
import { BusinessMetricCatalogService } from '../src/semantic-data/business-metric-catalog.service.js';
import type { BusinessMetricCatalogReader } from '../src/semantic-data/business-metric-catalog.types.js';
import { PublishedBusinessDefinitionSnapshotProviderService } from '../src/brain/cognition/published-business-definition-snapshot-provider.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { SemanticSqlDecisionService } from '../src/semantic-sql/semantic-sql-decision.service.js';
import type { AgentRole } from '../src/agent/agent.types.js';

type Args = {
  planOnly: boolean;
  persona?: AgentQuestionBankPersona;
  limit?: number;
  output?: string;
  legacyFixture: boolean;
};

type FailureReason =
  | 'route_error'
  | 'skill_missing'
  | 'tool_missing'
  | 'wrong_intent'
  | 'missing_output_kind'
  | 'missing_evidence'
  | 'permission_error'
  | 'runtime_error';

type ToolDefinition = {
  name: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  allowedRoles: AgentRole[];
  requiredPermissions: string[];
  requiresApproval: boolean;
  outputKinds: AgentQuestionOutputKind[];
};

const args = parseArgs();
const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
const annotatedQuestions = annotateQuestionBankCoverage(bank.questions);
const systemUnsupported = annotatedQuestions.filter((item) => item.systemSupportStatus === 'system_unsupported');
const alreadyTested = annotatedQuestions.filter(
  (item) => item.systemSupportStatus !== 'system_unsupported' && item.coverageStage !== 'not_run',
);
const remainingAll = selectRemainingSupportedQuestionBankCases(bank.questions, args.persona);
const remaining = typeof args.limit === 'number' ? remainingAll.slice(0, args.limit) : remainingAll;

if (args.planOnly) {
  emitReport({
    mode: 'plan-only',
    catalogMode: args.legacyFixture ? 'legacy_fixture_non_production' : 'governed_published_snapshot',
    totalQuestions: annotatedQuestions.length,
    persona: args.persona ?? 'all',
    systemUnsupported: summarizeUnsupported(systemUnsupported),
    alreadyTested: summarizeBy(alreadyTested, (item) => item.coverageStage),
    remainingSupported: {
      total: remainingAll.length,
      selected: remaining.length,
      byPersona: summarizeBy(remainingAll, (item) => item.persona),
      bySupportStatus: summarizeBy(remainingAll, (item) => item.systemSupportStatus),
    },
  });
  process.exit(0);
}
const toolRegistry = createToolRegistry();

async function main() {
  const runtime = await createCatalogRuntime();
  const planner = createPlanner(runtime.catalog);
  const results = [];
  try {
    for (const testCase of remaining) {
      try {
      const plan = await planner.plan({
        message: testCase.input,
        actor: { storeId: 1, userId: 1, role: testCase.evalRole, entrypoint: 'agent-eval-remaining' },
      });
      const firstTool = plan.toolPlan[0]?.tool;
      const tool = firstTool ? toolRegistry.get(firstTool) : undefined;
      const actualOutputKinds = inferActualOutputKinds(firstTool, plan.skillPlan?.outputContract ?? plan.outputContract, tool);
      const failureReasons = collectFailureReasons(testCase, {
        intentType: plan.intentType,
        clarificationNeeded: plan.clarificationNeeded,
        firstTool,
        toolExists: firstTool ? Boolean(tool) : undefined,
        capabilityId: plan.skillPlan?.capabilityId ?? plan.capabilityPlan?.capabilityId,
        businessDomain: getBusinessDomain(plan.businessTask),
        goal: plan.goal,
        outputKinds: actualOutputKinds,
      });
      results.push({
        id: testCase.id,
        input: testCase.input,
        persona: testCase.persona,
        role: testCase.evalRole,
        sourceCategory: testCase.sourceCategory,
        supportStatus: testCase.systemSupportStatus,
        passed: failureReasons.length === 0,
        failureReasons,
        actual: {
          intentType: plan.intentType,
          clarificationNeeded: plan.clarificationNeeded,
          firstTool,
          capabilityId: plan.skillPlan?.capabilityId ?? plan.capabilityPlan?.capabilityId,
          businessDomain: getBusinessDomain(plan.businessTask),
          outputKinds: actualOutputKinds,
        },
        expected: {
          intentType: testCase.expectedIntentType,
          outputKinds: testCase.expectedOutputKinds,
        },
      });
      } catch (error) {
        results.push({
        id: testCase.id,
        input: testCase.input,
        persona: testCase.persona,
        role: testCase.evalRole,
        sourceCategory: testCase.sourceCategory,
        supportStatus: testCase.systemSupportStatus,
        passed: false,
        failureReasons: ['runtime_error' as FailureReason],
        actual: { error: error instanceof Error ? error.message : String(error) },
        expected: {
          intentType: testCase.expectedIntentType,
          outputKinds: testCase.expectedOutputKinds,
        },
        });
      }
    }

    const failures = results.filter((item) => !item.passed);
    emitReport({
      mode: 'run',
      catalogMode: runtime.mode,
      productionReadiness: runtime.mode === 'governed_published_snapshot' ? 'production-governed' : 'non-production',
    persona: args.persona ?? 'all',
    totalQuestions: annotatedQuestions.length,
    systemUnsupported: summarizeUnsupported(systemUnsupported),
    alreadyTested: {
      total: alreadyTested.length,
      byCoverageStage: summarizeBy(alreadyTested, (item) => item.coverageStage),
    },
    remainingSupported: {
      total: remainingAll.length,
      selected: remaining.length,
      passed: results.filter((item) => item.passed).length,
      failed: failures.length,
      passRate: results.length ? Number((results.filter((item) => item.passed).length / results.length).toFixed(4)) : 1,
      byPersona: summarizeBy(remaining, (item) => item.persona),
      bySupportStatus: summarizeBy(remaining, (item) => item.systemSupportStatus),
    },
    failureReasons: summarizeFailureReasons(failures),
    systemUnsupportedList: systemUnsupported.map((item) => ({
      id: item.id,
      input: item.input,
      persona: item.persona,
      sourceCategory: item.sourceCategory,
      sourceSection: item.sourceSection,
      reason: item.systemSupportReason,
    })),
    agentGapList: failures.map((item) => ({
      id: item.id,
      input: item.input,
      persona: item.persona,
      role: item.role,
      sourceCategory: item.sourceCategory,
      supportStatus: item.supportStatus,
      failureReasons: item.failureReasons,
      actual: item.actual,
      expected: item.expected,
    })),
    });
  } finally {
    await runtime.close();
  }
}

function parseArgs(): Args {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    if (raw.includes('=')) {
      const [key, ...rest] = raw.replace(/^--/, '').split('=');
      values.set(key, rest.join('='));
    } else {
      flags.add(raw.replace(/^--/, ''));
    }
  }
  const persona = values.get('persona') as AgentQuestionBankPersona | undefined;
  const supportedPersonas: AgentQuestionBankPersona[] = ['manager', 'marketing', 'reception', 'beautician', 'inventory', 'finance', 'edge'];
  if (persona && !supportedPersonas.includes(persona)) {
    throw new Error(`--persona must be one of ${supportedPersonas.join(', ')}`);
  }
  const limitRaw = values.get('limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isInteger(limit) || Number(limit) <= 0)) {
    throw new Error('--limit must be a positive integer.');
  }
  return {
    planOnly: flags.has('plan-only'),
    legacyFixture: flags.has('legacy-fixture'),
    persona,
    limit,
    output: values.get('output'),
  };
}

function readQuestionBankMarkdown() {
  const candidates = [
    resolve(
      process.cwd(),
      '../../docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md',
    ),
    resolve(process.cwd(), 'docs/04-测试数据/agent-eval-questions.md'),
    resolve(process.cwd(), '../../docs/04-测试数据/agent-eval-questions.md'),
  ];
  const file = candidates.find((item) => existsSync(item));
  if (!file) throw new Error(`agent-eval-questions.md not found. tried: ${candidates.join(', ')}`);
  return readFileSync(file, 'utf8');
}

function createPlanner(metricCatalog: BusinessMetricCatalogReader) {
  const skillRegistry = new AgentSkillsRegistryService();
  return new AgentPlannerService(
    toolRegistry as never,
    new BusinessTaskCompilerService(
      new BusinessTaskPreParserService(),
      new CapabilityRegistryService(),
      metricCatalog,
      new SemanticSqlDecisionService(),
      undefined,
      skillRegistry,
    ),
  );
}

async function createCatalogRuntime(): Promise<{
  catalog: BusinessMetricCatalogReader;
  mode: 'governed_published_snapshot' | 'legacy_fixture_non_production';
  close(): Promise<void>;
}> {
  if (args.legacyFixture) {
    return {
      catalog: createInMemoryBusinessMetricCatalog(LEGACY_SEMANTIC_METRICS),
      mode: 'legacy_fixture_non_production',
      close: async () => undefined,
    };
  }
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const provider = new PublishedBusinessDefinitionSnapshotProviderService(prisma);
  const catalog = new BusinessMetricCatalogService(provider);
  await catalog.onModuleInit();
  catalog.list();
  return {
    catalog,
    mode: 'governed_published_snapshot',
    close: () => prisma.onModuleDestroy(),
  };
}

function collectFailureReasons(
  testCase: AgentEvalQuestionCase,
  actual: {
    intentType: string;
    clarificationNeeded: boolean;
    firstTool?: string;
    toolExists?: boolean;
    capabilityId?: string;
    businessDomain?: string;
    goal?: string;
    outputKinds: AgentQuestionOutputKind[];
  },
) {
  const reasons = new Set<FailureReason>();
  const expectedClarify = testCase.expectedIntentType === 'clarify';
  if (actual.goal === '角色权限不足') reasons.add('permission_error');
  if (actual.clarificationNeeded !== expectedClarify && actual.goal !== '角色权限不足') reasons.add('wrong_intent');
  if (!actual.firstTool && !expectedClarify) reasons.add('skill_missing');
  if (actual.firstTool && actual.toolExists === false) reasons.add('tool_missing');
  if (!actual.capabilityId && actual.firstTool && testCase.systemSupportStatus === 'system_supported_testable') {
    reasons.add('skill_missing');
  }
  if (actual.businessDomain === 'unknown' && !expectedClarify) reasons.add('route_error');

  const canValidateOutputContract =
    Boolean(actual.firstTool) &&
    actual.toolExists !== false &&
    actual.goal !== '角色权限不足';
  if (canValidateOutputContract) {
    const expectedOutputKinds = testCase.expectedOutputKinds ?? [];
    for (const kind of expectedOutputKinds) {
      if (kind === 'text') continue;
      if (kind === 'evidence' && !actual.outputKinds.includes('evidence')) reasons.add('missing_evidence');
      else if (kind !== 'evidence' && !actual.outputKinds.includes(kind)) reasons.add('missing_output_kind');
    }
  }
  return [...reasons];
}

function inferActualOutputKinds(firstTool?: string, outputContract?: unknown, tool?: ToolDefinition) {
  const kinds = new Set<AgentQuestionOutputKind>(['text']);
  const contract = outputContract as { requiredKinds?: unknown; preferredKinds?: unknown; evidenceRequired?: unknown } | undefined;
  for (const value of [...asStringArray(contract?.requiredKinds), ...asStringArray(contract?.preferredKinds), ...(tool?.outputKinds ?? [])]) {
    const normalized = normalizeOutputKind(value);
    if (normalized) kinds.add(normalized);
  }
  if (contract?.evidenceRequired === true) kinds.add('evidence');
  if (firstTool && !contract && tool?.outputKinds.length === 0) kinds.add('evidence');
  return [...kinds];
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeOutputKind(value: string): AgentQuestionOutputKind | null {
  if (value === 'evidence_panel') return 'evidence';
  return ['text', 'kpi', 'table', 'chart', 'action_card', 'clarify', 'evidence'].includes(value)
    ? value as AgentQuestionOutputKind
    : null;
}

function getBusinessDomain(value: unknown) {
  return value && typeof value === 'object' && 'domain' in value ? String((value as { domain?: unknown }).domain ?? 'unknown') : 'unknown';
}

function summarizeBy<T>(items: T[], selector: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = selector(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function summarizeFailureReasons(items: Array<{ failureReasons: FailureReason[] }>) {
  return items.reduce<Record<FailureReason, number>>((acc, item) => {
    for (const reason of item.failureReasons) acc[reason] = (acc[reason] ?? 0) + 1;
    return acc;
  }, {} as Record<FailureReason, number>);
}

function summarizeUnsupported(items: AgentEvalQuestionCase[]) {
  return {
    total: items.length,
    byPersona: summarizeBy(items, (item) => item.persona),
    byReason: summarizeBy(items, (item) => item.systemSupportReason),
  };
}

function emitReport(report: unknown) {
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    const outputPath = resolve(process.cwd(), args.output);
    mkdirSync(resolve(outputPath, '..'), { recursive: true });
    writeFileSync(outputPath, json, 'utf8');
    console.log(
      JSON.stringify(
        {
          output: outputPath,
          summary: summarizeReportForConsole(report),
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(json);
}

function summarizeReportForConsole(report: unknown) {
  if (!report || typeof report !== 'object') return report;
  const value = report as {
    mode?: unknown;
    persona?: unknown;
    totalQuestions?: unknown;
    systemUnsupported?: unknown;
    alreadyTested?: unknown;
    remainingSupported?: unknown;
    failureReasons?: unknown;
  };
  return {
    mode: value.mode,
    persona: value.persona,
    totalQuestions: value.totalQuestions,
    systemUnsupported: value.systemUnsupported,
    alreadyTested: value.alreadyTested,
    remainingSupported: value.remainingSupported,
    failureReasons: value.failureReasons,
  };
}

const toolDefinitions: ToolDefinition[] = [
  tool('customer.priority.rank', '推荐优先跟进客户', ['manager', 'reception'], ['table', 'action_card', 'evidence']),
  tool('business.query.ask', '执行受控经营问数', ['manager', 'reception', 'beautician'], ['kpi', 'table', 'chart', 'action_card', 'evidence']),
  tool('revenue.diagnose', '诊断收入变化', ['manager'], ['kpi', 'chart', 'evidence']),
  tool('finance.revenue.summary', '汇总财务收入', ['manager', 'reception'], ['kpi', 'table', 'chart', 'evidence']),
  tool('finance.margin.diagnose', '诊断财务毛利', ['manager'], ['kpi', 'table', 'evidence']),
  tool('finance.profit.diagnose', '诊断利润变化', ['manager'], ['kpi', 'table', 'evidence']),
  tool('finance.margin.risk.rank', '查询毛利风险排行', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('finance.refund.discount.audit', '审计退款折扣风险', ['manager', 'reception'], ['table', 'action_card', 'evidence']),
  tool('finance.beautician.performance.audit', '审计美容师绩效风险', ['manager'], ['table', 'evidence']),
  tool('finance.report.draft', '生成财务报告草稿', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('manager.daily.briefing', '生成门店今日经营简报', ['manager'], ['kpi', 'table', 'evidence']),
  tool('reception.customer.lookup', '查询前台客户资料', ['manager', 'reception'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('reception.reservation.today', '查询今日预约与待确认预约', ['manager', 'reception'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('reception.card.benefit.summary', '查询客户卡项与权益概况', ['manager', 'reception'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('customer.followup.task.draft', '生成客户跟进任务草稿', ['manager', 'reception', 'beautician'], ['table', 'action_card', 'evidence'], 'medium', true),
  tool('inventory.replenishment.draft', '生成补货采购草稿', ['manager'], ['action_card', 'evidence'], 'medium', true),
  tool('inventory.risk.rank', '查询库存风险排行', ['manager', 'reception'], ['kpi', 'table', 'chart', 'action_card', 'evidence']),
  tool('inventory.product.metadata.suggest', '生成商品资料和安全库存建议', ['manager', 'reception'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('inventory.consumption.trend', '分析库存消耗趋势', ['manager'], ['kpi', 'chart', 'table', 'action_card', 'evidence']),
  tool('inventory.project.bom.risk', '诊断项目耗材 BOM 风险', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('inventory.expiring.clearance.draft', '生成临期库存处理草稿', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('supplier.purchase.link', '查询供应商采购链接', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('beautician.today.service.list', '查询美容师今日服务客户', ['beautician', 'manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('beautician.customer.care.brief', '生成美容师客户护理摘要', ['beautician', 'manager'], ['table', 'evidence']),
  tool('beautician.performance.progress', '查询美容师本月业绩进度', ['beautician', 'manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('beautician.repurchase.opportunity', '推荐美容师复购续卡机会', ['beautician', 'manager'], ['table', 'evidence']),
  tool('service.record.draft', '生成服务记录草稿', ['beautician', 'manager'], ['table', 'action_card', 'evidence']),
  tool('scheduling.optimization.preview', '生成智能排班优化预览', ['manager'], ['action_card', 'evidence']),
  tool('schedule.diagnose', '诊断预约排班', ['manager', 'reception'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('product.sales.rank', '查询商品销量排行', ['manager', 'reception'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('marketing.customer.segment.discover', '发现适合营销召回的客户分群', ['manager'], ['table', 'evidence']),
  tool('promotion.offer.match', '匹配适合的营销权益与优惠方案', ['manager'], ['table', 'evidence']),
  tool('marketing.copy.generate', '生成营销文案与触达话术', ['manager'], ['action_card', 'table', 'evidence']),
  tool('marketing.effect.diagnose', '诊断营销活动效果', ['manager'], ['kpi', 'table', 'evidence']),
  tool('marketing.opportunity.discover', '发现适合做活动的商品机会', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('marketing.activity.draft', '生成营销活动草稿', ['manager'], ['action_card', 'evidence'], 'medium', true),
  tool('project.diagnose', '诊断项目经营', ['manager', 'reception'], ['kpi', 'table', 'chart', 'evidence']),
  tool('card.diagnose', '诊断卡项/会员卡经营', ['manager', 'reception'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('staff.performance.rank', '查询员工表现排行', ['manager', 'beautician'], ['kpi', 'table', 'chart', 'action_card', 'evidence']),
  tool('supply_chain.diagnose', '诊断供应链采购', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('marketing.conversion.diagnose', '诊断营销转化', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('automation.execution.diagnose', '复盘自动化执行', ['manager'], ['table', 'evidence']),
  tool('customer_app.funnel.analyze', '分析客户小程序渠道漏斗', ['manager'], ['chart', 'table', 'evidence']),
  tool('promotion.effect.analyze', '分析权益活动效果', ['manager'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('terminal.health.diagnose', '诊断终端健康', ['manager'], ['table', 'evidence']),
  tool('order.refund.diagnose', '诊断售后退款', ['manager', 'reception'], ['kpi', 'table', 'action_card', 'evidence']),
  tool('service.quality.diagnose', '诊断服务质量', ['manager'], ['table', 'evidence']),
  tool('store.comparison.diagnose', '诊断门店对比', ['manager'], ['chart', 'table', 'evidence']),
];

function tool(
  name: string,
  description: string,
  allowedRoles: AgentRole[],
  outputKinds: AgentQuestionOutputKind[],
  riskLevel: 'low' | 'medium' | 'high' = 'low',
  requiresApproval = false,
): ToolDefinition {
  return { name, description, riskLevel, allowedRoles, requiredPermissions: [], requiresApproval, outputKinds };
}

function createToolRegistry() {
  return {
    list: () => toolDefinitions,
    get: (name: string) => toolDefinitions.find((item) => item.name === name),
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
