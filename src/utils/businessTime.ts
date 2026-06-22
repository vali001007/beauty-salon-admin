export const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

type BusinessTimeInput = Date | string | number | null | undefined;

function toDate(value: BusinessTimeInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getParts(value: BusinessTimeInput) {
  const date = toDate(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: byType.get('year') ?? '',
    month: byType.get('month') ?? '',
    day: byType.get('day') ?? '',
    hour: byType.get('hour') ?? '',
    minute: byType.get('minute') ?? '',
    second: byType.get('second') ?? '',
  };
}

export function formatBusinessDate(value: BusinessTimeInput) {
  const parts = getParts(value);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatBusinessDateTime(value: BusinessTimeInput, options?: { seconds?: boolean }) {
  const parts = getParts(value);
  if (!parts) return '';
  const time = options?.seconds ? `${parts.hour}:${parts.minute}:${parts.second}` : `${parts.hour}:${parts.minute}`;
  return `${parts.year}-${parts.month}-${parts.day} ${time}`;
}

export function formatBusinessMonthDayTime(value: BusinessTimeInput) {
  const parts = getParts(value);
  if (!parts) return '';
  return `${Number(parts.month)}月${Number(parts.day)}日 ${parts.hour}:${parts.minute}`;
}

export function addBusinessDays(value: BusinessTimeInput, days: number) {
  const dateText = formatBusinessDate(value ?? new Date());
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatBusinessDate(date);
}
