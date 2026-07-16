import {
  readCapabilityStructuredComparisonTarget,
  structuredTimeUtcRange,
} from './brain-capability-structured-args.js';

describe('brain capability structured comparison args', () => {
  it('accepts a governed time comparison target and converts explicit dates', () => {
    const target = readCapabilityStructuredComparisonTarget({
      comparisonTarget: {
        type: 'time',
        timeRange: {
          label: '昨天',
          timezone: 'Asia/Shanghai',
          startDate: '2026-07-15',
          endDate: '2026-07-15',
        },
      },
    }, 'Asia/Shanghai');

    expect(target).toMatchObject({ type: 'time', timeRange: { label: '昨天' } });
    expect(structuredTimeUtcRange(target!.timeRange)).toEqual({
      label: '昨天',
      startDate: new Date('2026-07-14T16:00:00.000Z'),
      endExclusive: new Date('2026-07-15T16:00:00.000Z'),
    });
  });

  it('fails closed for entity comparisons and timezone drift', () => {
    expect(() => readCapabilityStructuredComparisonTarget({
      comparisonTarget: { type: 'entity', entityKeys: ['a', 'b'] },
    }, 'Asia/Shanghai')).toThrow('capability_comparison_target_invalid');

    expect(() => readCapabilityStructuredComparisonTarget({
      comparisonTarget: {
        type: 'time',
        timeRange: { label: '昨天', timezone: 'UTC', preset: 'yesterday' },
      },
    }, 'Asia/Shanghai')).toThrow('capability_time_timezone_mismatch');
  });
});
