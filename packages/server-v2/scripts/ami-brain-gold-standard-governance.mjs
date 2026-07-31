import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
const SOURCE_CSV = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-classification-v2.csv');
const SUITE_MANIFEST = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-suite-manifest-v2.json');
const OUTPUT_DIR = resolve(REPO_ROOT, 'docs/04-测试数据/Ami-Brain-事实金标准');
const OUTPUT_MANIFEST = resolve(OUTPUT_DIR, 'ami-brain-gold-standard-manifest-v1.json');
const OUTPUT_REPORT = resolve(OUTPUT_DIR, 'Ami-Brain-100题事实金标准候选与数据窗口报告-2026-07-29.md');
const headers = [
  'id',
  'status',
  'representative_case_id',
  'similarity',
  'cluster_id',
  'domain',
  'role',
  'type',
  'difficulty',
  'time_semantics',
  'coverage_signature',
  'reason',
  'product_loop_status',
  'product_feature_key',
  'management_entry_status',
  'backend_api_status',
  'data_facts_status',
  'missing_components',
  'question',
  'expected_target',
  'notes',
];

const quota = {
  finance: { label: '财务', count: 22, domains: ['财务域', '交易域'] },
  catalog: { label: '项目和商品', count: 7, domains: ['商品域'] },
  customer: { label: '客户', count: 11, domains: ['客户域'] },
  staff: { label: '员工', count: 19, domains: ['员工域'] },
  fulfillment: { label: '预约和履约', count: 15, domains: ['履约域'] },
  inventory: { label: '库存和采购', count: 26, domains: ['库存域', '供应链域'] },
};
const releaseCapabilityKeyList = [
  'appointment_gap_list',
  'beautician_customer_card_progress',
  'beautician_material_preparation',
  'beautician_personal_performance',
  'beautician_service_overview',
  'card_usage_action_preview',
  'customer_facts',
  'customer_follow_up_draft',
  'customer_priority_recommendation',
  'customer_waiting_loss_overview',
  'finance_material_cost_summary',
  'finance_payment_breakdown',
  'finance_risk_overview',
  'finance_staff_refund_rate_boundary',
  'finance_transaction_anomaly_review',
  'front_desk_operations_overview',
  'gap_fill_touch_preview',
  'inventory_operations_overview',
  'inventory_procurement_advice',
  'inventory_receipt_discrepancy_guidance',
  'inventory_risk_ranking',
  'manager_staff_overview',
  'marketing_automation_rule_preview',
  'marketing_campaign_cost_attribution_review',
  'marketing_campaign_plan',
  'marketing_customer_segment',
  'marketing_growth_overview',
  'marketing_message_draft',
  'marketing_strategy_execute_preview',
  'marketing_touch_draft',
  'order_revenue_analysis',
  'product_sales_ranking',
  'project_margin_analysis',
  'project_material_consumption_analysis',
  'project_service_ranking',
  'purchase_order_draft',
  'reservation_action_preview',
  'reservation_list',
  'service_record_completion_preview',
  'staff_performance_ranking',
  'store_operations_overview',
];
const releaseCapabilityKeys = new Set(releaseCapabilityKeyList);
// A fact gold standard must have one independently reproducible answer. Subjective
// analysis/risk questions stay in the product suite, but are not eligible for the
// deterministic truth snapshot until their threshold/formula contract is explicit.
const allowedTypes = new Set(['query_single', 'query_cross']);
const allowedTimeSemantics = new Set([
  'none',
  'natural_month',
  'natural_year',
  'half_year',
  'natural_week',
  'previous_month',
  'previous_week',
  'rolling_7d',
  'rolling_14d',
  'rolling_30d',
  'today',
  'yesterday',
]);
const privacyPattern = /(手机号|电话|生日|地址|微信|身份证|过敏史|病史)/u;
// These remain valid product-regression questions, but the frozen development
// dataset cannot produce the scalar truth implied by the wording. In BQ1103,
// the named product is not part of the named project's BOM; treating that as
// zero executable sessions would hide the actual business-contract mismatch.
const deterministicGoldExcludedCaseIds = new Set(['BQ1103']);
const deterministicGoldExcludedPattern = /够做多少次/u;
const FINANCE_ORDER_PROFIT_AUDIT_CONTRACTS = Object.freeze({
  BQ0846: Object.freeze({
    projection: 'gross_profit',
    scope: Object.freeze({ projectNames: Object.freeze(['晒后舒缓修护']) }),
  }),
  BQ0853: Object.freeze({ projection: 'per_order_gross_profit', scope: Object.freeze({ businessTypes: Object.freeze(['all']) }) }),
  BQ0854: Object.freeze({
    projection: 'gross_profit',
    scope: Object.freeze({ projectNames: Object.freeze(['亮肤淡斑管理']) }),
  }),
  BQ0857: Object.freeze({ projection: 'negative_order_ids', scope: Object.freeze({ businessTypes: Object.freeze(['all']) }) }),
  BQ0858: Object.freeze({
    projection: 'gross_profit',
    scope: Object.freeze({ businessTypes: Object.freeze(['member_card_open', 'card_sale']) }),
  }),
  BQ0859: Object.freeze({
    projection: 'cost_and_gross_profit',
    scope: Object.freeze({ businessTypes: Object.freeze(['product_sale']) }),
  }),
});
const fixedWindow = {
  storeId: 6,
  timezone: 'Asia/Shanghai',
  periodStart: '2026-06-01T00:00:00+08:00',
  periodEndExclusive: '2026-07-01T00:00:00+08:00',
  snapshotAt: null,
  snapshotPolicy: 'bind_at_truth_generation_and_invalidate_on_source_change',
  periodLabel: '2026年6月',
};

