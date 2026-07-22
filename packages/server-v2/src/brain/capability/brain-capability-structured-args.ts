import type { BrainCapabilityToolArgs } from './brain-capability-executor.registry.js';

export interface BrainCapabilityStructuredTime {
  label: string;
  timezone: 'Asia/Shanghai' | 'UTC';
  preset?: string;
  startDate?: string;
  endDate?: string;
}

export interface BrainCapabilityStructuredComparisonTarget {
  type: 'time';
  timeRange: BrainCapabilityStructuredTime;
}

export function readCapabilityStructuredTime(
  args: Record<string, unknown>,
  contextTimezone: string,
): BrainCapabilityStructuredTime | undefined {
  if (args.time === undefined) return undefined;
  if (!args.time || typeof args.time !== 'object' || Array.isArray(args.time)) {
    throw new Error('capability_time_args_invalid');
  }
  const time = args.time as Record<string, unknown>;
  const allowed = new Set(['label', 'timezone', 'preset', 'startDate', 'endDate']);
  if (Reflect.ownKeys(time).some((key) => typeof key !== 'string' || !allowed.has(key))) {
    throw new Error('capability_time_args_invalid');
  }
  if (typeof time.label !== 'string' || !time.label.trim()) throw new Error('capability_time_label_required');
  if (!['Asia/Shanghai', 'UTC'].includes(String(time.timezone))) throw new Error('capability_time_timezone_invalid');
  if (time.timezone !== contextTimezone) {
    throw new Error(`capability_time_timezone_mismatch:${String(time.timezone)}:${contextTimezone}`);
  }
  if ((time.startDate === undefined) !== (time.endDate === undefined)) {
    throw new Error('capability_time_range_incomplete');
  }
  if (time.startDate !== undefined && (!isIsoDate(time.startDate) || !isIsoDate(time.endDate))) {
    throw new Error('capability_time_range_invalid');
  }
  if (typeof time.startDate === 'string' && typeof time.endDate === 'string' && time.startDate > time.endDate) {
    throw new Error('capability_time_range_reversed');
  }
  if (time.preset !== undefined && (typeof time.preset !== 'string' || !time.preset.trim())) {
    throw new Error('capability_time_preset_invalid');
  }
  return {
    label: time.label.trim(),
    timezone: time.timezone as BrainCapabilityStructuredTime['timezone'],
    ...(typeof time.preset === 'string' ? { preset: time.preset.trim() } : {}),
    ...(typeof time.startDate === 'string' ? { startDate: time.startDate, endDate: time.endDate as string } : {}),
  };
}

export function structuredTimeUtcRange(time: BrainCapabilityStructuredTime):
  | { label: string; startDate: Date; endExclusive: Date }
  | undefined {
  if (!time.startDate || !time.endDate) return undefined;
  return {
    label: time.label,
    startDate: dateBoundary(time.startDate, time.timezone),
    endExclusive: dateBoundary(addUtcDays(time.endDate, 1), time.timezone),
  };
}

export function readCapabilityStructuredComparisonTarget(
  args: Record<string, unknown>,
  contextTimezone: string,
): BrainCapabilityStructuredComparisonTarget | undefined {
  if (args.comparisonTarget === undefined) return undefined;
  if (!args.comparisonTarget || typeof args.comparisonTarget !== 'object' || Array.isArray(args.comparisonTarget)) {
    throw new Error('capability_comparison_target_invalid');
  }
  const target = args.comparisonTarget as Record<string, unknown>;
  const allowed = new Set(['type', 'timeRange']);
  if (Reflect.ownKeys(target).some((key) => typeof key !== 'string' || !allowed.has(key))) {
    throw new Error('capability_comparison_target_invalid');
  }
  if (target.type !== 'time') throw new Error('capability_comparison_target_unsupported');
  const timeRange = readCapabilityStructuredTime({ time: target.timeRange }, contextTimezone);
  if (!timeRange) throw new Error('capability_comparison_time_required');
  return { type: 'time', timeRange };
}

export function structuredEntityMentions(args: BrainCapabilityToolArgs): Array<{
  entityType: string;
  entityKey?: string;
  mention: string;
  source?: string;
}> {
  if (!Array.isArray(args.entities)) return [];
  return args.entities.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const entity = value as Record<string, unknown>;
    if (typeof entity.entityType !== 'string' || typeof entity.mention !== 'string') return [];
    return [{
      entityType: entity.entityType,
      ...(typeof entity.entityKey === 'string' ? { entityKey: entity.entityKey } : {}),
      mention: entity.mention,
      ...(typeof entity.source === 'string' ? { source: entity.source } : {}),
    }];
  });
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateBoundary(value: string, timezone: BrainCapabilityStructuredTime['timezone']) {
  const [year, month, day] = value.split('-').map(Number);
  const offsetMs = timezone === 'Asia/Shanghai' ? 8 * 60 * 60 * 1000 : 0;
  return new Date(Date.UTC(year, month - 1, day) - offsetMs);
}

function addUtcDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
