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

  if (/(?:这个月|本月|当月).*(?:进步最快)|(?:进步最快).*(?:这个月|本月|当月)|成本项目异常增加/.test(text)) {
    return range(
      '上月与本月',
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    );
  }

  if (/(?:本月|这个月|当月).*(?:上个月|上月)|(?:上个月|上月).*(?:本月|这个月|当月)/.test(text)) {
    return range(
      '上月与本月',
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      new Date(now.getFullYear(), now.getMonth() + 1, 1),
    );
  }
  if (/(?:本周|这周|这礼拜).*(?:上周|上星期|上礼拜)|(?:上周|上星期|上礼拜).*(?:本周|这周|这礼拜)/.test(text)) {
    const today = startOfDay(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const thisMonday = addDays(today, -mondayOffset);
    return range('上周与本周', addDays(thisMonday, -7), addDays(thisMonday, 7));
  }
  if (/(?:今天|今日).*(?:昨天|昨日)|(?:昨天|昨日).*(?:今天|今日)/.test(text)) {
    const today = startOfDay(now);
    return range('昨天与今天', addDays(today, -1), addDays(today, 1));
  }
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  if (/(?:本季度|这个季度|当季).*(?:上个季度|上季度)|(?:上个季度|上季度).*(?:本季度|这个季度|当季)/.test(text)) {
    return range(
      '上季度与本季度',
      new Date(now.getFullYear(), quarterStartMonth - 3, 1),
      new Date(now.getFullYear(), quarterStartMonth + 3, 1),
    );
  }
  if (/上个季度|上季度/.test(text)) {
    return range(
      '上季度',
      new Date(now.getFullYear(), quarterStartMonth - 3, 1),
      new Date(now.getFullYear(), quarterStartMonth, 1),
    );
  }
  if (/本季度|这个季度|当季/.test(text)) {
    return range(
      '本季度',
      new Date(now.getFullYear(), quarterStartMonth, 1),
      new Date(now.getFullYear(), quarterStartMonth + 3, 1),
    );
  }
  if (/今年|本年度/.test(text)) {
    return range('今年', new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1));
  }
  if (/去年|上年度/.test(text)) {
    return range('去年', new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear(), 0, 1));
  }

  if (/今天|今日/.test(text)) {
    const start = startOfDay(now);
    return range('今天', start, addDays(start, 1));
  }
  if (/昨天|昨日/.test(text)) {
    const end = startOfDay(now);
    return range('昨天', addDays(end, -1), end);
  }
  if (/明天|明日/.test(text)) {
    const start = addDays(startOfDay(now), 1);
    return range('明天', start, addDays(start, 1));
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
  if (/上周|上星期|上礼拜/.test(text)) {
    const today = startOfDay(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const thisMonday = addDays(today, -mondayOffset);
    return range('上周', addDays(thisMonday, -7), thisMonday);
  }
  if (/本周末|这周末/.test(text)) {
    const today = startOfDay(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const monday = addDays(today, -mondayOffset);
    return range('本周末', addDays(monday, 5), addDays(monday, 7));
  }
  if (/本周|这周|这礼拜/.test(text)) {
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
  if (/这半年|近半年|最近半年|过去半年/.test(text)) {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    return range('近 6 个月', start, now);
  }
  const recentDays = text.match(/(?:最近|近)(\d{1,3})天/);
  if (recentDays) {
    const days = Math.max(1, Math.min(Number(recentDays[1]), 730));
    return range(`近 ${days} 天`, new Date(now.getTime() - days * 24 * 60 * 60 * 1000), now);
  }
  if (/(?:每个月|逐月)/.test(text)) {
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return range(
      '近 3 个完整自然月',
      new Date(now.getFullYear(), now.getMonth() - 3, 1),
      currentMonthStart,
    );
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
