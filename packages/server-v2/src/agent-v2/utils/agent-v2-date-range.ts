export const AGENT_V2_DAY_MS = 86_400_000;

export type AgentV2DateRange = {
  start: Date;
  end: Date;
  label: string;
  preset: string;
};

export type AgentV2DateRangeOptions = {
  fallbackPreset?: string;
  now?: Date;
  maxRecentDays?: number;
  maxRecentMonths?: number;
};

export function resolveAgentV2DateRange(input: unknown, options: AgentV2DateRangeOptions = {}): AgentV2DateRange {
  const now = options.now ?? new Date();
  const maxRecentDays = options.maxRecentDays ?? 90;
  const preset = typeof input === 'object' && input !== null ? String((input as any).preset ?? '') : String(input ?? '');
  if (preset === 'all') return { start: new Date(0), end: now, label: '全部时间', preset };
  if (typeof input === 'object' && input !== null && (input as any).startDate && (input as any).endDate) {
    return {
      start: new Date(String((input as any).startDate)),
      end: new Date(`${String((input as any).endDate).slice(0, 10)}T23:59:59.999Z`),
      label: String((input as any).label ?? '自定义时间'),
      preset: String((input as any).preset ?? 'custom'),
    };
  }
  if (preset === 'today') {
    const start = startOfAgentV2Day(now);
    return { start, end: new Date(start.getTime() + AGENT_V2_DAY_MS), label: '今天', preset };
  }
  if (preset === 'yesterday') {
    const end = startOfAgentV2Day(now);
    return { start: new Date(end.getTime() - AGENT_V2_DAY_MS), end, label: '昨天', preset };
  }
  if (preset === 'this_week') return { start: startOfAgentV2Week(now), end: now, label: '本周', preset };
  if (preset === 'last_week') {
    const end = startOfAgentV2Week(now);
    return { start: new Date(end.getTime() - 7 * AGENT_V2_DAY_MS), end, label: '上周', preset };
  }
  if (preset === 'this_month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: '本月', preset };
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { start, end: new Date(now.getFullYear(), now.getMonth(), 1), label: '上月', preset };
  }
  if (preset === 'this_year') return { start: new Date(now.getFullYear(), 0, 1), end: now, label: '今年', preset };
  if (preset === 'last_year') {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    return { start, end: new Date(now.getFullYear(), 0, 1), label: '去年', preset };
  }
  const monthRange = monthPresetRange(preset);
  if (monthRange) return monthRange;
  const recentDays = preset.match(/^last_(\d{1,3})_days$/)?.[1];
  if (recentDays) return recentDaysRange(Number(recentDays), now, maxRecentDays, preset);
  const recentMonths = preset.match(/^last_(\d{1,2})_months$/)?.[1];
  if (recentMonths) return recentMonthsRange(Number(recentMonths), now, options.maxRecentMonths ?? 24, preset);
  if (options.fallbackPreset && options.fallbackPreset !== preset) {
    return resolveAgentV2DateRange(options.fallbackPreset, { ...options, now });
  }
  const start = startOfAgentV2Week(now);
  return { start, end: now, label: '本周', preset: 'this_week' };
}

export function resolveAgentV2QueryDateRange(args: Record<string, unknown>, fallbackPreset: string, options: AgentV2DateRangeOptions = {}): AgentV2DateRange {
  const filters = typeof args.filters === 'object' && args.filters !== null ? args.filters as Record<string, unknown> : {};
  const explicit = args.timeRange ?? args.dateRange ?? filters.timeRange ?? filters.dateRange;
  if (explicit) return resolveAgentV2DateRange(explicit, options);
  const question = String(args.question ?? '');
  const preset = extractAgentV2DatePreset(question);
  if (preset) return resolveAgentV2DateRange(preset, options);
  const days = extractAgentV2RecentDays(question);
  if (days) return recentDaysRange(days, options.now ?? new Date(), options.maxRecentDays ?? 90, `last_${Math.min(days, options.maxRecentDays ?? 90)}_days`);
  const months = extractAgentV2RecentMonths(question);
  if (months) return recentMonthsRange(months, options.now ?? new Date(), options.maxRecentMonths ?? 24, `last_${Math.min(months, options.maxRecentMonths ?? 24)}_months`);
  const monthRange = extractAgentV2MonthRange(question, options.now ?? new Date());
  if (monthRange) return monthRange;
  return resolveAgentV2DateRange(fallbackPreset, options);
}

