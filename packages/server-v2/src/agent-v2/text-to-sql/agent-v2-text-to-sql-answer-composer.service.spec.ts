import { AgentV2TextToSqlAnswerComposerService } from './agent-v2-text-to-sql-answer-composer.service.js';
import type { AgentV2TextToSqlPlan } from './agent-v2-text-to-sql.types.js';

describe('AgentV2TextToSqlAnswerComposerService', () => {
  const composer = new AgentV2TextToSqlAnswerComposerService();
  const plan: AgentV2TextToSqlPlan = {
    status: 'planned',
    intent: { domain: 'sales', type: 'ranking', metric: 'quantity_sold' },
    selectedViews: ['agent_v2_order_item_sales_view'],
    generatedSql: 'SELECT product_name FROM agent_v2_order_item_sales_view LIMIT 10',
    parameters: {},
    explanation: 'test',
  };

  it('does not fabricate rows for no_data', () => {
    const answer = composer.compose({
      question: '本月销量最好的商品',
      plan,
      selectedViews: [],
      execution: { status: 'no_data', rows: [], executionMs: 1 },
    });

    expect(answer).toContain('没有匹配数据');
  });

  it('explains blocked reasons without exposing SQL', () => {
    const answer = composer.compose({
      question: '查询所有客户手机号',
      plan,
      selectedViews: [],
      execution: { status: 'blocked', rows: [], executionMs: 1, blockedReason: 'sensitive_field_selected' },
    });

    expect(answer).toContain('sensitive_field_selected');
    expect(answer).not.toMatch(/\b(select|from|where)\b/i);
  });

  it('explains failed readonly execution without treating it as no_data', () => {
    const answer = composer.compose({
      question: '本月销量最好的商品',
      plan,
      selectedViews: [],
      execution: { status: 'failed', rows: [], executionMs: 1, blockedReason: 'permission_error', errorMessage: 'permission_error' },
    });

    expect(answer).toContain('执行失败');
    expect(answer).toContain('permission_error');
    expect(answer).not.toContain('没有匹配数据');
    expect(answer).not.toMatch(/\b(select|from|where)\b/i);
  });

  it('includes source views and store scope in evidence', () => {
    const evidence = composer.evidence({
      storeIds: [1],
      selectedViews: [{
        id: 'order_item_sales',
        viewName: 'agent_v2_order_item_sales_view',
        domain: 'sales',
        description: '商品销量',
        status: 'enabled',
        batch: 'P0',
        requiredPermissions: [],
        fields: [{ name: 'product_name', type: 'string', description: '商品', policy: 'allow' }],
        sampleQuestions: [],
      }],
    });

    expect(evidence.sourceViews).toEqual(['agent_v2_order_item_sales_view']);
    expect(evidence.storeScope).toContain('1');
    expect(evidence.fieldPolicies[0]).toMatchObject({ policy: 'allow' });
  });
});
