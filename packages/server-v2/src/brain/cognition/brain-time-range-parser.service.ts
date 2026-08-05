import { Injectable } from '@nestjs/common';

export type BrainTimeGranularity = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface BrainDateRange {
  label: string;
  startDate: Date;
  endDate: Date;
  granularity: BrainTimeGranularity;
}

export interface BrainComparisonRange {
  label: string;
  current: BrainDateRange;
  previous: BrainDateRange;
}

export interface BrainDateFilter {
  field: 'date' | 'previous_date';
  op: 'between';
  value: [string, string];
}

export interface BrainTimeRangeParseResult {
  mentionedTime: boolean;
  filters: BrainDateFilter[];
  range?: BrainDateRange;
  comparison?: BrainComparisonRange;
  requiresComparison: boolean;
  unsupportedExpressions: string[];
}

export interface BrainTimeRangeParseOptions {
  now?: Date;
}

@Injectable()
export class BrainTimeRangeParserService {
  parse(message: string, options: BrainTimeRangeParseOptions = {}): BrainTimeRangeParseResult {
    const now = options.now ? new Date(options.now) : new Date();
    const text = message.trim();
    const hasExplicitComparison = /同比|相比|对比|比较|差多少|跟.*比|和.*比/.test(text);
    const absoluteRange = hasExplicitComparison ? undefined : this.parseAbsoluteRange(text);
    if (absoluteRange) {
      return {
        mentionedTime: true,
        filters: [this.toFilter(absoluteRange)],
        range: absoluteRange,
        requiresComparison: false,
        unsupportedExpressions: [],
      };
    }
    const comparisonRange = this.parseComparison(text, now);
    if (comparisonRange) {
      const unsupportedExpressions =
        comparisonRange.comparison || comparisonRange.incompleteComparison
          ? []
          : [...new Set([comparisonRange.range.label, ...this.detectUnsupportedTimeExpressions(text)])];
      return {
        mentionedTime: true,
        filters: [],
        range: comparisonRange.range,
        comparison: comparisonRange.comparison,
        requiresComparison: true,
        unsupportedExpressions,
      };
    }

    const range = this.parseScalarRange(text, now);
    if (range) {
      return {
        mentionedTime: true,
        filters: [this.toFilter(range)],
        range,
        requiresComparison: false,
        unsupportedExpressions: [],
      };
    }

    const unsupportedExpressions = this.detectUnsupportedTimeExpressions(text);
    return {
      mentionedTime: unsupportedExpressions.length > 0,
      filters: [],
      requiresComparison: false,
      unsupportedExpressions,
    };
  }

