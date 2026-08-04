import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import pg from 'pg';
import { ASK_DATA_FREE_SQL_VIEWS } from '../src/ask-data-free-sql/ask-data-free-sql.catalog.js';
import { AskDataIntentParser } from '../src/ask-data-free-sql/ask-data-intent-parser.js';
import { ASK_DATA_ADMIN_METRIC_CORRECTION_BY_ID } from './ask-data-admin-metric-corrections.js';

type AuditClass =
  | 'existing_ask_direct'
  | 'existing_facts_new_view'
  | 'existing_facts_new_metric'
  | 'backend_fact_incomplete'
  | 'brain_or_advice'
  | 'readonly_action'
  | 'sensitive_or_context';

type Priority = 'P0' | 'P1' | 'P2' | 'boundary';

type ManifestQuestion = {
  id: string;
  sourceRole: string;
  section: string;
  question: string;
  supportClass: string;
};

type CapabilityEvidence = {
  capabilityKey: string;
  capabilityLabel: string;
  auditClass: AuditClass;
  priority: Priority;
  reason: string;
  recommendedView?: string;
  permission?: string;
  pages: string[];
  backend: string[];
  models: string[];
  factKeys: string[];
};

type AuditItem = ManifestQuestion & {
  previousClass: string;
  auditClass: AuditClass;
  priority: Priority;
  capabilityKey: string;
  capabilityLabel: string;
  reason: string;
  recommendedView: string;
  permission: string;
  currentSemanticMetricKeys: string[];
  currentSemanticViews: string[];
  currentSemanticConfidence: number;
  pages: string[];
  backend: string[];
  models: string[];
  developmentFacts: Record<string, number | null>;
};

const { Client } = pg;
const serverRoot = process.cwd();
const repoRoot = resolve(serverRoot, '../..');
const storeId = Number(argumentValue('--store-id=') ?? '6');
const allowDevelopmentAdmin = process.argv.includes('--allow-development-admin');
const strict = process.argv.includes('--strict');
const manifestPath = resolve(
  serverRoot,
  argumentValue('--manifest=') ??
    '../../docs/04-测试数据/Ami-Ask-Agent问题库实测-2026-08-02/agent-question-bank-manifest.json',
);
const outputDir = resolve(
  serverRoot,
  argumentValue('--output-dir=') ??
    '../../docs/04-测试数据/Ami-Ask管理端事实覆盖审计-2026-08-02',
);
const generatedAt = new Date().toISOString();
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { questions: ManifestQuestion[] };
const sourceQuestions = manifest.questions.filter(
  (item) => item.supportClass === 'admin_supported_ask_not_open',
);
const parser = new AskDataIntentParser();
const knownViewNames = new Set(ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName));
let developmentEvidence: {
  connectionMode: string;
  databaseHost: string;
  counts: Record<string, number>;
} = { connectionMode: 'not_executed', databaseHost: '', counts: {} };

