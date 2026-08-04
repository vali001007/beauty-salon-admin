import type { AskDataAnswer } from './ask-data-free-sql.types.js';

type AnswerContractEvidence = {
  question?: string;
  rows?: Array<Record<string, unknown>>;
  requiredOutputFields?: string[];
  requiredAnswerFacts?: string[];
  metricKeys?: string[];
  dimensions?: Array<{ key?: string; field: string }>;
  nonNullableRequiredFields?: string[];
};

export function detectAskDataAnswerScopeFailure(
  answer: Pick<AskDataAnswer, 'summary' | 'keyFindings' | 'caveats'>,
  evidence?: {
    rows?: Array<Record<string, unknown>>;
    nonNullableRequiredFields?: string[];
  },
) {
  const resultText = [answer.summary, ...answer.keyFindings].join('；');
  const text = [resultText, ...answer.caveats].join('；');
  const missingRequiredValue = evidence?.nonNullableRequiredFields?.find((field) =>
    evidence.rows?.length && evidence.rows.every((row) => row[field] === null || row[field] === undefined || row[field] === ''),
  );
  if (missingRequiredValue) {
    return `回答必需指标缺少有效值：${missingRequiredValue}`;
  }
  if (/(?:仅|只有|查询到)\s*1\s*个(?:有效)?趋势点/.test(text) && /不足以判断变化方向|不足以形成变化结论/.test(text)) {
    return undefined;
  }
  const patterns = [
    /(?:数据|结果|当前结果|现有数据).{0,30}(?:无法|不能|不足以)(?:判断|识别|确认|计算|回答)/,
    /(?:无法|不能)(?:判断|识别|确认|计算|回答).{0,30}(?:具体|哪些|是否|比例|金额|结果)?/,
    /(?:缺少|未提供).{0,30}(?:字段|指标|事实|口径).{0,30}(?:无法|不能|不足以)/,
  ];
  const matched = patterns.find((pattern) => pattern.test(text));
  if (!matched) return undefined;
  const excerpt = text.match(matched)?.[0] ?? '回答明确披露无法完成用户要求';
  return `回答未完成问题要求：${excerpt}`;
}

export function detectAskDataAnswerContractFailure(
  answer: Pick<AskDataAnswer, 'summary' | 'keyFindings' | 'caveats'>,
  evidence: AnswerContractEvidence,
) {
  const scopeFailure = detectAskDataAnswerScopeFailure(answer, evidence);
  if (scopeFailure) return scopeFailure;
  const rows = evidence.rows ?? [];
  if (!rows.length) return undefined;
  const resultText = [answer.summary, ...answer.keyFindings].join('；');
  const text = [resultText, ...answer.caveats].join('；');
  const metricKeys = new Set(evidence.metricKeys ?? []);
  const answerFacts = new Set(evidence.requiredAnswerFacts ?? []);

  if ([...metricKeys].some((key) => ['item_contribution_margin', 'project_attributed_cost', 'below_cost_sale'].includes(key))) {
    for (const field of requiredItemMarginAnswerFields(evidence.question ?? '')) {
      if (!rows.some((row) => hasValue(row[field]))) continue;
      if (!answerMentionsItemMarginField(resultText, field)) {
        return `回答未呈现用户实际询问的指标：${field}`;
      }
    }

    if (answerFacts.has('data_policy') && !disclosesContributionMarginBoundary(text)) {
      return '回答未披露贡献毛利与已确认经营利润的口径边界。';
    }

    const estimatedCount = aggregateEvidenceCount(rows, 'estimated_cost_event_count', 'is_estimated_cost');
    if (estimatedCount > 0 && !/(?:估算成本|成本估算|商品档案成本|BOM\s*标准成本|BOM标准成本)/i.test(text)) {
      return '回答未披露结果包含估算成本。';
    }

    const missingCostCount = aggregateEvidenceCount(rows, 'cost_missing_event_count');
    if (missingCostCount > 0 && !/(?:成本缺失|缺少.{0,8}成本|成本.{0,8}不完整|无法形成完整毛利)/.test(text)) {
      return '回答未披露存在成本缺失事件。';
    }
  }

  if (metricKeys.has('payment_flow') && /退款.*(?:明细|报告|记录)|(?:明细|报告).*(?:退款)/.test(evidence.question ?? '')) {
    const refundDetailPatterns: Array<[string, RegExp]> = [
      ['refund_amount', /退款(?:冲减)?金额/],
      ['refunded_at', /退款时间/],
      ['refund_status', /退款状态/],
      ['refund_reason_category', /退款原因/],
    ];
    for (const [field, pattern] of refundDetailPatterns) {
      if (rows.some((row) => hasValue(row[field])) && !pattern.test(resultText)) {
        return `退款明细回答缺少字段：${field}`;
      }
    }
  }

  if (answerFacts.has('all_requested_dimensions')) {
    const itemTypeDimension = evidence.dimensions?.find((dimension) => dimension.field === 'item_type');
    if (itemTypeDimension) {
      const values = new Set(rows.map((row) => String(row.item_type ?? '')).filter(Boolean));
      if (values.has('product') && !/(?:商品|产品)/.test(resultText)) return '回答缺少商品维度标签。';
      if (values.has('project') && !/(?:服务项目|项目|服务)/.test(resultText)) return '回答缺少服务项目维度标签。';
    }
  }

  if (answerFacts.has('amount_unit')) {
    const amountFields = (evidence.requiredOutputFields ?? []).filter((field) =>
      /(?:amount|revenue|profit|cost|margin|balance|receipts|liability|price)$/.test(field)
      && !/(?:_rate|_ratio)$/.test(field),
    );
    if (amountFields.some((field) => rows.some((row) => hasValue(row[field]))) && !/[元￥¥]/.test(resultText)) {
      return '回答缺少金额单位。';
    }
  }

  return undefined;
}

