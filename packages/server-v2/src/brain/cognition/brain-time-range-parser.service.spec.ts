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

  it('parses an explicit recent-day count instead of silently using 30 days', () => {
    expect(range('查看最近7天的实收金额')).toMatchObject({
      label: '最近7天',
      startDate: new Date(2026, 6, 4, 0, 0, 0, 0),
      endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
      granularity: 'day',
    });
  });

  it.each(['过去7天实收金额', '近7天实收金额'])('normalizes a recent-day paraphrase: %s', (question) => {
    expect(range(question)).toMatchObject({
      label: '最近7天',
      startDate: new Date(2026, 6, 4, 0, 0, 0, 0),
      endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
    });
  });

  it.each([
    ['帮我找一下45天没来的客户', '45天未活跃阈值', new Date(2026, 4, 27, 0, 0, 0, 0)],
    ['帮我找一下三个月没来消费的客户', '3个月未活跃阈值', new Date(2026, 3, 12, 0, 0, 0, 0)],
  ])('parses an explicit inactivity threshold: %s', (question, label, startDate) => {
    expect(range(question)).toMatchObject({
      label,
      startDate,
      endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
      granularity: 'day',
    });
  });

  it('uses the previous 30 complete calendar days as the governed usual baseline', () => {
    const result = parser.parse('今天客单价多少，跟平时比怎么样', { now: new Date(2026, 6, 10, 12, 0, 0) });

    expect(result.comparison).toMatchObject({
      current: {
        label: '今天',
        startDate: new Date(2026, 6, 10, 0, 0, 0, 0),
        endDate: new Date(2026, 6, 10, 23, 59, 59, 999),
      },
      previous: {
        label: '最近30个完整自然日',
        startDate: new Date(2026, 5, 10, 0, 0, 0, 0),
        endDate: new Date(2026, 6, 9, 23, 59, 59, 999),
      },
    });
  });
});