const suiteRaw = readFileSync(SUITE_MANIFEST, 'utf8');
const suite = JSON.parse(suiteRaw);
const productLoopPath = resolve(REPO_ROOT, suite.productLoopEligibility.path);
const productLoopRaw = readFileSync(productLoopPath, 'utf8');
const productLoop = JSON.parse(productLoopRaw);
const productLoopStatuses = new Map(productLoop.cases.map((item) => [item.id, item.status]));
const standardIds = new Set(suite.suites.standardRegression.caseIds);
const sourceRaw = readFileSync(SOURCE_CSV, 'utf8');
const rows = parseCsv(sourceRaw).map((row) => Object.fromEntries(row.map((value, index) => [headers[index], value])));
const eligibility = buildEligibilityAudit(rows);
if (process.argv.includes('--eligibility-audit')) {
  console.log(JSON.stringify(eligibility, null, 2));
  process.exit(0);
}
const selected = [];
for (const [groupKey, definition] of Object.entries(quota)) {
  const candidates = rows.filter(
    (row) =>
      standardIds.has(row.id) &&
      row.status === 'KEEP' &&
      row.product_loop_status === 'current_release_test' &&
      definition.domains.includes(row.domain) &&
      allowedTypes.has(row.type) &&
      allowedTimeSemantics.has(row.time_semantics) &&
      resolveGoldContract(groupKey, row) !== null &&
      !deterministicGoldExcludedCaseIds.has(row.id) &&
      !deterministicGoldExcludedPattern.test(row.question) &&
      !privacyPattern.test(row.question),
  );
  const group = selectDiverse(candidates, definition.count);
  if (group.length !== definition.count) {
    throw new Error(`gold standard quota unavailable:${groupKey}:${group.length}/${definition.count}`);
  }
  selected.push(...group.map((row) => buildCase(groupKey, definition.label, row)));
}

const manifest = {
  schemaVersion: 'ami-brain-gold-standard/v1',
  manifestVersion: '2026-07-29-v1-candidate',
  status: 'candidate_pending_truth_snapshot',
  generatedAt: '2026-07-29T00:00:00.000+08:00',
  source: {
    classificationPath: relative(SOURCE_CSV),
    classificationChecksum: sha256(sourceRaw),
    suiteManifestPath: relative(SUITE_MANIFEST),
    suiteManifestChecksum: sha256(suiteRaw),
    standardRegressionSuiteKey: suite.suites.standardRegression.key,
    standardRegressionCaseIdsChecksum: suite.suites.standardRegression.caseIdsChecksum,
    productLoopEligibilityPath: relative(productLoopPath),
    productLoopEligibilityChecksum: sha256(productLoopRaw),
    releaseCapabilitySnapshot: {
      releaseId: 416,
      releaseKey: 'ami-brain-production-baseline-p0-release-20260722-full',
      observedAt: '2026-07-29',
      environment: 'approved_supabase_development_read_only',
      capabilityCount: releaseCapabilityKeyList.length,
      capabilityKeysChecksum: sha256(releaseCapabilityKeyList.join('\n')),
    },
  },
  fixedDataContract: fixedWindow,
  dataReadinessEvidence: {
    observedAt: '2026-07-29',
    environment: 'approved_supabase_development',
    storeId: 6,
    june2026: {
      newCustomers: 9,
      visitedCustomers: 55,
      orders: 144,
      payments: 144,
      refunds: 2,
      reservations: 168,
      serviceTasks: 107,
      stockMovements: 295,
      orderItems: 146,
    },
    purpose: 'window_readiness_only_not_truth_snapshot',
  },
  quota: Object.fromEntries(Object.entries(quota).map(([key, value]) => [key, value.count])),
  caseCount: selected.length,
  truthReadiness: {
    capabilityMapped: selected.filter((item) => Boolean(item.expectedCapabilityKey)).length,
    auditContractMapped: selected.filter((item) => item.audit.status === 'contract_mapped').length,
    auditQueryReady: selected.filter((item) => item.audit.status === 'ready').length,
    snapshotReady: selected.filter((item) => item.expectedSnapshot.status === 'ready').length,
    releaseBlockingUntilReady: true,
  },
  cases: selected,
};
validateGoldManifest(manifest);
mkdirSync(OUTPUT_DIR, { recursive: true });
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(OUTPUT_MANIFEST, manifestText, 'utf8');
writeFileSync(OUTPUT_REPORT, renderReport(manifest), 'utf8');
console.log(
  JSON.stringify(
    {
      output: relative(OUTPUT_MANIFEST),
      report: relative(OUTPUT_REPORT),
      caseCount: manifest.caseCount,
      quota: manifest.quota,
      status: manifest.status,
      checksum: sha256(manifestText),
    },
    null,
    2,
  ),
);

