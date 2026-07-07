import { resolveAgentV2DateRange, resolveAgentV2QueryDateRange } from './agent-v2-date-range.js';

describe('Agent V2 date range parsing', () => {
  const now = new Date(2026, 6, 6, 12, 0, 0);

  it('parses previous month from Chinese questions before tool defaults', () => {
    const range = resolveAgentV2QueryDateRange({ question: '上个月营业额' }, 'today', { now });

    expect(range).toMatchObject({
      label: '上月',
      preset: 'last_month',
      start: new Date(2026, 5, 1),
      end: new Date(2026, 6, 1),
    });
  });

  it('parses common week, year and explicit month expressions', () => {
    expect(resolveAgentV2QueryDateRange({ question: '上周营业额' }, 'today', { now })).toMatchObject({
      label: '上周',
      preset: 'last_week',
      start: new Date(2026, 5, 29),
      end: new Date(2026, 6, 6),
    });
    expect(resolveAgentV2QueryDateRange({ question: '今年营业额' }, 'today', { now })).toMatchObject({
      label: '今年',
      preset: 'this_year',
      start: new Date(2026, 0, 1),
      end: now,
    });
    expect(resolveAgentV2QueryDateRange({ question: '6月份营业额' }, 'today', { now })).toMatchObject({
      label: '2026年6月',
      preset: 'month_2026_06',
      start: new Date(2026, 5, 1),
      end: new Date(2026, 6, 1),
    });
  });

  it('keeps explicit parameters ahead of natural language', () => {
    const range = resolveAgentV2QueryDateRange({
      question: '上个月营业额',
      timeRange: { preset: 'today' },
    }, 'this_month', { now });

    expect(range).toMatchObject({ label: '今天', preset: 'today' });
  });

  it('supports preset resolution directly for shared tool code', () => {
    expect(resolveAgentV2DateRange('last_month', { now })).toMatchObject({
      label: '上月',
      preset: 'last_month',
    });
  });
});
