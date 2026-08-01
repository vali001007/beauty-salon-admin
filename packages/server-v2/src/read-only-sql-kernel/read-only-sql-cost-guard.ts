import { Injectable } from '@nestjs/common';
import type { ReadOnlySqlGuardResult } from './read-only-sql-kernel.types.js';

export type ReadOnlySqlCostResult =
  | { status: 'pass'; estimatedCost: number; appliedPolicies: string[] }
  | { status: 'blocked'; estimatedCost: number; reasonCode: string; message: string; appliedPolicies: string[] };

@Injectable()
export class ReadOnlySqlCostGuard {
  inspect(guard: ReadOnlySqlGuardResult, maxEstimatedCost: number): ReadOnlySqlCostResult {
    if (guard.status !== 'pass') {
      return {
        status: 'blocked',
        estimatedCost: 0,
        reasonCode: guard.reasonCode,
        message: guard.message,
        appliedPolicies: [],
      };
    }

    const parsed = guard.parsed;
    let estimatedCost = 10;
    estimatedCost += Math.max(0, parsed.sourceViews.length - 1) * 25;
    estimatedCost += parsed.hasJoin ? 20 : 0;
    estimatedCost += parsed.hasGroupBy ? 15 : 0;
    estimatedCost += parsed.hasOrderBy ? 10 : 0;
    estimatedCost += parsed.cteNames.length * 15;
    estimatedCost += Math.min(parsed.limit ?? 100, 100) / 10;

    if (estimatedCost > maxEstimatedCost) {
      return {
        status: 'blocked',
        estimatedCost,
        reasonCode: 'estimated_cost_exceeded',
        message: '查询组合过于复杂，请缩小时间范围、减少关联或降低返回数量。',
        appliedPolicies: ['static_cost_estimate'],
      };
    }
    return { status: 'pass', estimatedCost, appliedPolicies: ['static_cost_estimate'] };
  }
}
