import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrainRuntimeConfigService } from '../config/brain-runtime-config.service.js';

export type BrainDataQualityBlockedFact =
  | 'current_in_store'
  | 'staff_live_state'
  | 'service_task_status'
  | 'service_overrun'
  | 'stock_risk'
  | 'procurement_advice';

export interface BrainDataQualityAssessment {
  status: 'trusted' | 'degraded';
  ruleCounts: Record<string, number>;
  blockedFacts: BrainDataQualityBlockedFact[];
  limitations: string[];
  candidateRulesIncluded: boolean;
}

const CAPABILITY_RULES: Record<string, Array<{
  ruleKey: string;
  blockedFacts: BrainDataQualityBlockedFact[];
  limitation: (count: number) => string;
}>> = {
  store_operations_overview: [
    {
      ruleKey: 'reception_in_store_state_stale',
      blockedFacts: ['current_in_store'],
      limitation: (count) => `发现 ${count} 条陈旧到店状态，已隐藏当前在店人数。`,
    },
    {
      ruleKey: 'service_task_state_inconsistent',
      blockedFacts: ['staff_live_state'],
      limitation: (count) => `发现 ${count} 条服务任务状态异常，已隐藏员工实时忙闲状态。`,
    },
  ],
  front_desk_operations_overview: [
    {
      ruleKey: 'reception_in_store_state_stale',
      blockedFacts: ['current_in_store'],
      limitation: (count) => `发现 ${count} 条陈旧到店状态，已停止把历史到店记录解释为当前在店。`,
    },
    {
      ruleKey: 'service_task_state_inconsistent',
      blockedFacts: ['staff_live_state', 'service_overrun'],
      limitation: (count) => `发现 ${count} 条服务任务状态异常，已隐藏员工实时忙闲和服务超时结论。`,
    },
  ],
  beautician_service_overview: [
    {
      ruleKey: 'service_task_state_inconsistent',
      blockedFacts: ['service_task_status'],
      limitation: (count) => `发现 ${count} 条服务任务状态异常，已隐藏依赖任务状态的服务计数。`,
    },
  ],
  inventory_operations_overview: [
    {
      ruleKey: 'inventory_safety_stock_invalid',
      blockedFacts: ['stock_risk', 'procurement_advice'],
      limitation: (count) => `发现 ${count} 个商品安全库存无效，已隐藏缺货统计和采购建议。`,
    },
    {
      ruleKey: 'procurement_evidence_missing',
      blockedFacts: ['procurement_advice'],
      limitation: (count) => `发现 ${count} 条采购建议缺少供应商或报价证据，已隐藏对应采购建议。`,
    },
  ],
  inventory_procurement_advice: [
    {
      ruleKey: 'inventory_safety_stock_invalid',
      blockedFacts: ['procurement_advice'],
      limitation: (count) => `发现 ${count} 个商品安全库存无效，当前不能生成完整采购建议。`,
    },
    {
      ruleKey: 'procurement_evidence_missing',
      blockedFacts: ['procurement_advice'],
      limitation: (count) => `发现 ${count} 条补货项缺少供应商或报价证据，当前不能生成完整采购建议。`,
    },
  ],
};

@Injectable()
export class BrainDataQualityGuardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: BrainRuntimeConfigService,
  ) {}

  async assess(input: { storeId: number; capabilityKey: string }): Promise<BrainDataQualityAssessment> {
    const policies = CAPABILITY_RULES[input.capabilityKey] ?? [];
    const candidateRulesIncluded = this.config.runtime.allowCandidateInspectionGuards;
    if (!policies.length) return this.trusted(candidateRulesIncluded);
    const ruleKeys = policies.map((policy) => policy.ruleKey);
    const eligibleRules = await this.prisma.brainInspectionRule.findMany({
      where: {
        ruleKey: { in: ruleKeys },
        ...(candidateRulesIncluded ? {} : { enabled: true }),
      },
      select: { ruleKey: true },
    });
    const eligibleRuleKeys = [...new Set(eligibleRules.map((rule) => rule.ruleKey))];
    if (!eligibleRuleKeys.length) return this.trusted(candidateRulesIncluded);
    const grouped = await this.prisma.brainInspectionFinding.groupBy({
      by: ['ruleKey'],
      where: { storeId: input.storeId, status: 'open', ruleKey: { in: eligibleRuleKeys } },
      _count: { _all: true },
    });
    const ruleCounts = Object.fromEntries(grouped.map((row) => [row.ruleKey, row._count._all]));
    const active = policies.filter((policy) => (ruleCounts[policy.ruleKey] ?? 0) > 0);
    if (!active.length) return this.trusted(candidateRulesIncluded);
    return {
      status: 'degraded',
      ruleCounts,
      blockedFacts: [...new Set(active.flatMap((policy) => policy.blockedFacts))],
      limitations: active.map((policy) => policy.limitation(ruleCounts[policy.ruleKey])),
      candidateRulesIncluded,
    };
  }

  private trusted(candidateRulesIncluded: boolean): BrainDataQualityAssessment {
    return { status: 'trusted', ruleCounts: {}, blockedFacts: [], limitations: [], candidateRulesIncluded };
  }
}
