interface EvalCitationLike {
  sourceType?: string;
  sourceId?: string;
}

interface EvalRiskRecordLike {
  question: string;
  citations?: EvalCitationLike[];
  expected?: unknown;
}

interface TimeRangeParserLike {
  parse(question: string): {
    mentionedTime: boolean;
    unsupportedExpressions: string[];
  };
}

interface QuestionIntentLike {
  classify(question: string): { intent: string };
}

export function countBaselineTimeFallbackRisks(records: EvalRiskRecordLike[]) {
  return records.filter((record) => /(明天|下午|现在)/.test(record.question) && hasMetricCitation(record)).length;
}

export function countCurrentTimeFallbackRisks(records: EvalRiskRecordLike[], timeRangeParser: TimeRangeParserLike) {
  return records.filter((record) => {
    const parsed = timeRangeParser.parse(record.question);
    const unsupportedTimeExpressions = parsed.unsupportedExpressions.filter(
      (expression) => expression !== '对比时间' || hasTemporalComparisonCue(record.question),
    );
    return parsed.mentionedTime && unsupportedTimeExpressions.length > 0 && hasMetricCitation(record);
  }).length;
}

export function countDraftActionMetricMismatches(records: EvalRiskRecordLike[], questionIntent: QuestionIntentLike) {
  return records.filter((record) => {
    const governedIntent = record.expected && typeof record.expected === 'object' && !Array.isArray(record.expected)
      ? (record.expected as Record<string, unknown>).intent
      : undefined;
    const intent = typeof governedIntent === 'string'
      ? governedIntent
      : questionIntent.classify(record.question).intent;
    return (intent === 'draft' || intent === 'action' || intent === 'recommendation') && hasMetricCitation(record);
  }).length;
}

function hasMetricCitation(record: EvalRiskRecordLike) {
  return (record.citations ?? []).some(
    (citation) =>
      Boolean(citation.sourceId) &&
      (citation.sourceType === 'metric' ||
        (citation.sourceType === 'business_definition' && citation.sourceId?.startsWith('metric.'))),
  );
}

function hasTemporalComparisonCue(question: string) {
  return /(同比|环比|同期|上(?:周|月|季度|年)|下(?:周|月|季度|年)|昨天|前天|去年|另一个周期|另一天|跟.{0,8}(?:周|月|季度|年|天).{0,8}比)/.test(question);
}
