import {
  amiBrainGoldValueChecksum,
  compareAmiBrainGoldValue,
  type AmiBrainGoldComparison,
  type AmiBrainGoldEvaluationResult,
} from './ami-brain-gold-standard.js';

export type AmiBrainGoldRuntimeCase = {
  goldCaseId: string;
  sourceCaseId: string;
  evaluationQuestion: string;
  expectedCapabilityKey: string;
  audit: {
    resolverKey: string;
    comparison: AmiBrainGoldComparison;
    tolerance?: string | number | null;
  };
  expectedSnapshot: {
    status: string;
    value: unknown;
    checksum: string;
  };
};

export type AmiBrainGoldRuntimeResponse = {
  status: string;
  answer: string;
  blocks: unknown[];
  capabilityKeys: string[];
  failureCode?: string;
  error?: string;
};

export function extractAmiBrainGoldObservedCapabilityKeys(trace: unknown): string[] {
  const root = asRecord(trace);
  const steps = Array.isArray(root.steps) ? root.steps.map(asRecord) : [];
  return unique(
    steps
      .flatMap((step) => {
        const key = String(step.stepKey ?? '');
        if (step.status !== 'completed') return [];
        const output = asRecord(step.output);
        if (key === 'bounded_dag_execution') {
          const observations = Array.isArray(output.observations) ? output.observations.map(asRecord) : [];
          return observations
            .filter((observation) => observation.status === 'completed')
            .map((observation) => observation.capabilityKey);
        }
        if (key !== 'capability_execution' && !key.startsWith('domain_adapter_')) return [];
        const metadata = asRecord(output.metadata);
        return [output.capabilityKey, metadata.capabilityKey];
      }),
  );
}

export type AmiBrainGoldRuntimeEvaluationResult = AmiBrainGoldEvaluationResult & {
  goldCaseId: string;
  status:
    | 'matched'
    | 'value_mismatch'
    | 'provider_unavailable'
    | 'execution_failed'
    | 'capability_evidence_missing'
    | 'capability_mismatch'
    | 'actual_value_unavailable';
  expectedCapabilityKey: string;
  observedCapabilityKeys: string[];
  comparison: AmiBrainGoldComparison;
  comparisonCode: string | null;
  expectedValueChecksum: string;
  actualValueChecksum: string | null;
  normalizedExpected: unknown;
  normalizedActual: unknown;
  actualValue: unknown;
  reason: string | null;
};

type RowBlock = { kind: string; rows: Array<Record<string, unknown>>; columns: string[] };

const FIELD_ALIASES: Record<string, string[]> = {
  method: ['method', 'paymentMethod'],
  amount: ['amount', 'value', 'totalAmount'],
  totalCost: ['totalCost', 'costAmount', 'cost', '总成本', '成本'],
  grossProfit: ['grossProfit', 'profit', 'margin', 'amount'],
  type: ['type', 'commissionType', 'category'],
  orderId: ['orderId', 'productOrderId'],
  customerId: ['customerId'],
  projectId: ['projectId'],
  beauticianId: ['beauticianId', 'staffId'],
  reservationId: ['reservationId', 'appointmentId'],
  productId: ['productId'],
  supplierId: ['supplierId'],
  movementId: ['movementId', 'stockMovementId'],
  batchId: ['batchId', 'stockBatchId'],
  batchNo: ['batchNo', 'batchNumber'],
  stock: ['stock', 'currentStock', 'quantity'],
  unitCost: ['unitCost'],
  totalAmount: ['totalAmount', 'amount'],
  supplierName: ['supplierName', 'supplier'],
  category: ['category', 'categoryName', 'productCategory'],
  productionDate: ['productionDate', 'producedAt'],
  expiryDate: ['expiryDate', 'expiresAt'],
  occurredAt: ['occurredAt', 'createdAt', 'dateTime'],
  quantity: ['quantity', 'changeQuantity'],
  beforeStock: ['beforeStock'],
  afterStock: ['afterStock'],
  date: ['date', 'day'],
  startTime: ['startTime', 'time'],
  count: ['count', 'total', 'quantity'],
  name: ['name', 'level', 'levelName'],
  levelId: ['levelId'],
};

