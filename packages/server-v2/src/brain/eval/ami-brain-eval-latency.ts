export interface AmiBrainLatencyDistribution {
  count: number;
  averageMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
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
