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
    const comparisonRange = this.parseComparison(text, now);
    if (comparisonRange) {
      return {
        mentionedTime: true,
        filters: [],
        range: comparisonRange.range,
        comparison: comparisonRange.comparison,
        requiresComparison: true,
        unsupportedExpressions: comparisonRange.comparison ? [] : [comparisonRange.range.label],
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
  ): { range: BrainDateRange; comparison?: BrainComparisonRange } | undefined {
    if ((text.includes('本月') || text.includes('这个月')) && (text.includes('上月') || text.includes('上个月'))) {
      const current = this.currentMonthRange(now);
      const previous = this.previousMonthRange(now);
      return {
        range: { ...current, label: '本月对比上月' },
        comparison: { label: '本月对比上月', current, previous },
      };
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
    if (text.includes('去年同期')) {
      const start = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      const end = new Date(
        now.getFullYear() - 1,
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
      return { range: { label: '去年同期', startDate: start, endDate: end, granularity: 'year' } };
    }
    if (/(同比|环比|跟.*比|和.*比|相比|对比|差多少)/.test(text)) {
      return { range: { label: '对比时间', startDate: now, endDate: now, granularity: 'day' } };
    }
    return undefined;
  }

  private parseScalarRange(text: string, now: Date): BrainDateRange | undefined {
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

  private detectUnsupportedTimeExpressions(text: string) {
    const patterns = ['前天', '后天', '凌晨', '早上', '中午', '晚上', '最近', '近', '过去', '未来', '同期'];
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
