import { Injectable } from '@nestjs/common';
import type { AgentRole } from '../agent/agent.types.js';
import { DimensionRegistryService } from '../semantic-data/dimension-registry.service.js';
import { SemanticMetricRegistryService } from '../semantic-data/semantic-metric-registry.service.js';
import type { SemanticQueryPlan } from './query-plan.types.js';

export type QuerySafetyDecision = {
  allowed: boolean;
  rejectedReason?: string;
  warnings: string[];
};

const ROLE_LABELS: Record<AgentRole, string> = {
  manager: '店长',
  reception: '前台',
  beautician: '美容师',
};

@Injectable()
export class QuerySafetyGuardService {
  constructor(
    private readonly metricRegistry: SemanticMetricRegistryService,
    private readonly dimensionRegistry: DimensionRegistryService,
  ) {}

  validate(plan: SemanticQueryPlan): QuerySafetyDecision {
    const warnings: string[] = [];
    if (!plan.storeScope.storeIds.length) return this.reject('缺少门店范围，已阻止查询。', warnings);
    if (!plan.metrics.length) return this.reject('缺少查询指标，已阻止查询。', warnings);
    if (plan.limit < 1 || plan.limit > 100) return this.reject('查询返回数量超出系统限制。', warnings);
    if (!this.dimensionRegistry.allKnown(plan.dimensions)) return this.reject('包含暂不支持的查询维度。', warnings);

    if (plan.role === 'beautician' && !this.hasSelfScope(plan)) {
      return this.reject('美容师账号只能查询本人相关数据。', warnings);
    }

    for (const metricRef of plan.metrics) {
      const metric = this.metricRegistry.findByKey(metricRef.key);
      if (!metric) return this.reject(`暂不支持指标「${metricRef.key}」。`, warnings);
      if (metric.sensitive && plan.role !== 'manager' && plan.role !== 'beautician') {
        return this.reject(`当前${ROLE_LABELS[plan.role]}账号不能查看「${metric.name}」。`, warnings);
      }
    }

    if (plan.riskLevel !== 'low') return this.reject('当前查询风险等级过高，需要使用专用工具或审批流程。', warnings);
    return { allowed: true, warnings };
  }

  private hasSelfScope(plan: SemanticQueryPlan) {
    return plan.filters.scope === 'self' || Number(plan.filters.operatorId) > 0 || Number(plan.filters.beauticianId) > 0;
  }

  private reject(rejectedReason: string, warnings: string[]): QuerySafetyDecision {
    return { allowed: false, rejectedReason, warnings };
  }
}