const PAYMENT_METHODS: Record<string, string> = {
  现金: 'cash',
  微信: 'wechat',
  支付宝: 'alipay',
  银行卡: 'card',
  储值余额: 'member_balance',
  会员余额: 'member_balance',
};

export function parseAmiBrainGoldRuntimeCases(manifest: unknown): AmiBrainGoldRuntimeCase[] {
  const root = asRecord(manifest);
  if (root.status !== 'ready' || !Array.isArray(root.cases) || root.cases.length !== 100) {
    throw new Error('ami_brain_gold_runtime_manifest_not_ready');
  }
  const cases = root.cases.map((value, index) => {
    const item = asRecord(value);
    const audit = asRecord(item.audit);
    const expectedSnapshot = asRecord(item.expectedSnapshot);
    if (
      typeof item.goldCaseId !== 'string' ||
      typeof item.sourceCaseId !== 'string' ||
      typeof item.evaluationQuestion !== 'string' ||
      !item.evaluationQuestion.trim() ||
      typeof item.expectedCapabilityKey !== 'string' ||
      typeof audit.resolverKey !== 'string' ||
      !isGoldComparison(audit.comparison) ||
      expectedSnapshot.status !== 'ready' ||
      typeof expectedSnapshot.checksum !== 'string' ||
      !/^[0-9a-f]{64}$/iu.test(expectedSnapshot.checksum)
    ) {
      throw new Error(`ami_brain_gold_runtime_case_invalid:${item.sourceCaseId ?? index}`);
    }
    return item as AmiBrainGoldRuntimeCase;
  });
  const goldIds = new Set(cases.map((item) => item.goldCaseId));
  const sourceIds = new Set(cases.map((item) => item.sourceCaseId));
  if (goldIds.size !== cases.length || sourceIds.size !== cases.length) {
    throw new Error('ami_brain_gold_runtime_case_ids_duplicate');
  }
  return cases;
}

export function selectAmiBrainGoldRuntimeCases(
  cases: AmiBrainGoldRuntimeCase[],
  requestedCaseIds: string[],
): AmiBrainGoldRuntimeCase[] {
  const requested = [...new Set(requestedCaseIds.map((value) => value.trim()).filter(Boolean))];
  if (!requested.length) return cases;
  const byId = new Map<string, AmiBrainGoldRuntimeCase>();
  for (const testCase of cases) {
    byId.set(testCase.goldCaseId, testCase);
    byId.set(testCase.sourceCaseId, testCase);
  }
  const missing = requested.filter((caseId) => !byId.has(caseId));
  if (missing.length) {
    throw new Error(`ami_brain_gold_runtime_target_ids_missing:${missing.join(',')}`);
  }
  const selectedSourceIds = new Set(requested.map((caseId) => byId.get(caseId)!.sourceCaseId));
  return cases.filter((testCase) => selectedSourceIds.has(testCase.sourceCaseId));
}

