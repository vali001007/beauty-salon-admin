import { formatBusinessDate, formatBusinessDateTime, toBusinessDateOnly } from './business-time.js';

describe('business-time', () => {
  it('formats dates in Asia/Shanghai business timezone', () => {
    const shanghaiEarlyMorning = new Date('2026-06-19T17:51:29.000Z');

    expect(formatBusinessDate(shanghaiEarlyMorning)).toBe('2026-06-20');
    expect(formatBusinessDateTime(shanghaiEarlyMorning, { seconds: true })).toBe('2026-06-20 01:51:29');
  });

  it('keeps Shanghai midnight as 00:00 instead of 24:00', () => {
    const shanghaiMidnight = new Date('2026-06-19T16:00:00.000Z');

    expect(formatBusinessDate(shanghaiMidnight)).toBe('2026-06-20');
    expect(formatBusinessDateTime(shanghaiMidnight, { seconds: true })).toBe('2026-06-20 00:00:00');
  });

  it('normalizes date-only values to the business date boundary', () => {
    expect(toBusinessDateOnly('2026-06-20').toISOString()).toBe('2026-06-20T00:00:00.000Z');
  });
});