  private parseComparison(
    text: string,
    now: Date,
  ): { range: BrainDateRange; comparison?: BrainComparisonRange; incompleteComparison?: boolean } | undefined {
    const rollingRanges = [...text.matchAll(/(?:最近|过去|近)\s*([一二三四五六七八九十\d]{1,3})\s*(个月|天|年)/gu)];
    if (rollingRanges.length >= 2 && /(?:相比|对比|比较|跟.*比|和.*比|与.*比)/.test(text)) {
      const current = this.rollingRange(now, chineseOrArabicNumber(rollingRanges[0]![1]!), rollingRanges[0]![2]!);
      const previous = this.rollingRange(now, chineseOrArabicNumber(rollingRanges[1]![1]!), rollingRanges[1]![2]!);
      if (current && previous) {
        const label = `${current.label}对比${previous.label}`;
        return {
          range: { ...current, label },
          comparison: { label, current, previous },
        };
      }
    }
    if ((text.includes('本月') || text.includes('这个月')) && (text.includes('上月') || text.includes('上个月'))) {
      const current = this.currentMonthRange(now);
      const previous = this.previousMonthRange(now);
      return {
        range: { ...current, label: '本月对比上月' },
        comparison: { label: '本月对比上月', current, previous },
      };
    }
    const explicitMonths = text.match(/([一二三四五六七八九十\d]{1,3})月.*?([一二三四五六七八九十\d]{1,3})月/);
    if (explicitMonths) {
      const currentMonth = chineseOrArabicNumber(explicitMonths[1]);
      const previousMonth = chineseOrArabicNumber(explicitMonths[2]);
      if (currentMonth >= 1 && currentMonth <= 12 && previousMonth >= 1 && previousMonth <= 12) {
        const current = this.namedMonthRange(now, currentMonth);
        const previous = this.namedMonthRange(now, previousMonth, current.startDate);
        return {
          range: { ...current, label: `${current.label}对比${previous.label}` },
          comparison: { label: `${current.label}对比${previous.label}`, current, previous },
        };
      }
    }
    if ((text.includes('本周') || text.includes('这周')) && text.includes('上周')) {
      const current = this.currentWeekRange(now);
      const previous = this.previousWeekRange(now);
      return {
        range: { ...current, label: '本周对比上周' },
        comparison: { label: '本周对比上周', current, previous },
      };
    }
    if (text.includes('今天') && text.includes('昨天')) {
      const current = this.dayRange('今天', now, 0);
      const previous = this.dayRange('昨天', now, -1);
      return {
        range: { ...current, label: '今天对比昨天' },
        comparison: { label: '今天对比昨天', current, previous },
      };
    }
    if (text.includes('今天') && /(平时|平常|日常|通常)/.test(text)) {
      const current = this.dayRange('今天', now, 0);
      const previousStart = this.startOfDay(now);
      previousStart.setDate(previousStart.getDate() - 30);
      const previousEnd = this.endOfDay(now);
      previousEnd.setDate(previousEnd.getDate() - 1);
      const previous = {
        label: '最近30个完整自然日',
        startDate: previousStart,
        endDate: previousEnd,
        granularity: 'day' as const,
      };
      return {
        range: { ...current, label: '今天对比平时' },
        comparison: { label: '今天对比平时', current, previous },
      };
    }
    if (text.includes('去年同期')) {
      const start = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { range: { label: '去年同期', startDate: start, endDate: end, granularity: 'year' } };
    }
    if (text.includes('环比')) {
      const current = this.currentMonthRange(now);
      const previous = this.previousMonthRange(now);
      return {
        range: { ...current, label: '本月环比上月' },
        comparison: { label: '本月环比上月', current, previous },
      };
    }
    if (/(同比|跟.*比|和.*比|相比|对比|比较|差多少)/.test(text)) {
      const anchor = this.incompleteComparisonAnchor(text, now);
      if (anchor) return { range: anchor, incompleteComparison: true };
      return { range: { label: '对比时间', startDate: now, endDate: now, granularity: 'day' } };
    }
    return undefined;
  }

  private rollingRange(now: Date, amount: number, unit: string): BrainDateRange | undefined {
    if (!Number.isInteger(amount) || amount < 1) return undefined;
    if (unit === '天' && amount <= 366) {
      const startDate = this.startOfDay(now);
      startDate.setDate(startDate.getDate() - (amount - 1));
      return {
        label: `最近${amount}天`,
        startDate,
        endDate: this.endOfDay(now),
        granularity: 'day',
      };
    }
    if (unit === '个月' && amount <= 36) {
      const startDate = this.subtractCalendarMonthsClamped(this.startOfDay(now), amount);
      return {
        label: `过去${amount}个月`,
        startDate,
        endDate: this.endOfDay(now),
        granularity: amount % 12 === 0 ? 'year' : 'month',
      };
    }
    if (unit === '年' && amount <= 10) {
      const startDate = this.subtractCalendarYearsClamped(this.startOfDay(now), amount);
      return {
        label: `过去${amount}年`,
        startDate,
        endDate: this.endOfDay(now),
        granularity: 'year',
      };
    }
    return undefined;
  }