export function evaluateAmiBrainGoldRuntimeResponse(input: {
  testCase: AmiBrainGoldRuntimeCase;
  response: AmiBrainGoldRuntimeResponse;
}): AmiBrainGoldRuntimeEvaluationResult {
  const testCase = input.testCase;
  const response = input.response;
  const observedCapabilityKeys = unique(response.capabilityKeys ?? []);
  const failureText = `${response.status} ${response.failureCode ?? ''} ${response.error ?? ''}`.toLowerCase();
  if (/provider|model_unavailable|llm_unavailable/u.test(failureText)) {
    return failedResult(testCase, observedCapabilityKeys, 'provider_unavailable', '模型或供应商不可用。');
  }
  if (response.status !== 'completed' || response.error) {
    return failedResult(
      testCase,
      observedCapabilityKeys,
      'execution_failed',
      response.error || response.failureCode || `Brain 状态为 ${response.status}。`,
    );
  }
  if (!observedCapabilityKeys.length) {
    return failedResult(testCase, observedCapabilityKeys, 'capability_evidence_missing', '运行证据没有记录实际能力键。');
  }
  if (!observedCapabilityKeys.includes(testCase.expectedCapabilityKey)) {
    return failedResult(
      testCase,
      observedCapabilityKeys,
      'capability_mismatch',
      `期望能力 ${testCase.expectedCapabilityKey}，实际为 ${observedCapabilityKeys.join(',')}。`,
    );
  }

  const extracted = extractAmiBrainGoldActualValue({ testCase, response });
  if (!extracted.found) {
    return failedResult(testCase, observedCapabilityKeys, 'actual_value_unavailable', extracted.reason);
  }
  const comparison = compareAmiBrainGoldValue({
    comparison: testCase.audit.comparison,
    expected: testCase.expectedSnapshot.value,
    actual: extracted.value,
    tolerance: testCase.audit.tolerance,
  });
  return {
    sourceCaseId: testCase.sourceCaseId,
    goldCaseId: testCase.goldCaseId,
    passed: comparison.passed,
    status: comparison.passed ? 'matched' : 'value_mismatch',
    expectedCapabilityKey: testCase.expectedCapabilityKey,
    observedCapabilityKeys,
    comparison: testCase.audit.comparison,
    comparisonCode: comparison.code,
    expectedValueChecksum: testCase.expectedSnapshot.checksum,
    actualValueChecksum: amiBrainGoldValueChecksum(extracted.value),
    normalizedExpected: comparison.normalizedExpected,
    normalizedActual: comparison.normalizedActual,
    actualValue: extracted.value,
    reason: comparison.passed ? null : 'Brain 结构化结果与冻结真值不一致。',
  };
}

export function extractAmiBrainGoldActualValue(input: {
  testCase: AmiBrainGoldRuntimeCase;
  response: Pick<AmiBrainGoldRuntimeResponse, 'answer' | 'blocks'>;
}): { found: true; value: unknown } | { found: false; reason: string } {
  const comparison = input.testCase.audit.comparison;
  if (comparison === 'boolean_exact') {
    const value = booleanFromResponse(input.response);
    return value === undefined
      ? { found: false, reason: '结构化结果和回答中没有唯一布尔结论。' }
      : { found: true, value };
  }
  if (['money_fen_exact', 'integer_exact', 'decimal_exact', 'scalar_exact'].includes(comparison)) {
    return scalarFromResponse(input.testCase, input.response);
  }
  if (comparison === 'id_set_exact') {
    return idSetFromResponse(input.testCase, input.response);
  }
  if (comparison === 'ordered_rows') {
    return rowsFromResponse(input.testCase, input.response, true);
  }
  return jsonFromResponse(input.testCase, input.response);
}

function failedResult(
  testCase: AmiBrainGoldRuntimeCase,
  observedCapabilityKeys: string[],
  status: Exclude<AmiBrainGoldRuntimeEvaluationResult['status'], 'matched' | 'value_mismatch'>,
  reason: string,
): AmiBrainGoldRuntimeEvaluationResult {
  return {
    sourceCaseId: testCase.sourceCaseId,
    goldCaseId: testCase.goldCaseId,
    passed: false,
    status,
    expectedCapabilityKey: testCase.expectedCapabilityKey,
    observedCapabilityKeys,
    comparison: testCase.audit.comparison,
    comparisonCode: null,
    expectedValueChecksum: testCase.expectedSnapshot.checksum,
    actualValueChecksum: null,
    normalizedExpected: testCase.expectedSnapshot.value,
    normalizedActual: null,
    actualValue: null,
    reason,
  };
}

