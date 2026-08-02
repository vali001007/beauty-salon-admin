import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

type DurationMetricKey = 'endToEnd' | 'firstVisibleAnswer' | 'model' | 'toolData';

interface RunTimingSample {
  runId: number;
  createdAt: Date;
  releaseId: number | null;
  releaseKey: string | null;
  provider: string | null;
  model: string | null;
  capabilityKey: string | null;
  endToEndMs: number | null;
  firstVisibleAnswerMs: number | null;
  modelMs: number | null;
  toolDataMs: number | null;
}

@Injectable()
export class BrainGovernanceMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getQualityLatency(input: {
    from?: string;
    to?: string;
    days?: number;
    storeId?: number;
    provider?: string;
    model?: string;
    capabilityKey?: string;
    candidateKey?: string;
    percentile?: number;
  }) {
    const range = dateRange(input);
    const candidateReleaseIdentity = input.candidateKey
      ? await this.resolveCandidateReleaseIdentity(input.candidateKey)
      : null;
    const runs = await this.prisma.brainRun.findMany({
      where: {
        createdAt: { gte: range.from, lte: range.to },
        ...(positiveInteger(input.storeId) ? { storeId: positiveInteger(input.storeId) } : {}),
        status: { in: ['completed', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: {
        id: true,
        input: true,
        output: true,
        latencyMs: true,
        createdAt: true,
        steps: {
          orderBy: { createdAt: 'asc' },
          select: { stepKey: true, layer: true, latencyMs: true, output: true, createdAt: true },
        },
      },
    });

    const samples = runs.map(toTimingSample).filter((sample) =>
      (!input.provider || sample.provider === input.provider)
      && (!input.model || sample.model === input.model)
      && (!input.capabilityKey || sample.capabilityKey === input.capabilityKey)
      && (!candidateReleaseIdentity
        || candidateReleaseIdentity.releaseIds.has(sample.releaseId ?? -1)
        || candidateReleaseIdentity.releaseKeys.has(sample.releaseKey ?? '')));
    const metrics = {
      endToEnd: metric(samples, 'endToEnd'),
      firstVisibleAnswer: metric(samples, 'firstVisibleAnswer'),
      model: metric(samples, 'model'),
      toolData: metric(samples, 'toolData'),
    };
    const filters = {
      providers: unique(samples.map((sample) => sample.provider)),
      models: unique(samples.map((sample) => sample.model)),
      capabilityKeys: unique(samples.map((sample) => sample.capabilityKey)),
    };
    const requestedPercentile = boundedPercentile(input.percentile);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString(), cappedSampleSize: 5000 },
      sampleSize: samples.length,
      metrics,
      filters,
      appliedFilters: {
        candidateKey: input.candidateKey ?? null,
        capabilityKey: input.capabilityKey ?? null,
        provider: input.provider ?? null,
        model: input.model ?? null,
        storeId: positiveInteger(input.storeId) ?? null,
      },
      selectedPercentile: {
        percentile: requestedPercentile,
        endToEndMs: metricPercentile(samples, 'endToEnd', requestedPercentile),
        firstVisibleAnswerMs: metricPercentile(samples, 'firstVisibleAnswer', requestedPercentile),
        modelMs: metricPercentile(samples, 'model', requestedPercentile),
        toolDataMs: metricPercentile(samples, 'toolData', requestedPercentile),
      },
      daily: dailySeries(samples),
      dataCompleteness: {
        endToEnd: completeness(samples, 'endToEnd'),
        firstVisibleAnswer: completeness(samples, 'firstVisibleAnswer'),
        model: completeness(samples, 'model'),
        toolData: completeness(samples, 'toolData'),
        firstVisibleAnswerMode: 'buffered_answer_ready',
        note: '首次可见回答基于服务端 response_persistence 时间戳；当前 SSE 为整段答案就绪后分块发送，不代表首 token 延迟。',
      },
    };
  }

  private async resolveCandidateReleaseIdentity(candidateKey: string) {
    const candidate = await this.prisma.brainGovernanceCandidate.findUnique({
      where: { candidateKey },
      select: {
        rolloutSequence: {
          select: { releases: { select: { id: true, releaseKey: true } } },
        },
      },
    });
    const releases = candidate?.rolloutSequence?.releases ?? [];
    return {
      releaseIds: new Set(releases.map((release) => release.id)),
      releaseKeys: new Set(releases.map((release) => release.releaseKey)),
    };
  }

  async getGovernanceLatency(input: { from?: string; to?: string; days?: number } = {}) {
    const range = dateRange(input);
    const [events, receipts, tasks] = await Promise.all([
      this.prisma.brainGovernanceEvent.findMany({
        where: { createdAt: { gte: range.from, lte: range.to } },
        orderBy: { createdAt: 'asc' },
        take: 20000,
        select: { candidateId: true, eventType: true, createdAt: true },
      }),
      this.prisma.brainGateReceipt.findMany({
        where: { ingestedAt: { gte: range.from, lte: range.to }, verificationStatus: 'verified' },
        orderBy: { ingestedAt: 'desc' },
        take: 2000,
        select: { result: true, ingestedAt: true },
      }),
      this.prisma.brainGovernanceTask.findMany({
        where: {
          completedAt: { gte: range.from, lte: range.to },
          status: { in: ['approved', 'rejected', 'failed', 'cancelled'] },
        },
        orderBy: { completedAt: 'desc' },
        take: 10000,
        select: { status: true, attemptCount: true },
      }),
    ]);
    const byCandidate = new Map<number, Array<{ eventType: string; createdAt: Date }>>();
    for (const event of events) {
      if (!event.candidateId) continue;
      const list = byCandidate.get(event.candidateId) ?? [];
      list.push(event);
      byCandidate.set(event.candidateId, list);
    }
    const values = {
      candidateGate: [] as number[],
      waitingEvidence: [] as number[],
      waitingApproval: [] as number[],
      candidateToShadow: [] as number[],
      shadowToFull: [] as number[],
      receiptIngest: receiptIngestDurations(receipts),
    };
    for (const candidateEvents of byCandidate.values()) {
      pushDuration(values.candidateGate, candidateEvents, 'candidate_check_started', 'receipt_verified');
      pushDuration(values.waitingEvidence, candidateEvents, 'task_waiting_evidence', 'receipt_verified');
      pushDuration(values.waitingApproval, candidateEvents, 'task_pending_approval', ['task_approved', 'task_rejected']);
      pushDuration(values.candidateToShadow, candidateEvents, 'candidate_created', 'rollout_shadow_activated');
      pushDuration(values.shadowToFull, candidateEvents, 'rollout_shadow_activated', 'rollout_full_activated');
    }
    const reuse = receiptGateReuse(receipts.map((receipt) => receipt.result));
    const terminalTasks = tasks.length;
    const firstPassTasks = tasks.filter((task) => task.status === 'approved' && task.attemptCount <= 1).length;
    const retriedTasks = tasks.filter((task) => task.attemptCount > 1).length;
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      candidateCount: byCandidate.size,
      metrics: Object.fromEntries(Object.entries(values).map(([key, durations]) => [key, durationSummary(durations)])),
      gateReuse: reuse,
      taskOutcomes: {
        terminal: terminalTasks,
        firstPass: firstPassTasks,
        retried: retriedTasks,
        firstPassRate: terminalTasks ? firstPassTasks / terminalTasks : null,
        retryRate: terminalTasks ? retriedTasks / terminalTasks : null,
      },
    };
  }
}

