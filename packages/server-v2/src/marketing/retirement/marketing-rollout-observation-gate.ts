const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXPORT_STALENESS_MS = 6 * 60 * 60 * 1000;
const MAX_COVERAGE_LAG_MS = 60 * 60 * 1000;

export type MarketingRolloutRequirement = 'worker' | 'facts' | 'all';

export type MarketingWorkerDailyObservation = {
  businessDate: string;
  executionCount: number;
  deliveryJobCount: number;
  queuedCount: number;
  runningCount: number;
  staleExecutionCount: number;
  deliveredCount: number;
  deadLetterCount: number;
  expiredLeaseCount: number;
  duplicateDeliveryArtifactCount: number;
  deliveredMissingFactCount: number;
};

export type MarketingEffectParityMetrics = {
  deliveryCount: number;
  conversionCount: number;
  revenue: number;
  refundAmount: number;
};

export type MarketingFactParityDailyObservation = {
  businessDate: string;
  legacy: MarketingEffectParityMetrics;
  facts: MarketingEffectParityMetrics;
};

export type MarketingRolloutObservationExport = {
  storeId: number;
  rangeStart: string;
  rangeEnd: string;
  exportedAt: string;
  observationEndBusinessDate: string;
  sources: {
    worker: string;
    legacyEffect: string;
    factEffect: string;
  };
  coverageSegments: Array<{ start: string; end: string }>;
  workerDays: MarketingWorkerDailyObservation[];
  factParityDays: MarketingFactParityDailyObservation[];
};

export type MarketingRolloutObservationOptions = {
  requirement?: MarketingRolloutRequirement;
  requiredWorkerDays?: number;
  requiredFactDays?: number;
  amountTolerance?: number;
};

function timestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function businessDateTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function expectedBusinessDates(endBusinessDate: string, count: number) {
  const end = businessDateTimestamp(endBusinessDate);
  if (end === null) throw new Error('Invalid observationEndBusinessDate');
  return Array.from({ length: count }, (_, index) =>
    new Date(end - (count - index - 1) * DAY_MS).toISOString().slice(0, 10),
  );
}

function assertFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${field}`);
}

function validateMetrics(metrics: MarketingEffectParityMetrics, prefix: string) {
  assertFiniteNonNegative(metrics.deliveryCount, `${prefix}.deliveryCount`);
  assertFiniteNonNegative(metrics.conversionCount, `${prefix}.conversionCount`);
  if (!Number.isFinite(metrics.revenue)) throw new Error(`Invalid ${prefix}.revenue`);
  assertFiniteNonNegative(metrics.refundAmount, `${prefix}.refundAmount`);
}

function indexByBusinessDate<T extends { businessDate: string }>(items: T[], label: string) {
  const index = new Map<string, T>();
  for (const item of items) {
    if (businessDateTimestamp(item?.businessDate) === null) throw new Error(`Invalid ${label} businessDate`);
    if (index.has(item.businessDate)) throw new Error(`Duplicate ${label} businessDate: ${item.businessDate}`);
    index.set(item.businessDate, item);
  }
  return index;
}

function evaluateExportCoverage(input: MarketingRolloutObservationExport, now: Date, requiredDays: number) {
  const rangeStart = timestamp(input.rangeStart);
  const rangeEnd = timestamp(input.rangeEnd);
  const exportedAt = timestamp(input.exportedAt);
  const evaluatedAt = now.getTime();
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
    throw new Error('Invalid rollout observation export range');
  }
  if (exportedAt === null || !Number.isFinite(evaluatedAt)) {
    throw new Error('Invalid rollout observation export metadata');
  }
  if (!Array.isArray(input.coverageSegments)) {
    throw new Error('Rollout observation coverageSegments must be an array');
  }

  const coverageSegments = input.coverageSegments
    .map((segment) => ({ start: timestamp(segment?.start), end: timestamp(segment?.end) }))
    .map((segment) => {
      if (segment.start === null || segment.end === null || segment.end <= segment.start) {
        throw new Error('Invalid rollout observation coverage segment');
      }
      return { start: segment.start, end: segment.end };
    })
    .sort((left, right) => left.start - right.start);

  const reasons: string[] = [];
  if (rangeEnd - rangeStart < requiredDays * DAY_MS) reasons.push('observation_window_too_short');
  if (evaluatedAt - exportedAt > MAX_EXPORT_STALENESS_MS || exportedAt > evaluatedAt) {
    reasons.push('export_not_fresh');
  }
  if (exportedAt - rangeEnd > MAX_COVERAGE_LAG_MS || rangeEnd > exportedAt) {
    reasons.push('export_coverage_not_continuous');
  }

  let coverageCursor = rangeStart;
  for (const segment of coverageSegments) {
    if (segment.end <= coverageCursor) continue;
    if (segment.start > coverageCursor) break;
    coverageCursor = Math.max(coverageCursor, segment.end);
    if (coverageCursor >= rangeEnd) break;
  }
  if (coverageCursor < rangeEnd) reasons.push('export_coverage_has_gaps');

  return {
    passed: reasons.length === 0,
    reasons,
    rangeStart: new Date(rangeStart).toISOString(),
    rangeEnd: new Date(rangeEnd).toISOString(),
    exportedAt: new Date(exportedAt).toISOString(),
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    observationDays: Number(((rangeEnd - rangeStart) / DAY_MS).toFixed(4)),
    coverageSegmentCount: coverageSegments.length,
  };
}

function evaluateWorkerDays(input: MarketingRolloutObservationExport, requiredDays: number) {
  if (!Array.isArray(input.workerDays)) throw new Error('Rollout observation workerDays must be an array');
  const byDate = indexByBusinessDate(input.workerDays, 'worker observation');
  const expectedDates = expectedBusinessDates(input.observationEndBusinessDate, requiredDays);
  const reasons: string[] = [];
  const selected = expectedDates.map((date) => byDate.get(date));

  if (selected.some((item) => !item)) reasons.push('worker_observation_days_missing');

  const totals = {
    executionCount: 0,
    deliveryJobCount: 0,
    queuedCount: 0,
    runningCount: 0,
    staleExecutionCount: 0,
    deliveredCount: 0,
    deadLetterCount: 0,
    expiredLeaseCount: 0,
    duplicateDeliveryArtifactCount: 0,
    deliveredMissingFactCount: 0,
  };

  for (const item of selected) {
    if (!item) continue;
    for (const [field, value] of Object.entries(item)) {
      if (field === 'businessDate') continue;
      assertFiniteNonNegative(value as number, `workerDays.${field}`);
    }
    for (const field of Object.keys(totals) as Array<keyof typeof totals>) totals[field] += item[field];

    if (item.executionCount === 0 || item.deliveryJobCount === 0) {
      reasons.push(`worker_sample_missing:${item.businessDate}`);
    }
    if (item.staleExecutionCount > 0) reasons.push(`stale_execution_detected:${item.businessDate}`);
    if (item.expiredLeaseCount > 0) reasons.push(`expired_lease_detected:${item.businessDate}`);
    if (item.duplicateDeliveryArtifactCount > 0) {
      reasons.push(`duplicate_delivery_artifact_detected:${item.businessDate}`);
    }
    if (item.deliveredMissingFactCount > 0) {
      reasons.push(`delivered_missing_fact_detected:${item.businessDate}`);
    }
  }

  return {
    requiredDays,
    observedDates: expectedDates,
    passed: reasons.length === 0,
    totals,
    deadLetterRate:
      totals.deliveryJobCount === 0 ? null : Number((totals.deadLetterCount / totals.deliveryJobCount).toFixed(6)),
    reasons,
  };
}

function evaluateFactParityDays(
  input: MarketingRolloutObservationExport,
  requiredDays: number,
  amountTolerance: number,
) {
  if (!Array.isArray(input.factParityDays)) {
    throw new Error('Rollout observation factParityDays must be an array');
  }
  const byDate = indexByBusinessDate(input.factParityDays, 'fact parity observation');
  const expectedDates = expectedBusinessDates(input.observationEndBusinessDate, requiredDays);
  const reasons: string[] = [];
  const selected = expectedDates.map((date) => byDate.get(date));
  if (selected.some((item) => !item)) reasons.push('fact_parity_days_missing');

  const totals = {
    legacy: { deliveryCount: 0, conversionCount: 0, revenue: 0, refundAmount: 0 },
    facts: { deliveryCount: 0, conversionCount: 0, revenue: 0, refundAmount: 0 },
  };

  for (const item of selected) {
    if (!item) continue;
    validateMetrics(item.legacy, `factParityDays.${item.businessDate}.legacy`);
    validateMetrics(item.facts, `factParityDays.${item.businessDate}.facts`);
    for (const source of ['legacy', 'facts'] as const) {
      for (const field of Object.keys(totals[source]) as Array<keyof MarketingEffectParityMetrics>) {
        totals[source][field] += item[source][field];
      }
    }

    if (item.legacy.deliveryCount !== item.facts.deliveryCount) {
      reasons.push(`delivery_count_mismatch:${item.businessDate}`);
    }
    if (item.legacy.conversionCount !== item.facts.conversionCount) {
      reasons.push(`conversion_count_mismatch:${item.businessDate}`);
    }
    if (Math.abs(item.legacy.revenue - item.facts.revenue) > amountTolerance) {
      reasons.push(`revenue_mismatch:${item.businessDate}`);
    }
    if (Math.abs(item.legacy.refundAmount - item.facts.refundAmount) > amountTolerance) {
      reasons.push(`refund_amount_mismatch:${item.businessDate}`);
    }
  }

  const legacySample =
    totals.legacy.deliveryCount +
    totals.legacy.conversionCount +
    Math.abs(totals.legacy.revenue) +
    totals.legacy.refundAmount;
  const factSample =
    totals.facts.deliveryCount +
    totals.facts.conversionCount +
    Math.abs(totals.facts.revenue) +
    totals.facts.refundAmount;
  if (legacySample === 0 || factSample === 0) reasons.push('fact_parity_sample_missing');

  return {
    requiredDays,
    observedDates: expectedDates,
    amountTolerance,
    passed: reasons.length === 0,
    totals,
    differences: {
      deliveryCount: totals.facts.deliveryCount - totals.legacy.deliveryCount,
      conversionCount: totals.facts.conversionCount - totals.legacy.conversionCount,
      revenue: Number((totals.facts.revenue - totals.legacy.revenue).toFixed(6)),
      refundAmount: Number((totals.facts.refundAmount - totals.legacy.refundAmount).toFixed(6)),
    },
    reasons,
  };
}

export function evaluateMarketingRolloutObservation(
  input: MarketingRolloutObservationExport,
  now = new Date(),
  options: MarketingRolloutObservationOptions = {},
) {
  const requirement = options.requirement ?? 'all';
  const requiredWorkerDays = options.requiredWorkerDays ?? 3;
  const requiredFactDays = options.requiredFactDays ?? 7;
  const amountTolerance = options.amountTolerance ?? 0.01;
  if (!['worker', 'facts', 'all'].includes(requirement)) throw new Error('Invalid rollout requirement');
  if (!Number.isInteger(requiredWorkerDays) || requiredWorkerDays <= 0) {
    throw new Error('Invalid requiredWorkerDays');
  }
  if (!Number.isInteger(requiredFactDays) || requiredFactDays <= 0) {
    throw new Error('Invalid requiredFactDays');
  }
  if (!Number.isFinite(amountTolerance) || amountTolerance < 0) throw new Error('Invalid amountTolerance');
  if (!Number.isInteger(input.storeId) || input.storeId <= 0) throw new Error('Invalid rollout storeId');
  if (
    !input.sources ||
    !String(input.sources.worker ?? '').trim() ||
    !String(input.sources.legacyEffect ?? '').trim() ||
    !String(input.sources.factEffect ?? '').trim()
  ) {
    throw new Error('Invalid rollout observation sources');
  }
  if (input.sources.legacyEffect.trim() === input.sources.factEffect.trim()) {
    throw new Error('Legacy and fact observations must use independent sources');
  }
  if (businessDateTimestamp(input.observationEndBusinessDate) === null) {
    throw new Error('Invalid observationEndBusinessDate');
  }

  const requiredRangeDays = requirement === 'worker' ? requiredWorkerDays : requiredFactDays;
  const exportCoverage = evaluateExportCoverage(input, now, requiredRangeDays);
  const worker = evaluateWorkerDays(input, requiredWorkerDays);
  const facts = evaluateFactParityDays(input, requiredFactDays, amountTolerance);
  const requiredResults = [exportCoverage.passed];
  if (requirement === 'worker' || requirement === 'all') requiredResults.push(worker.passed);
  if (requirement === 'facts' || requirement === 'all') requiredResults.push(facts.passed);

  const reasons = [...exportCoverage.reasons];
  if (requirement === 'worker' || requirement === 'all') reasons.push(...worker.reasons);
  if (requirement === 'facts' || requirement === 'all') reasons.push(...facts.reasons);

  return {
    mode: 'read_only' as const,
    storeId: input.storeId,
    sources: input.sources,
    requirement,
    passed: requiredResults.every(Boolean),
    observationEndBusinessDate: input.observationEndBusinessDate,
    exportCoverage,
    worker: { required: requirement === 'worker' || requirement === 'all', ...worker },
    facts: { required: requirement === 'facts' || requirement === 'all', ...facts },
    reasons,
  };
}
