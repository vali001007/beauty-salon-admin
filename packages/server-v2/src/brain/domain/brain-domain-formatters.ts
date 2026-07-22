import type { BrainDateRange } from '../cognition/brain-time-range-parser.service.js';

export function formatBrainMoney(value: number) {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  return `${normalizedValue.toFixed(2)} 元`;
}

export function formatBrainPercent(value: number) {
  const normalizedValue = Number.isFinite(value) ? value : 0;
  return `${(normalizedValue * 100).toFixed(1)}%`;
}

export function defaultBrainDateRange(): BrainDateRange {
  const now = new Date();
  return {
    label: '今天',
    startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
    endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    granularity: 'day',
  };
}

export function toBrainNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(value.toString());
  return 0;
}