async function main() {
  developmentEvidence = await loadDevelopmentEvidence();
  const auditItems = sourceQuestions.map(auditQuestion);
  const classCounts = countBy(auditItems, (item) => item.auditClass);
  const roleCounts = groupCounts(auditItems, (item) => item.sourceRole, (item) => item.auditClass);
  const capabilityCounts = groupCounts(
    auditItems,
    (item) => `${item.capabilityKey}\t${item.capabilityLabel}\t${item.auditClass}\t${item.priority}`,
    () => 'count',
  );
  const directlyAnswerable = auditItems.filter((item) => item.auditClass === 'existing_ask_direct').length;
  const factsOpenable = auditItems.filter((item) =>
    ['existing_ask_direct', 'existing_facts_new_view', 'existing_facts_new_metric'].includes(item.auditClass),
  ).length;
  const evidence = {
    version: 'v1',
    generatedAt,
    sourceManifest: manifestPath,
    storeId,
    connectionMode: developmentEvidence.connectionMode,
    databaseHost: developmentEvidence.databaseHost,
    sourceQuestionCount: sourceQuestions.length,
    summary: {
      byAuditClass: classCounts,
      directlyAnswerable,
      factsOpenable,
      factsOpenableRate: ratio(factsOpenable, sourceQuestions.length),
      boundaryOrIncomplete: sourceQuestions.length - factsOpenable,
    },
    developmentFacts: developmentEvidence.counts,
    byRole: roleCounts,
    questions: auditItems,
  };

  mkdirSync(outputDir, { recursive: true });
  const jsonPath = resolve(outputDir, 'Ami-Ask管理端事实覆盖逐题审计-2026-08-02.json');
  const csvPath = resolve(outputDir, 'Ami-Ask管理端事实覆盖逐题审计-2026-08-02.csv');
  const reportPath = resolve(outputDir, 'Ami-Ask管理端事实覆盖支持矩阵-2026-08-02.md');
  writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(csvPath, renderCsv(auditItems));
  writeFileSync(reportPath, renderMarkdown(evidence, capabilityCounts));

  const failures: string[] = [];
  if (sourceQuestions.length !== 234) failures.push(`expected_234_questions_got_${sourceQuestions.length}`);
  if (auditItems.some((item) => !item.capabilityKey || !item.reason)) failures.push('unclassified_question');
  const directSemanticMisses = auditItems.filter(
    (item) => item.auditClass === 'existing_ask_direct'
      && (!item.currentSemanticViews.includes(item.recommendedView) || item.currentSemanticConfidence < 0.75),
  );
  if (directSemanticMisses.length) failures.push(`direct_semantic_miss_${directSemanticMisses.map((item) => item.id).join('_')}`);
  if (auditItems.some((item) => item.recommendedView && !knownViewNames.has(item.recommendedView) && !item.recommendedView.startsWith('ask_data_'))) {
    failures.push('invalid_recommended_view');
  }
  if (strict && allowDevelopmentAdmin && developmentEvidence.connectionMode !== 'development_admin') {
    failures.push('development_admin_evidence_missing');
  }

  console.log(
    JSON.stringify(
      {
        jsonPath,
        csvPath,
        reportPath,
        sourceQuestionCount: sourceQuestions.length,
        summary: evidence.summary,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length) process.exitCode = 1;
}

function auditQuestion(item: ManifestQuestion): AuditItem {
  const parsed = parser.parse(item.question, new Date('2026-08-02T00:00:00.000Z'));
  const semanticViews = [
    ...new Set(parsed.matchedContracts.map((match) => match.contract.preferredView)),
  ];
  const correction = ASK_DATA_ADMIN_METRIC_CORRECTION_BY_ID.get(item.id);
  const capability = correction
    ? {
        capabilityKey: correction.capabilityKey,
        capabilityLabel: correction.capabilityLabel,
        auditClass: correction.auditClass,
        priority: correction.priority,
        reason: correction.reason,
        recommendedView: correction.requiredViews[0] ?? correction.acceptableViews[0],
        permission: permissionForView(correction.requiredViews[0] ?? correction.acceptableViews[0]),
        pages: [] as string[],
        backend: ['packages/server-v2/src/ask-data-free-sql/ask-data-semantic-contracts.ts'],
        models: [] as string[],
        factKeys: [] as string[],
      }
    : classifyCapability(item, semanticViews, parsed.semanticIntent.confidence);
  const recommendedView = capability.recommendedView ?? semanticViews[0] ?? '';
  const implementedDirect = isImplementedDirectCapability(
    capability,
    recommendedView,
    semanticViews,
    parsed.semanticIntent.confidence,
  );
  return {
    ...item,
    previousClass: item.supportClass,
    auditClass: implementedDirect ? 'existing_ask_direct' : capability.auditClass,
    priority: capability.priority,
    capabilityKey: capability.capabilityKey,
    capabilityLabel: capability.capabilityLabel,
    reason: implementedDirect
      ? `${capability.reason}当前 Catalog 和独立语义合同已完成接入，按已开放能力计入直接覆盖。`
      : capability.reason,
    recommendedView,
    permission: capability.permission ?? permissionForView(recommendedView),
    currentSemanticMetricKeys: parsed.semanticIntent.metricKeys,
    currentSemanticViews: semanticViews,
    currentSemanticConfidence: Number(parsed.semanticIntent.confidence.toFixed(4)),
    pages: capability.pages.map(repoPath),
    backend: capability.backend.map(repoPath),
    models: capability.models,
    developmentFacts: Object.fromEntries(
      capability.factKeys.map((key) => [key, developmentEvidence.counts[key] ?? null]),
    ),
  };
}

function isImplementedDirectCapability(
  capability: CapabilityEvidence,
  recommendedView: string,
  semanticViews: string[],
  semanticConfidence: number,
) {
  if (!['existing_facts_new_view', 'existing_facts_new_metric'].includes(capability.auditClass)) return false;
  if (!recommendedView || !knownViewNames.has(recommendedView)) return false;
  return semanticConfidence >= 0.75 && semanticViews.includes(recommendedView);
}

function classifyCapability(
  item: ManifestQuestion,
  semanticViews: string[],
  semanticConfidence: number,
): CapabilityEvidence {
  const question = item.question;
  const boundary = BOUNDARY_CAPABILITIES.find((candidate) => candidate.match.test(question));
  if (boundary) return stripMatch(boundary);

  const incomplete = INCOMPLETE_CAPABILITIES.find((candidate) => candidate.match.test(question));
  if (incomplete) return stripMatch(incomplete);

  if (/(消费了钱但很少用次卡|消费很多但突然消失|消费金额分.*层|最近消费明显减少|消费频率明显下降|重要客户来店|到店客人的基本信息|预约的客人里.*VIP)/.test(question)) {
    return {
      capabilityKey: 'customer_behavior_combination_metric',
      capabilityLabel: '客户行为组合口径',
      auditClass: 'existing_facts_new_metric',
      priority: 'P1',
      reason: '基础字段已开放，但题目仍需要阈值、跨期趋势或预约与客户价值的组合口径；不能仅因单视图存在就宣称已直接支持。',
      recommendedView: 'ask_data_customer_profile_summary_view',
      permission: 'core:customer:view',
      pages: ['src/app/pages/CustomerData.tsx'],
      backend: ['packages/server-v2/src/customers/customers.controller.ts'],
      models: ['Customer', 'ProductOrder', 'Reservation', 'CustomerLifecycleSnapshot'],
      factKeys: ['Customer', 'ProductOrder', 'Reservation', 'CustomerLifecycleSnapshot'],
    };
  }

  const newView = NEW_VIEW_CAPABILITIES.find((candidate) => candidate.match.test(question));
  if (newView) return stripMatch(newView);

  const newMetric = EXISTING_VIEW_METRIC_CAPABILITIES.find((candidate) => candidate.match.test(question));
  if (newMetric) return stripMatch(newMetric);

  const preferredView = semanticViews.find((viewName) => knownViewNames.has(viewName));
  if (preferredView && semanticConfidence >= 0.75) {
    const view = ASK_DATA_FREE_SQL_VIEWS.find((candidate) => candidate.viewName === preferredView);
    return {
      capabilityKey: `existing_${view?.domain ?? 'ask'}_query`,
      capabilityLabel: view?.label ?? preferredView,
      auditClass: 'existing_ask_direct',
      priority: 'P0',
      reason: '当前独立语义合同已能命中现有治理视图；只需纳入真实泛化回归，不需要新增底层事实。',
      recommendedView: preferredView,
      permission: view?.requiredPermissions.join(' 或 '),
      pages: [],
      backend: ['packages/server-v2/src/ask-data-free-sql/ask-data-free-sql.catalog.ts'],
      models: [],
      factKeys: [],
    };
  }

  return {
    capabilityKey: 'unproven_backend_fact',
    capabilityLabel: '未形成可证明的问数事实',
    auditClass: 'backend_fact_incomplete',
    priority: 'P2',
    reason: '静态页面或对象存在不足以证明题目所需事实；当前未找到完整、可持续且可按门店审计的数据链路。',
    pages: [],
    backend: [],
    models: [],
    factKeys: [],
  };
}

type MatchableCapability = CapabilityEvidence & { match: RegExp };

const BOUNDARY_CAPABILITIES: MatchableCapability[] = [
  capability(
    'supplier_value_standard_required',
    '供应商性价比标准缺失',
    'sensitive_or_context',
    'boundary',
    /供应商.*性价比|性价比.*供应商/,
    '当前只有已审批报价和预计交期，没有质量评分；必须先明确按价格、交期或二者组合比较。',
    {
      recommendedView: 'ask_data_supplier_quote_terms_view',
      permission: 'core:supply:view',
      pages: ['src/app/pages/supply-platform/SupplyPlatformMvp.tsx'],
      backend: ['packages/server-v2/src/ask-data-free-sql/ask-data-intent-parser.ts'],
      models: ['SupplySupplier', 'SupplyQuote', 'SupplyCatalogMapping'],
      factKeys: ['SupplySupplier', 'SupplyQuote', 'SupplyQuoteApproved'],
    },
  ),
  capability(
    'readonly_action',
    '只读边界之外的操作',
    'readonly_action',
    'boundary',
    /(帮我设置|帮我记录|帮我记|帮我打开|帮我创建|自动准备|自动发|自动送|自动触发|发给|推送|帮我核销|充值|结账|申请退款|改期|调整排班|记录入库|开具|提醒.*联系)/,
    '管理端可能存在操作入口，但 Ami Ask 的产品边界是只读查询；该题不得通过自由 SQL 执行副作用。',
  ),
  capability(
    'sensitive_or_context',
    '敏感信息或缺失会话实体',
    'sensitive_or_context',
    'boundary',
    /(^|[，。])(她|这个客人|这位客人|下一个客人|下午那个客人|那个预约|这次护理|她家人)|有个客人.*叫|护理历史|特殊要求|皮肤|过敏|仪器项目|在家用什么护肤品|比较难服务|老板对我.*反馈/,
    '题目依赖上一轮客户、预约或员工身份，或触及护理健康与内部备注；不能为了覆盖率开放敏感原文。',
  ),
  capability(
    'brain_or_advice',
    '建议、预测或内容生成',
    'brain_or_advice',
    'boundary',
    /(想做个|帮我设计|方法|适合.*吗|怎么调整|怎么回答|怎么介绍|怎么处理|怎么影响|要不要|该不该|需要特别注意|补偿|安抚|帮我解释|如果.*(?:增加|减少|打八折|促销)|能完成目标吗|压力有多大|控制空间|降低成本的建议|采购建议|补货建议|下次采购|需要补什么货|需要补多少|需要马上采购|帮我估算|分析一下|主要是什么原因|为什么|有没有办法|评估一下|完整.*报告|月度财务简报|收入明细报表|成本利润分析报告)/,
    '题目要求方案、预测、归因解释或内容组织，SQL 只能提供事实证据，最终能力应由独立 Ami Brain 或受控报告能力承接。',
  ),
];

const INCOMPLETE_CAPABILITIES: MatchableCapability[] = [
  capability(
    'supplier_quote_history_missing',
    '供应商报价历史序列缺失',
    'backend_fact_incomplete',
    'P1',
    /原材料价格.*趋势|报价.*上涨趋势|报价.*下降趋势/,
    '当前同 SKU 只有当前已审批报价横截面，缺少至少两个时间点的可比历史序列，不得用不同供应商报价伪造价格趋势。',
    {
      recommendedView: 'ask_data_supplier_quote_terms_view',
      permission: 'core:supply:view',
      pages: ['src/app/pages/supply-platform/SupplyPlatformMvp.tsx'],
      backend: ['packages/server-v2/src/supply-platform/supply-platform.controller.ts'],
      models: ['SupplySupplier', 'SupplyQuote', 'SupplyCatalogMapping'],
      factKeys: ['SupplySupplier', 'SupplyQuote', 'SupplyQuoteApproved'],
    },
  ),
  capability(
    'live_store_presence',
    '实时在店、等待与现场状态',
    'backend_fact_incomplete',
    'P1',
    /(现在还有几个在店|现在店里.*在忙|现在店里有几个客人|现在在忙吗|大概还要多久|提前到了在等|等待时间长而离开|床位|没到岗|请假了|通知到位|爽约.*提前联系|可能爽约|超时.*下一个预约|预约超过两小时没有确认)/,
    '预约、排班和服务任务存在，但当前门店的状态事件与等待事件均为 0，无法证明可靠的实时在店、等待、通知或爽约事实。',
    {
      pages: ['src/app/pages/ProjectReservation.tsx'],
      backend: [
        'packages/server-v2/src/reservations/reservations.controller.ts',
        'packages/server-v2/src/reservations/customer-waiting.controller.ts',
      ],
      models: ['Reservation', 'ReservationStatusEvent', 'CustomerWaitingEpisode', 'ServiceTask'],
      factKeys: ['Reservation', 'ReservationStatusEvent', 'CustomerWaitingEpisode', 'ServiceTask'],
      permission: 'core:store:reservations',
    },
  ),
  capability(
    'staff_hr_history',
    '员工人事、考勤和培训历史',
    'backend_fact_incomplete',
    'P2',
    /(培训|请假了几次|迟到|早退|试用期|转正|离职|没到岗)/,
    '现有美容师、排班和请假对象不足以形成考勤、试用期、转正、培训与离职风险的审计事实。',
    {
      pages: ['src/app/pages/BeauticianManagement.tsx'],
      backend: ['packages/server-v2/src/scheduling/scheduling.service.ts'],
      models: ['Beautician', 'Schedule', 'BeauticianTimeOff'],
      factKeys: ['Beautician', 'Schedule'],
      permission: 'core:store:beauticians',
    },
  ),
  capability(
    'device_incident_history',
    '设备故障历史',
    'backend_fact_incomplete',
    'P2',
    /设备.*(?:问题|故障)|仪器.*(?:问题|故障)/,
    'TerminalDevice 只有当前状态与最近在线时间，没有独立故障事件和维修闭环，不能回答“最近是否出过问题”。',
    {
      models: ['TerminalDevice'],
      factKeys: ['TerminalDevice'],
      permission: 'core:terminal:view',
    },
  ),
  capability(
    'supplier_quality_governance',
    '供应商资质、质检与争议',
    'backend_fact_incomplete',
    'P2',
    /(供应商.*(?:资质|质检|退换货|纠纷|新品|涨价通知|优惠)|这批货的质检|替代进口|新的更好的供应商)/,
    '供应商、报价对象存在，但当前资质记录为 0，且没有质检、退换货政策、涨价通知或争议处理事实闭环。',
    {
      pages: ['src/app/pages/supply-platform/SupplyPlatformMvp.tsx'],
      backend: ['packages/server-v2/src/supply-platform/supply-platform.controller.ts'],
      models: ['SupplySupplier', 'SupplierQualification', 'SupplyQuote'],
      factKeys: ['SupplySupplier', 'SupplyQuote', 'SupplierQualification'],
      permission: 'core:supply:view',
    },
  ),
  capability(
    'promotion_redemption_events',
    '优惠发放与核销事件闭环',
    'backend_fact_incomplete',
    'P1',
    /(优惠券平均核销周期|优惠.*滥用|优惠.*送出去多少钱|打折优惠批了多少|免单或赠送了多少|员工自主给客户打折的权限|没有授权.*优惠|超权限.*优惠)/,
    'Promotion 有配置与累计计数，但开发门店当前 usedCount 合计为 0，且缺少逐次发放、核销、审批与授权事件，不能证明周期和滥用。',
    {
      pages: ['src/app/pages/PromotionManagement.tsx'],
      backend: ['packages/server-v2/src/marketing/marketing.controller.ts'],
      models: ['Promotion', 'ProductOrder'],
      factKeys: ['Promotion', 'PromotionUsed'],
      permission: 'core:marketing:view',
    },
  ),
  capability(
    'financial_governance_missing',
    '现金流、预算、手续费与审批治理',
    'backend_fact_incomplete',
    'P2',
    /(现金流|预算|手续费|审批流程|待审批|超出预算|财务报告什么时候|预期差多少)/,
    '订单、支付和退款事实存在，但题目要求的预算、渠道手续费、审批状态、现金流账户或跨月资金治理没有完整事实模型。',
    {
      pages: ['src/app/pages/finance/FinanceOverview.tsx'],
      backend: ['packages/server-v2/src/finance-metrics/finance-metrics.controller.ts'],
      models: ['ProductOrder', 'PaymentRecord', 'RefundRecord', 'DailySettlement'],
      factKeys: ['ProductOrder', 'PaymentRecord', 'RefundRecord', 'DailySettlement'],
      permission: 'core:finance:view',
    },
  ),
  capability(
    'staff_customer_attribution_missing',
    '员工获客、复购、升单与客户归属',
    'backend_fact_incomplete',
    'P1',
    /(升单能力|客户被别的美容师|带走客户|推荐过新客户|转介绍能力)/,
    '订单与服务可关联员工，但“归属客户、转介绍、升单归因、抢客”缺少稳定治理定义，不能仅凭备注或单次订单推断。',
    {
      pages: ['src/app/pages/operation-profit/BeauticianPerformance.tsx'],
      backend: ['packages/server-v2/src/orders/orders.service.ts'],
      models: ['OrderItem', 'ServiceTask', 'Beautician', 'Customer'],
      factKeys: ['Beautician', 'ProductOrder', 'ServiceTask'],
      permission: 'core:beautician-performance:view',
    },
  ),
  capability(
    'store_targets_missing',
    '经营目标与达成预测',
    'backend_fact_incomplete',
    'P2',
    /(目标|能完成目标|还差多远)/,
    '门店指标快照存在，但当前门店目标表没有可用记录；没有目标值时不能输出达成率或完成预测。',
    {
      models: ['StoreMetricTarget', 'StoreMetricSnapshot'],
      factKeys: ['StoreMetricTarget', 'StoreMetricSnapshot'],
      permission: 'core:finance:view',
    },
  ),
];

const NEW_VIEW_CAPABILITIES: MatchableCapability[] = [
  capability(
    'customer_behavior',
    '客户行为与复购事实',
    'existing_ask_direct',
    'P0',
    /(老客|新客|好久没来|三个月没来|45天没来|只来一次|办了卡但还没预约|开了次卡但从来不来|买了次卡但最近一直不来|卡里的次数快用完了还没约|消费了钱但很少用次卡|消费频率.*下降|平均多久回来|回头率|复购率|最近消费.*减少|突然消失|最近有点被唤醒|上次来是什么时候|固定.*习惯|快.*生日|生日|来源渠道|客户.*分层|消费金额分.*层|高价值|潜力.*长期客户|到店客人的画像|重要客户来店|到店客人的基本信息|预约的客人里.*VIP|王芳.*情况|张雯.*上次来)/,
    '已扩展脱敏客户档案视图，开放来源、年龄段、生日窗口、到店复购、次卡使用和生命周期摘要；不开放手机号、精确生日、健康信息或证据 JSON。',
    {
      recommendedView: 'ask_data_customer_profile_summary_view',
      pages: ['src/app/pages/CustomerData.tsx'],
      backend: [
        'packages/server-v2/src/customers/customers.controller.ts',
        'packages/server-v2/src/customers/customers.service.ts',
      ],
      models: ['Customer', 'ProductOrder', 'Reservation', 'CustomerLifecycleSnapshot'],
      factKeys: ['Customer', 'CustomerBirthday', 'CustomerSource', 'CustomerVisitFacts', 'ProductOrder', 'Reservation'],
      permission: 'core:customer:view',
    },
  ),
  capability(
    'customer_marketing_attribution',
    '客户级营销响应与归因',
    'existing_facts_new_view',
    'P1',
    /(活动有响应|参加过.*活动|被活动吸引|持续复购|渠道带来的客户质量|免费次卡.*付费客户|对优惠很敏感|活动.*客户)/,
    '营销触达、客户、订单和归因事实存在，但当前 Ask 只开放汇总 ROI，缺少脱敏客户级响应视图。',
    {
      recommendedView: 'ask_data_customer_marketing_response_view',
      pages: ['src/app/pages/MarketingAnalytics.tsx'],
      backend: [
        'packages/server-v2/src/marketing/attribution/marketing-effect-fact.service.ts',
        'packages/server-v2/src/marketing/marketing.controller.ts',
      ],
      models: ['MarketingEffectFact', 'MarketingAutomationTouch', 'MarketingAttribution', 'Customer'],
      factKeys: ['MarketingEffectFact', 'MarketingEffectCustomerLinked', 'MarketingAutomationTouch'],
      permission: 'core:marketing:analytics',
    },
  ),
  capability(
    'supplier_commercial_terms',
    '供应商报价与商业条款',
    'existing_facts_new_view',
    'P1',
    /(供应商.*报价|比较.*供应商.*价格|供应商.*价格|最低采购量|账期|性价比|换个供应商降低成本|原材料价格.*趋势)/,
    '供应商、SKU、有效报价、MOQ、交付天数和账期字段已存在，可建立门店映射后的只读报价视图。',
    {
      recommendedView: 'ask_data_supplier_quote_terms_view',
      pages: ['src/app/pages/supply-platform/SupplyPlatformMvp.tsx'],
      backend: ['packages/server-v2/src/supply-platform/supply-platform.controller.ts'],
      models: ['SupplySupplier', 'SupplyQuote', 'SupplyCatalogMapping'],
      factKeys: ['SupplySupplier', 'SupplyQuote', 'SupplyQuoteApproved'],
      permission: 'core:supply:view',
    },
  ),
  capability(
    'inventory_turnover_planning',
    '库存周转与补货事实',
    'existing_facts_new_view',
    'P1',
    /(积压|周转率|周转.*最低|够用多久|够用多少次|一直在消耗.*没有采购|需求突然增加|进货太多|开了之后很长时间|每天大概消耗|每日平均耗材|这季度每个产品的用量|一直有但从来不用|快断货但还没采购|项目因为缺耗材)/,
    '库存、批次、消耗和采购事实存在，可计算历史消耗速度、库存可用天数和周转；预测补货仍应披露假设。',
    {
      recommendedView: 'ask_data_inventory_turnover_view',
      pages: ['src/app/pages/StockManagement.tsx', 'src/app/pages/PurchaseManagement.tsx'],
      backend: ['packages/server-v2/src/inventory/inventory.controller.ts'],
      models: ['Product', 'StockBatch', 'StockMovement', 'ProcurementOrderItem'],
      factKeys: ['Product', 'StockBatch', 'StockMovement', 'ProcurementOrder'],
      permission: 'core:inventory:stock',
    },
  ),
  capability(
    'staff_consumption_efficiency',
    '员工耗材使用效率',
    'existing_facts_new_view',
    'P1',
    /(美容师.*用料|各美容师.*耗材|耗材使用效率|用料比标准)/,
    'BOM 和服务消耗事实存在，但当前 BOM 偏差视图没有员工维度，需要通过服务任务建立受控员工归属。',
    {
      recommendedView: 'ask_data_staff_consumption_efficiency_view',
      pages: ['src/app/pages/ServiceConsumption.tsx'],
      backend: ['packages/server-v2/src/inventory/inventory.controller.ts'],
      models: ['StockMovement', 'ProjectBomItem', 'ServiceTask', 'Beautician'],
      factKeys: ['StockMovementServiceConsume', 'ProjectBomItem', 'ServiceTask', 'Beautician'],
      permission: 'core:inventory:consumption',
    },
  ),
  capability(
    'product_project_margin',
    '商品与项目经营毛利',
    'existing_facts_new_view',
    'P1',
    /(产品.*价格低于成本|产品毛利率|项目.*毛利|项目的成本|耗材成本占服务收入|项目.*亏损|产品销售的毛利.*服务项目|项目成本明显上涨)/,
    '订单明细、商品成本、项目销售和 BOM 成本均存在，但当前利润视图只有已确认月结总额，缺少商品/项目粒度的治理口径。',
    {
      recommendedView: 'ask_data_item_margin_view',
      pages: ['src/app/pages/finance/ProfitWorkbench.tsx', 'src/app/pages/ServiceConsumption.tsx'],
      backend: [
        'packages/server-v2/src/orders/orders.controller.ts',
        'packages/server-v2/src/finance-metrics/finance-metrics.controller.ts',
      ],
      models: ['OrderItem', 'Product', 'ProjectBomItem', 'StockMovement'],
      factKeys: ['ProductOrder', 'Product', 'ProjectBomItem', 'StockMovement'],
      permission: 'core:operation-profit:view',
    },
  ),
  capability(
    'staff_customer_outcomes',
    '员工客户经营结果',
    'existing_facts_new_view',
    'P1',
    /(客户复购率最高|很长时间没有新客|擅长的项目客户最满意|所有员工的收款加起来|退款影响到员工提成)/,
    '订单、服务任务、员工、客户、反馈和提成事实可以形成受控员工结果视图；必须固定客户归属与去重口径，不读取反馈原文。',
    {
      recommendedView: 'ask_data_staff_customer_outcome_view',
      pages: ['src/app/pages/operation-profit/BeauticianPerformance.tsx'],
      backend: [
        'packages/server-v2/src/orders/orders.controller.ts',
        'packages/server-v2/src/customer-feedback/customer-feedback.controller.ts',
      ],
      models: ['OrderItem', 'ServiceTask', 'Customer', 'CustomerServiceFeedback', 'CommissionRecord'],
      factKeys: ['ProductOrder', 'ServiceTask', 'Customer', 'CustomerServiceFeedback', 'CommissionRecord'],
      permission: 'core:beautician-performance:view',
    },
  ),
  capability(
    'discount_refund_governance',
    '折扣与退款事实',
    'existing_facts_new_view',
    'P1',
    /(打折优惠减少了多少收入|退款申请需要处理|退款申请的平均处理时间|客户经常退款|退款但服务已经做完|退款后马上重新消费|折扣总金额和折扣率|退款率最高|跨月的预付款)/,
    '订单折扣、退款状态、创建/完成时间、客户和服务任务均有结构化字段，可新增不含原因原文与审批备注的治理视图。',
    {
      recommendedView: 'ask_data_discount_refund_governance_view',
      pages: ['src/app/pages/finance/FinanceOverview.tsx', 'src/app/pages/finance/CashierReconciliation.tsx'],
      backend: ['packages/server-v2/src/orders/orders.controller.ts'],
      models: ['ProductOrder', 'RefundRecord', 'OrderItem', 'ServiceTask', 'Beautician'],
      factKeys: ['ProductOrder', 'RefundRecord', 'ServiceTask', 'Beautician'],
      permission: 'core:finance:view',
    },
  ),
  capability(
    'customer_service_consumption',
    '客户与服务耗材联合事实',
    'existing_facts_new_view',
    'P1',
    /(平均每个客人消耗多少耗材|消费了钱但很少用次卡|项目.*耗材成本各是多少|耗材成本占服务收入)/,
    '服务任务、订单项目和耗材流水可关联客户与项目，需在语义视图内先固定归属和去重，避免自由 JOIN 放大金额。',
    {
      recommendedView: 'ask_data_service_consumption_unit_economics_view',
      pages: ['src/app/pages/ServiceConsumption.tsx'],
      backend: ['packages/server-v2/src/inventory/inventory.controller.ts'],
      models: ['ServiceTask', 'OrderItem', 'StockMovement', 'ProjectBomItem'],
      factKeys: ['ServiceTask', 'ProductOrder', 'StockMovementServiceConsume', 'ProjectBomItem'],
      permission: 'core:inventory:consumption',
    },
  ),
];

const EXISTING_VIEW_METRIC_CAPABILITIES: MatchableCapability[] = [
  capability(
    'existing_reservation_metric',
    '预约列表、峰值与到店状态指标',
    'existing_facts_new_metric',
    'P0',
    /(今天所有的预约|明天所有预约|预约最多的是哪几天|下午还有几个预约|下一个预约是谁|今天第一个|今天最后一个|到店率|爽约了几个|今天服务了几个客人|今天来了几个客人|下午有预约但.*找不到记录|下午哪个时段可以加客|整体的服务流程安排|下午两点那个客人想做什么项目)/,
    '当前预约和服务视图已有日期、时间、状态、员工、项目与脱敏客户字段；需要补齐口语指标和受控排序/状态口径。',
    {
      recommendedView: 'agent_v3_reservation_view',
      pages: ['src/app/pages/ProjectReservation.tsx'],
      backend: ['packages/server-v2/src/reservations/reservations.controller.ts'],
      models: ['Reservation', 'ServiceTask'],
      factKeys: ['Reservation', 'ServiceTask'],
      permission: 'core:store:reservations',
    },
  ),
  capability(
    'existing_staff_metric',
    '员工绩效、服务量与产能指标',
    'existing_facts_new_metric',
    'P0',
    /(谁的业绩最好|美容师接的客人最多|这周业绩明显下滑|谁服务了几个客人|员工.*进步最快|美容师的客诉最多|员工这周业绩|总共要服务几个小时|哪个美容师可以接新单)/,
    '员工绩效、服务质量、反馈和产能视图已经开放所需字段，主要缺口是时间粒度、比较和同义词入口。',
    {
      recommendedView: 'ask_data_staff_performance_view',
      pages: ['src/app/pages/operation-profit/BeauticianPerformance.tsx'],
      backend: ['packages/server-v2/src/finance-metrics/finance-metrics.controller.ts'],
      models: ['CommissionRecord', 'ServiceTask', 'Schedule', 'Beautician'],
      factKeys: ['CommissionRecord', 'ServiceTask', 'Schedule', 'Beautician'],
      permission: 'core:beautician-performance:view',
    },
  ),
  capability(
    'existing_inventory_metric',
    '库存、效期、销售与消耗指标',
    'existing_facts_new_metric',
    'P0',
    /(库存不够|只剩最后几瓶|卖得最好的产品|补水系列.*库存|防晒产品.*多少|30天内要过期|已经过期|最容易过期|最贵的.*耗材.*库存|这个月用了多少|哪个项目消耗耗材最多|各项目的耗材成本|项目的耗材成本最高|消耗异常的产品|库存损耗率|有什么产品可以卖|耗材被浪费|使用不规范)/,
    '现有商品库存、库存流水、库存报废和 BOM 偏差视图已经开放数量、效期、成本和项目维度；需补充派生指标与组合查询合同。',
    {
      recommendedView: 'agent_v3_product_inventory_view',
      pages: ['src/app/pages/StockManagement.tsx', 'src/app/pages/ExpiryManagement.tsx'],
      backend: ['packages/server-v2/src/inventory/inventory.controller.ts'],
      models: ['Product', 'StockBatch', 'StockMovement', 'ProjectBomItem'],
      factKeys: ['Product', 'StockBatch', 'StockBatchExpiry', 'StockMovement', 'ProjectBomItem'],
      permission: 'core:inventory:stock',
    },
  ),
  capability(
    'existing_finance_metric',
    '收入、支付、退款、成本与对账指标',
    'existing_facts_new_metric',
    'P0',
    /(今天收了多少钱|收入汇总|每天的收入|本周跟上周比|这个月比上个月|现金|储值收款|次卡销售.*金额|收入明细|退款率|重复退款|重复消费|退款明细|不正常的流水|财务数据.*异常|折扣总金额|这个月.*成本|成本项目异常增加|盈亏平衡点|这个月已经收了多少钱|第一笔收款|收款记录|付了款但没有记录|储值卡消费|预付了但还没使用|收款没有对应服务|到账的钱和开单的钱差)/,
    '订单、支付退款、日结、经营成本和对账异常视图已具备基础事实；需要补充比较、渠道、折扣及组合指标合同。',
    {
      recommendedView: 'agent_v3_payment_refund_view',
      pages: ['src/app/pages/finance/FinanceOverview.tsx', 'src/app/pages/finance/CashierReconciliation.tsx'],
      backend: [
        'packages/server-v2/src/orders/orders.controller.ts',
        'packages/server-v2/src/finance-metrics/finance-metrics.controller.ts',
      ],
      models: ['ProductOrder', 'PaymentRecord', 'RefundRecord', 'DailySettlement', 'FinanceReconciliationIssue'],
      factKeys: ['ProductOrder', 'PaymentRecord', 'RefundRecord', 'DailySettlement', 'FinanceReconciliationIssue'],
      permission: 'core:finance:view',
    },
  ),
  capability(
    'existing_marketing_metric',
    '营销投入、渠道与自动化指标',
    'existing_facts_new_metric',
    'P0',
    /(活动花了多少钱.*收入|哪个渠道.*质量最好|自动化规则在运行.*效果|活动.*带来.*收入|权益.*吸引力)/,
    '营销 ROI、活动、优惠和自动触达视图已有汇总事实；需要明确估算成本、归因窗口和效果比较口径。',
    {
      recommendedView: 'ask_data_marketing_roi_view',
      pages: ['src/app/pages/MarketingAnalytics.tsx'],
      backend: ['packages/server-v2/src/marketing/marketing.controller.ts'],
      models: ['MarketingEffectFact', 'MarketingAutomationStrategy', 'Promotion'],
      factKeys: ['MarketingEffectFact', 'MarketingAutomationStrategy', 'Promotion'],
      permission: 'core:marketing:analytics',
    },
  ),
];

function capability(
  capabilityKey: string,
  capabilityLabel: string,
  auditClass: AuditClass,
  priority: Priority,
  match: RegExp,
  reason: string,
  extra: Partial<CapabilityEvidence> = {},
): MatchableCapability {
  return {
    capabilityKey,
    capabilityLabel,
    auditClass,
    priority,
    match,
    reason,
    pages: [],
    backend: [],
    models: [],
    factKeys: [],
    ...extra,
  };
}

function stripMatch(value: MatchableCapability): CapabilityEvidence {
  const { match: _match, ...result } = value;
  return result;
}

async function loadDevelopmentEvidence() {
  const empty = { connectionMode: 'not_executed', databaseHost: '', counts: {} as Record<string, number> };
  if (!allowDevelopmentAdmin) return empty;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL missing');
  const url = new URL(databaseUrl);
  if (!url.hostname.endsWith('supabase.com')) {
    throw new Error(`Refusing admin support audit on unapproved host: ${url.hostname}`);
  }
  const client = new Client({
    connectionString: databaseUrl,
    application_name: 'ask_data_admin_support_audit',
  });
  await client.connect();
  const counts: Record<string, number> = {};
  for (const [key, query] of Object.entries(developmentFactQueries())) {
    const result = await client.query(query.sql, query.storeScoped ? [storeId] : []);
    counts[key] = Number(result.rows[0]?.count ?? 0);
  }
  await client.end();
  return {
    connectionMode: 'development_admin',
    databaseHost: url.hostname,
    counts,
  };
}

function developmentFactQueries(): Record<string, { sql: string; storeScoped: boolean }> {
  return {
  Customer: { sql: 'SELECT count(*)::int count FROM "Customer" WHERE "storeId"=$1 AND "deletedAt" IS NULL', storeScoped: true },
  CustomerBirthday: { sql: 'SELECT count(*)::int count FROM "Customer" WHERE "storeId"=$1 AND "deletedAt" IS NULL AND birthday IS NOT NULL', storeScoped: true },
  CustomerSource: { sql: 'SELECT count(*)::int count FROM "Customer" WHERE "storeId"=$1 AND "deletedAt" IS NULL AND source IS NOT NULL AND btrim(source) <> \'\'', storeScoped: true },
  CustomerVisitFacts: { sql: 'SELECT count(*)::int count FROM "Customer" WHERE "storeId"=$1 AND "deletedAt" IS NULL AND ("visitCount" > 0 OR "lastVisitDate" IS NOT NULL)', storeScoped: true },
  CustomerLifecycleSnapshot: { sql: 'SELECT count(*)::int count FROM "CustomerLifecycleSnapshot" WHERE "storeId"=$1', storeScoped: true },
  CustomerOpportunity: { sql: 'SELECT count(*)::int count FROM "CustomerOpportunity" WHERE "storeId"=$1', storeScoped: true },
  CustomerServiceFeedback: { sql: 'SELECT count(*)::int count FROM customer_service_feedback WHERE "storeId"=$1', storeScoped: true },
  Reservation: { sql: 'SELECT count(*)::int count FROM "Reservation" WHERE "storeId"=$1', storeScoped: true },
  ReservationStatusEvent: { sql: 'SELECT count(*)::int count FROM "ReservationStatusEvent" WHERE "storeId"=$1', storeScoped: true },
  CustomerWaitingEpisode: { sql: 'SELECT count(*)::int count FROM customer_waiting_episode WHERE "storeId"=$1', storeScoped: true },
  Schedule: { sql: 'SELECT count(*)::int count FROM "Schedule" WHERE "storeId"=$1', storeScoped: true },
  ServiceTask: { sql: 'SELECT count(*)::int count FROM "ServiceTask" WHERE "storeId"=$1', storeScoped: true },
  Beautician: { sql: 'SELECT count(*)::int count FROM "Beautician" WHERE "storeId"=$1', storeScoped: true },
  BeauticianUserLinked: { sql: 'SELECT count(*)::int count FROM "Beautician" WHERE "storeId"=$1 AND "userId" IS NOT NULL', storeScoped: true },
  CommissionRecord: { sql: 'SELECT count(*)::int count FROM "CommissionRecord" WHERE "storeId"=$1', storeScoped: true },
  ProductOrder: { sql: 'SELECT count(*)::int count FROM "ProductOrder" WHERE "storeId"=$1', storeScoped: true },
  PaymentRecord: { sql: 'SELECT count(*)::int count FROM "PaymentRecord" p JOIN "ProductOrder" o ON o.id=p."orderId" WHERE o."storeId"=$1', storeScoped: true },
  RefundRecord: { sql: 'SELECT count(*)::int count FROM "RefundRecord" r JOIN "ProductOrder" o ON o.id=r."orderId" WHERE o."storeId"=$1', storeScoped: true },
  DailySettlement: { sql: 'SELECT count(*)::int count FROM "DailySettlement" WHERE "storeId"=$1', storeScoped: true },
  FinanceReconciliationIssue: { sql: 'SELECT count(*)::int count FROM "FinanceReconciliationIssue" WHERE "storeId"=$1', storeScoped: true },
  OperatingCost: { sql: 'SELECT count(*)::int count FROM "OperatingCost" WHERE "storeId"=$1', storeScoped: true },
  Product: { sql: 'SELECT count(*)::int count FROM "Product" WHERE "storeId"=$1 AND "deletedAt" IS NULL', storeScoped: true },
  StockBatch: { sql: 'SELECT count(*)::int count FROM "StockBatch" b JOIN "Product" p ON p.id=b."productId" WHERE p."storeId"=$1', storeScoped: true },
  StockBatchExpiry: { sql: 'SELECT count(*)::int count FROM "StockBatch" b JOIN "Product" p ON p.id=b."productId" WHERE p."storeId"=$1 AND b."expiryDate" IS NOT NULL', storeScoped: true },
  StockMovement: { sql: 'SELECT count(*)::int count FROM "StockMovement" WHERE "storeId"=$1', storeScoped: true },
  StockMovementServiceConsume: { sql: 'SELECT count(*)::int count FROM "StockMovement" WHERE "storeId"=$1 AND "movementType" IN (\'service_consume\', \'service_consumption\')', storeScoped: true },
  ProjectBomItem: { sql: 'SELECT count(*)::int count FROM "ProjectBomItem" b JOIN "Project" p ON p.id=b."projectId" WHERE p."storeId"=$1', storeScoped: true },
  ProcurementOrder: { sql: 'SELECT count(*)::int count FROM "ProcurementOrder" WHERE "storeId"=$1', storeScoped: true },
  SupplySupplier: { sql: 'SELECT count(*)::int count FROM "SupplySupplier" WHERE "deletedAt" IS NULL', storeScoped: false },
  SupplyQuote: { sql: 'SELECT count(*)::int count FROM "SupplyQuote" WHERE "deletedAt" IS NULL', storeScoped: false },
  SupplyQuoteApproved: { sql: 'SELECT count(*)::int count FROM "SupplyQuote" WHERE "deletedAt" IS NULL AND status=\'active\' AND "auditStatus"=\'approved\'', storeScoped: false },
  SupplierQualification: { sql: 'SELECT count(*)::int count FROM "SupplierQualification"', storeScoped: false },
  MarketingEffectFact: { sql: 'SELECT count(*)::int count FROM "MarketingEffectFact" WHERE "storeId"=$1', storeScoped: true },
  MarketingEffectCustomerLinked: { sql: 'SELECT count(*)::int count FROM "MarketingEffectFact" WHERE "storeId"=$1 AND "customerId" IS NOT NULL', storeScoped: true },
  MarketingAutomationStrategy: { sql: 'SELECT count(*)::int count FROM "MarketingAutomationStrategy" WHERE "storeId"=$1', storeScoped: true },
  MarketingAutomationTouch: { sql: 'SELECT count(*)::int count FROM "MarketingAutomationTouch" t JOIN "MarketingAutomationStrategy" s ON s.id=t."strategyId" WHERE s."storeId"=$1', storeScoped: true },
  Promotion: { sql: 'SELECT count(*)::int count FROM "Promotion" WHERE "storeId"=$1 OR "storeId" IS NULL', storeScoped: true },
  PromotionUsed: { sql: 'SELECT coalesce(sum("usedCount"),0)::int count FROM "Promotion" WHERE "storeId"=$1 OR "storeId" IS NULL', storeScoped: true },
  TerminalDevice: { sql: 'SELECT count(*)::int count FROM "TerminalDevice" WHERE "storeId"=$1', storeScoped: true },
  StoreMetricTarget: { sql: 'SELECT count(*)::int count FROM store_metric_target WHERE "storeId"=$1', storeScoped: true },
  StoreMetricSnapshot: { sql: 'SELECT count(*)::int count FROM store_metric_snapshot WHERE "storeId"=$1', storeScoped: true },
  };
}

function renderMarkdown(
  value: {
    connectionMode: string;
    databaseHost: string;
    sourceQuestionCount: number;
    summary: {
      byAuditClass: Record<string, number>;
      directlyAnswerable: number;
      factsOpenable: number;
    };
    developmentFacts: Record<string, number>;
    questions: AuditItem[];
  },
  capabilities: Record<string, Record<string, number>>,
) {
  const lines: string[] = [];
  lines.push('# Ami Ask 管理端事实覆盖支持矩阵（2026-08-02）', '');
  lines.push('- 范围：第二轮题库中原自动分类为“管理端/后台已有相邻能力，Ask 未开放”的 234 题');
  lines.push(`- 数据环境：门店 ${storeId}，${value.connectionMode}`);
  lines.push(`- 数据库主机：${value.databaseHost || '未执行真实数据探针'}`);
  lines.push('- 边界：开发管理员数据量只用于判断开发事实是否存在，不代表生产专用只读验收', '');
  lines.push('## 一、审计结论', '');
  lines.push(
    `原 234 题不是 234 个开发需求。逐题校正后，现有 Ask 可直接承接 ${value.summary.directlyAnswerable} 题；已有后台事实、可通过补指标或新视图开放的题共 ${value.summary.factsOpenable} 题（${percent(value.summary.factsOpenable, value.sourceQuestionCount)}）。其余题属于事实闭环不完整、Brain 建议、写操作或敏感上下文边界。`,
    '',
  );
  lines.push('| 审计分类 | 题数 | 产品处理 |', '|---|---:|---|');
  const meanings: Record<AuditClass, string> = {
    existing_ask_direct: '补真实泛化回归与语义入口，不新增底表事实。',
    existing_facts_new_metric: '复用现有治理视图，增加指标、同义词、Query Plan 和回答合同。',
    existing_facts_new_view: '后台事实完整，经隐私与口径评审后增加 Ask 专用语义视图。',
    backend_fact_incomplete: '先建设业务事件或历史事实闭环，不允许从备注或页面状态推断。',
    brain_or_advice: '由独立 Ami Brain 承接建议、预测或内容组织；事实查询可作为证据。',
    readonly_action: '保留 Ask 只读边界，分流到受控业务操作。',
    sensitive_or_context: '要求明确实体或拒绝敏感字段，不以扩大字段开放提高覆盖率。',
  };
  for (const key of Object.keys(meanings) as AuditClass[]) {
    lines.push(`| ${key} | ${value.summary.byAuditClass[key] ?? 0} | ${meanings[key]} |`);
  }
  lines.push('', '## 二、能力簇与优先级', '');
  lines.push('| 能力簇 | 分类 | 优先级 | 题数 |', '|---|---|---:|---:|');
  for (const key of Object.keys(capabilities).sort()) {
    const [capabilityKey, label, auditClass, priority] = key.split('\t');
    const count = capabilities[key]?.count ?? 0;
    lines.push(`| ${label}（${capabilityKey}） | ${auditClass} | ${priority} | ${count} |`);
  }
  lines.push('', '## 三、开发数据事实', '');
  lines.push('| 事实 | 门店 6 数据量 |', '|---|---:|');
  for (const [key, count] of Object.entries(value.developmentFacts)) lines.push(`| ${key} | ${count} |`);
  lines.push('', '关键限制：', '');
  lines.push(
    `- 预约状态事件 ${value.developmentFacts.ReservationStatusEvent ?? 0} 条、等待事件 ${value.developmentFacts.CustomerWaitingEpisode ?? 0} 条，实时在店和等待分析暂不能开放。`,
    `- 客户反馈 ${value.developmentFacts.CustomerServiceFeedback ?? 0} 条，可以保留“暂无反馈数据”的查询能力，但不能用模拟数据证明满意度。`,
    `- 供应商资质 ${value.developmentFacts.SupplierQualification ?? 0} 条，报价能力可开放，资质与质检能力暂不开放。`,
    `- 14 名美容师中仅 ${value.developmentFacts.BeauticianUserLinked ?? 0} 名绑定登录账号，“我的排班/业绩”不能在身份覆盖补齐前全量启用。`,
    '',
  );
  lines.push('## 四、逐题支持矩阵', '');
  lines.push('| ID | 角色 | 问题 | 审计分类 | 能力/建议视图 | 优先级 | 证据与原因 |', '|---|---|---|---|---|---:|---|');
  for (const item of value.questions) {
    const evidenceText = [
      item.reason,
      item.models.length ? `模型：${item.models.join('、')}` : '',
      Object.keys(item.developmentFacts).length
        ? `数据：${Object.entries(item.developmentFacts).map(([key, count]) => `${key}=${count ?? '未取证'}`).join('、')}`
        : '',
    ].filter(Boolean).join('；');
    lines.push(
      `| ${item.id} | ${escapeCell(item.sourceRole)} | ${escapeCell(item.question)} | ${item.auditClass} | ${escapeCell(item.capabilityLabel)}${item.recommendedView ? `<br>${item.recommendedView}` : ''} | ${item.priority} | ${escapeCell(evidenceText)} |`,
    );
  }
  lines.push('', '## 五、开发顺序', '');
  lines.push(
    '1. P0：先补现有视图指标合同，覆盖收入、预约、员工、库存和营销的明确事实问法。',
    '2. P0：新增脱敏客户行为视图，开放生日窗口、来源、最近到店、复购间隔和沉睡客户。',
    '3. P1：新增供应商报价、库存周转、客户级营销响应、项目商品毛利和员工耗材效率视图。',
    '4. P1/P2：实时在店、等待、优惠滥用、供应商资质、现金流和员工归属先补业务事实闭环，再进入 Ask。',
    '5. Brain 建议、写操作、敏感健康信息继续独立分流，不计入 Ask 事实覆盖率失败。',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function renderCsv(items: AuditItem[]) {
  const headers = [
    'id', 'role', 'section', 'question', 'previousClass', 'auditClass', 'priority',
    'capabilityKey', 'capabilityLabel', 'reason', 'recommendedView', 'permission',
    'currentSemanticMetricKeys', 'currentSemanticViews', 'currentSemanticConfidence',
    'pages', 'backend', 'models', 'developmentFacts',
  ];
  const rows = items.map((item) => [
    item.id, item.sourceRole, item.section, item.question, item.previousClass, item.auditClass,
    item.priority, item.capabilityKey, item.capabilityLabel, item.reason, item.recommendedView,
    item.permission, item.currentSemanticMetricKeys.join('|'), item.currentSemanticViews.join('|'),
    item.currentSemanticConfidence, item.pages.join('|'), item.backend.join('|'), item.models.join('|'),
    JSON.stringify(item.developmentFacts),
  ]);
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function repoPath(path: string) {
  return relative(repoRoot, resolve(repoRoot, path));
}

function permissionForView(viewName?: string) {
  if (!viewName) return '';
  return ASK_DATA_FREE_SQL_VIEWS.find((view) => view.viewName === viewName)?.requiredPermissions.join(' 或 ') ?? '';
}

function argumentValue(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((result, item) => {
    const value = key(item);
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function groupCounts<T>(items: T[], group: (item: T) => string, key: (item: T) => string) {
  return items.reduce<Record<string, Record<string, number>>>((result, item) => {
    const groupKey = group(item);
    const value = key(item);
    result[groupKey] ??= {};
    result[groupKey][value] = (result[groupKey][value] ?? 0) + 1;
    return result;
  }, {});
}

function ratio(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function percent(numerator: number, denominator: number) {
  return denominator ? `${((numerator / denominator) * 100).toFixed(2)}%` : '0.00%';
}

function escapeCell(value: unknown) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

await main();
