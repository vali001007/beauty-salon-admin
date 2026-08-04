import { resolveAskDataDateRange } from './ask-data-free-sql.date-range.js';

describe('resolveAskDataDateRange', () => {
  const now = new Date('2026-08-01T05:00:00.000Z');

  it.each([
    ['本月项目收入', '本月'],
    ['上个月退款', '上个月'],
    ['最近30天销量', '近 30 天'],
    ['最近三个月员工业绩', '近 3 个月'],
    ['这半年有多少预约', '近 6 个月'],
    ['未来7天预约', '未来 7 天'],
    ['今天营业额', '今天'],
    ['明天每位员工空闲多少分钟', '明天'],
    ['本周末预约', '本周末'],
  ])('resolves %s', (question, label) => {
    expect(resolveAskDataDateRange(question, now)?.label).toBe(label);
  });

  it('uses an exclusive seven-day end for future seven days', () => {
    const result = resolveAskDataDateRange('未来7天预约', now);
    expect(new Date(result!.endAt).getTime() - new Date(result!.startAt).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('resolves colloquial half-year wording to a real six-month range', () => {
    const result = resolveAskDataDateRange('这半年有大量空档时段吗', now)!;
    expect(result.label).toBe('近 6 个月');
    expect(new Date(result.endAt).getTime() - new Date(result.startAt).getTime()).toBeGreaterThan(
      180 * 24 * 60 * 60 * 1000,
    );
  });

  it('keeps both months for month-over-month comparisons', () => {
    const result = resolveAskDataDateRange('比较本月和上月实收', now)!;
    const start = new Date(result.startAt);
    const end = new Date(result.endAt);
    expect(result.label).toBe('上月与本月');
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 6, 1]);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 8, 1]);
  });

  it.each([
    '哪个员工这个月进步最快',
    '有没有成本项目异常增加的情况',
  ])('expands governed implicit comparisons to previous and current month: %s', (question) => {
    const result = resolveAskDataDateRange(question, now)!;
    expect(result.label).toBe('上月与本月');
    expect(new Date(result.endAt).getTime() - new Date(result.startAt).getTime()).toBeGreaterThan(
      60 * 24 * 60 * 60 * 1000,
    );
  });

  it('keeps both weeks for week-over-week comparisons', () => {
    const result = resolveAskDataDateRange('本周和上周营业额差多少', now)!;
    expect(result.label).toBe('上周与本周');
    expect(new Date(result.endAt).getTime() - new Date(result.startAt).getTime()).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('keeps both weeks for colloquial 礼拜 wording', () => {
    const result = resolveAskDataDateRange('把这礼拜和上礼拜的开单净收入放一起，差额也给我', now)!;
    expect(result.label).toBe('上周与本周');
    expect(new Date(result.endAt).getTime() - new Date(result.startAt).getTime()).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('resolves this weekend as Saturday through exclusive Monday', () => {
    const result = resolveAskDataDateRange('本周末临期库存', now)!;
    expect(result.label).toBe('本周末');
    expect(new Date(result.endAt).getTime() - new Date(result.startAt).getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });

  it('keeps both quarters for quarter-over-quarter comparisons', () => {
    const result = resolveAskDataDateRange('这个季度和上个季度的成本结构有什么变化', now)!;
    const start = new Date(result.startAt);
    const end = new Date(result.endAt);
    expect(result.label).toBe('上季度与本季度');
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 3, 1]);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 9, 1]);
  });

  it('resolves the current calendar year', () => {
    const result = resolveAskDataDateRange('今年有哪些营销活动在跑', now)!;
    expect(result.label).toBe('今年');
    expect(new Date(result.endAt).getFullYear() - new Date(result.startAt).getFullYear()).toBe(1);
  });

  it.each([
    '我们每个月大概会损耗多少货值',
    '每个月库存报废金额大概多少',
    '逐月看一下报损货值',
    '每个月通常损耗多少钱',
    '按每个月展示库存损失',
  ])('defaults open-ended monthly wording to the last three complete calendar months: %s', (question) => {
    const result = resolveAskDataDateRange(question, now)!;
    expect(result.label).toBe('近 3 个完整自然月');
    expect(new Date(result.startAt).toISOString()).toBe('2026-04-30T16:00:00.000Z');
    expect(new Date(result.endAt).toISOString()).toBe('2026-07-31T16:00:00.000Z');
  });
});
