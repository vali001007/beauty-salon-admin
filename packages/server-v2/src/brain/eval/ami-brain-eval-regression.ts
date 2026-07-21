export type AmiBrainEvalRegressionScope = 'product' | 'provider' | 'all';

export type AmiBrainEvalRegressionRecord = {
  questionId: string;
  status: string;
  failureReason?: string;
  latencyMs?: number;
};

export type AmiBrainEvalRegressionPayload = {
  metadata?: Record<string, unknown>;
  records?: AmiBrainEvalRegressionRecord[];
};

export function selectAmiBrainEvalRegressionRecords(
  payload: AmiBrainEvalRegressionPayload,
  scope: AmiBrainEvalRegressionScope,
) {
  const records = validRecords(payload);
  return records.filter((record) => {
    if (scope === 'provider') return record.status === 'provider_unavailable';
    if (scope === 'product') return !isUsable(record.status) && record.status !== 'provider_unavailable';
    return !isUsable(record.status);
  });
}

export function buildAmiBrainEvalRegressionManifest(input: {
  sourceResultsPath: string;
  sourcePayload: AmiBrainEvalRegressionPayload;
  currentRecords: AmiBrainEvalRegressionRecord[];
}) {
  const productFailures = input.currentRecords.filter(
    (record) => !isUsable(record.status) && record.status !== 'provider_unavailable',
  );
  const providerFailures = input.currentRecords.filter((record) => record.status === 'provider_unavailable');
  return {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    sourceResultsPath: input.sourceResultsPath,
    sourceGeneratedAt: string(input.sourcePayload.metadata?.generatedAt),
    sourceReleaseId: positiveInteger(input.sourcePayload.metadata?.releaseId),
    sourceReleaseFingerprint: releaseFingerprint(input.sourcePayload.metadata),
    productFailures: summarize(productFailures),
    providerFailures: summarize(providerFailures),
    allFailures: summarize([...productFailures, ...providerFailures]),
  };
}

export function compareAmiBrainEvalRegression(input: {
  sourceResultsPath: string;
  sourcePayload: AmiBrainEvalRegressionPayload;
  scope: AmiBrainEvalRegressionScope;
  selectedQuestionIds?: string[];
  currentRecords: AmiBrainEvalRegressionRecord[];
}) {
  const requested = input.selectedQuestionIds?.length ? new Set(input.selectedQuestionIds) : undefined;
  const selected = selectAmiBrainEvalRegressionRecords(input.sourcePayload, input.scope).filter(
    (record) => !requested || requested.has(record.questionId),
  );
  const currentById = new Map(input.currentRecords.map((record) => [record.questionId, record]));
  const resolvedQuestionIds: string[] = [];
  const unresolvedQuestionIds: string[] = [];
  const providerUnavailableQuestionIds: string[] = [];
  const missingQuestionIds: string[] = [];
  for (const baseline of selected) {
    const current = currentById.get(baseline.questionId);
    if (!current) {
      missingQuestionIds.push(baseline.questionId);
    } else if (isUsable(current.status)) {
      resolvedQuestionIds.push(baseline.questionId);
    } else if (current.status === 'provider_unavailable') {
      providerUnavailableQuestionIds.push(baseline.questionId);
    } else {
      unresolvedQuestionIds.push(baseline.questionId);
    }
  }
  return {
    sourceResultsPath: input.sourceResultsPath,
    scope: input.scope,
    selectedCount: selected.length,
    resolvedCount: resolvedQuestionIds.length,
    unresolvedCount: unresolvedQuestionIds.length,
    providerUnavailableCount: providerUnavailableQuestionIds.length,
    missingCount: missingQuestionIds.length,
    passRate: selected.length ? resolvedQuestionIds.length / selected.length : 0,
    passed:
      selected.length > 0 &&
      unresolvedQuestionIds.length === 0 &&
      providerUnavailableQuestionIds.length === 0 &&
      missingQuestionIds.length === 0,
    resolvedQuestionIds,
    unresolvedQuestionIds,
    providerUnavailableQuestionIds,
    missingQuestionIds,
  };
}

function validRecords(payload: AmiBrainEvalRegressionPayload) {
  const records = Array.isArray(payload.records) ? payload.records : [];
  const unique = new Map<string, AmiBrainEvalRegressionRecord>();
  for (const record of records) {
    if (!record || typeof record.questionId !== 'string' || !record.questionId.trim()) continue;
    if (typeof record.status !== 'string' || !record.status.trim()) continue;
    unique.set(record.questionId.trim(), { ...record, questionId: record.questionId.trim() });
  }
  return [...unique.values()];
}

function summarize(records: AmiBrainEvalRegressionRecord[]) {
  return {
    count: records.length,
    questionIds: records.map((record) => record.questionId),
    byStatus: countBy(records.map((record) => record.status)),
    byReason: countBy(records.map((record) => record.failureReason ?? record.status)).slice(0, 20),
  };
}

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function releaseFingerprint(metadata: Record<string, unknown> | undefined) {
  const snapshot = metadata?.releaseSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined;
  return string((snapshot as Record<string, unknown>).releaseFingerprint);
}

function isUsable(status: string) {
  return status === 'usable_exact' || status === 'usable_partial';
}

function string(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}
