import { AgentV3AnswerRelevanceGuardService } from './agent-v3-answer-relevance-guard.service.js';
import type { AgentV3QueryIntent, AgentV3SqlGuardResult, AgentV3TextToSqlPlan } from './agent-v3-text-to-sql.types.js';

const projectIntent: AgentV3QueryIntent = {
  originalQuestion: '最近一个月最受欢迎的项目有哪几个',
  normalizedQuestion: '最近一个月最受欢迎的项目有哪几个',
  domain: 'project',
  entity: {
    type: 'project',
    canonicalName: '项目',
    aliases: ['项目'],
    confidence: 0.9,
  },
  metric: {
    type: 'quantity',
    canonicalName: 'service_quantity',
    fieldCandidates: ['service_quantity'],
    sortDirection: 'desc',
    confidence: 0.9,
  },
  timeRange: { preset: 'last_30_days', confidence: 0.9 },
  shape: 'ranking',
  selectedView: 'agent_v3_project_service_sales_view',
  expectedFields: ['project_id', 'project_name', 'project_type'],
  forbiddenFields: ['customer_id', 'customer_name_masked', 'member_level'],
  selectedViewCandidates: [],
  risks: [],
  source: 'v3_kg_local_fixture',
};

const plan: AgentV3TextToSqlPlan = {
  status: 'planned',
  intent: { domain: 'project', type: 'ranking', metric: 'service_quantity' },
  queryIntent: projectIntent,
  selectedViews: ['agent_v3_project_service_sales_view'],
  generatedSql: 'SELECT project_id, project_name FROM agent_v3_project_service_sales_view LIMIT 10',
  parameters: {},
  explanation: 'test',
};

describe('AgentV3AnswerRelevanceGuardService', () => {
  const service = new AgentV3AnswerRelevanceGuardService();

  it('passes when selected SQL view and columns match query intent', () => {
    const guard: AgentV3SqlGuardResult = {
      status: 'pass',
      safeSql: plan.generatedSql ?? '',
      redactedSql: plan.generatedSql ?? '',
      params: {},
      selectedViews: [
        {
          id: 'project',
          viewName: 'agent_v3_project_service_sales_view',
          domain: 'project',
          description: 'project view',
          status: 'enabled',
          batch: 'P0',
          requiredPermissions: [],
          sampleQuestions: [],
          fields: [
            { name: 'project_id', type: 'number', description: '项目 ID', policy: 'allow' },
            { name: 'project_name', type: 'string', description: '项目名称', policy: 'allow' },
          ],
        },
      ],
      parsed: {
        statementType: 'select',
        columns: ['project_id', 'project_name'],
        referencedColumns: [],
        sourceViews: ['agent_v3_project_service_sales_view'],
        functions: [],
        hasWildcard: false,
        hasLimit: true,
        limit: 10,
        hasWhere: false,
        hasGroupBy: false,
        hasOrderBy: false,
        tokens: [],
      },
      appliedPolicies: [],
    };

    expect(service.inspect({ plan, guard })).toEqual({
      status: 'pass',
      appliedPolicies: [
        'query_intent_view_checked',
        'query_intent_domain_checked',
        'query_intent_forbidden_fields_checked',
        'query_intent_expected_fields_checked',
      ],
    });
  });

  it('blocks customer answer fields for project popularity questions', () => {
    const guard: AgentV3SqlGuardResult = {
      status: 'pass',
      safeSql: 'SELECT customer_id, customer_name_masked FROM agent_v3_customer_profile_summary_view LIMIT 10',
      redactedSql: 'SELECT customer_id, customer_name_masked FROM agent_v3_customer_profile_summary_view LIMIT 10',
      params: {},
      selectedViews: [
        {
          id: 'customer',
          viewName: 'agent_v3_customer_profile_summary_view',
          domain: 'customer',
          description: 'customer view',
          status: 'enabled',
          batch: 'P0',
          requiredPermissions: [],
          sampleQuestions: [],
          fields: [
            { name: 'customer_id', type: 'number', description: '客户 ID', policy: 'allow' },
            { name: 'customer_name_masked', type: 'string', description: '客户姓名', policy: 'mask' },
          ],
        },
      ],
      parsed: {
        statementType: 'select',
        columns: ['customer_id', 'customer_name_masked'],
        referencedColumns: [],
        sourceViews: ['agent_v3_customer_profile_summary_view'],
        functions: [],
        hasWildcard: false,
        hasLimit: true,
        limit: 10,
        hasWhere: false,
        hasGroupBy: false,
        hasOrderBy: false,
        tokens: [],
      },
      appliedPolicies: [],
    };

    const result = service.inspect({ plan, guard });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.reasonCode).toBe('semantic_view_mismatch');
    }
  });
});
