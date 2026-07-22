const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_EXPORT_STALENESS_MS = 6 * 60 * 60 * 1000;
const MAX_COVERAGE_LAG_MS = 60 * 60 * 1000;
const LEGACY_MARKER = 'legacy_marketing_recommendation_api';

export type MarketingLegacyLogExport = {
  rangeStart: string;
  rangeEnd: string;
  exportedAt: string;
  coverageSegments: Array<{ start: string; end: string }>;
  events: Array<{ timestamp: string; message: string }>;
};

function timestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

export function evaluateMarketingLegacyRetirement(input: MarketingLegacyLogExport, now = new Date()) {
  const rangeStart = timestamp(input.rangeStart);
  const rangeEnd = timestamp(input.rangeEnd);
  const exportedAt = timestamp(input.exportedAt);
  const evaluatedAt = now.getTime();
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
    throw new Error('Invalid legacy log export range');
  }
  if (exportedAt === null || !Number.isFinite(evaluatedAt)) {
    throw new Error('Invalid legacy log export metadata');
  }
  if (!Array.isArray(input.events)) throw new Error('Legacy log export events must be an array');
  if (!Array.isArray(input.coverageSegments)) throw new Error('Legacy log export coverageSegments must be an array');

  const coverageSegments = input.coverageSegments
    .map((segment) => ({ start: timestamp(segment?.start), end: timestamp(segment?.end) }))
    .map((segment) => {
      if (segment.start === null || segment.end === null || segment.end <= segment.start) {
        throw new Error('Invalid legacy log coverage segment');
      }
      return { start: segment.start, end: segment.end };
    })
    .sort((left, right) => left.start - right.start);

  const routeCounts: Record<string, number> = {};
  const storeCounts: Record<string, number> = {};
  let legacyCallCount = 0;

  for (const event of input.events) {
    const eventTimestamp = timestamp(event?.timestamp);
    if (eventTimestamp === null) throw new Error('Invalid legacy log event timestamp');
    if (eventTimestamp < rangeStart || eventTimestamp > rangeEnd) continue;
    const message = String(event?.message ?? '');
    if (!message.includes(LEGACY_MARKER)) continue;
    legacyCallCount += 1;
    const route = message.match(/route=(GET|POST|PUT|PATCH|DELETE) (\/\S+)/);
    const storeId = message.match(/storeId=(\d+)/);
    increment(routeCounts, route ? `${route[1]} ${route[2]}` : 'unknown');
    increment(storeCounts, storeId?.[1] ?? 'unknown');
  }

  const observationMs = rangeEnd - rangeStart;
  const reasons: string[] = [];
  if (observationMs < FOURTEEN_DAYS_MS) reasons.push('observation_window_too_short');
  if (evaluatedAt - exportedAt > MAX_EXPORT_STALENESS_MS || exportedAt > evaluatedAt) reasons.push('export_not_fresh');
  if (exportedAt - rangeEnd > MAX_COVERAGE_LAG_MS || rangeEnd > exportedAt) reasons.push('export_coverage_not_continuous');
  let coverageCursor = rangeStart;
  for (const segment of coverageSegments) {
    if (segment.end <= coverageCursor) continue;
    if (segment.start > coverageCursor) break;
    coverageCursor = Math.max(coverageCursor, segment.end);
    if (coverageCursor >= rangeEnd) break;
  }
  if (coverageCursor < rangeEnd) reasons.push('export_coverage_has_gaps');
  if (legacyCallCount > 0) reasons.push('legacy_calls_detected');
  return {
    mode: 'read_only' as const,
    passed: reasons.length === 0,
    rangeStart: new Date(rangeStart).toISOString(),
    rangeEnd: new Date(rangeEnd).toISOString(),
    exportedAt: new Date(exportedAt).toISOString(),
    evaluatedAt: new Date(evaluatedAt).toISOString(),
    observationDays: Number((observationMs / (24 * 60 * 60 * 1000)).toFixed(4)),
    coverageSegmentCount: coverageSegments.length,
    legacyCallCount,
    routeCounts,
    storeCounts,
    reasons,
  };
}
