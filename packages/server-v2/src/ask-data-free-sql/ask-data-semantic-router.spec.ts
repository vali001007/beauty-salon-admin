import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASK_DATA_FREE_SQL_VIEWS } from './ask-data-free-sql.catalog.js';
import { AskDataClarificationPolicy } from './ask-data-clarification-policy.js';
import { AskDataIntentParser } from './ask-data-intent-parser.js';
import {
  ASK_DATA_SEMANTIC_CONTRACTS,
  validateAskDataSemanticContracts,
} from './ask-data-semantic-contracts.js';
import { AskDataSemanticRouter, askDataSemanticRouterConfig } from './ask-data-semantic-router.js';
import { authorizedAskDataViews } from './ask-data-free-sql-view-selector.js';

const adminContext = {
  userId: 9,
  storeId: 6,
  permissions: ['*'],
  deniedPermissions: [],
};

describe('Ami Ask independent semantic router', () => {
  const parser = new AskDataIntentParser();
  const policy = new AskDataClarificationPolicy();

  it('defines one valid primary semantic entry for every registered Ask view', () => {
    const knownViews = ASK_DATA_FREE_SQL_VIEWS.map((view) => view.viewName);
    expect(ASK_DATA_SEMANTIC_CONTRACTS).toHaveLength(34);
    expect(new Set(ASK_DATA_SEMANTIC_CONTRACTS.map((item) => item.metricKey)).size).toBe(34);
    expect(new Set(ASK_DATA_SEMANTIC_CONTRACTS.map((item) => item.preferredView))).toEqual(new Set(knownViews));
    expect(validateAskDataSemanticContracts(knownViews)).toEqual([]);
  });

  it.each([
    ['最近三个月产品订单有多少', 'product_sales', 'scalar'],
    ['最近30天哪个项目最受欢迎', 'project_sales', 'ranking'],
    ['最近14天的实收流水', 'payment_flow', 'list'],
    ['各供应商采购金额排行', 'supplier_performance', 'ranking'],
    ['当前价格最高的项目有哪些', 'project_catalog', 'ranking'],
    ['最近三个月经营成本趋势', 'operating_cost', 'trend'],
    ['本月财务对账异常有哪些', 'reconciliation_issue', 'list'],
    ['各渠道营销 ROI 对比', 'marketing_roi', 'comparison'],
  ])('maps governed wording to a unique metric: %s', (question, metricKey, answerShape) => {
    const parsed = parser.parse(question, new Date('2026-08-02T00:00:00.000Z'));
    expect(parsed.semanticIntent.metricKeys[0]).toBe(metricKey);
    expect(parsed.semanticIntent.answerShape).toBe(answerShape);
  });

  it('keeps explicitly combined finance metrics as a comparison instead of forcing clarification', () => {
    const parsed = parser.parse('本月营业额与日结净收分别是多少');
    expect(parsed.semanticIntent.metricKeys).toEqual(expect.arrayContaining(['order_revenue', 'daily_net_receipts']));
    expect(parsed.semanticIntent.answerShape).toBe('comparison');
    expect(policy.inspect(parsed.semanticIntent).required).toBe(false);
  });

  it('applies governed defaults and exposes them as assumptions', () => {
    const recent = parser.parse('最近哪个项目最受欢迎', new Date('2026-08-02T00:00:00.000Z'));
    expect(recent.semanticIntent.timeRange?.label).toBe('近 30 天');
    expect(recent.semanticIntent.assumptions).toEqual(
      expect.arrayContaining(['“最近”按近 30 天查询。', '未指定排行数量，默认返回前 10 名。']),
    );
  });

  it.each([
    ['双十一的商品销量', 'year', '具体年份'],
    ['本月大额退款有哪些', 'threshold', '金额阈值'],
  ])('preserves a material ambiguity: %s', (question, slot, expectedQuestionText) => {
    const parsed = parser.parse(question);
    expect(parsed.semanticIntent.ambiguities[0]?.slot).toBe(slot);
    const decision = policy.inspect(parsed.semanticIntent);
    expect(decision.required).toBe(true);
    expect(decision.question).toContain(expectedQuestionText);
  });

  it('routes high-confidence questions deterministically to one governed view', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '最近30天哪个项目最受欢迎',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.routeMode).toBe('deterministic');
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_project_service_sales_view']);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('returns permission denied before model routing when the governed target view is unauthorized', async () => {
    const ai = { generateStructured: jest.fn() };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const context = {
      ...adminContext,
      permissions: ['core:store:scheduling'],
    };
    const result = await router.route({
      question: '本月营业额是多少',
      context,
      authorizedViews: authorizedAskDataViews(context),
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.permissionDenied).toBe(true);
    expect(result.candidateViews).toEqual([]);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('uses one bounded structured model call only for low-confidence questions', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          intent: 'query',
          answerShape: 'scalar',
          metricKeys: ['order_revenue'],
          viewNames: ['agent_v3_order_summary_view'],
          confidence: 0.82,
          ambiguitySlot: '',
          clarificationQuestion: '',
        },
      }),
    };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '帮我看看最近经营情况',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.routeMode).toBe('model_fallback');
    expect(result.candidateViews.map((view) => view.viewName)).toEqual(['agent_v3_order_summary_view']);
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    const prompt = JSON.stringify(ai.generateStructured.mock.calls[0][0]);
    expect(prompt).not.toContain('business_definition');
  });

  it('does not accept a model-selected view outside the authorized candidate pool', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          intent: 'query',
          answerShape: 'scalar',
          metricKeys: ['order_revenue'],
          viewNames: ['forbidden_bottom_table'],
          confidence: 0.99,
          ambiguitySlot: '',
          clarificationQuestion: '',
        },
      }),
    };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '帮我看看经营情况',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.candidateViews).toEqual([]);
    expect(result.clarificationReason).toBe('model_returned_no_allowed_view');
  });

  it('turns a model-reported ambiguity into a concrete clarification even when wording is omitted', async () => {
    const ai = {
      generateStructured: jest.fn().mockResolvedValue({
        data: {
          intent: 'query',
          answerShape: 'scalar',
          metricKeys: ['order_revenue'],
          viewNames: ['agent_v3_order_summary_view'],
          confidence: 0.6,
          ambiguitySlot: 'comparison_basis',
          clarificationQuestion: '',
        },
      }),
    };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '帮我比较一下经营情况',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.75 },
    });
    expect(result.clarificationQuestion).toContain('comparison_basis');
    expect(result.clarificationReason).toBe('model_ambiguity:comparison_basis');
  });

  it('falls back safely to deterministic candidates when the semantic model fails', async () => {
    const ai = { generateStructured: jest.fn().mockRejectedValue(new Error('timeout')) };
    const router = new AskDataSemanticRouter(ai as any, parser, policy);
    const result = await router.route({
      question: '营业额还是日结净收',
      context: adminContext,
      authorizedViews: ASK_DATA_FREE_SQL_VIEWS,
      config: { enabled: true, shadow: false, modelFallback: true, minConfidence: 0.9 },
    });
    expect(result.routeMode).toBe('deterministic');
    expect(result.candidateViews.length).toBeGreaterThan(0);
    expect(result.fallbackReason).toContain('model_failed');
  });

  it('parses independent router environment flags without changing the SQL kernel config', () => {
    expect(
      askDataSemanticRouterConfig({
        ASK_DATA_SEMANTIC_ROUTER_ENABLED: 'true',
        ASK_DATA_SEMANTIC_ROUTER_SHADOW: 'false',
        ASK_DATA_SEMANTIC_ROUTER_MODEL_FALLBACK: 'false',
        ASK_DATA_SEMANTIC_ROUTER_MIN_CONFIDENCE: '0.8',
      }),
    ).toEqual({ enabled: true, shadow: false, modelFallback: false, minConfidence: 0.8 });
  });

  it('has no Brain or semantic-data runtime imports', () => {
    const files = [
      'ask-data-semantic-contracts.ts',
      'ask-data-intent-parser.ts',
      'ask-data-semantic-router.ts',
      'ask-data-clarification-policy.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), 'src/ask-data-free-sql', file), 'utf8');
      expect(source).not.toMatch(/from ['"]\.\.\/brain\//);
      expect(source).not.toMatch(/from ['"]\.\.\/semantic-data\//);
      expect(source).not.toContain('business_definition');
      expect(source).not.toContain('BrainRelease');
    }
  });

  it('keeps deterministic routing comfortably below the 50ms P95 target', () => {
    const samples: number[] = [];
    for (let index = 0; index < 200; index += 1) {
      const startedAt = performance.now();
      parser.parse('最近30天哪个项目最受欢迎');
      samples.push(performance.now() - startedAt);
    }
    samples.sort((left, right) => left - right);
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(50);
  });
});