function toTimingSample(run: {
  id: number;
  input: Prisma.JsonValue;
  output: Prisma.JsonValue | null;
  latencyMs: number | null;
  createdAt: Date;
  steps: Array<{ stepKey: string; layer: string; latencyMs: number | null; output: Prisma.JsonValue | null; createdAt: Date }>;
}): RunTimingSample {
  const output = record(run.output);
  const runtimeSelection = record(run.steps.find((step) => step.stepKey === 'release_runtime_selection')?.output);
  const response = run.steps.find((step) => step.stepKey === 'response_persistence');
  const modelDurations = run.steps.filter(isModelStep).map((step) => validDuration(step.latencyMs)).filter(isNumber);
  const toolDurations = run.steps.filter(isToolDataStep).map((step) => validDuration(step.latencyMs)).filter(isNumber);
  const firstVisibleAnswerMs = response ? Math.max(0, response.createdAt.getTime() - run.createdAt.getTime()) : null;
  const persistedResponseMs = validDuration(response?.latencyMs);
  const baseLatencyMs = validDuration(run.latencyMs);
  return {
    runId: run.id,
    createdAt: run.createdAt,
    releaseId: positiveInteger(Number(runtimeSelection.releaseId ?? output.releaseId)) ?? null,
    releaseKey: text(runtimeSelection.releaseKey ?? output.releaseKey),
    provider: text(output.provider),
    model: text(output.model),
    capabilityKey: text(output.capabilityKey),
    endToEndMs: baseLatencyMs === null ? firstVisibleAnswerMs : baseLatencyMs + (persistedResponseMs ?? 0),
    firstVisibleAnswerMs,
    modelMs: modelDurations.length ? modelDurations.reduce(sum, 0) : null,
    toolDataMs: toolDurations.length ? toolDurations.reduce(sum, 0) : null,
  };
}

function isModelStep(step: { stepKey: string }) {
  return ['model_intent_compile', 'model_intent_validation_retry', 'supervisor_model_plan'].includes(step.stepKey);
}

function isToolDataStep(step: { stepKey: string; layer: string }) {
  return ['semantic', 'execution', 'skill'].includes(step.layer)
    || ['capability_execution', 'bounded_dag_execution', 'semantic_query', 'semantic_query_comparison', 'semantic_query_ranking'].includes(step.stepKey);
}