function scalarFromResponse(
  testCase: AmiBrainGoldRuntimeCase,
  response: Pick<AmiBrainGoldRuntimeResponse, 'answer' | 'blocks'>,
): { found: true; value: unknown } | { found: false; reason: string } {
  const patterns = scalarLabelPatterns(testCase);
  const items = response.blocks.flatMap((block) => {
    const record = asRecord(block);
    return record.kind === 'kpi' && Array.isArray(record.items)
      ? record.items.map(asRecord).filter((item) => typeof item.label === 'string')
      : [];
  });
  const matched = items.filter((item) => patterns.some((pattern) => pattern.test(String(item.label))));
  if (matched.length === 1) return { found: true, value: matched[0]!.value };
  if (!matched.length && items.length === 1) return { found: true, value: items[0]!.value };
  const answerValues = scalarValuesFromText(testCase.audit.comparison, response.answer);
  if (answerValues.length === 1) return { found: true, value: answerValues[0] };
  return {
    found: false,
    reason: matched.length > 1 ? '命中多个同名 KPI，无法确定金标准实际值。' : '没有找到唯一匹配的结构化 KPI。',
  };
}

function booleanFromResponse(response: Pick<AmiBrainGoldRuntimeResponse, 'answer' | 'blocks'>): boolean | undefined {
  const text = [
    response.answer,
    ...response.blocks.flatMap((block) => {
      const record = asRecord(block);
      return record.kind === 'kpi' && Array.isArray(record.items)
        ? record.items.map((item) => String(asRecord(item).value ?? ''))
        : [];
    }),
  ].join(' ');
  const falseMatch = /未对平|不一致|存在差异|否(?:。|$)/u.test(text);
  const positiveText = text.replaceAll(/未对平|不对平|不一致|存在差异/gu, '');
  const trueMatch = /已对平|对平完成|一致|无差异|是(?:。|$)/u.test(positiveText);
  if (trueMatch === falseMatch) return undefined;
  return trueMatch;
}

function idSetFromResponse(
  testCase: AmiBrainGoldRuntimeCase,
  response: Pick<AmiBrainGoldRuntimeResponse, 'answer' | 'blocks'>,
): { found: true; value: unknown } | { found: false; reason: string } {
  const expected = testCase.expectedSnapshot.value;
  if (!Array.isArray(expected)) return { found: false, reason: '冻结真值不是集合。' };
  if (expected.length && isRecord(expected[0])) return rowsFromResponse(testCase, response, false);
  const identityKey = identityKeyFor(testCase);
  if (!identityKey) return { found: false, reason: '该题未定义结构化身份字段。' };
  const blocks = rowBlocks(response.blocks);
  const matching = blocks.filter((block) => block.columns.some((column) => aliases(identityKey).includes(column)));
  if (matching.length === 1) {
    const values = matching[0]!.rows
      .map((row) => field(row, identityKey))
      .filter((value) => value !== undefined && value !== null);
    return { found: true, value: values };
  }
  return { found: false, reason: '没有找到唯一包含身份字段的结构化表格。' };
}