export function startOfAgentV2Day(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfAgentV2Week(date: Date) {
  const day = date.getDay() || 7;
  const start = startOfAgentV2Day(date);
  return new Date(start.getTime() - (day - 1) * AGENT_V2_DAY_MS);
}

export function extractAgentV2DatePreset(question: string) {
  if (/全部|所有|不限时间|历史/.test(question)) return 'all';
  if (/今天|今日/.test(question)) return 'today';
  if (/昨天|昨日/.test(question)) return 'yesterday';
  if (/上周|上星期|上个星期|上一周/.test(question)) return 'last_week';
  if (/本周|这周|本星期|这个星期/.test(question)) return 'this_week';
  if (/上月|上个月|上一个月/.test(question)) return 'last_month';
  if (/本月|这个月|当月/.test(question)) return 'this_month';
  if (/去年|上一年|上年/.test(question)) return 'last_year';
  if (/今年|本年|这个年度|本年度/.test(question)) return 'this_year';
  if (/近一周|最近一周|过去一周|近7天|最近7天|过去7天|近七天|最近七天|过去七天/.test(question)) return 'last_7_days';
  if (/近一个月|最近一个月|过去一个月|近30天|最近30天|过去30天|近三十天|最近三十天|过去三十天/.test(question)) return 'last_30_days';
  return null;
}

export function extractAgentV2RecentDays(question: string) {
  const raw = question.match(/(?:最近|近|过去)\s*([一二两三四五六七八九十\d]{1,3})\s*天/)?.[1];
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.min(numeric, 90);
  const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (raw === '十') return 10;
  if (raw.startsWith('十')) return 10 + (map[raw.slice(1)] ?? 0);
  if (raw.includes('十')) {
    const [tens, ones] = raw.split('十');
    return Math.min((map[tens] ?? 1) * 10 + (map[ones] ?? 0), 90);
  }
  return map[raw] ?? null;
}

export function extractAgentV2RecentMonths(question: string) {
  const raw = question.match(/(?:最近|近|过去)\s*([一二两三四五六七八九十\d]{1,3})\s*个?\s*月/)?.[1];
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.min(numeric, 24);
  const parsed = parseChineseNumber(raw);
  return parsed ? Math.min(parsed, 24) : null;
}

export function extractAgentV2MonthRange(question: string, now = new Date()): AgentV2DateRange | null {
  if (/(?:最近|近|过去)\s*[一二两三四五六七八九十\d]{1,3}\s*个?\s*月/.test(question)) return null;
  const matched =
    question.match(/(?:(20\d{2})\s*年\s*)?([一二三四五六七八九十\d]{1,2})\s*月(?:份)?/) ??
    question.match(/(20\d{2})[-/年]([01]?\d)\s*(?:月)?/);
  if (!matched) return null;
  const year = Number(matched[1] ?? now.getFullYear());
  const month = parseMonthNumber(matched[2]);
  if (!Number.isInteger(year) || !month || month < 1 || month > 12) return null;
  const start = new Date(year, month - 1, 1);
  return { start, end: new Date(year, month, 1), label: `${year}年${month}月`, preset: `month_${year}_${String(month).padStart(2, '0')}` };
}

function monthPresetRange(preset: string): AgentV2DateRange | null {
  const matched = preset.match(/^month_(20\d{2})_(0[1-9]|1[0-2])$/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const start = new Date(year, month - 1, 1);
  return { start, end: new Date(year, month, 1), label: `${year}年${month}月`, preset };
}

function recentDaysRange(daysInput: number, now: Date, maxRecentDays: number, preset: string): AgentV2DateRange {
  const days = Math.min(Math.max(Number(daysInput) || 30, 1), maxRecentDays);
  const start = startOfAgentV2Day(new Date(now.getTime() - Math.max(0, days - 1) * AGENT_V2_DAY_MS));
  return { start, end: now, label: `近 ${days} 天`, preset };
}

function recentMonthsRange(monthsInput: number, now: Date, maxRecentMonths: number, preset: string): AgentV2DateRange {
  const months = Math.min(Math.max(Number(monthsInput) || 1, 1), maxRecentMonths);
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  return { start, end: now, label: `近 ${months} 个月`, preset };
}

function parseMonthNumber(input: string) {
  const numeric = Number(input);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return parseChineseNumber(input);
}

function parseChineseNumber(input: string) {
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  if (input === '十') return 10;
  if (input.startsWith('十')) return 10 + (map[input.slice(1)] ?? 0);
  if (input.includes('十')) {
    const [tens, ones] = input.split('十');
    return (map[tens] ?? 1) * 10 + (map[ones] ?? 0);
  }
  return map[input] ?? null;
}