function buildCase(groupKey, groupLabel, row) {
  const comparison = resolveComparison(row);
  const contract = resolveGoldContract(groupKey, row);
  if (!contract) throw new Error(`gold standard contract unavailable:${row.id}`);
  const auditDefinition = resolveAuditDefinition(contract.resolverKey, row);
  if (!releaseCapabilityKeys.has(contract.capabilityKey)) {
    throw new Error(`gold standard capability outside release snapshot:${row.id}:${contract.capabilityKey}`);
  }
  return {
    goldCaseId: `GOLD-${row.id}`,
    sourceCaseId: row.id,
    groupKey,
    groupLabel,
    domain: row.domain,
    role: row.role,
    questionType: row.type,
    difficulty: row.difficulty,
    sourceQuestion: row.question,
    evaluationQuestion: fixedQuestion(row.question, row.time_semantics),
    synonyms: [],
    storeId: fixedWindow.storeId,
    timezone: fixedWindow.timezone,
    timeContract: fixedTimeContract(row.time_semantics),
    expectedIntent: row.type,
    expectedCapabilityKey: contract.capabilityKey,
    expectedGranularity: comparison.granularity,
    expectedAnswerShape: comparison.answerShape,
    expectedTarget: row.expected_target,
    audit: {
      status: 'contract_mapped',
      resolverKey: contract.resolverKey,
      queryVersion: auditDefinition.queryVersion,
      sourceTables: auditDefinition.sourceTables,
      comparison: comparison.comparison,
      tolerance: comparison.tolerance,
      ...(auditDefinition.parameters ? { parameters: auditDefinition.parameters } : {}),
    },
    expectedSnapshot: {
      status: 'pending',
      generatedAt: null,
      sourceRowCount: null,
      value: null,
      checksum: null,
    },
    releaseBlocking: true,
  };
}

function resolveAuditDefinition(resolverKey, row) {
  const implemented = {
    'finance.payment_method_amounts': ['PaymentRecord', 'ProductOrder'],
    'finance.card_recognized_revenue': ['CustomerCard', 'CardUsageRecord'],
    'finance.order_profit': ['ProductOrder', 'OrderItem', 'ProjectBomItem', 'Product', 'StockMovement', 'CommissionRecord'],
    'finance.gross_margin': ['DailySettlement'],
    'finance.stored_value_liability': ['CustomerBalanceAccount'],
    'finance.cash_shift_reconciliation': ['DailySettlement'],
    'finance.operating_profit': ['DailySettlement', 'OperatingCost', 'CommissionRecord'],
    'finance.unfulfilled_card_liability': ['CustomerCard'],
    'finance.cost_income_ratio': ['DailySettlement', 'OperatingCost', 'CommissionRecord'],
    'finance.staff_commission_composition': ['Beautician', 'CommissionRecord'],
    'catalog.project_sales': ['ProductOrder', 'OrderItem', 'Project'],
    'catalog.project_bom_items': ['Project', 'ProjectBomItem', 'Product'],
    'inventory.stock_or_consumption_fact': ['Product', 'StockBatch', 'StockMovement', 'ProjectBomItem'],
    'inventory.stock_risk_fact': ['Product', 'StockBatch', 'StockMovement'],
    'inventory.procurement_fact': [
      'SupplySupplier',
      'SupplyQuote',
      'SupplyCatalogMapping',
      'ProcurementOrder',
      'ProcurementOrderItem',
      'SupplySettlement',
      'Category',
    ],
    'customer.new_customer_count': ['Customer'],
    'customer.member_tier_count': ['Customer'],
    'customer.visited_customer_count': ['Reservation', 'Customer'],
    'customer.visited_member_tier_set': ['Reservation', 'Customer'],
    'customer.new_customer_repeat_purchase_count': ['Customer', 'ProductOrder'],
    'customer.expiring_card_unbooked': ['CustomerCard', 'Reservation', 'Customer'],
    'customer.card_holders_without_visit': ['CustomerCard', 'Reservation', 'Customer'],
    'fulfillment.arrival_or_task_count': ['Reservation', 'ServiceTask', 'Customer'],
    'fulfillment.card_usage_count': ['CardUsageRecord'],
    'fulfillment.reservation_fact': ['Reservation', 'Customer', 'Project', 'Beautician'],
    'staff.active_beautician_count': ['Beautician'],
    'staff.served_customer_count': ['Beautician', 'ServiceTask', 'Customer'],
    'staff.level_scalar': ['Beautician', 'BeauticianLevel'],
    'staff.project_skill_set': ['Beautician', 'BeauticianProjectSkill', 'Project'],
    'staff.schedule_fact': /请假/u.test(row.question)
      ? ['Beautician', 'BeauticianTimeOff']
      : /在岗/u.test(row.question)
        ? ['Beautician', 'Schedule', 'BeauticianTimeOff', 'BeauticianProjectSkill', 'Project']
        : ['Beautician', 'Schedule', 'BeauticianTimeOff'],
  };
  if (resolverKey === 'finance.order_profit') {
    const parameters = FINANCE_ORDER_PROFIT_AUDIT_CONTRACTS[row.id];
    if (!parameters) throw new Error(`finance order profit audit contract unavailable:${row.id}`);
    return { queryVersion: 'v2', sourceTables: implemented[resolverKey], parameters };
  }
  return implemented[resolverKey]
    ? { queryVersion: 'v1', sourceTables: implemented[resolverKey] }
    : { queryVersion: 'v1-pending-implementation', sourceTables: parseExpectedTargets(row.expected_target) };
}

