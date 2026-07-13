import { Injectable } from '@nestjs/common';

@Injectable()
export class BrainAnalysisSkillsService {
  compareCurrentAndPrevious(current: number, previous: number) {
    const delta = current - previous;
    const rate = previous === 0 ? null : delta / previous;
    return { current, previous, delta, rate };
  }

  trend(values: number[]) {
    if (values.length < 2) return { direction: 'flat', slope: 0 };
    const slope = values[values.length - 1] - values[0];
    return { direction: slope > 0 ? 'up' : slope < 0 ? 'down' : 'flat', slope };
  }
}
