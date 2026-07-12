import { BrainTimeRangeParserService } from './brain-time-range-parser.service.js';

describe('BrainTimeRangeParserService', () => {
  const parser = new BrainTimeRangeParserService();
  const now = new Date(2026, 6, 10, 10, 30, 0, 0);

  const range = (message: string) => parser.parse(message, { now }).range;

  it('parses today without falling back to all history', () => {
    expect(range('今天预约多少')).toMatchObject({
      label: '今天',
      startDate: new Date(2026, 6, 10, 0, 0, 0, 0),
      endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
    });
  });

  it('parses tomorrow as a future day range', () => {
    expect(range('明天预约多少')).toMatchObject({
      label: '明天',
      startDate: new Date(2026, 6, 11, 0, 0, 0, 0),
      endDate: new Date(2026, 6, 11, 23, 59, 59, 999),
    });
  });

  it('parses yesterday as a previous day range', () => {
    expect(range('昨天预约多少')).toMatchObject({
      label: '昨天',
      startDate: new Date(2026, 6, 9, 0, 0, 0, 0),
      endDate: new Date(2026, 6, 9, 23, 59, 59, 999),
    });
  });

  it('parses afternoon into today afternoon range', () => {
    expect(range('下午还有几个预约')).toMatchObject({
      label: '今天下午',
      startDate: new Date(2026, 6, 10, 12, 0, 0, 0),
      endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
    });
  });

  it('parses now into current time through end of today', () => {
    expect(range('现在还有几个预约')).toMatchObject({
      label: '现在到今天结束',
      startDate: now,
      endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
    });
  });

  it('marks year-over-year same period as comparison instead of scalar all-history', () => {
    const result = parser.parse('去年同期收入多少', { now });

    expect(result.mentionedTime).toBe(true);
    expect(result.requiresComparison).toBe(true);
    expect(result.filters).toEqual([]);
    expect(result.range?.label).toBe('去年同期');
  });

  it('builds month-over-month comparison periods', () => {
    const result = parser.parse('这个月跟上个月比收入差多少', { now });

    expect(result.requiresComparison).toBe(true);
    expect(result.comparison).toMatchObject({
      label: '本月对比上月',
      current: {
        label: '本月',
        startDate: new Date(2026, 6, 1, 0, 0, 0, 0),
        endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
      },
      previous: {
        label: '上月',
        startDate: new Date(2026, 5, 1, 0, 0, 0, 0),
        endDate: new Date(2026, 5, 30, 23, 59, 59, 999),
      },
    });
  });

  it('does not invent filters when no time expression is present', () => {
    const result = parser.parse('预约多少', { now });

    expect(result.mentionedTime).toBe(false);
    expect(result.filters).toEqual([]);
    expect(result.range).toBeUndefined();
  });

  it('parses recent business status as the latest 30 calendar days', () => {
    expect(range('最近情况怎么样')).toMatchObject({
      label: '最近30天',
      startDate: new Date(2026, 5, 11, 0, 0, 0, 0),
      endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
      granularity: 'day',
    });
  });
});