export function isAskDataAnswerGrounded(
  answer: Pick<AskDataAnswer, 'summary' | 'keyFindings'>,
  rows: Array<Record<string, unknown>>,
  timeRange: string,
) {
  const answerText = [answer.summary, ...answer.keyFindings].join(' ');
  const claimedDates = extractDateClaims(answerText);
  const evidenceDates = extractEvidenceDates(rows, timeRange);
  if (!claimedDates.every((date) => evidenceDates.has(date))) return false;
  const evidence = extractNumericClaims(`${JSON.stringify(rows)} ${rows.length} ${timeRange}`)
    .map((item) => item.value);
  const claims = extractNumericClaims(answerText);
  return claims.every((claim) => evidence.some((candidate) => numericClaimMatchesEvidence(claim, candidate)));
}

function extractNumericClaims(value: string) {
  const withoutDates = value.replace(/\b\d{4}-\d{2}-\d{2}(?:[T ][-0-9:.+Z]*)?\b/g, ' ');
  return [...withoutDates.matchAll(/(-?\d+(?:\.\d+)?)\s*(%)?/g)].map((match) => ({
    value: Number(match[1]),
    percentage: Boolean(match[2]),
  })).filter((item) => Number.isFinite(item.value));
}

function extractDateClaims(value: string) {
  return [...value.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
}

function extractEvidenceDates(rows: Array<Record<string, unknown>>, timeRange: string) {
  const dates = new Set(extractDateClaims(timeRange));
  for (const row of rows) {
    for (const value of Object.values(row)) {
      const normalized = normalizeEvidenceDate(value);
      if (normalized) dates.add(normalized);
      if (typeof value === 'string' && !normalized) extractDateClaims(value).forEach((date) => dates.add(date));
    }
  }
  return dates;
}

function normalizeEvidenceDate(value: unknown) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = value instanceof Date
    ? value
    : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ].*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
      ? new Date(value.replace(' ', 'T'))
      : undefined;
  if (!parsed || Number.isNaN(parsed.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

function numericClaimMatchesEvidence(claim: { value: number; percentage: boolean }, evidence: number) {
  const normalizedClaim = claim.percentage ? claim.value / 100 : claim.value;
  const tolerance = claim.percentage ? 0.000051 : 0.005001;
  return Math.abs(normalizedClaim - evidence) <= tolerance;
}

function requiredItemMarginAnswerFields(question: string) {
  if (/退款.*(?:冲减|影响).*(?:收入|成本)|(?:收入|成本).*退款冲减/.test(question)) {
    return ['refund_amount', 'attributed_cost'];
  }
  const fields: string[] = [];
  if (/毛利率/.test(question)) fields.push('contribution_margin_rate');
  if (/(?:贡献)?毛利/.test(question)) fields.push('contribution_margin');
  if (/(?:耗材|归属|可归属)?成本/.test(question)) fields.push('attributed_cost');
  if (/净收入/.test(question)) fields.push('net_revenue');
  return [...new Set(fields)];
}

function answerMentionsItemMarginField(text: string, field: string) {
  const number = '-?\\d+(?:\\.\\d+)?';
  const patterns: Record<string, RegExp> = {
    refund_amount: new RegExp(`退款(?:冲减)?(?:金额|收入)?[^；。]{0,16}${number}`),
    attributed_cost: new RegExp(`(?:可归属[^；。]{0,10}成本|耗材成本|商品成本|归属成本|成本冲回)[^；。]{0,16}${number}`),
    contribution_margin: new RegExp(`(?:贡献)?毛利(?!率)[^；。]{0,12}${number}`),
    contribution_margin_rate: new RegExp(`(?:贡献)?毛利率[^；。]{0,12}${number}`),
    net_revenue: new RegExp(`(?:已识别)?净收入[^；。]{0,12}${number}`),
  };
  return patterns[field]?.test(text) ?? true;
}

function disclosesContributionMarginBoundary(text: string) {
  const definesContributionMargin = /贡献毛利/.test(text) && /(?:净收入|收入).{0,16}(?:可归属|商品|耗材).{0,12}成本/.test(text);
  const excludesOperatingCosts = /不含.{0,24}(?:提成|经营费用|房租|水电)/.test(text);
  const distinguishesProfit = /(?:不等同|不是|并非).{0,16}(?:经营利润|月结利润|已确认利润)|(?:经营利润|月结利润|已确认利润).{0,16}(?:不等同|不是|并非)/.test(text);
  return definesContributionMargin && excludesOperatingCosts && distinguishesProfit;
}

function aggregateEvidenceCount(
  rows: Array<Record<string, unknown>>,
  countField: string,
  booleanField?: string,
) {
  const explicit = rows.reduce((sum, row) => sum + numericValue(row[countField]), 0);
  if (explicit > 0 || !booleanField) return explicit;
  return rows.filter((row) => row[booleanField] === true || row[booleanField] === 'true').length;
}

function numericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return 0;
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}
