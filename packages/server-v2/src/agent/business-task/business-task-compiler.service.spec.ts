import { CapabilityRegistryService } from '../capabilities/capability-registry.service.js';
import { SemanticMetricRegistryService } from '../../semantic-data/semantic-metric-registry.service.js';
import { SemanticSqlDecisionService } from '../../semantic-sql/semantic-sql-decision.service.js';
import { BusinessTaskCompilerService } from './business-task-compiler.service.js';
import { BusinessTaskLlmCompilerService } from './business-task-llm-compiler.service.js';
import { BusinessTaskPreParserService } from './business-task-preparser.service.js';

describe('BusinessTaskCompilerService', () => {
  const service = new BusinessTaskCompilerService(
    new BusinessTaskPreParserService(),
    new CapabilityRegistryService(),
    new SemanticMetricRegistryService(),
    new SemanticSqlDecisionService(),
  );
  const serviceWithLlmDraft = new BusinessTaskCompilerService(
    new BusinessTaskPreParserService(),
    new CapabilityRegistryService(),
    new SemanticMetricRegistryService(),
    new SemanticSqlDecisionService(),
    new BusinessTaskLlmCompilerService({ get: jest.fn((_key: string, fallback: unknown) => fallback) } as any),
  );

  it('compiles customer priority questions into a capability plan', async () => {
    const result = await service.compile({ message: '今天最值得跟进的10个客户', role: 'manager' });

    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'customer',
      taskType: 'recommendation',
      limit: 10,
      metrics: ['follow_up_priority_score'],
    });
    expect(result.metricMatches[0]).toMatchObject({ key: 'follow_up_priority_score' });
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'customer_priority_recommendation',
      toolPlan: [{ tool: 'customer.priority.rank', args: expect.objectContaining({ limit: 10 }) }],
    });
    expect(result.semanticSqlCandidate).toMatchObject({
      allowed: false,
      fallbackCapability: 'customer_priority_recommendation',
    });
  });

  it('compiles revenue questions into a dedicated revenue diagnosis capability', async () => {
    const result = await service.compile({ message: '为什么今天收入下降', role: 'manager' });

    expect(result.validation.valid).toBe(true);
    expect(result.task.taskType).toBe('diagnosis');
    expect(result.metricMatches[0]).toMatchObject({ key: 'revenue' });
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'revenue_diagnosis',
      toolPlan: [{ tool: 'revenue.diagnose', args: expect.objectContaining({ question: '为什么今天收入下降' }) }],
    });
  });

  it('compiles product sales growth questions into a dedicated product sales ranking capability', async () => {
    const result = await service.compile({ message: '近30天销量增长最快的10个商品', role: 'manager' });

    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'product',
      taskType: 'ranking',
      limit: 10,
      metrics: ['product_sales_growth'],
    });
    expect(result.metricMatches[0]).toMatchObject({ key: 'product_sales_growth' });
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'product_sales_ranking',
      toolPlan: [{ tool: 'product.sales.rank', args: expect.objectContaining({ question: '近30天销量增长最快的10个商品', limit: 10 }) }],
    });
    expect(result.semanticSqlCandidate).toMatchObject({
      allowed: false,
      fallbackCapability: 'product_sales_ranking',
    });
  });

  it('compiles inventory risk questions into a dedicated inventory risk capability', async () => {
    const result = await service.compile({ message: '哪些商品库存不足', role: 'manager' });

    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'inventory',
      taskType: 'query',
      metrics: ['stock_risk_score'],
    });
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'inventory_risk_ranking',
      toolPlan: [{ tool: 'inventory.risk.rank', args: expect.objectContaining({ question: '哪些商品库存不足' }) }],
    });
    expect(result.semanticSqlCandidate).toMatchObject({
      allowed: false,
      fallbackCapability: 'inventory_risk_ranking',
    });
  });

  it('compiles scheduling questions into reservation schedule diagnosis capability', async () => {
    const result = await service.compile({ message: '今天哪些美容师空闲', role: 'manager' });

    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'schedule',
      taskType: 'query',
    });
    expect(result.task.metrics).toEqual(expect.arrayContaining(['schedule_utilization_rate']));
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'reservation_schedule_diagnosis',
      toolPlan: [{ tool: 'schedule.diagnose', args: expect.objectContaining({ question: '今天哪些美容师空闲' }) }],
    });
    expect(result.semanticSqlCandidate).toMatchObject({
      allowed: false,
      fallbackCapability: 'reservation_schedule_diagnosis',
    });
  });

  it('compiles staff performance questions into a dedicated staff capability', async () => {
    const result = await service.compile({ message: '近期表现较好的员工', role: 'manager' });

    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'staff',
      taskType: 'ranking',
      metrics: ['staff_performance_score'],
    });
    expect(result.metricMatches[0]).toMatchObject({ key: 'staff_performance_score' });
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'staff_performance_ranking',
      toolPlan: [{ tool: 'staff.performance.rank', args: expect.objectContaining({ question: '近期表现较好的员工' }) }],
    });
  });

  it('compiles beautician self performance questions into the same scoped staff capability', async () => {
    const result = await service.compile({ message: '我的表现怎么样', role: 'beautician' });

    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'staff',
      taskType: 'query',
      metrics: ['staff_performance_score'],
    });
    expect(result.metricMatches[0]).toMatchObject({ key: 'staff_performance_score' });
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'staff_performance_ranking',
      toolPlan: [{ tool: 'staff.performance.rank', args: expect.objectContaining({ question: '我的表现怎么样' }) }],
    });
  });

  it('compiles newly covered domains into dedicated capabilities', async () => {
    const supplier = await service.compile({ message: '哪个供应商供货慢', role: 'manager' });
    const automation = await service.compile({ message: '自动化触达效果怎么样', role: 'manager' });
    const app = await service.compile({ message: '小程序最近带来多少客户', role: 'manager' });
    const refund = await service.compile({ message: '哪些退款异常', role: 'manager' });
    const terminal = await service.compile({ message: '终端最近失败最多的问题', role: 'manager' });

    expect(supplier.task.domain).toBe('supplyChain');
    expect(supplier.capabilityMatches[0]).toMatchObject({
      capabilityId: 'supplier_performance_diagnosis',
      toolPlan: [{ tool: 'supply_chain.diagnose', args: expect.any(Object) }],
    });
    expect(automation.task.domain).toBe('automation');
    expect(automation.capabilityMatches[0]).toMatchObject({
      capabilityId: 'automation_execution_diagnosis',
      toolPlan: [{ tool: 'automation.execution.diagnose', args: expect.any(Object) }],
    });
    expect(app.task.domain).toBe('customerApp');
    expect(app.capabilityMatches[0]).toMatchObject({
      capabilityId: 'customer_app_funnel_analysis',
      toolPlan: [{ tool: 'customer_app.funnel.analyze', args: expect.any(Object) }],
    });
    expect(refund.task.domain).toBe('afterSales');
    expect(refund.capabilityMatches[0]).toMatchObject({
      capabilityId: 'refund_risk_diagnosis',
      toolPlan: [{ tool: 'order.refund.diagnose', args: expect.any(Object) }],
    });
    expect(terminal.task.domain).toBe('terminal');
    expect(terminal.capabilityMatches[0]).toMatchObject({
      capabilityId: 'terminal_health_diagnosis',
      toolPlan: [{ tool: 'terminal.health.diagnose', args: expect.any(Object) }],
    });
  });

  it('compiles project questions into project business diagnosis capability', async () => {
    const result = await service.compile({ message: '项目耗材毛利怎么样', role: 'manager' });

    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'project',
      taskType: 'query',
    });
    expect(result.task.metrics).toEqual(expect.arrayContaining(['project_service_growth', 'gross_margin']));
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'project_business_diagnosis',
      toolPlan: [{ tool: 'project.diagnose', args: expect.objectContaining({ question: '项目耗材毛利怎么样' }) }],
    });
    expect(result.semanticSqlCandidate).toMatchObject({
      allowed: false,
      fallbackCapability: 'project_business_diagnosis',
    });
  });

  it('compiles card and member balance questions into card member diagnosis capability', async () => {
    const cardRisk = await service.compile({ message: '未来30天哪些次卡快到期', role: 'manager' });
    const memberBalance = await service.compile({ message: '会员卡余额怎么样', role: 'manager' });

    expect(cardRisk.validation.valid).toBe(true);
    expect(cardRisk.task).toMatchObject({
      domain: 'card',
      taskType: 'forecast',
      metrics: ['card_expiry_risk'],
    });
    expect(cardRisk.capabilityMatches[0]).toMatchObject({
      capabilityId: 'card_member_business_diagnosis',
      toolPlan: [{ tool: 'card.diagnose', args: expect.objectContaining({ question: '未来30天哪些次卡快到期' }) }],
    });
    expect(memberBalance.validation.valid).toBe(true);
    expect(memberBalance.task).toMatchObject({
      domain: 'memberCard',
      taskType: 'query',
      metrics: ['member_balance'],
    });
    expect(memberBalance.capabilityMatches[0]).toMatchObject({
      capabilityId: 'card_member_business_diagnosis',
      toolPlan: [{ tool: 'card.diagnose', args: expect.objectContaining({ question: '会员卡余额怎么样' }) }],
    });
    expect(memberBalance.semanticSqlCandidate).toMatchObject({
      allowed: false,
      fallbackCapability: 'card_member_business_diagnosis',
    });
  });

  it('compiles finance margin questions into finance margin diagnosis capability', async () => {
    const result = await service.compile({ message: '近30天毛利怎么样', role: 'manager' });

    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'finance',
      taskType: 'query',
      metrics: ['gross_margin'],
    });
    expect(result.capabilityMatches[0]).toMatchObject({
      capabilityId: 'finance_margin_diagnosis',
      toolPlan: [{ tool: 'finance.margin.diagnose', args: expect.objectContaining({ question: '近30天毛利怎么样' }) }],
    });
    expect(result.semanticSqlCandidate).toMatchObject({
      allowed: false,
      fallbackCapability: 'finance_margin_diagnosis',
    });
  });

  it('returns validation clarification for unknown vague input', async () => {
    const result = await service.compile({ message: '随便看看', role: 'manager' });

    expect(result.validation.valid).toBe(false);
    expect(result.capabilityMatches).toEqual([]);
    expect(result.validation.clarificationQuestion).toContain('业务领域');
  });

  it('uses a validated LLM structured draft only to fill missing slots', async () => {
    const result = await serviceWithLlmDraft.compile({
      message: '这个',
      role: 'manager',
      context: {
        llmTaskCompilerEnabled: true,
        llmBusinessTaskDraft: {
          domain: 'product',
          taskType: 'ranking',
          metrics: ['product_sales_growth'],
          timeRange: { preset: 'last_30_days', label: '近30天' },
          limit: 8,
          outputMode: 'ranked_list',
          confidence: 0.84,
          reason: '用户在商品销售上下文中询问趋势',
        },
      },
    });

    expect(result.llmDraft).toMatchObject({ used: true, status: 'success', source: 'context' });
    expect(result.validation.valid).toBe(true);
    expect(result.task).toMatchObject({
      domain: 'product',
      taskType: 'ranking',
      limit: 8,
      metrics: ['product_sales_growth'],
      outputMode: 'ranked_list',
    });
    expect(result.capabilityMatches[0]).toMatchObject({ capabilityId: 'product_sales_ranking' });
  });

  it('does not let an LLM draft override deterministic domain, time range or limit', async () => {
    const result = await serviceWithLlmDraft.compile({
      message: '今天最值得跟进的10个客户',
      role: 'manager',
      context: {
        llmTaskCompilerEnabled: true,
        llmBusinessTaskDraft: {
          domain: 'product',
          taskType: 'ranking',
          metrics: ['product_sales_growth'],
          timeRange: { preset: 'last_30_days', label: '近30天' },
          limit: 3,
          confidence: 0.95,
        },
      },
    });

    expect(result.task).toMatchObject({
      domain: 'customer',
      taskType: 'recommendation',
      timeRange: { preset: 'today', label: '今天' },
      limit: 10,
    });
    expect(result.task.metrics).toEqual(['follow_up_priority_score']);
    expect(result.validation.warnings).toEqual(
      expect.arrayContaining([
        'llm_domain_ignored_by_deterministic_slot',
        'llm_taskType_ignored_by_deterministic_slot',
        'llm_limit_ignored_by_deterministic_slot',
        'llm_timeRange_ignored_by_deterministic_slot',
      ]),
    );
    expect(result.capabilityMatches[0]).toMatchObject({ capabilityId: 'customer_priority_recommendation' });
  });

  it('ignores context LLM drafts when the compiler preview is not enabled', async () => {
    const result = await serviceWithLlmDraft.compile({
      message: '随便看看',
      role: 'manager',
      context: {
        llmBusinessTaskDraft: {
          domain: 'product',
          taskType: 'ranking',
          metrics: ['product_sales_growth'],
          limit: 5,
          confidence: 0.9,
        },
      },
    });

    expect(result.llmDraft).toMatchObject({ used: false, status: 'disabled' });
    expect(result.validation.valid).toBe(false);
    expect(result.capabilityMatches).toEqual([]);
  });
});
