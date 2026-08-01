export type AskDataResolvedDateRange = { label: string; startAt: string; endAt: string };

export function resolveAskDataDateRange(question: string, now = new Date()): AskDataResolvedDateRange | undefined {
  const text = question.replace(/\s+/g, '');
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const range = (label: string, start: Date, end: Date) => ({
    label,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  });

  if (/今天|今日/.test(text)) {
    const start = startOfDay(now);
    return range('今天', start, addDays(start, 1));
  }
  if (/昨天|昨日/.test(text)) {
    const end = startOfDay(now);
    return range('昨天', addDays(end, -1), end);
  }
  if (/上个月|上月/.test(text)) {
    return range(
      '上个月',
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      new Date(now.getFullYear(), now.getMonth(), 1),
    );
  }
  if (/本月|这个月|当月/.test(text)) {
    return range(
      '本月',
      new Date(now.getFullYear(), now.getMonth(), 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    );
  }
  if (/上周|上星期/.test(text)) {
    const today = startOfDay(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const thisMonday = addDays(today, -mondayOffset);
    return range('上周', addDays(thisMonday, -7), thisMonday);
  }
  if (/本周|这周/.test(text)) {
    const today = startOfDay(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const monday = addDays(today, -mondayOffset);
    return range('本周', monday, addDays(monday, 7));
  }
  const futureDays = text.match(/(?:未来|接下来)(\d{1,3})天/);
  if (futureDays) {
    const days = Math.max(1, Math.min(Number(futureDays[1]), 365));
    const start = startOfDay(now);
    return range(`未来 ${days} 天`, start, addDays(start, days));
  }
  const recentMonths = text.match(/(?:最近|近)([一二三四五六七八九十\d]{1,3})个?月/);
  if (recentMonths) {
    const months = Math.max(1, Math.min(parseCount(recentMonths[1]), 24));
    const start = new Date(now);
    start.setMonth(start.getMonth() - months);
    return range(`近 ${months} 个月`, start, now);
  }
  const recentDays = text.match(/(?:最近|近)(\d{1,3})天/);
  if (recentDays) {
    const days = Math.max(1, Math.min(Number(recentDays[1]), 730));
    return range(`近 ${days} 天`, new Date(now.getTime() - days * 24 * 60 * 60 * 1000), now);
  }
  if (/最近|近期|近一个月/.test(text)) {
    return range('近 30 天', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), now);
  }
  return undefined;
}

function parseCount(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (digits[value.slice(1)] ?? 0);
  if (value.endsWith('十')) return (digits[value.slice(0, -1)] ?? 0) * 10;
  const [tens, ones] = value.split('十');
  if (ones !== undefined) return (digits[tens] ?? 0) * 10 + (digits[ones] ?? 0);
  return digits[value] ?? 1;
}
