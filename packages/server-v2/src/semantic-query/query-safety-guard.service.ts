import { Inject, Injectable } from '@nestjs/common';
import type { AgentRole } from '../agent/agent.types.js';
import { DimensionRegistryService } from '../semantic-data/dimension-registry.service.js';
import {
  BUSINESS_METRIC_CATALOG,
  type BusinessMetricCatalogReader,
} from '../semantic-data/business-metric-catalog.types.js';
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
    @Inject(BUSINESS_METRIC_CATALOG)
    private readonly metricCatalog: BusinessMetricCatalogReader,
    private readonly dimensionRegistry: DimensionRegistryService,
  ) {}

  validate(plan: SemanticQueryPlan): QuerySafetyDecision {
    const warnings: string[] = [];
    if (!plan.storeScope.storeIds.length || plan.storeScope.storeIds.some((storeId) => !Number.isFinite(storeId) || storeId <= 0)) {
      return this.reject('缺少门店范围，已阻止查询。', warnings);
    }
    if (!plan.metrics.length) return this.reject('缺少查询指标，已阻止查询。', warnings);
    if (plan.limit < 1 || plan.limit > 100) return this.reject('查询返回数量超出系统限制。', warnings);
    if (!this.dimensionRegistry.allKnown(plan.dimensions)) return this.reject('包含暂不支持的查询维度。', warnings);

    if (plan.actor.role !== plan.role || plan.actor.storeId !== plan.storeScope.storeIds[0]) {
      return this.reject('查询身份上下文与门店范围不一致。', warnings);
    }

    if (plan.actor.role === 'beautician' && !this.hasSelfScope(plan)) {
      return this.reject('美容师账号只能查询本人相关数据。', warnings);
    }

    for (const metricRef of plan.metrics) {
      const metric = this.metricCatalog.findByKey(metricRef.key);
      if (!metric) return this.reject(`暂不支持指标「${metricRef.key}」。`, warnings);
      const missingPermission = metric.permissions.find(
        (permission) => !plan.actor.permissions.includes('*') && !plan.actor.permissions.includes(permission),
      );
      if (missingPermission) return this.reject(`缺少指标权限「${missingPermission}」。`, warnings);
      if (metric.sensitive && plan.actor.role !== 'manager' && plan.actor.role !== 'beautician') {
        return this.reject(`当前${ROLE_LABELS[plan.actor.role]}账号不能查看「${metric.name}」。`, warnings);
      }
    }

    if (plan.riskLevel !== 'low') return this.reject('当前查询风险等级过高，需要使用专用工具或审批流程。', warnings);
    return { allowed: true, warnings };
  }

  private hasSelfScope(plan: SemanticQueryPlan) {
    const beauticianId = plan.actor.beauticianId;
    return (
      Number.isInteger(beauticianId) &&
      Number(beauticianId) > 0 &&
      plan.selfScope?.dimensionKey === 'beauticianId' &&
      plan.selfScope.value === beauticianId &&
      plan.filters.scope === 'self' &&
      Number(plan.filters.beauticianId) === beauticianId &&
      plan.dimensions.includes('beauticianId') &&
      plan.metrics.every((metric) => metric.runtimeBinding.runtimeQuery.dimensions.includes('beauticianId'))
    );
  }

  private reject(rejectedReason: string, warnings: string[]): QuerySafetyDecision {
    return { allowed: false, rejectedReason, warnings };
  }
}
