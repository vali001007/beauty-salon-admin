import type { AskDataAnswer } from './ask-data-free-sql.types.js';

export function detectAskDataAnswerScopeFailure(
  answer: Pick<AskDataAnswer, 'summary' | 'keyFindings' | 'caveats'>,
  evidence?: {
    rows?: Array<Record<string, unknown>>;
    nonNullableRequiredFields?: string[];
  },
) {
  const text = [answer.summary, ...answer.keyFindings, ...answer.caveats].join('；');
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

export function isAskDataAnswerGrounded(
  answer: Pick<AskDataAnswer, 'summary' | 'keyFindings'>,
  rows: Array<Record<string, unknown>>,
  timeRange: string,
) {
  const evidence = extractNumericClaims(`${JSON.stringify(rows)} ${rows.length} ${timeRange}`)
    .map((item) => item.value);
  const claims = extractNumericClaims([answer.summary, ...answer.keyFindings].join(' '));
  return claims.every((claim) => evidence.some((candidate) => numericClaimMatchesEvidence(claim, candidate)));
}

function extractNumericClaims(value: string) {
  return [...value.matchAll(/(-?\d+(?:\.\d+)?)\s*(%)?/g)].map((match) => ({
    value: Number(match[1]),
    percentage: Boolean(match[2]),
  })).filter((item) => Number.isFinite(item.value));
}

function numericClaimMatchesEvidence(claim: { value: number; percentage: boolean }, evidence: number) {
  const normalizedClaim = claim.percentage ? claim.value / 100 : claim.value;
  const tolerance = claim.percentage ? 0.000051 : 0.005001;
  return Math.abs(normalizedClaim - evidence) <= tolerance;
}