function rowsFromResponse(
  testCase: AmiBrainGoldRuntimeCase,
  response: Pick<AmiBrainGoldRuntimeResponse, 'answer' | 'blocks'>,
  preserveOrder: boolean,
): { found: true; value: unknown } | { found: false; reason: string } {
  const expected = testCase.expectedSnapshot.value;
  if (!Array.isArray(expected)) return { found: false, reason: '冻结真值不是行集合。' };
  const expectedKeys = expected.length && isRecord(expected[0]) ? Object.keys(expected[0]) : expectedRowKeysFor(testCase);
  const blocks = rowBlocks(response.blocks);
  const scored = blocks
    .map((block) => ({
      block,
      score: expectedKeys.filter((key) => block.columns.some((column) => aliases(key).includes(column))).length,
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  if (!scored.length) return { found: false, reason: '没有找到与冻结行结构匹配的表格。' };
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) {
    return { found: false, reason: '存在多个同等匹配的结构化表格。' };
  }
  const rows = scored[0]!.block.rows.map((row) => projectRow(row, expectedKeys));
  return { found: true, value: preserveOrder ? rows : rows };
}

function jsonFromResponse(
  testCase: AmiBrainGoldRuntimeCase,
  response: Pick<AmiBrainGoldRuntimeResponse, 'answer' | 'blocks'>,
): { found: true; value: unknown } | { found: false; reason: string } {
  const expected = testCase.expectedSnapshot.value;
  if (expected === null) {
    const expectedKeys = expectedRowKeysFor(testCase);
    const emptyMatches = rowBlocks(response.blocks).filter(
      (block) =>
        block.rows.length === 0 &&
        expectedKeys.length > 0 &&
        expectedKeys.every((key) => block.columns.some((column) => aliases(key).includes(column))),
    );
    if (emptyMatches.length === 1) return { found: true, value: null };
    const rows = rowBlocks(response.blocks).flatMap((block) => block.rows);
    return rows.length === 1
      ? { found: true, value: rows[0] }
      : { found: false, reason: '无法从结构化结果确定空记录或唯一记录。' };
  }
  if (Array.isArray(expected)) return rowsFromResponse(testCase, response, true);
  if (!isRecord(expected)) return scalarFromResponse(testCase, response);
  const keys = Object.keys(expected);
  const candidates = rowBlocks(response.blocks)
    .flatMap((block) => block.rows)
    .filter((row) => keys.every((key) => field(row, key) !== undefined));
  return candidates.length === 1
    ? { found: true, value: projectRow(candidates[0]!, keys) }
    : { found: false, reason: '没有找到唯一匹配冻结记录字段的结构化行。' };
}

function scalarLabelPatterns(testCase: AmiBrainGoldRuntimeCase): RegExp[] {
  const question = testCase.evaluationQuestion;
  const resolver = testCase.audit.resolverKey;
  if (resolver === 'finance.card_recognized_revenue') return [/确认收入/u];
  if (resolver === 'finance.stored_value_liability') return [/储值.*负债|会员卡负债|储值余额合计/u];
  if (resolver === 'finance.unfulfilled_card_liability') return [/未履约负债|次卡负债|会员卡负债/u];
  if (resolver === 'finance.operating_profit') return [/经营利润/u];
  if (resolver === 'finance.cost_income_ratio') return [/成本.*收入|成本率/u];
  if (resolver === 'finance.gross_margin') return [/毛利率/u.test(question) ? /毛利率/u : /毛利|利润/u];
  if (resolver === 'finance.order_profit') return [/毛利|利润/u];
  if (resolver === 'catalog.project_sales') return [/服务次数|销量|销售数量|卖出/u];
  if (resolver === 'catalog.project_bom_items') return [/BOM成本|物料成本|耗材成本|成本/u];
  if (resolver.startsWith('customer.')) {
    if (/新增|新客/u.test(question)) return [/新增客户|新客/u];
    if (/会员/u.test(question)) return [/会员/u];
    return [/客户|到店/u];
  }
  if (resolver === 'staff.active_beautician_count') return [/在职美容师/u];
  if (resolver === 'staff.served_customer_count') return [/服务客户|客户数/u];
  if (resolver === 'fulfillment.card_usage_count') return [/核销/u];
  if (resolver === 'fulfillment.arrival_or_task_count') return [/到店|服务任务/u];
  if (resolver === 'fulfillment.reservation_fact') return [/预约|到店转化率/u];
  if (resolver === 'inventory.stock_risk_fact') return [/缺货|临期|安全库存/u];
  if (resolver === 'inventory.stock_or_consumption_fact') {
    if (/消耗/u.test(question)) return [/消耗/u];
    if (/安全库存/u.test(question)) return [/安全库存/u];
    if (/库存总价值/u.test(question)) return [/库存总价值|库存价值/u];
    return [/库存/u];
  }
  if (resolver === 'inventory.procurement_fact') {
    if (/供应商/u.test(question) && /多少|几个/u.test(question)) return [/供应商/u];
    if (/待收货/u.test(question)) return [/待收货/u];
    if (/待付款/u.test(question)) return [/待付款/u];
    return [/采购总额|采购金额|采购成本/u];
  }
  return [new RegExp(escapeRegExp(question.replace(/[截至年月日\d/：\s-]/gu, '').slice(-6) || '指标'), 'u')];
}

function identityKeyFor(testCase: AmiBrainGoldRuntimeCase): string | undefined {
  const resolver = testCase.audit.resolverKey;
  const question = testCase.evaluationQuestion;
  if (resolver === 'finance.order_profit') return 'orderId';
  if (resolver === 'catalog.project_bom_items') return 'productId';
  if (resolver.startsWith('customer.')) return 'customerId';
  if (resolver === 'staff.project_skill_set') return 'projectId';
  if (resolver === 'staff.schedule_fact') return 'beauticianId';
  if (resolver === 'fulfillment.reservation_fact') {
    return /哪些预约|接了哪些预约/u.test(question) ? 'reservationId' : 'customerId';
  }
  if (resolver === 'inventory.stock_risk_fact') return 'productId';
  if (resolver === 'inventory.stock_or_consumption_fact') return 'batchId';
  return undefined;
}

function expectedRowKeysFor(testCase: AmiBrainGoldRuntimeCase): string[] {
  const resolver = testCase.audit.resolverKey;
  if (resolver === 'finance.payment_method_amounts') return ['method', 'amount'];
  if (resolver === 'finance.order_profit') return ['orderId', 'grossProfit'];
  if (resolver === 'finance.staff_commission_composition') return ['type', 'amount'];
  if (resolver === 'staff.schedule_fact') return ['date', 'startTime'];
  if (resolver === 'fulfillment.reservation_fact') return ['date', 'startTime', 'count'];
  if (resolver === 'inventory.procurement_fact') {
    if (/品类/u.test(testCase.evaluationQuestion)) return ['category', 'amount'];
    if (/最便宜/u.test(testCase.evaluationQuestion)) return ['supplierId', 'unitCost'];
    return ['supplierId', 'amount'];
  }
  if (resolver === 'inventory.stock_or_consumption_fact') return ['movementId', 'occurredAt', 'type', 'quantity'];
  return [];
}

function projectRow(row: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, normalizeFieldValue(key, field(row, key))]));
}

