import { Injectable } from '@nestjs/common';

@Injectable()
export class BrainEvalService {
  constructor(private readonly prisma: unknown) {}

  summarizeResults(results: Array<{ caseKey: string; passed: boolean }>) {
    const failed = results.filter((result) => !result.passed).length;
    return {
      total: results.length,
      passed: results.length - failed,
      failed,
      canRelease: failed === 0,
    };
  }
}
