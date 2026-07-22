import type { BrainSemanticIntent } from './brain-semantic-intent.types.js';
import { BrainIntentCompletenessPolicyService } from './brain-intent-completeness-policy.service.js';

const hash = (value: string) => value.repeat(64);

const snapshot = {
  productionReady: true as const,
  fingerprint: hash('f'),
  entities: [],
  relations: [],
  metrics: [
    metric('staff_service_revenue', '员工服务收入', ['员工业绩', '服务业绩', '业绩']),
    metric('staff_sales_revenue', '员工销售业绩', ['员工业绩', '销售业绩', '业绩']),
    metric('staff_service_count', '员工服务次数', ['员工业绩', '服务次数', '业绩']),
    metric('staff_commission_amount', '员工提成', ['员工业绩', '提成业绩', '业绩']),
  ],
  dimensions: [],
};

describe('BrainIntentCompletenessPolicyService', () => {
  const service = new BrainIntentCompletenessPolicyService();

  it.each(['业绩好不好', '看下唐伊的业绩', '唐伊业绩怎么样', '查一下唐伊业绩情况', '唐伊表现怎么样'])(
    'clarifies a governed metric alias collision: %s',
    (question) => {
      const intent = baseIntent({
        objective: '查询唐伊的员工业绩',
        domains: ['beautician'],
        entities: question.includes('唐伊')
          ? [{ entityType: 'beautician', entityKey: '41', mention: '唐伊', source: 'user', confidence: 0.99 }]
          : [],
        metrics: [metricRef('staff_service_revenue')],
      });

      const result = service.assess({
        intent,
        question,
        snapshot: snapshot as never,
        catalogAmbiguous: true,
        conversationSlots: {},
      });

      if (question === '唐伊表现怎么样') {
        expect(result.missingSlots).not.toContain('metric');
      } else {
        expect(result.missingSlots).toContain('metric');
        expect(result.ambiguities[0]?.candidates).toEqual(
          expect.arrayContaining(['员工服务收入', '员工销售业绩', '员工服务次数', '员工提成']),
        );
      }
    },
  );

  it.each([
    ['BQ1956', '昨天怎么样'],
    ['BQ1956 同义 1', '昨天情况如何'],
    ['BQ1956 同义 2', '昨天表现好不好'],
    ['BQ1961', '最近生意如何'],
    ['BQ1961 同义 1', '最近门店情况怎么样'],
    ['BQ1961 同义 2', '这阵子经营得好吗'],
  ])('turns %s into one merged business-scope clarification', (_caseKey, question) => {
    const result = service.assess({
      intent: baseIntent({ domains: ['finance', 'customer', 'reservation', 'inventory'], metrics: [], entities: [] }),
      question,
      snapshot: snapshot as never,
      catalogAmbiguous: true,
      conversationSlots: {},
    });

    expect(result).toMatchObject({ intent: 'clarify', answerShape: 'clarification' });
    expect(result.missingSlots).toContain('objective');
  });

  it.each(['昨天实收多少', '最近30天新客有多少'])(
    'does not over-clarify a scoped business question: %s',
    (question) => {
      const result = service.assess({
        intent: baseIntent({ domains: ['finance'], metrics: [metricRef('staff_service_revenue')] }),
        question,
        snapshot: snapshot as never,
        catalogAmbiguous: false,
        conversationSlots: {},
      });

      expect(result.intent).not.toBe('clarify');
      expect(result.missingSlots).not.toContain('objective');
    },
  );

  it('keeps an appointment action and carries unresolved customer identity into the next turn', () => {
    const result = service.assess({
      intent: baseIntent({
        intent: 'action',
        answerShape: 'action_preview',
        domains: ['reservation'],
        entities: [{ entityType: 'project', mention: '亮肤淡斑管理', source: 'user', confidence: 0.95 }],
        missingSlots: ['actionTarget'],
      }),
      question: '帮她约个亮肤淡斑管理',
      snapshot: snapshot as never,
      catalogAmbiguous: false,
      conversationSlots: {
        modelContext: { pendingClarification: { missingSlots: ['entity'], questions: [], ambiguities: [] } },
      },
    });

    expect(result).toMatchObject({ intent: 'action', answerShape: 'action_preview' });
    expect(result.missingSlots).toEqual(expect.arrayContaining(['entity', 'timeRange']));
  });

  it.each(['帮我约一下', '替我安排个预约', '给我约个时间'])(
    'keeps an underspecified appointment command as an action preview and asks for required objects: %s',
    (question) => {
      const result = service.assess({
        intent: baseIntent({
          objective: '创建预约',
          intent: 'action',
          answerShape: 'action_preview',
          domains: ['reservation'],
          missingSlots: ['actionTarget'],
        }),
        question,
        snapshot: snapshot as never,
        catalogAmbiguous: false,
        conversationSlots: {},
      });

      expect(result).toMatchObject({ intent: 'action', answerShape: 'action_preview' });
      expect(result.missingSlots).toEqual(expect.arrayContaining(['customer', 'project', 'timeRange']));
    },
  );

  it('does not over-clarify a complete appointment preview request', () => {
    const result = service.assess({
      intent: baseIntent({
        objective: '为刘婉清预约亮肤淡斑管理',
        intent: 'action',
        answerShape: 'action_preview',
        domains: ['reservation'],
        entities: [
          { entityType: 'customer', entityKey: '501', mention: '刘婉清', source: 'user', confidence: 1 },
          { entityType: 'project', entityKey: '31', mention: '亮肤淡斑管理', source: 'user', confidence: 1 },
        ],
        timeRange: { label: '明天下午3点', timezone: 'Asia/Shanghai' },
      }),
      question: '帮刘婉清约明天下午3点的亮肤淡斑管理',
      snapshot: snapshot as never,
      catalogAmbiguous: false,
      conversationSlots: {},
    });

    expect(result.missingSlots).not.toContain('customer');
    expect(result.missingSlots).not.toContain('project');
    expect(result.missingSlots).not.toContain('timeRange');
  });

  it.each(['帮她约个亮肤淡斑管理', '给她安排亮肤淡斑管理', '替这个客户约亮肤淡斑管理'])(
    'preserves the unresolved same-name customer across a follow-up action: %s',
    (question) => {
      const result = service.assess({
        intent: baseIntent({
          intent: 'action',
          answerShape: 'action_preview',
          domains: ['reservation'],
          entities: [{ entityType: 'project', mention: '亮肤淡斑管理', source: 'user', confidence: 0.95 }],
        }),
        question,
        snapshot: snapshot as never,
        catalogAmbiguous: false,
        conversationSlots: {
          modelContext: { pendingClarification: { missingSlots: ['entity'], questions: [], ambiguities: [] } },
        },
      });

      expect(result).toMatchObject({ intent: 'action', answerShape: 'action_preview' });
      expect(result.missingSlots).toEqual(expect.arrayContaining(['entity', 'timeRange']));
    },
  );

  it('does not ask for identity or time again after both are server-resolved', () => {
    const result = service.assess({
      intent: baseIntent({
        intent: 'action',
        answerShape: 'action_preview',
        domains: ['reservation'],
        entities: [
          {
            entityType: 'customer',
            entityKey: '501',
            mention: '黄婉清（尾号6017）',
            source: 'conversation',
            confidence: 1,
          },
          { entityType: 'project', entityKey: '31', mention: '亮肤淡斑管理', source: 'user', confidence: 1 },
        ],
        timeRange: { label: '明天下午3点', timezone: 'Asia/Shanghai' },
      }),
      question: '帮她约明天下午3点的亮肤淡斑管理',
      snapshot: snapshot as never,
      catalogAmbiguous: false,
      conversationSlots: {
        modelContext: { pendingClarification: { missingSlots: ['entity'], questions: [], ambiguities: [] } },
      },
    });

    expect(result.missingSlots).not.toEqual(expect.arrayContaining(['entity', 'timeRange']));
  });

  it.each(['跟国庆期间比呢', '和国庆假期比较一下', '对比国庆前后怎么样'])(
    'requires an explicit year for a named holiday comparison period: %s',
    (question) => {
      const result = service.assess({
        intent: baseIntent({ intent: 'comparison', answerShape: 'comparison', domains: ['finance'] }),
        question,
        snapshot: snapshot as never,
        catalogAmbiguous: false,
        conversationSlots: {},
      });

      expect(result.missingSlots).toContain('comparisonTarget');
    },
  );

  it.each(['跟2025年国庆期间比', '和去年国庆假期比较'])(
    'accepts an explicitly anchored holiday comparison: %s',
    (question) => {
      const result = service.assess({
        intent: baseIntent({
          intent: 'comparison',
          answerShape: 'comparison',
          domains: ['finance'],
          comparisonTarget: {
            type: 'time',
            timeRange: {
              label: '2025年国庆',
              startDate: '2025-10-01',
              endDate: '2025-10-07',
              timezone: 'Asia/Shanghai',
            },
          },
        }),
        question,
        snapshot: snapshot as never,
        catalogAmbiguous: false,
        conversationSlots: {},
      });

      expect(result.missingSlots).not.toContain('comparisonTarget');
    },
  );
});

function baseIntent(overrides: Partial<BrainSemanticIntent> = {}): BrainSemanticIntent {
  return {
    schemaVersion: '1.0',
    objective: '分析门店经营表现',
    domains: ['finance', 'customer'],
    intent: 'diagnosis',
    entities: [],
    metrics: [],
    dimensions: [],
    filters: [],
    orderBy: [],
    answerShape: 'diagnosis',
    ambiguities: [],
    missingSlots: [],
    assumptions: [],
    confidence: 0.9,
    decisionSummary: '测试',
    successCriteria: ['返回受控结果'],
    ...overrides,
  };
}

function metricRef(key: string) {
  return {
    definitionType: 'metric' as const,
    definitionKey: `metric.${key}`,
    definitionVersion: 1,
    definitionFingerprint: hash('a'),
    sourceFingerprint: hash('b'),
  };
}

function metric(metricKey: string, name: string, aliases: string[]) {
  return {
    definitionKey: `metric.${metricKey}`,
    version: 1,
    definitionFingerprint: hash('a'),
    sourceFingerprint: hash('b'),
    metricKey,
    name,
    aliases,
    domain: 'beautician',
    formula: {},
    source: {},
    defaultFilters: [],
    permissions: [],
    description: name,
  };
}