function field(row: Record<string, unknown>, key: string) {
  for (const alias of aliases(key)) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  return undefined;
}

function aliases(key: string) {
  return FIELD_ALIASES[key] ?? [key];
}

function normalizeFieldValue(key: string, value: unknown) {
  if (key === 'method' && typeof value === 'string') return PAYMENT_METHODS[value] ?? value;
  return value;
}

function rowBlocks(blocks: unknown[]): RowBlock[] {
  return blocks.flatMap((block) => {
    const record = asRecord(block);
    if (!['table', 'ranking', 'chart'].includes(String(record.kind)) || !Array.isArray(record.rows)) return [];
    const rows = record.rows.map(asRecord);
    const columns = Array.isArray(record.columns)
      ? record.columns.filter((value): value is string => typeof value === 'string')
      : rows.length
        ? Object.keys(rows[0]!)
        : [];
    return [{ kind: String(record.kind), rows, columns }];
  });
}

function scalarValuesFromText(comparison: AmiBrainGoldComparison, text: string): unknown[] {
  if (comparison === 'decimal_exact') return [...text.matchAll(/-?\d+(?:\.\d+)?%/gu)].map((match) => match[0]);
  if (comparison === 'money_fen_exact') {
    return [...text.matchAll(/-?\d+(?:\.\d+)?\s*元/gu)].map((match) => match[0]);
  }
  if (comparison === 'integer_exact') {
    return [...text.matchAll(/-?\d+\s*(?:人|个|次|张|单|笔|件|家)/gu)].map((match) => match[0]);
  }
  return [];
}

function unique(values: unknown[]) {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, any> {
  return isRecord(value) ? value : {};
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isGoldComparison(value: unknown): value is AmiBrainGoldComparison {
  return [
    'money_fen_exact',
    'integer_exact',
    'decimal_exact',
    'boolean_exact',
    'scalar_exact',
    'id_set_exact',
    'ordered_rows',
    'json_exact',
  ].includes(String(value));
}
