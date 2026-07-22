import { BrainTimeRangeParserService } from '../cognition/brain-time-range-parser.service.js';

export interface BrainTimeBoundaryGrade {
  layer: 'time_boundary';
  passed: boolean;
  score: number;
  checked: number;
  failures: string[];
  deterministicFailure: boolean;
  expected?: { label: string; startDate: string; endExclusive: string; boundary: '[start,end)' };
  actual?: { startDate?: string; endExclusive?: string; boundary?: string; timezone?: string };
}

export class BrainTimeBoundaryGraderService {
  private readonly parser = new BrainTimeRangeParserService();

  grade(input: {
    question: string;
    expected: unknown;
    actual: unknown;
    now: Date;
  }): BrainTimeBoundaryGrade {
    const expectedContract = record(input.expected);
    if (!Object.keys(expectedContract).length) return passedWithoutCheck();
    const label = string(expectedContract.label);
    const preset = string(expectedContract.preset);
    const parsed = this.parser.parse(input.question, { now: input.now });
    if (!label || !preset || !parsed.range) {
      return failed(['time_boundary_expectation_invalid']);
    }
    const expected = {
      label,
      startDate: parsed.range.startDate.toISOString(),
      endExclusive: new Date(parsed.range.endDate.getTime() + 1).toISOString(),
      boundary: '[start,end)' as const,
    };
    const actual = record(input.actual);
    const failures = [
      ...(parsed.range.label !== label ? [`time_label_mismatch:${parsed.range.label}:${label}`] : []),
      ...(actual.startDate !== expected.startDate ? ['time_start_mismatch'] : []),
      ...(actual.endExclusive !== expected.endExclusive ? ['time_end_mismatch'] : []),
      ...(actual.boundary !== expected.boundary ? ['time_boundary_mode_mismatch'] : []),
      ...(actual.timezone !== 'Asia/Shanghai' ? ['time_timezone_mismatch'] : []),
    ];
    return {
      layer: 'time_boundary',
      passed: failures.length === 0,
      score: failures.length ? 0 : 1,
      checked: 1,
      failures,
      deterministicFailure: failures.length > 0,
      expected,
      actual: {
        startDate: string(actual.startDate),
        endExclusive: string(actual.endExclusive),
        boundary: string(actual.boundary),
        timezone: string(actual.timezone),
      },
    };
  }
}

function passedWithoutCheck(): BrainTimeBoundaryGrade {
  return { layer: 'time_boundary', passed: true, score: 1, checked: 0, failures: [], deterministicFailure: false };
}

function failed(failures: string[]): BrainTimeBoundaryGrade {
  return { layer: 'time_boundary', passed: false, score: 0, checked: 1, failures, deterministicFailure: true };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function string(value: unknown) {
  return typeof value === 'string' ? value : '';
}