  private incompleteComparisonAnchor(text: string, now: Date): BrainDateRange | undefined {
    if (text.includes('昨天')) return this.dayRange('昨天', now, -1);
    if (text.includes('上周')) return this.previousWeekRange(now);
    if (text.includes('上个月') || text.includes('上月')) return this.previousMonthRange(now);
    if (text.includes('上季度')) {
      const currentQuarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        label: '上季度',
        startDate: new Date(now.getFullYear(), currentQuarterStartMonth - 3, 1, 0, 0, 0, 0),
        endDate: new Date(now.getFullYear(), currentQuarterStartMonth, 0, 23, 59, 59, 999),
        granularity: 'quarter',
      };
    }
    if (text.includes('去年')) {
      return {
        label: '去年',
        startDate: new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0),
        endDate: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
        granularity: 'year',
      };
    }
    if (text.includes('本月') || text.includes('这个月')) return this.currentMonthRange(now);
    if (text.includes('本周') || text.includes('这周')) return this.currentWeekRange(now);
    if (text.includes('今天')) return this.dayRange('今天', now, 0);
    if (text.includes('本季度') || text.includes('这个季度')) {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        label: '本季度',
        startDate: new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0),
        endDate: this.endOfDay(now),
        granularity: 'quarter',
      };
    }
    if (text.includes('今年')) {
      return {
        label: '今年',
        startDate: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        endDate: this.endOfDay(now),
        granularity: 'year',
      };
    }
    return undefined;
  }

  private parseScalarRange(text: string, now: Date): BrainDateRange | undefined {
    const inactiveDays = text.match(/(\d{1,3})\s*天(?:没来|未到店|未消费)/);
    if (inactiveDays) {
      const days = Number(inactiveDays[1]);
      if (days >= 1 && days <= 366) return this.relativeThresholdRange(now, days, `${days}天未活跃阈值`);
    }
    const inactiveMonths = text.match(/([一二三四五六七八九十]|\d{1,2})\s*个月(?:没来|未到店|未消费)/);
    if (inactiveMonths) {
      const months = chineseOrArabicNumber(inactiveMonths[1]);
      if (months >= 1 && months <= 24) return this.relativeThresholdRange(now, months * 30, `${months}个月未活跃阈值`);
    }
    const recentDays = text.match(/(?:最近|过去|近)\s*(\d{1,3})\s*天/);
    if (recentDays) {
      const days = Number(recentDays[1]);
      if (days >= 1 && days <= 366) {
        const startDate = this.startOfDay(now);
        startDate.setDate(startDate.getDate() - (days - 1));
        return {
          label: `最近${days}天`,
          startDate,
          endDate: this.endOfDay(now),
          granularity: 'day',
        };
      }
    }
    const recentMonths = text.match(/(?:最近|过去|近)\s*([一二三四五六七八九十\d]{1,3})\s*个月/);
    if (recentMonths) {
      const months = chineseOrArabicNumber(recentMonths[1]);
      if (months >= 1 && months <= 36) {
        const startDate = this.subtractCalendarMonthsClamped(this.startOfDay(now), months);
        return {
          label: `过去${months}个月`,
          startDate,
          endDate: this.endOfDay(now),
          granularity: months % 12 === 0 ? 'year' : 'month',
        };
      }
    }
    const recentYears = text.match(/(?:最近|过去|近)\s*([一二三四五六七八九十\d]{1,2})\s*年/);
    if (recentYears) {
      const years = chineseOrArabicNumber(recentYears[1]);
      if (years >= 1 && years <= 10) {
        const startDate = this.subtractCalendarYearsClamped(this.startOfDay(now), years);
        return {
          label: `过去${years}年`,
          startDate,
          endDate: this.endOfDay(now),
          granularity: 'year',
        };
      }
    }
    if (text.includes('最近')) {
      const startDate = this.startOfDay(now);
      startDate.setDate(startDate.getDate() - 29);
      return {
        label: '最近30天',
        startDate,
        endDate: this.endOfDay(now),
        granularity: 'day',
      };
    }
    const currentPeriodToNow = this.currentPeriodToNow(text, now);
    if (currentPeriodToNow) return currentPeriodToNow;
    if (text.includes('现在')) {
      return {
        label: '现在到今天结束',
        startDate: new Date(now),
        endDate: this.endOfDay(now),
        granularity: 'hour',
      };
    }
    if (text.includes('今天')) return this.dayRange('今天', now, 0);
    if (text.includes('明天')) return this.dayRange('明天', now, 1);
    if (text.includes('昨天')) return this.dayRange('昨天', now, -1);
    if (text.includes('上午')) {
      return {
        label: '今天上午',
        startDate: this.startOfDay(now),
        endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 59, 59, 999),
        granularity: 'hour',
      };
    }
    if (text.includes('下午')) {
      return {
        label: '今天下午',
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0),
        endDate: this.endOfDay(now),
        granularity: 'hour',
      };
    }
    if (text.includes('本周') || text.includes('这周')) {
      return this.currentWeekRange(now);
    }
    if (text.includes('上周')) {
      return this.previousWeekRange(now);
    }
    if (text.includes('下周')) {
      const start = this.startOfWeek(now);
      start.setDate(start.getDate() + 7);
      const end = this.endOfDay(start);
      end.setDate(start.getDate() + 6);
      return { label: '下周', startDate: start, endDate: end, granularity: 'week' };
    }
    if (text.includes('本月') || text.includes('这个月')) {
      return this.currentMonthRange(now);
    }
    if (text.includes('上个月') || text.includes('上月')) {
      return this.previousMonthRange(now);
    }
    if (text.includes('下个月') || text.includes('下月')) {
      return {
        label: '下月',
        startDate: new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0),
        endDate: new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999),
        granularity: 'month',
      };
    }
    if (text.includes('本季度') || text.includes('这个季度')) {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        label: '本季度',
        startDate: new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0),
        endDate: this.endOfDay(now),
        granularity: 'quarter',
      };
    }
    if (text.includes('上季度')) {
      const currentQuarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), currentQuarterStartMonth - 3, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), currentQuarterStartMonth, 0, 23, 59, 59, 999);
      return { label: '上季度', startDate: start, endDate: end, granularity: 'quarter' };
    }
    if (text.includes('今年')) {
      return {
        label: '今年',
        startDate: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        endDate: this.endOfDay(now),
        granularity: 'year',
      };
    }
    if (text.includes('去年')) {
      return {
        label: '去年',
        startDate: new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0),
        endDate: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
        granularity: 'year',
      };
    }

    return undefined;
  }

  private parseAbsoluteRange(text: string): BrainDateRange | undefined {
    const cutoff = text.match(
      /(?:截至|截止)\s*(\d{4})\s*(?:年|[/-])\s*(\d{1,2})\s*(?:月|[/-])\s*(\d{1,2})\s*日?(?:\s*[T ]?\s*(\d{1,2})\s*[:：]\s*(\d{1,2})(?:\s*[:：]\s*(\d{1,2}))?)?/u,
    );
    if (cutoff) {
      const endDate = this.validLocalDate(
        Number(cutoff[1]),
        Number(cutoff[2]),
        Number(cutoff[3]),
        Number(cutoff[4] ?? 23),
        Number(cutoff[5] ?? 59),
        Number(cutoff[6] ?? 59),
        cutoff[4] ? 0 : 999,
      );
      if (endDate) {
        const label = cutoff[4]
          ? `截至${this.dateLabel(endDate)} ${this.clockLabel(endDate)}`
          : `截至${this.dateLabel(endDate)}`;
        return {
          label,
          startDate: new Date(0),
          endDate,
          granularity: cutoff[4] ? 'hour' : 'day',
        };
      }
    }

    const chineseRange = text.match(
      /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:至|到|—|~|～)\s*(?:(\d{4})\s*年\s*)?(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*日/u,
    );
    if (chineseRange) {
      const start = this.validLocalDate(Number(chineseRange[1]), Number(chineseRange[2]), Number(chineseRange[3]));
      const end = this.validLocalDate(
        Number(chineseRange[4] ?? chineseRange[1]),
        Number(chineseRange[5] ?? chineseRange[2]),
        Number(chineseRange[6]),
      );
      const range = this.absoluteDayRange(start, end);
      if (range) return range;
    }

    const numericRange = text.match(
      /(\d{4})\s*([/-])\s*(\d{1,2})\s*\2\s*(\d{1,2})\s*(?:至|到|—|~|～)\s*(?:(\d{4})\s*([/-])\s*)?(\d{1,2})\s*(?:[/-])\s*(\d{1,2})/u,
    );
    if (numericRange) {
      const start = this.validLocalDate(Number(numericRange[1]), Number(numericRange[3]), Number(numericRange[4]));
      const end = this.validLocalDate(
        Number(numericRange[5] ?? numericRange[1]),
        Number(numericRange[7]),
        Number(numericRange[8]),
      );
      const range = this.absoluteDayRange(start, end);
      if (range) return range;
    }

    const chineseDay = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);
    if (chineseDay) {
      const date = this.validLocalDate(Number(chineseDay[1]), Number(chineseDay[2]), Number(chineseDay[3]));
      if (date) return this.absoluteSingleDay(date);
    }

    const numericDay = text.match(/(\d{4})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})/u);
    if (numericDay) {
      const date = this.validLocalDate(Number(numericDay[1]), Number(numericDay[2]), Number(numericDay[3]));
      if (date) return this.absoluteSingleDay(date);
    }

    const chineseMonth = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月(?!\s*\d{1,2}\s*日)/u);
    if (chineseMonth) {
      const year = Number(chineseMonth[1]);
      const month = Number(chineseMonth[2]);
      const start = this.validLocalDate(year, month, 1);
      const end = this.validLocalDate(year, month, new Date(year, month, 0).getDate(), 23, 59, 59, 999);
      if (start && end) return this.absoluteMonthRange(year, month, start, end);
    }

    const numericMonth = text.match(/(\d{4})\s*[/-]\s*(\d{1,2})(?!\s*[/-]\s*\d{1,2})/u);
    if (numericMonth) {
      const year = Number(numericMonth[1]);
      const month = Number(numericMonth[2]);
      const start = this.validLocalDate(year, month, 1);
      const end = this.validLocalDate(year, month, new Date(year, month, 0).getDate(), 23, 59, 59, 999);
      if (start && end) return this.absoluteMonthRange(year, month, start, end);
    }
    return undefined;
  }

  private absoluteSingleDay(date: Date): BrainDateRange {
    return {
      label: this.dateLabel(date),
      startDate: this.startOfDay(date),
      endDate: this.endOfDay(date),
      granularity: 'day',
    };
  }

  private absoluteMonthRange(year: number, month: number, start: Date, end: Date): BrainDateRange {
    return {
      label: `${year}年${month}月`,
      startDate: start,
      endDate: end,
      granularity: 'month',
    };
  }

  private absoluteDayRange(start: Date | undefined, end: Date | undefined): BrainDateRange | undefined {
    if (!start || !end || start > end) return undefined;
    return {
      label: `${this.dateLabel(start)}至${this.dateLabel(end)}`,
      startDate: this.startOfDay(start),
      endDate: this.endOfDay(end),
      granularity: 'day',
    };
  }

  private validLocalDate(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0,
  ): Date | undefined {
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day) ||
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      !Number.isInteger(second) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59
    ) {
      return undefined;
    }
    const value = new Date(year, month - 1, day, hour, minute, second, millisecond);
    return value.getFullYear() === year &&
      value.getMonth() === month - 1 &&
      value.getDate() === day &&
      value.getHours() === hour &&
      value.getMinutes() === minute &&
      value.getSeconds() === second
      ? value
      : undefined;
  }

  private dateLabel(date: Date) {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  private clockLabel(date: Date) {
    return [date.getHours(), date.getMinutes(), date.getSeconds()]
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  }

  private currentPeriodToNow(text: string, now: Date): BrainDateRange | undefined {
    if (!/(截至|截止|到|至).*(现在|目前)|截至目前|至今/.test(text)) return undefined;
    const endDate = new Date(now);
    if (text.includes('本月') || text.includes('这个月')) {
      return { ...this.currentMonthRange(now), label: '本月截至现在', endDate };
    }
    if (text.includes('本周') || text.includes('这周')) {
      return { ...this.currentWeekRange(now), label: '本周截至现在', endDate };
    }
    if (text.includes('本季度') || text.includes('这个季度')) {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return {
        label: '本季度截至现在',
        startDate: new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0, 0),
        endDate,
        granularity: 'quarter',
      };
    }
    if (text.includes('今年')) {
      return {
        label: '今年截至现在',
        startDate: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        endDate,
        granularity: 'year',
      };
    }
    return undefined;
  }

  private subtractCalendarMonthsClamped(date: Date, months: number): Date {
    const result = new Date(date);
    const originalDay = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() - months);
    const targetMonthLastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(originalDay, targetMonthLastDay));
    return result;
  }

  private subtractCalendarYearsClamped(date: Date, years: number): Date {
    const result = new Date(date);
    const originalDay = result.getDate();
    result.setDate(1);
    result.setFullYear(result.getFullYear() - years);
    const targetMonthLastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(originalDay, targetMonthLastDay));
    return result;
  }

  private relativeThresholdRange(now: Date, days: number, label: string): BrainDateRange {
    const startDate = this.startOfDay(now);
    startDate.setDate(startDate.getDate() - (days - 1));
    return { label, startDate, endDate: this.endOfDay(now), granularity: 'day' };
  }

  private dayRange(label: string, now: Date, offsetDays: number): BrainDateRange {
    const date = new Date(now);
    date.setDate(date.getDate() + offsetDays);
    return {
      label,
      startDate: this.startOfDay(date),
      endDate: this.endOfDay(date),
      granularity: 'day',
    };
  }

  private currentWeekRange(now: Date): BrainDateRange {
    return {
      label: '本周',
      startDate: this.startOfWeek(now),
      endDate: this.endOfDay(now),
      granularity: 'week',
    };
  }

  private previousWeekRange(now: Date): BrainDateRange {
    const start = this.startOfWeek(now);
    start.setDate(start.getDate() - 7);
    const end = this.endOfDay(start);
    end.setDate(start.getDate() + 6);
    return { label: '上周', startDate: start, endDate: end, granularity: 'week' };
  }

  private currentMonthRange(now: Date): BrainDateRange {
    return {
      label: '本月',
      startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      endDate: this.endOfDay(now),
      granularity: 'month',
    };
  }

  private previousMonthRange(now: Date): BrainDateRange {
    return {
      label: '上月',
      startDate: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
      endDate: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      granularity: 'month',
    };
  }

  private namedMonthRange(now: Date, month: number, notAfter?: Date): BrainDateRange {
    const anchor = notAfter ?? now;
    let year = anchor.getFullYear();
    if (month - 1 > anchor.getMonth()) year -= 1;
    const isCurrentMonth = year === now.getFullYear() && month - 1 === now.getMonth();
    return {
      label: `${month}月`,
      startDate: new Date(year, month - 1, 1, 0, 0, 0, 0),
      endDate: isCurrentMonth ? this.endOfDay(now) : new Date(year, month, 0, 23, 59, 59, 999),
      granularity: 'month',
    };
  }

  private detectUnsupportedTimeExpressions(text: string) {
    const patterns = [
      '前天',
      '后天',
      '凌晨',
      '早上',
      '中午',
      '晚上',
      '最近',
      '近',
      '过去',
      '未来',
      '同期',
      '双十一',
      '双十二',
      '618',
      '六一八',
      '国庆',
      '春节',
      '五一',
      '劳动节',
      '元旦',
      '中秋',
      '端午',
      '七夕',
    ];
    return patterns.filter((pattern) => text.includes(pattern));
  }

  private toFilter(range: BrainDateRange): BrainDateFilter {
    return {
      field: 'date',
      op: 'between',
      value: [range.startDate.toISOString(), range.endDate.toISOString()],
    };
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private endOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  private startOfWeek(date: Date) {
    const start = this.startOfDay(date);
    start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return start;
  }
}

function chineseOrArabicNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return digits[value] ?? Number.NaN;
}