function selectDiverse(rows, count) {
  const sorted = [...rows].sort((left, right) => left.id.localeCompare(right.id));
  const selected = [];
  const used = new Set();
  for (const row of sorted) {
    const signature = `${row.domain}|${row.type}|${row.difficulty}|${row.time_semantics}`;
    if (used.has(signature)) continue;
    selected.push(row);
    used.add(signature);
    if (selected.length === count) return selected;
  }
  for (const row of sorted) {
    if (selected.includes(row)) continue;
    selected.push(row);
    if (selected.length === count) return selected;
  }
  return selected;
}

function fixedQuestion(question, timeSemantics) {
  let value = question
    .replaceAll(/本月|这个月|当月/gu, '2026年6月')
    .replaceAll(/最近30天|近30天/gu, '2026年6月1日至30日')
    .replaceAll(/最近14天|近14天/gu, '2026年6月17日至30日')
    .replaceAll(/最近7天|近7天/gu, '2026年6月24日至30日')
    .replaceAll(/本周|这周/gu, '2026年6月22日至28日')
    .replaceAll(/上周/gu, '2026年6月15日至21日')
    .replaceAll(/今天/gu, '2026年6月30日')
    .replaceAll(/昨天/gu, '2026年6月29日')
    .replaceAll(/上月|上个月/gu, '2026年5月')
    .replaceAll(/今年|本年度|本年/gu, '2026年1月1日至6月30日')
    .replaceAll(/近半年|最近半年|上半年/gu, '2026年1月1日至6月30日')
    .replaceAll(/这半年/gu, '2026年1月1日至6月30日')
    .replaceAll(/现在|当前/gu, '截至2026年6月30日');
  if (timeSemantics === 'none') {
    value = value.replaceAll(/截至2026年6月30日/gu, '截至{{snapshotAtLabel}}');
    if (!/\{\{snapshotAtLabel\}\}/u.test(value)) value = `截至{{snapshotAtLabel}}，${value}`;
  }
  return value;
}

function fixedTimeContract(timeSemantics) {
  const periods = {
    natural_month: ['2026-06-01T00:00:00+08:00', '2026-07-01T00:00:00+08:00'],
    rolling_30d: ['2026-06-01T00:00:00+08:00', '2026-07-01T00:00:00+08:00'],
    natural_week: ['2026-06-22T00:00:00+08:00', '2026-06-29T00:00:00+08:00'],
    previous_week: ['2026-06-15T00:00:00+08:00', '2026-06-22T00:00:00+08:00'],
    previous_month: ['2026-05-01T00:00:00+08:00', '2026-06-01T00:00:00+08:00'],
    natural_year: ['2026-01-01T00:00:00+08:00', '2026-07-01T00:00:00+08:00'],
    half_year: ['2026-01-01T00:00:00+08:00', '2026-07-01T00:00:00+08:00'],
    rolling_14d: ['2026-06-17T00:00:00+08:00', '2026-07-01T00:00:00+08:00'],
    rolling_7d: ['2026-06-24T00:00:00+08:00', '2026-07-01T00:00:00+08:00'],
    today: ['2026-06-30T00:00:00+08:00', '2026-07-01T00:00:00+08:00'],
    yesterday: ['2026-06-29T00:00:00+08:00', '2026-06-30T00:00:00+08:00'],
  };
  const period = periods[timeSemantics];
  return period
    ? { mode: 'closed_period', periodStart: period[0], periodEndExclusive: period[1] }
    : {
        mode: 'snapshot_at',
        snapshotAt: null,
        snapshotPolicy: fixedWindow.snapshotPolicy,
      };
}

