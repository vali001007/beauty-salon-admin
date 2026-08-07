export interface AmiBrainLatencyDistribution {
  count: number;
  averageMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

export interface AmiBrainProviderFailureAttribution {
  provider?: string;
  model?: string;
  routeMode?: string;
  errorCategory: 'provider_unavailable' | 'provider_auth_failed' | 'timeout' | 'network' | 'schema' | 'judge' | 'business' | 'unknown';
  latencyMs: number | null;
  attemptCount: number;
}

export function resolveAmiBrainUserResponseLatencyMs(input: {
  startedAtMs: number;
  answerReadyAtMs?: number;
  requestCompletedAtMs: number;
}) {
  const startedAtMs = finiteTimestamp(input.startedAtMs, 'startedAtMs');
  const requestCompletedAtMs = finiteTimestamp(input.requestCompletedAtMs, 'requestCompletedAtMs');
  const answerReadyAtMs =
    input.answerReadyAtMs === undefined
      ? requestCompletedAtMs
      : finiteTimestamp(input.answerReadyAtMs, 'answerReadyAtMs');
  const completedBoundary = Math.max(startedAtMs, requestCompletedAtMs);
  const responseBoundary = Math.min(completedBoundary, Math.max(startedAtMs, answerReadyAtMs));
  return responseBoundary - startedAtMs;
}

export function buildBrainRunLatencyBreakdown(trace: unknown) {
  const run = record(trace);
  const runLatencyMs = positiveFiniteNumber(run.latencyMs);
  const rawSteps = Array.isArray(run.steps) ? run.steps.map(record) : [];
  const timedSteps = rawSteps
    .map((step) => ({
      stepKey: String(step.stepKey ?? ''),
      layer: String(step.layer ?? 'unknown'),
      status: String(step.status ?? 'unknown'),
      latencyMs: positiveFiniteNumber(step.latencyMs),
      timingScope: String(record(step.output).timingScope ?? 'brain_run'),
      nestedPhaseLatencyMs: numericRecord(record(step.output).phaseLatencyMs),
    }))
    .filter((step) => step.stepKey && step.latencyMs !== null);
  const steps = timedSteps.filter((step) => step.timingScope !== 'outside_brain_run');
  const outsideBrainRunSteps = timedSteps.filter((step) => step.timingScope === 'outside_brain_run');
  const byLayerMs: Record<string, number> = {};
  for (const step of steps) byLayerMs[step.layer] = (byLayerMs[step.layer] ?? 0) + step.latencyMs!;
  const outsideBrainRunByLayerMs: Record<string, number> = {};
  for (const step of outsideBrainRunSteps) {
    outsideBrainRunByLayerMs[step.layer] = (outsideBrainRunByLayerMs[step.layer] ?? 0) + step.latencyMs!;
  }
  const nestedPhases = steps.flatMap((step) =>
    Object.entries(step.nestedPhaseLatencyMs).map(([phaseKey, latencyMs]) => ({
      parentStepKey: step.stepKey,
      phaseKey,
      latencyMs,
    })),
  );
  const byNestedPhaseMs: Record<string, number> = {};
  for (const phase of nestedPhases) {
    byNestedPhaseMs[phase.phaseKey] = (byNestedPhaseMs[phase.phaseKey] ?? 0) + phase.latencyMs;
  }
  const instrumentedStepLatencyMs = Object.values(byLayerMs).reduce((sum, value) => sum + value, 0);
  const outsideBrainRunStepLatencyMs = Object.values(outsideBrainRunByLayerMs).reduce((sum, value) => sum + value, 0);
  const unattributedLatencyMs =
    runLatencyMs === null ? null : Math.max(0, runLatencyMs - Math.min(runLatencyMs, instrumentedStepLatencyMs));
  return {
    brainRunLatencyMs: runLatencyMs,
    instrumentedStepLatencyMs,
    unattributedLatencyMs,
    instrumentationCoverage:
      runLatencyMs && runLatencyMs > 0 ? Math.min(1, instrumentedStepLatencyMs / runLatencyMs) : null,
    byLayerMs,
    byNestedPhaseMs,
    nestedPhases,
    outsideBrainRunStepLatencyMs,
    outsideBrainRunByLayerMs,
    outsideBrainRunSteps: outsideBrainRunSteps.map(stripTimingMetadata),
    steps: steps.map(stripTimingMetadata),
  };
}

export function summarizeAmiBrainEvalLatencies(rows: Array<{ latencyMs?: number | null; metadata?: unknown }>) {
  const userResponse = rows.map((row) => row.latencyMs ?? null);
  const judge = rows.map((row) => positiveFiniteNumber(record(record(row.metadata).latency).judgeLatencyMs));
  const evaluationTotal = rows.map((row) =>
    positiveFiniteNumber(record(record(row.metadata).latency).evaluationTotalLatencyMs),
  );
  return {
    userResponse: distribution(userResponse),
    judge: distribution(judge),
    evaluationTotal: distribution(evaluationTotal),
  };
}

export function summarizeAmiBrainEvalFailureAttribution(
  rows: Array<{ failureCluster?: string | null; error?: string | null; latencyMs?: number | null; metadata?: unknown }>,
) {
  const providerFailures = rows.flatMap((row) => providerFailureAttribution(row));
  const businessAbilityFailures = rows.filter((row) =>
    ['answer_not_grounded', 'multi_turn_not_continued', 'ambiguity_not_clarified', 'suspected_false_success'].includes(
      String(row.failureCluster ?? ''),
    ),
  ).length;
  const judgeFailures = rows.filter((row) => /judge/i.test(String(row.failureCluster ?? row.error ?? ''))).length;
  const dataOrPermissionFailures = rows.filter((row) =>
    /permission|denied|no_data|data/i.test(String(row.failureCluster ?? row.error ?? '')),
  ).length;
  return {
    providerUnavailable: providerFailures.length,
    businessAbilityFailures,
    judgeFailures,
    dataOrPermissionFailures,
    providerFailures,
  };
}

export function providerFailureAttribution(row: {
  failureCluster?: string | null;
  error?: string | null;
  latencyMs?: number | null;
  metadata?: unknown;
}): AmiBrainProviderFailureAttribution[] {
  const failureCluster = String(row.failureCluster ?? '');
  const error = String(row.error ?? '');
  if (/judge/i.test(failureCluster)) return [];
  const metadata = record(row.metadata);
  const route = record(metadata.route);
  const runtimeModel = record(record(metadata.evidence).runtimeModel);
  const provider = stringValue(runtimeModel.provider) ?? stringValue(route.provider) ?? stringValue(metadata.provider);
  const model = stringValue(runtimeModel.model) ?? stringValue(route.model) ?? stringValue(metadata.model);
  const routeMode = stringValue(runtimeModel.routeMode) ?? stringValue(route.routeMode) ?? stringValue(metadata.routeMode);
  const attempts = positiveFiniteNumber(metadata.attemptCount) ?? positiveFiniteNumber(route.attemptCount) ?? 1;
  const category = classifyProviderError(`${failureCluster} ${error}`);
  if (
    failureCluster !== 'provider_unavailable' &&
    !['provider_unavailable', 'provider_auth_failed', 'timeout', 'network'].includes(category)
  ) {
    return [];
  }
  return [
    {
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(routeMode ? { routeMode } : {}),
      errorCategory: category,
      latencyMs: positiveFiniteNumber(row.latencyMs),
      attemptCount: Math.max(1, Math.round(attempts)),
    },
  ];
}

function classifyProviderError(value: string): AmiBrainProviderFailureAttribution['errorCategory'] {
  const normalized = value.toLocaleLowerCase('en-US');
  if (/auth|401|403|api[_ -]?key|credential/.test(normalized)) return 'provider_auth_failed';
  if (/timeout|timed out|deadline/.test(normalized)) return 'timeout';
  if (/network|econn|enotfound|fetch failed|socket/.test(normalized)) return 'network';
  if (/schema|json/.test(normalized)) return 'schema';
  if (/judge/.test(normalized)) return 'judge';
  if (/provider|unavailable|circuit/.test(normalized)) return 'provider_unavailable';
  if (/answer_not_grounded|multi_turn|ambiguity|false_success/.test(normalized)) return 'business';
  return 'unknown';
}

function distribution(values: Array<number | null | undefined>): AmiBrainLatencyDistribution {
  const recorded = values
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  return {
    count: recorded.length,
    averageMs: recorded.length ? Math.round(recorded.reduce((sum, value) => sum + value, 0) / recorded.length) : null,
    p50Ms: percentile(recorded, 0.5),
    p95Ms: percentile(recorded, 0.95),
    maxMs: recorded.at(-1) ?? null,
  };
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index]!;
}

function positiveFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteTimestamp(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${field}_must_be_finite`);
  return parsed;
}

function numericRecord(value: unknown) {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([key, raw]) => {
      const parsed = positiveFiniteNumber(raw);
      return parsed === null ? [] : [[key, parsed]];
    }),
  ) as Record<string, number>;
}

function stripTimingMetadata(step: { stepKey: string; layer: string; status: string; latencyMs: number | null }) {
  return {
    stepKey: step.stepKey,
    layer: step.layer,
    status: step.status,
    latencyMs: step.latencyMs,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
