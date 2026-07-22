import { BrainTimeBoundaryGraderService } from './brain-time-boundary-grader.service.js';

describe('BrainTimeBoundaryGraderService', () => {
  const grader = new BrainTimeBoundaryGraderService();

  it.each([
    ['today', '今天', '2026-07-14T16:00:00.000Z', '2026-07-15T16:00:00.000Z'],
    ['tomorrow', '明天', '2026-07-15T16:00:00.000Z', '2026-07-16T16:00:00.000Z'],
    ['yesterday', '昨天', '2026-07-13T16:00:00.000Z', '2026-07-14T16:00:00.000Z'],
    ['this_week', '本周', '2026-07-12T16:00:00.000Z', '2026-07-15T16:00:00.000Z'],
    ['last_week', '上周', '2026-07-05T16:00:00.000Z', '2026-07-12T16:00:00.000Z'],
    ['this_month', '本月', '2026-06-30T16:00:00.000Z', '2026-07-15T16:00:00.000Z'],
    ['last_month', '上月', '2026-05-31T16:00:00.000Z', '2026-06-30T16:00:00.000Z'],
  ])('accepts exact %s execution boundaries', (preset, label, startDate, endExclusive) => {
    expect(grader.grade({
      question: `${label}实收多少`,
      expected: { preset, label },
      actual: { startDate, endExclusive, boundary: '[start,end)', timezone: 'Asia/Shanghai' },
      now: new Date('2026-07-15T04:00:00.000Z'),
    })).toMatchObject({ passed: true, checked: 1, failures: [] });
  });

  it('fails when execution silently falls back to another date range', () => {
    expect(grader.grade({
      question: '明天实收多少',
      expected: { preset: 'tomorrow', label: '明天' },
      actual: {
        startDate: '2026-06-15T16:00:00.000Z',
        endExclusive: '2026-07-15T16:00:00.000Z',
        boundary: '[start,end)',
        timezone: 'Asia/Shanghai',
      },
      now: new Date('2026-07-15T04:00:00.000Z'),
    })).toMatchObject({ passed: false, failures: ['time_start_mismatch', 'time_end_mismatch'] });
  });
});
