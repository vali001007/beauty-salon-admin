import { BusinessTaskPreParserService } from '../agent/business-task/business-task-preparser.service.js';
import { SemanticSqlDecisionService } from './semantic-sql-decision.service.js';

describe('SemanticSqlDecisionService', () => {
  const preParser = new BusinessTaskPreParserService();
  const service = new SemanticSqlDecisionService();

  it('rejects SQL execution by default in P0 while recording fallback capability', () => {
    const { task } = preParser.parse('近30天销量增长最快的10个商品');
    const decision = service.decide({ task, role: 'manager' });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('rejected');
    expect(decision.rejectedRules).toContain('semantic_sql_beta_disabled');
    expect(decision.fallbackCapability).toBe('product_sales_ranking');
  });

  it('allows low-risk ranking when P1 beta is enabled', () => {
    const { task } = preParser.parse('近30天销量增长最快的10个商品');
    const decision = service.decide({ task, role: 'manager', p1BetaEnabled: true });

    expect(decision.allowed).toBe(true);
    expect(decision.metricKeys).toContain('product_sales_growth');
    expect(decision.dimensions).toEqual(['productId', 'productName']);
    expect(decision.limit).toBe(10);
  });

  it('records revenue diagnosis as the standard fallback for revenue metrics', () => {
    const { task } = preParser.parse('今天收入怎么样');
    const decision = service.decide({ task, role: 'manager' });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackCapability).toBe('revenue_diagnosis');
    expect(decision.metricKeys).toContain('revenue');
  });

  it('records inventory risk ranking as the standard fallback for stock metrics', () => {
    const { task } = preParser.parse('哪些商品库存不足');
    const decision = service.decide({ task, role: 'manager' });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackCapability).toBe('inventory_risk_ranking');
    expect(decision.metricKeys).toContain('stock_risk_score');
  });

  it('records reservation schedule diagnosis as the standard fallback for scheduling metrics', () => {
    const { task } = preParser.parse('今天哪些美容师空闲');
    const decision = service.decide({ task, role: 'manager' });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackCapability).toBe('reservation_schedule_diagnosis');
    expect(decision.metricKeys).toContain('schedule_utilization_rate');
  });

  it('records project business diagnosis as the standard fallback for project metrics', () => {
    const { task } = preParser.parse('项目耗材毛利怎么样');
    const decision = service.decide({ task, role: 'manager' });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackCapability).toBe('project_business_diagnosis');
    expect(decision.metricKeys).toContain('gross_margin');
  });

  it('records card member diagnosis as the standard fallback for card metrics', () => {
    const { task } = preParser.parse('会员卡余额怎么样');
    const decision = service.decide({ task, role: 'manager' });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackCapability).toBe('card_member_business_diagnosis');
    expect(decision.metricKeys).toContain('member_balance');
    expect(decision.dimensions).toEqual(['customerId', 'customerName']);
  });

  it('records finance margin diagnosis as the standard fallback for margin metrics', () => {
    const { task } = preParser.parse('近30天毛利怎么样');
    const decision = service.decide({ task, role: 'manager' });

    expect(decision.allowed).toBe(false);
    expect(decision.fallbackCapability).toBe('finance_margin_diagnosis');
    expect(decision.metricKeys).toContain('gross_margin');
    expect(decision.dimensions).toEqual(['date']);
  });

  it('does not allow recommendation tasks to bypass capabilities', () => {
    const { task } = preParser.parse('今天最值得跟进的10个客户');
    const decision = service.decide({ task, role: 'manager', p1BetaEnabled: true });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('not_candidate');
    expect(decision.fallbackCapability).toBe('customer_priority_recommendation');
    expect(decision.reason).toContain('推荐任务');
  });

  it('rejects draft or workflow tasks even when beta is enabled', () => {
    const { task } = preParser.parse('下发这些客户的跟进任务');
    const decision = service.decide({ task, role: 'manager', p1BetaEnabled: true });

    expect(decision.allowed).toBe(false);
    expect(decision.rejectedRules).toContain('task_type_workflow_not_allowed');
    expect(decision.rejectedRules).toContain('risk_or_approval_not_allowed');
  });
});
