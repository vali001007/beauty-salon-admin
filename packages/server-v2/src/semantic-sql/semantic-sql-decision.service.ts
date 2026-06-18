import { Injectable } from '@nestjs/common';
import type { SemanticSqlCandidate, SemanticSqlDecisionInput } from './semantic-sql.types.js';
import type { BusinessTask } from '../agent/business-task/business-task.types.js';

const SQL_ELIGIBLE_TASK_TYPES = new Set(['query', 'ranking']);
const SQL_ELIGIBLE_DOMAINS = new Set([
  'business',
  'product',
  'project',
  'reservation',
  'order',
  'card',
  'memberCard',
  'inventory',
  'supplyChain',
  'finance',
  'marketing',
  'promotion',
  'automation',
  'staff',
  'serviceQuality',
  'customerApp',
  'channel',
  'terminal',
  'store',
  'afterSales',
]);

@Injectable()
export class SemanticSqlDecisionService {
  decide(input: SemanticSqlDecisionInput): SemanticSqlCandidate {
    const task = input.task;
    const rejectedRules = this.collectRejectedRules(task, Boolean(input.p1BetaEnabled));
    const allowed = rejectedRules.length === 0;

    return {
      status: allowed ? 'allowed' : this.isCandidateShape(task) ? 'rejected' : 'not_candidate',
      allowed,
      reason: allowed
        ? '该任务属于低风险只读聚合/排行，P1 Beta 可作为 Semantic SQL 候选。'
        : this.describeRejection(task, rejectedRules),
      metricKeys: task.metrics,
      dimensions: this.inferDimensions(task),
      timeRange: task.timeRange,
      limit: task.limit,
      rejectedRules,
      fallbackCapability: this.fallbackCapability(task),
    };
  }

  private collectRejectedRules(task: BusinessTask, p1BetaEnabled: boolean) {
    const rules: string[] = [];
    if (!p1BetaEnabled) rules.push('semantic_sql_beta_disabled');
    if (!SQL_ELIGIBLE_TASK_TYPES.has(task.taskType)) rules.push(`task_type_${task.taskType}_not_allowed`);
    if (!SQL_ELIGIBLE_DOMAINS.has(task.domain)) rules.push(`domain_${task.domain}_not_allowed`);
    if (!task.metrics.length) rules.push('missing_metric_keys');
    if (task.requiresApproval || task.riskLevel !== 'low') rules.push('risk_or_approval_not_allowed');
    if (task.taskType === 'ranking' && !task.limit) rules.push('ranking_missing_limit');
    return rules;
  }

  private isCandidateShape(task: BusinessTask) {
    return SQL_ELIGIBLE_TASK_TYPES.has(task.taskType) && SQL_ELIGIBLE_DOMAINS.has(task.domain);
  }

  private describeRejection(task: BusinessTask, rules: string[]) {
    if (rules.includes('semantic_sql_beta_disabled')) {
      return 'P0 不开放自由 SQL；仅记录候选决策并回退到标准 Capability / Metric。';
    }
    if (task.taskType === 'recommendation') {
      return '推荐任务需要经营评分和动作建议，SQL 只能作为指标子查询，不能直接替代标准能力。';
    }
    if (task.requiresApproval) return '该任务涉及草稿或工作流，需要 Agent Tool 和审批，不能走 SQL。';
    return `Semantic SQL 准入失败：${rules.join(', ')}`;
  }

  private inferDimensions(task: BusinessTask) {
    if (task.domain === 'product') return ['productId', 'productName'];
    if (task.domain === 'project') return ['projectId', 'projectName'];
    if (task.domain === 'reservation') return ['reservationDate'];
    if (task.domain === 'inventory') return ['productId', 'productName'];
    if (task.domain === 'supplyChain') return ['supplierId', 'supplierName', 'productId', 'productName'];
    if (task.domain === 'card') return ['cardName'];
    if (task.domain === 'memberCard') return ['customerId', 'customerName'];
    if (task.domain === 'finance') return ['date'];
    if (task.domain === 'marketing' || task.domain === 'promotion' || task.domain === 'automation') return ['campaignId', 'campaignName', 'date'];
    if (task.domain === 'staff') return ['staffId', 'staffName'];
    if (task.domain === 'customerApp' || task.domain === 'channel') return ['channel', 'date'];
    if (task.domain === 'terminal') return ['deviceId', 'date'];
    if (task.domain === 'afterSales') return ['orderId', 'date'];
    if (task.domain === 'store') return ['storeId'];
    return ['date'];
  }

  private fallbackCapability(task: BusinessTask) {
    if (task.domain === 'customer' && task.metrics.includes('follow_up_priority_score')) {
      return 'customer_priority_recommendation';
    }
    if (task.domain === 'product' && task.metrics.includes('product_sales_growth')) return 'product_sales_ranking';
    if (task.domain === 'project' && (task.metrics.includes('project_service_growth') || task.metrics.includes('gross_margin'))) return 'project_business_diagnosis';
    if (task.metrics.includes('card_expiry_risk') || task.metrics.includes('card_usage_times') || task.metrics.includes('member_balance')) return 'card_member_business_diagnosis';
    if (task.domain === 'finance' && (task.metrics.includes('gross_margin') || task.metrics.includes('material_cost') || task.metrics.includes('commission_cost'))) {
      return 'finance_margin_diagnosis';
    }
    if (task.metrics.includes('revenue')) return 'revenue_diagnosis';
    if (task.metrics.includes('stock_risk_score')) return 'inventory_risk_ranking';
    if (task.metrics.includes('schedule_utilization_rate') || task.metrics.includes('reservation_arrival_rate')) return 'reservation_schedule_diagnosis';
    if (task.domain === 'staff' && task.metrics.includes('staff_performance_score')) return 'staff_performance_ranking';
    if (task.domain === 'supplyChain') return 'supplier_performance_diagnosis';
    if (task.domain === 'marketing') return 'marketing_conversion_diagnosis';
    if (task.domain === 'promotion') return 'promotion_effect_analysis';
    if (task.domain === 'automation') return 'automation_execution_diagnosis';
    if (task.domain === 'customerApp' || task.domain === 'channel') return 'customer_app_funnel_analysis';
    if (task.domain === 'terminal') return 'terminal_health_diagnosis';
    if (task.domain === 'afterSales') return 'refund_risk_diagnosis';
    return undefined;
  }
}