function inferComparison(question, type) {
  if (/哪些.*(?:毛利|利润).*为负|(?:毛利|利润).*为负.*哪些/u.test(question)) {
    return { answerShape: 'list', granularity: 'rows', comparison: 'id_set_exact', tolerance: null };
  }
  if (/提成构成/u.test(question)) {
    return { answerShape: 'money_rows', granularity: 'grouped_rows', comparison: 'ordered_rows', tolerance: null };
  }
  if (/排行|排名|前\d|最高|最低|最好|最差|最多|最少|最满|最忙|各.*预约量/u.test(question)) {
    return { answerShape: 'ranking_or_analysis', granularity: 'grouped_rows', comparison: 'ordered_rows', tolerance: null };
  }
  if (/率|占比|比例/u.test(question)) {
    return { answerShape: 'ratio', granularity: 'scalar', comparison: 'decimal_exact', tolerance: '0.0001' };
  }
  if (/金额|多少钱|价格|售价|零售价|收入|营收|实收|成本|利润|毛利|负债|余额|价值|客单价|业绩|提成|总额|待付款|还差多少到目标/u.test(question)) {
    const grouped = /各|每(个|位|张|种)|分别/u.test(question);
    return {
      answerShape: grouped ? 'money_rows' : 'money',
      granularity: grouped ? 'grouped_rows' : 'scalar',
      comparison: grouped ? 'ordered_rows' : 'money_fen_exact',
      tolerance: grouped ? null : '0.01',
    };
  }
  if (/多少(个|人|位|次|单|件|张|种)?|几个|次数|人次|人数|数量/u.test(question)) {
    return { answerShape: 'count', granularity: 'scalar', comparison: 'integer_exact', tolerance: '0' };
  }
  if (/哪些|明细|记录|列表|名单|都有谁|有谁|谁在|哪几种|批次/u.test(question)) {
    return { answerShape: 'list', granularity: 'rows', comparison: 'id_set_exact', tolerance: null };
  }
  if (/哪天|具体哪天|日期|时间|多久|时长/u.test(question)) {
    return { answerShape: 'temporal', granularity: 'scalar', comparison: 'scalar_exact', tolerance: null };
  }
  if (/库存变化|走势|趋势/u.test(question)) {
    return { answerShape: 'time_series', granularity: 'grouped_rows', comparison: 'ordered_rows', tolerance: null };
  }
  if (/是否|吗|有没有|对平|异常|够用/u.test(question)) {
    return { answerShape: 'boolean', granularity: 'scalar', comparison: 'boolean_exact', tolerance: null };
  }
  return { answerShape: 'scalar_or_record', granularity: 'record', comparison: 'json_exact', tolerance: null };
}

function resolveComparison(row) {
  const orderProfitContract = FINANCE_ORDER_PROFIT_AUDIT_CONTRACTS[row.id];
  if (orderProfitContract?.projection === 'cost_and_gross_profit') {
    return { answerShape: 'scalar_or_record', granularity: 'record', comparison: 'json_exact', tolerance: null };
  }
  return inferComparison(row.question, row.type);
}

