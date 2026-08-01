import { resolveAskDataDateRange } from './ask-data-free-sql.date-range.js';

describe('resolveAskDataDateRange', () => {
  const now = new Date('2026-08-01T05:00:00.000Z');

  it.each([
    ['本月项目收入', '本月'],
    ['上个月退款', '上个月'],
    ['最近30天销量', '近 30 天'],
    ['最近三个月员工业绩', '近 3 个月'],
    ['未来7天预约', '未来 7 天'],
    ['今天营业额', '今天'],
  ])('resolves %s', (question, label) => {
    expect(resolveAskDataDateRange(question, now)?.label).toBe(label);
  });

  it('uses an exclusive seven-day end for future seven days', () => {
    const result = resolveAskDataDateRange('未来7天预约', now);
    expect(new Date(result!.endAt).getTime() - new Date(result!.startAt).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