function metric(samples: RunTimingSample[], key: DurationMetricKey) {
  return durationSummary(samples.map((sample) => durationValue(sample, key)).filter(isNumber));
}

function metricPercentile(samples: RunTimingSample[], key: DurationMetricKey, requestedPercentile: number) {
  const values = samples.map((sample) => durationValue(sample, key)).filter(isNumber).sort((left, right) => left - right);
  return percentile(values, requestedPercentile / 100);
}

function completeness(samples: RunTimingSample[], key: DurationMetricKey) {
  const available = samples.filter((sample) => durationValue(sample, key) !== null).length;
  return {
    available,
    total: samples.length,
    rate: samples.length ? available / samples.length : null,
    unavailableReason: available ? null : unavailableReason(key),
  };
}

function durationValue(sample: RunTimingSample, key: DurationMetricKey) {
  if (key === 'endToEnd') return sample.endToEndMs;
  if (key === 'firstVisibleAnswer') return sample.firstVisibleAnswerMs;
  if (key === 'model') return sample.modelMs;
  return sample.toolDataMs;
}

function unavailableReason(key: DurationMetricKey) {
  if (key === 'firstVisibleAnswer') return 'response_persistence_trace_missing';
  if (key === 'model') return 'model_trace_missing_or_rules_path';
  if (key === 'toolData') return 'tool_data_trace_missing';
  return 'brain_run_latency_missing';
}

function dailySeries(samples: RunTimingSample[]) {
  const groups = new Map<string, RunTimingSample[]>();
  for (const sample of samples) {
    const key = sample.createdAt.toISOString().slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, items]) => ({
    date,
    sampleSize: items.length,
    endToEndP50Ms: metric(items, 'endToEnd').p50Ms,
    firstVisibleP50Ms: metric(items, 'firstVisibleAnswer').p50Ms,
    modelP50Ms: metric(items, 'model').p50Ms,
    toolDataP50Ms: metric(items, 'toolData').p50Ms,
  }));
}

function durationSummary(input: number[]) {
  const values = [...input].sort((left, right) => left - right);
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    averageMs: values.length ? Math.round(values.reduce(sum, 0) / values.length) : null,
    sampleSize: values.length,
    unavailableReason: values.length ? null : 'no_complete_samples',
  };
}

function pushDuration(
  target: number[],
  events: Array<{ eventType: string; createdAt: Date }>,
  startType: string,
  endType: string | string[],
) {
  const start = events.find((event) => event.eventType === startType);
  if (!start) return;
  const endTypes = Array.isArray(endType) ? endType : [endType];
  const end = events.find((event) => endTypes.includes(event.eventType) && event.createdAt >= start.createdAt);
  if (end) target.push(end.createdAt.getTime() - start.createdAt.getTime());
}

function receiptGateReuse(results: Prisma.JsonValue[]) {
  let total = 0;
  let reused = 0;
  let avoidedModelInvocations = 0;
  let executedModelInvocations = 0;
  for (const result of results) {
    const rows = Array.isArray(record(result).results) ? record(result).results as unknown[] : [];
    for (const value of rows) {
      const row = record(value as Prisma.JsonValue);
      total += 1;
      const modelInvocations = Math.max(0, Number.isFinite(Number(row.modelInvocationCount)) ? Number(row.modelInvocationCount) : 0);
      if (row.reused === true || row.status === 'reused') {
        reused += 1;
        avoidedModelInvocations += modelInvocations;
      } else {
        executedModelInvocations += modelInvocations;
      }
    }
  }
  return { reused, total, rate: total ? reused / total : null, avoidedModelInvocations, executedModelInvocations };
}

function receiptIngestDurations(receipts: Array<{ result: Prisma.JsonValue; ingestedAt: Date }>) {
  return receipts.flatMap((receipt) => {
    const payload = record(receipt.result);
    const generatedAt = validDate(typeof payload.createdAt === 'string' ? payload.createdAt : undefined)
      ?? validDate(typeof payload.generatedAt === 'string' ? payload.generatedAt : undefined);
    if (!generatedAt) return [];
    const duration = receipt.ingestedAt.getTime() - generatedAt.getTime();
    return duration >= 0 ? [duration] : [];
  });
}

function dateRange(input: { from?: string; to?: string; days?: number }) {
  const to = validDate(input.to) ?? new Date();
  const days = Math.min(90, Math.max(1, Math.trunc(Number(input.days) || 7)));
  const from = validDate(input.from) ?? new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return from <= to ? { from, to } : { from: to, to: from };
}

function validDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function positiveInteger(value?: number) {
  return Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
}

function boundedPercentile(value?: number) {
  const percentileValue = Math.trunc(Number(value));
  return Number.isInteger(percentileValue) && percentileValue >= 1 && percentileValue <= 99 ? percentileValue : 50;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))] ?? null;
}

function validDuration(value?: number | null) {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : null;
}

function unique(values: Array<string | null>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function text(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function record(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

function sum(left: number, right: number) {
  return left + right;
}