function resolveGoldContract(groupKey, row) {
  const question = row.question;
  if (groupKey === 'finance') {
    if (FINANCE_ORDER_PROFIT_AUDIT_CONTRACTS[row.id]) {
      return contract('finance_risk_overview', 'finance.order_profit');
    }
    if (/消费记录/u.test(question)) return null;
    if (/支付方式/u.test(question)) return contract('finance_payment_breakdown', 'finance.payment_method_amounts');
    if (/确认收入|核销确认/u.test(question)) return contract('finance_risk_overview', 'finance.card_recognized_revenue');
    if (/哪些.*(?:毛利|利润).*为负|(?:毛利|利润).*为负.*哪些/u.test(question)) {
      return contract('finance_risk_overview', 'finance.order_profit');
    }
    if (/每张订单.*毛利|订单.*利润/u.test(question)) return contract('finance_risk_overview', 'finance.order_profit');
    if (/经营利润/u.test(question)) return contract('finance_risk_overview', 'finance.operating_profit');
    if (/毛利/u.test(question)) return contract('finance_risk_overview', 'finance.gross_margin');
    if (/储值负债/u.test(question)) return contract('finance_risk_overview', 'finance.stored_value_liability');
    if (/未履约负债/u.test(question)) return contract('finance_risk_overview', 'finance.unfulfilled_card_liability');
    if (/对平/u.test(question)) return contract('finance_risk_overview', 'finance.cash_shift_reconciliation');
    if (/成本占收入/u.test(question)) return contract('finance_risk_overview', 'finance.cost_income_ratio');
    if (/提成构成/u.test(question)) return contract('finance_risk_overview', 'finance.staff_commission_composition');
    return null;
  }
  if (groupKey === 'catalog') {
    if (/零售价|售价|价格|多少钱|规格|类型|在售/u.test(question)) return null;
    if (/用到哪些耗材|标准耗材|BOM/u.test(question)) {
      return contract('project_material_consumption_analysis', 'catalog.project_bom_items');
    }
    if (/次卡|会员卡/u.test(question)) return null;
    if (/卖了多少|卖得最/u.test(question)) {
      return contract(
        /Product/u.test(row.expected_target) && !/Project/u.test(row.expected_target)
          ? 'product_sales_ranking'
          : 'project_service_ranking',
        /Product/u.test(row.expected_target) && !/Project/u.test(row.expected_target)
          ? 'catalog.product_sales'
          : 'catalog.project_sales',
      );
    }
    return null;
  }
  if (groupKey === 'customer') {
    if (/新增/u.test(question)) return contract('customer_facts', 'customer.new_customer_count');
    // The fixed development dataset contains repeated names for point lookups.
    // Keep those cases in product regression as clarification tests; they cannot
    // be deterministic fact gold cases without a unique identifier.
    if (/会员等级|渠道|上次到店|累计消费|标签/u.test(question)) return null;
    if (/快到期还没预约/u.test(question)) return contract('customer_facts', 'customer.expiring_card_unbooked');
    if (/办了.*卡.*没来/u.test(question)) return contract('customer_facts', 'customer.card_holders_without_visit');
    if (/到店.*金卡以上/u.test(question)) return contract('customer_facts', 'customer.visited_member_tier_set');
    if (/新客.*第二次消费/u.test(question)) return contract('customer_facts', 'customer.new_customer_repeat_purchase_count');
    if (/钻石会员/u.test(question)) return contract('customer_facts', 'customer.member_tier_count');
    if (/到店的客户有多少/u.test(question)) return contract('customer_facts', 'customer.visited_customer_count');
    return null;
  }
  if (groupKey === 'staff') {
    // Self-view facts depend on the authenticated user -> beautician binding.
    // The fixed data contract currently binds only storeId, not a user identity,
    // so these remain product/permission tests rather than shared truth snapshots.
    if (/^我|我\d/u.test(question)) return null;
    // “排班工时超了”缺少已发布的超时阈值和计算口径，不能为了凑金标准
    // 配额自行假设每日/每周工时上限。
    if (/排班工时.*超/u.test(question)) return null;
    if (/在职美容师/u.test(question)) return contract('manager_staff_overview', 'staff.active_beautician_count');
    if (/排班|请假|在岗|谁在上班/u.test(question)) return contract('manager_staff_overview', 'staff.schedule_fact');
    if (/服务了多少个客户/u.test(question)) return contract('manager_staff_overview', 'staff.served_customer_count');
    if (/职级/u.test(question)) return contract('manager_staff_overview', 'staff.level_scalar');
    if (/会做哪些项目/u.test(question)) return contract('manager_staff_overview', 'staff.project_skill_set');
    return null;
  }
  if (groupKey === 'fulfillment') {
    // Availability is a current/future capacity fact. The source KEEP pool only
    // contains year/campaign-period variants, which become historical after the
    // fixed-window rewrite and no longer match appointment_gap_list semantics.
    // Keep them in product regression, but do not manufacture a historical gap truth.
    if (/哪些时段还有空/u.test(question)) return null;
    // Point lookups by customer name are not deterministic in the fixed dataset:
    // repeated names must trigger product clarification rather than a fabricated fact.
    if (/有预约吗|预约的是什么项目/u.test(question)) return null;
    // Release #416 has reservation/resource views, but no published deterministic
    // resource-conflict formula that can serve as an independent gold oracle.
    if (/资源冲突/u.test(question)) return null;
    if (/各美容师的预约量/u.test(question)) {
      return contract('front_desk_operations_overview', 'fulfillment.reservation_fact');
    }
    if (/服务任务|到店人数/u.test(question)) return contract('front_desk_operations_overview', 'fulfillment.arrival_or_task_count');
    if (/核销了多少次卡/u.test(question)) return contract('front_desk_operations_overview', 'fulfillment.card_usage_count');
    return contract('reservation_list', 'fulfillment.reservation_fact');
  }
  if (groupKey === 'inventory') {
    // 泛化“入库了多少货”尚未定义是否包含采购、调拨、退货和盘盈，
    // 在统一入库口径发布前保留为产品回归题，不生成伪确定性真值。
    if (/入库了多少货/u.test(question)) return null;
    if (/供应商|采购/u.test(question)) return contract('inventory_procurement_advice', 'inventory.procurement_fact');
    if (/缺货|低于安全库存|临期/u.test(question)) return contract('inventory_risk_ranking', 'inventory.stock_risk_fact');
    return contract('inventory_operations_overview', 'inventory.stock_or_consumption_fact');
  }
  return null;
}

function contract(capabilityKey, resolverKey) {
  return { capabilityKey, resolverKey };
}

function buildEligibilityAudit(sourceRows) {
  const groups = {};
  for (const [groupKey, definition] of Object.entries(quota)) {
    const eligible = sourceRows.filter(
      (row) =>
        standardIds.has(row.id) &&
        row.status === 'KEEP' &&
        row.product_loop_status === 'current_release_test' &&
        definition.domains.includes(row.domain) &&
        allowedTypes.has(row.type) &&
        allowedTimeSemantics.has(row.time_semantics) &&
        resolveGoldContract(groupKey, row) !== null &&
        !privacyPattern.test(row.question),
    );
    groups[groupKey] = {
      requested: definition.count,
      eligible: eligible.length,
      byCapability: countBy(eligible.map((row) => resolveGoldContract(groupKey, row).capabilityKey)),
      byResolver: countBy(eligible.map((row) => resolveGoldContract(groupKey, row).resolverKey)),
    };
  }
  return {
    schemaVersion: 'ami-brain-gold-standard-eligibility/v1',
    releaseId: 416,
    releaseCapabilityKeysChecksum: sha256(releaseCapabilityKeyList.join('\n')),
    rule: 'standard KEEP + current product loop + deterministic query + mapped active capability + mapped audit resolver contract',
    groups,
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function parseExpectedTargets(value) {
  return [...new Set(String(value).split(/[×/、,+]/u).map((item) => item.trim()).filter(Boolean))];
}

function renderReport(manifest) {
  const byGroup = Object.entries(quota).map(([key, value]) => `| ${value.label} | ${value.count} | ${manifest.cases.filter((item) => item.groupKey === key).length} |`);
  return `# Ami Brain 100 题事实金标准候选与数据窗口报告

> 生成日期：2026-07-29<br>
> 当前状态：候选题已冻结，审计查询和真值快照尚未生成，不构成发布通过证据

## 产品结论

已从 standard-regression 的 KEEP 题中确定 100 道事实题候选，并绑定 storeId=6、Asia/Shanghai 和关闭月份 2026 年 6 月。该窗口在开发库中已有客户、订单、支付、退款、预约、履约和库存流水，可用于后续确定性审计。

当前不能把这 100 题计入 verifiedCapability：预期能力和审计 resolver 合同已完成映射，但 resolver 查询实现、结果快照、来源行数和 checksum 仍为 pending。只有这些字段全部生成并通过比较后，才能进入发布门禁。

原计划为“项目和商品”固定保留 20 题。只读核对 Release #416 的 41 项已发布能力并逐题复核口径后，10 道该领域题能同时满足“确定性问数、真实 Release 能力、独立审计 resolver 合同”三个条件，但其中 8 道共用项目 BOM 耗材 resolver，全部保留会重新引入模板冗余；价格、规格、项目类型、次卡销量和耗材包零售价也不能用项目服务或耗材消耗能力近似替代。因此本版保留 6 道代表题，并把 14 道配额分配到客户、员工、履约和库存领域，总题量仍为 100。

首次客户审计还发现固定开发库中的点名客户题存在 3—9 条同名记录，仅凭姓名无法形成唯一真值。此类题继续留在产品回归中验证同名澄清，但不再计入事实金标准；客户事实配额由 17 调整为 14，释放的 3 题转入库存与采购。若后续题目提供客户 ID 或经授权的脱敏唯一标识，再单独建立精确客户查询金标准。

履约候选中的“今年/活动期间哪些时段还有空”没有进入事实金标准。可预约空档是以当前排班和未来预约为基础的容量事实，把“今年”冻结成 2026 年 1—6 月后会变成历史空档，与 Release #416 的 \`appointment_gap_list\` 当前/未来语义不一致。此类题继续留在产品回归中验证时间澄清；事实金标准改用可独立复算的预约量、预约名单、到店、爽约、核销和分组排行题。

首次履约审计还发现“吴若兰最近 7 天有预约吗”在固定开发库中对应 4 个同名客户。布尔回答会掩盖身份歧义，因此该题与其他点名客户预约题继续留在产品回归中验证澄清，不进入事实金标准；履约配额改由“各美容师预约量”等可审计分组事实补足。

员工候选中的“我上周服务了多少客户”“我最近 7 天做了哪些项目”“我这个月还差多少到目标”也不进入共享事实金标准。它们依赖登录用户到美容师档案的身份绑定，而当前固定数据合同只绑定 storeId=6，没有绑定 userId/beauticianId。此类题继续在产品门禁中按实际登录身份验证；事实金标准改用显式员工或全店聚合题，避免不同角色复用同一伪真值。

合同映射进度：capability 100/100，audit resolver contract 100/100；可执行审计查询 0/100，真值快照 0/100。

## 领域配额

| 领域 | 计划 | 实际 |
| --- | ---: | ---: |
${byGroup.join('\n')}

## 固定数据合同

- storeId：6
- 时区：Asia/Shanghai
- 关闭周期：2026-06-01 00:00:00 至 2026-07-01 00:00:00（左闭右开）
- 周期题中的“本月/今天/最近 30 天”等表达已转换为明确日期，避免运行日期变化导致真值漂移。
- 当前状态类题使用 \`{{snapshotAtLabel}}\` 模板；只有执行审计查询并绑定真实 snapshotAt 后才会形成最终问题，不能伪装成 6 月 30 日历史状态。

## 开发库窗口可用性

2026-07-29 对已批准的 Supabase 开发库做了只读检查。storeId=6 在 2026 年 6 月包含：新增客户 9、到店客户 55、订单 144、支付 144、退款 2、预约 168、服务任务 107、库存流水 295、订单明细 146。该数据只证明窗口可用于建标，不是逐题真值快照。

## 下一步门禁

1. 实现已映射的审计 resolver 查询并进行独立口径复核。
2. 只读执行审计查询，保存脱敏结果、来源行数、生成时间和 checksum。
3. 对金额、计数、比例、排行和 ID 集合分别执行确定性比较。
4. 将全部 100 题加入 standard-regression；任一事实错误阻断发布。
`;
}

function validateGoldManifest(manifest) {
  if (manifest.caseCount !== 100 || manifest.cases.length !== 100) throw new Error('gold standard case count invalid');
  const ids = manifest.cases.map((item) => item.goldCaseId);
  if (new Set(ids).size !== ids.length) throw new Error('gold standard duplicate case id');
  for (const [groupKey, definition] of Object.entries(quota)) {
    const actual = manifest.cases.filter((item) => item.groupKey === groupKey).length;
    if (actual !== definition.count) throw new Error(`gold standard quota invalid:${groupKey}:${actual}`);
  }
  for (const item of manifest.cases) {
    if (!standardIds.has(item.sourceCaseId)) throw new Error(`gold standard source outside standard suite:${item.sourceCaseId}`);
    if (productLoopStatuses.get(item.sourceCaseId) !== 'current_release_test') {
      throw new Error(`gold standard source is not current release:${item.sourceCaseId}`);
    }
    if (!releaseCapabilityKeys.has(item.expectedCapabilityKey)) {
      throw new Error(`gold standard capability outside release snapshot:${item.goldCaseId}:${item.expectedCapabilityKey}`);
    }
    if (
      item.audit.status !== 'contract_mapped' ||
      !item.audit.resolverKey ||
      !item.expectedCapabilityKey ||
      item.expectedSnapshot.status !== 'pending'
    ) {
      throw new Error(`gold standard candidate falsely marked ready:${item.goldCaseId}`);
    }
    if (item.timeContract.mode === 'snapshot_at') {
      if (item.timeContract.snapshotAt !== null || !item.evaluationQuestion.includes('{{snapshotAtLabel}}')) {
        throw new Error(`gold standard snapshot contract invalid:${item.goldCaseId}`);
      }
    } else if (
      !Date.parse(item.timeContract.periodStart) ||
      !Date.parse(item.timeContract.periodEndExclusive) ||
      Date.parse(item.timeContract.periodStart) >= Date.parse(item.timeContract.periodEndExclusive)
    ) {
      throw new Error(`gold standard period contract invalid:${item.goldCaseId}`);
    }
    if (/(本月|今天|昨天|本周|上周|最近7天|最近14天|最近30天|今年|这半年|最近三个月|双十一)/u.test(item.evaluationQuestion)) {
      throw new Error(`gold standard dynamic time unresolved:${item.goldCaseId}`);
    }
  }
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (quoted) {
      if (char === '"' && raw[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/u, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((item) => item.some((value) => value.trim()));
  if (!header || header.join(',') !== headers.join(',')) throw new Error('gold standard classification header invalid');
  return body;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function relative(value) {
  return value.replace(`${REPO_ROOT}/`, '');
}
