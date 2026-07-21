import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  annotateQuestionBankCoverage,
  parseAgentEvalQuestionMarkdown,
  selectRemainingSupportedQuestionBankCases,
  selectP0QuestionBankCases,
  toAgentEvalCaseDefinitions,
} from './agent-eval-question-bank.js';

function readQuestionBankMarkdown() {
  const candidates = [
    resolve(process.cwd(), 'docs/04-测试数据/agent-eval-questions.md'),
    resolve(process.cwd(), '../../docs/04-测试数据/agent-eval-questions.md'),
    resolve(process.cwd(), '../../docs/04-测试数据/Agent评测与知识治理-2026-06-30至07-03/agent-eval-questions.md'),
  ];
  const file = candidates.find((item) => existsSync(item));
  if (!file) throw new Error(`agent-eval-questions.md not found. tried: ${candidates.join(', ')}`);
  return readFileSync(file, 'utf8');
}

describe('Agent eval question bank', () => {
  it('parses the markdown question bank into 650 structured cases', () => {
    const markdown = readQuestionBankMarkdown();
    expect(markdown.match(/^# Agent 评测问题库$/gm)).toHaveLength(1);

    const bank = parseAgentEvalQuestionMarkdown(markdown);
    expect(bank).toEqual(
      expect.objectContaining({
        title: 'Agent 评测问题库',
        version: 'v1.0',
        date: '2026-06-27',
      }),
    );
    expect(bank.questions).toHaveLength(650);
    expect(
      bank.questions.every(
        (item) =>
          item.expectedSemanticIntent &&
          item.expectedDomains &&
          item.expectedEntities &&
          item.expectedMetrics &&
          item.expectedDimensions,
      ),
    ).toBe(true);
    expect(countBy(bank.questions, 'persona')).toEqual({
      manager: 100,
      marketing: 100,
      reception: 100,
      beautician: 100,
      inventory: 100,
      finance: 100,
      edge: 50,
    });
    expect(bank.questions.find((item) => item.input === '今天店里情况怎么样，给我来个总结')).toMatchObject({
      expectedSemanticIntent: 'diagnosis',
      requiresApproval: false,
    });
    expect(bank.questions.find((item) => item.input === '今天退款有几笔，金额多少')).toMatchObject({
      expectedSemanticIntent: 'query',
      requiresApproval: false,
      expectedOutputKinds: expect.not.arrayContaining(['action_card']),
    });
    expect(
      bank.questions.find((item) => item.input === '哪些客户最近消费频率明显下降')?.expectedOutputKinds,
    ).not.toContain('kpi');
    expect(bank.questions.find((item) => item.input === '这个月提成最高的是谁，大概多少')).toMatchObject({
      expectedSemanticIntent: 'ranking',
      expectedMetrics: ['staff_commission_amount'],
    });
    expect(bank.questions.find((item) => item.input === '谁的客户复购率最高')).toMatchObject({
      expectedSemanticIntent: 'ranking',
      expectedMetrics: ['staff_customer_repurchase_rate'],
    });
    expect(bank.questions.find((item) => item.input === '有没有员工这周业绩明显下滑')?.expectedMetrics).not.toContain(
      'staff_performance_score',
    );
    expect(bank.questions.find((item) => item.input === '今天退款有几笔，金额多少')?.expectedMetrics).toEqual(
      expect.arrayContaining(['refund_amount', 'refund_count']),
    );
    expect(bank.questions.find((item) => item.input === '今天折扣优惠送出去多少钱')?.expectedMetrics).toContain(
      'discount_amount',
    );
    expect(bank.questions.find((item) => item.input === '今天新客老客各来了几个')?.expectedDimensions).not.toContain(
      'customer',
    );
    expect(bank.questions.find((item) => item.input === '上个月新来了多少新客，转化了多少')).toMatchObject({
      expectedSemanticIntent: 'query',
      expectedMetrics: expect.arrayContaining([
        'new_customer_count',
        'new_customer_conversion_count',
        'new_customer_conversion_rate',
      ]),
    });
    expect(
      bank.questions.find((item) => item.input === '帮我看一下今天到店客人的画像，主要是什么年龄段'),
    ).toMatchObject({
      expectedSemanticIntent: 'query',
      expectedDimensions: expect.arrayContaining(['customerAgeGroup']),
    });
    expect(bank.questions.find((item) => item.input === '哪个美容师接的客人最多')?.expectedDimensions).toEqual([
      'beautician',
    ]);
    expect(bank.questions.find((item) => item.input === '哪个美容师接的客人最多')?.expectedMetrics).toContain(
      'staff_unique_customer_count',
    );
    expect(bank.questions.find((item) => item.input === '今天谁服务了几个客人')?.expectedDimensions).toEqual([
      'beautician',
    ]);
    expect(bank.questions.find((item) => item.input === '今天谁服务了几个客人')?.expectedMetrics).toContain(
      'staff_unique_customer_count',
    );
    expect(bank.questions.find((item) => item.input === '这个月产品销售额是多少')?.expectedMetrics).toEqual([
      'product_sales_amount',
    ]);
    expect(bank.questions.find((item) => item.input === '哪些产品毛利率最高')?.expectedMetrics).toContain(
      'product_gross_margin_rate',
    );
    expect(bank.questions.find((item) => item.input === '有没有产品卖出去的价格低于成本的')?.expectedMetrics).toContain(
      'product_below_cost_sale_count',
    );
    expect(bank.questions.find((item) => item.input === '哪些耗材消耗速度最快')?.expectedMetrics).toContain(
      'inventory_consumption_quantity',
    );
    expect(bank.questions.find((item) => item.input === '我这个月业绩是多少')).toMatchObject({
      expectedSemanticIntent: 'query',
      expectedAnswerShape: 'scalar',
    });
    expect(bank.questions.find((item) => item.input === '有没有哪个客户最近好久没来了，我应该联系一下')).toMatchObject({
      expectedIntentType: 'query',
      expectedSemanticIntent: 'query',
    });
    expect(bank.questions.find((item) => item.input === '能不能在客户消费后自动给她推荐下一个适合的项目')).toMatchObject({
      expectedSemanticIntent: 'recommendation',
    });
    expect(bank.questions.find((item) => item.input === '我今天已经做了几个客人，收入多少')).toMatchObject({
      expectedSemanticIntent: 'query',
      expectedMetrics: [],
    });
    expect(bank.questions.find((item) => item.input === '这个月哪个项目消耗耗材最多')).toMatchObject({
      expectedSemanticIntent: 'ranking',
      expectedAnswerShape: 'ranking',
      expectedMetrics: [],
      expectedDimensions: ['projectName'],
    });
    expect(bank.questions.find((item) => item.input === '帮我看一下各项目的毛利情况')).toMatchObject({
      expectedSemanticIntent: 'ranking',
      expectedAnswerShape: 'ranking',
      expectedMetrics: [],
      expectedDimensions: expect.arrayContaining(['project']),
    });
    expect(bank.questions.find((item) => item.input === '这个月耗材成本占了多少')).toMatchObject({
      expectedSemanticIntent: 'query',
      expectedAnswerShape: 'scalar',
      expectedMetrics: ['material_cost'],
    });
    expect(bank.questions.find((item) => item.input === '帮我看一下耗材成本占服务收入的比例')).toMatchObject({
      expectedSemanticIntent: 'query',
      expectedAnswerShape: 'scalar',
      expectedDomains: ['inventory_procurement'],
      expectedMetrics: ['material_cost_rate'],
    });
    expect(bank.questions.find((item) => item.input === '今天的日均客单价是多少')).toMatchObject({
      expectedSemanticIntent: 'query',
      expectedMetrics: ['average_order_value'],
    });
    expect(bank.questions.find((item) => item.input === '有没有哪个项目因为缺耗材没法做')).toMatchObject({
      expectedSemanticIntent: 'query',
    });
    expect(bank.questions.find((item) => item.input === '帮我统计一下这个月每个项目的收入占比')).toMatchObject({
      expectedSemanticIntent: 'ranking',
      expectedAnswerShape: 'ranking',
      expectedDomains: ['project'],
      expectedMetrics: [],
      expectedDimensions: expect.arrayContaining(['project']),
    });
    expect(bank.questions.find((item) => item.input === '储值卡余额总计多少，如果客户都来消费我们能撑住吗')).toMatchObject({
      expectedSemanticIntent: 'diagnosis',
      expectedAnswerShape: 'diagnosis',
      expectedMetrics: [],
      expectedEntities: [],
    });
    expect(bank.questions.find((item) => item.input === '这个客人皮肤比较敏感，用什么护理方案最安全')).toMatchObject({
      expectedIntentType: 'analysis_and_recommendation',
      expectedSemanticIntent: 'recommendation',
    });
    expect(bank.questions.find((item) => item.input === '这个月有没有不正常的流水')).toMatchObject({
      expectedSemanticIntent: 'diagnosis',
      expectedAnswerShape: 'diagnosis',
      expectedMetrics: [],
    });
    expect(
      bank.questions.find((item) => item.input === '最近有没有现金流异常的情况')?.expectedDimensions,
    ).not.toContain('payment_method');
    expect(bank.questions.find((item) => item.input === '最近有没有客户投诉或者表达不满')?.expectedMetrics).toEqual(
      expect.arrayContaining(['customer_complaint_count', 'customer_feedback_collection_coverage_rate']),
    );
    expect(bank.questions.find((item) => item.input === '最近有没有客户投诉或者表达不满')?.systemSupportStatus).toBe(
      'system_supported_testable',
    );
    expect(bank.questions.find((item) => item.input === '帮我看一下客户满意度整体情况')?.expectedMetrics).toEqual(
      expect.arrayContaining(['customer_average_satisfaction_rating', 'customer_feedback_collection_coverage_rate']),
    );
    expect(bank.questions.find((item) => item.input === '哪个美容师的客诉最多，最近有没有')?.expectedMetrics).toContain(
      'staff_customer_complaint_count',
    );
    expect(bank.questions.find((item) => item.input === '最近有没有客户因为等待时间长而离开')?.expectedMetrics).toEqual(
      expect.arrayContaining(['customer_long_wait_departure_count', 'customer_waiting_collection_coverage_rate']),
    );
    expect(bank.questions.find((item) => item.input === '最近有没有客户因为等待时间长而离开')?.systemSupportStatus).toBe(
      'system_supported_testable',
    );
    expect(bank.questions.find((item) => item.input === '哪些沉睡客户最近有点被唤醒的迹象')).toMatchObject({
      expectedMetrics: ['dormant_reactivation_customer_count'],
      expectedDimensions: ['customer'],
    });
    expect(bank.questions.find((item) => item.input === '帮我看一下今天整体的服务流程安排')).toMatchObject({
      expectedIntentType: 'query',
      expectedSemanticIntent: 'query',
    });
    expect(bank.questions.find((item) => item.input === '帮我搞一下活动')).toMatchObject({
      expectedIntentType: 'draft',
      expectedSemanticIntent: 'draft',
    });
    expect(bank.questions.find((item) => item.input === '帮我做一个今天的收入汇总')?.expectedOutputKinds).toEqual(
      expect.arrayContaining(['kpi', 'table']),
    );
    const campaignPlanning = bank.questions.filter((item) => item.sourceCategory === '活动策划');
    expect(campaignPlanning).toHaveLength(20);
    expect(campaignPlanning.find((item) => item.sourceIndex === 24)).toMatchObject({
      expectedIntentType: 'draft',
      expectedSemanticIntent: 'draft',
    });
    expect(campaignPlanning.find((item) => item.sourceIndex === 23)).toMatchObject({
      expectedIntentType: 'analysis_and_recommendation',
      expectedSemanticIntent: 'recommendation',
    });
    expect(campaignPlanning.find((item) => item.sourceIndex === 29)).toMatchObject({
      expectedSemanticIntent: 'recommendation',
      expectedMetrics: [],
      expectedDimensions: [],
    });
    expect(bank.questions.find((item) => item.input === '这个月活动花了多少钱，带来了多少收入')).toMatchObject({
      expectedSemanticIntent: 'diagnosis',
      expectedAnswerShape: 'diagnosis',
      expectedMetrics: [],
    });
    expect(bank.questions.find((item) => item.input === '我今天要用到什么产品和耗材')?.systemSupportStatus).not.toBe(
      'system_unsupported',
    );
    expect(
      bank.questions.find((item) => item.input === '下一个客人有没有皮肤过敏或者什么注意事项')?.systemSupportStatus,
    ).not.toBe('system_unsupported');
    expect(bank.questions.find((item) => item.input === '帮我确认一下明天所有预约都通知到位了吗')).toMatchObject({
      systemSupportStatus: 'system_unsupported',
    });
    expect(bank.questions.find((item) => item.input === '今天有没有安排我去做培训或其他任务')).toMatchObject({
      systemSupportStatus: 'system_unsupported',
    });
    expect(bank.questions.find((item) => item.input === '下一个客人最近情绪状态怎么样，需要特别关心吗')).toMatchObject({
      systemSupportStatus: 'system_unsupported',
    });
    expect(bank.questions.find((item) => item.input === '我想在每次服务结束后自动发一条感谢消息')).toMatchObject({
      systemSupportStatus: 'system_supported_agent_gap',
    });
    expect(bank.questions.find((item) => item.input === '帮我算一下盈亏平衡点，每月至少要做多少收入')).toMatchObject({
      systemSupportStatus: 'system_unsupported',
    });
    expect(bank.questions.find((item) => item.input === '员工最近情绪不好影响服务，同时营业额也在下滑，有关系吗')).toMatchObject({
      systemSupportStatus: 'system_unsupported',
    });
    expect(bank.questions.find((item) => item.input === '不要给我建议了，就告诉我数据')).toMatchObject({
      expectedIntentType: 'clarify',
      expectedSemanticIntent: 'clarify',
      expectedBrainStatus: 'clarify',
      expectedPlanShape: undefined,
    });
    expect(bank.questions.find((item) => item.input === '生成一份完整的年度运营报告')).toMatchObject({
      expectedIntentType: 'clarify',
      expectedSemanticIntent: 'clarify',
      expectedBrainStatus: 'clarify',
      expectedPlanShape: undefined,
    });
    expect(bank.questions.find((item) => item.input === '我想同时提升复购率和客单价，应该从哪里入手')).toMatchObject({
      expectedIntentType: 'analysis_and_recommendation',
      expectedSemanticIntent: 'recommendation',
      expectedMetrics: [],
      expectedPlanShape: expect.objectContaining({ minNodes: 1 }),
    });
    expect(bank.questions.find((item) => item.input === '有没有长期未消耗的大额储值需要关注')).toMatchObject({
      systemSupportStatus: 'system_supported_agent_gap',
    });
    expect(bank.questions.find((item) => item.input === '今天有哪个客人是比较难服务的，需要注意什么')).toMatchObject({
      expectedSemanticIntent: 'query',
      expectedDimensions: [],
    });
    expect(bank.questions.find((item) => item.input === '李美容师现在在忙吗，大概还要多久')?.expectedEntities).toEqual(
      expect.arrayContaining(['beautician', 'reservation']),
    );
    expect(bank.questions.find((item) => item.input === '能不能在员工空档时自动推送客户填满档期')).toMatchObject({
      requiresApproval: true,
      expectedSemanticIntent: 'action',
      expectedOutputKinds: expect.arrayContaining(['action_card']),
    });
    expect(bank.questions.find((item) => item.input === '这个月次卡销售了多少金额')?.expectedMetrics).toContain(
      'card_package_sales_amount',
    );
    expect(bank.questions.find((item) => item.input === '帮我查一下某笔交易的完整流水')).toMatchObject({
      expectedIntentType: 'clarify',
      expectedSemanticIntent: 'clarify',
      expectedBrainStatus: 'clarify',
    });
    expect(bank.questions.find((item) => item.input === '帮我预测下个季度的营业额')).toMatchObject({
      systemSupportStatus: 'system_supported_testable',
      expectedSemanticIntent: 'diagnosis',
    });
    expect(bank.questions.find((item) => item.input === '能不能在客户生日当天自动送一个小礼物')).toMatchObject({
      requiresApproval: true,
      expectedSemanticIntent: 'action',
      systemSupportStatus: 'system_supported_agent_gap',
    });
  });

  it('selects the first 120 P0 gate cases by role and edge strategy', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const p0Cases = selectP0QuestionBankCases(bank.questions);

    expect(p0Cases).toHaveLength(120);
    expect(countBy(p0Cases, 'persona')).toEqual({
      manager: 15,
      marketing: 15,
      reception: 15,
      beautician: 15,
      inventory: 15,
      finance: 15,
      edge: 30,
    });
    expect(p0Cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input: '今天营业额到多少了',
          persona: 'manager',
          evalRole: 'manager',
          expectedOutputKinds: expect.arrayContaining(['kpi', 'evidence']),
        }),
        expect.objectContaining({
          input: '我想做个召回活动，哪些客户最值得联系',
          persona: 'marketing',
          expectedSkill: 'marketing.growth.execution',
          expectedOutputKinds: expect.arrayContaining(['table', 'evidence']),
        }),
        expect.objectContaining({
          input: '这个客人用次卡核销，帮我看一下她的次卡情况',
          persona: 'reception',
          evalRole: 'reception',
          expectedOutputKinds: expect.arrayContaining(['table']),
        }),
        expect.objectContaining({
          input: '哪些产品快过期了，还有多少',
          persona: 'inventory',
          expectedSkill: 'inventory.supply.risk',
        }),
        expect.objectContaining({
          input: '这个月营业额是多少',
          persona: 'finance',
          expectedSkill: 'finance.profit.risk',
        }),
        expect.objectContaining({
          input: '帮我看看',
          persona: 'edge',
          expectedIntentType: 'clarify',
          expectedBrainStatus: 'clarify',
          expectedPlanShape: undefined,
        }),
      ]),
    );
    expect(
      p0Cases.find((item) => item.id === 'qb-edge-context-inherit-011')?.conversationTurns?.map((turn) => turn.input),
    ).toEqual(['帮我查一下客户马美琳，手机号后四位6325的信息。', '她上次来是什么项目？']);
    expect(p0Cases.find((item) => item.id === 'qb-edge-context-inherit-018')?.conversationTurns).toHaveLength(3);
    expect(p0Cases.find((item) => item.id === 'qb-edge-context-inherit-012')?.conversationTurns?.[1]).toMatchObject({
      expectedPlanShape: undefined,
      expectedDecisionCodes: ['empty_customer_set_vip_count_zero'],
    });
    expect(p0Cases.find((item) => item.id === 'qb-edge-context-inherit-015')?.conversationTurns?.[1]).toMatchObject({
      systemSupportStatus: 'system_unsupported',
      expectedPlanShape: undefined,
    });
    expect(p0Cases.find((item) => item.id === 'qb-edge-context-inherit-016')?.conversationTurns?.[1]).toMatchObject({
      systemSupportStatus: 'system_unsupported',
      expectedPlanShape: undefined,
    });
    expect(p0Cases.find((item) => item.id === 'qb-edge-context-inherit-017')?.conversationTurns?.[1]).toMatchObject({
      expectedPlanShape: undefined,
      expectedDecisionCodes: ['expiring_inventory_empty_no_campaign_needed'],
    });
    expect(p0Cases.find((item) => item.id === 'qb-edge-context-inherit-019')?.conversationTurns?.[1]).toMatchObject({
      expectedAnswerShape: 'clarification',
      expectedBrainStatus: 'clarify',
      expectedPlanShape: undefined,
    });
    expect(
      p0Cases.find((item) => item.id === 'qb-edge-correction-031')?.conversationTurns?.map((turn) => turn.input),
    ).toEqual(['这个月营业额是多少', '不对，我问的是上个月不是这个月']);
    expect(p0Cases.find((item) => item.id === 'qb-edge-correction-033')?.conversationTurns?.[0]).toMatchObject({
      input: '本月商品销售排行',
      expectedSemanticIntent: 'ranking',
      expectedMetrics: ['product_sales_amount'],
    });
    expect(
      p0Cases.flatMap((item) => item.conversationTurns ?? []).some((turn) => turn.input.includes('（然后）')),
    ).toBe(false);
  });

  it('can convert P0 question bank cases into existing AgentEvalCaseDefinition shape', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const evalCases = toAgentEvalCaseDefinitions(selectP0QuestionBankCases(bank.questions));

    expect(evalCases).toHaveLength(120);
    expect(evalCases[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^qb-/),
        scenario: expect.stringContaining('问题库：'),
        input: expect.any(String),
        role: expect.stringMatching(/manager|reception|beautician/),
      }),
    );
  });

  it('classifies every question by system support without dropping original cases', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const counts = countBy(bank.questions, 'systemSupportStatus');

    expect(bank.questions).toHaveLength(650);
    expect(bank.questions.every((item) => item.systemSupportStatus && item.systemSupportReason)).toBe(true);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(650);
    expect(counts.system_unsupported).toBeGreaterThan(0);
    expect(counts.system_supported_testable).toBeGreaterThan(0);
    expect(counts.system_supported_agent_gap).toBeGreaterThan(0);
    expect(bank.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input: '店里消防安全检查需要做吗',
          systemSupportStatus: 'system_unsupported',
        }),
        expect.objectContaining({
          input: '帮我写个朋友圈文案推一下我们的新项目',
          systemSupportStatus: 'system_supported_agent_gap',
        }),
        expect.objectContaining({
          input: '今天营业额到多少了',
          systemSupportStatus: 'system_supported_testable',
        }),
      ]),
    );
  });

  it('selects remaining supported questions by excluding unsupported and covered cases', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const annotated = annotateQuestionBankCoverage(bank.questions);
    const remaining = selectRemainingSupportedQuestionBankCases(bank.questions);

    expect(annotated).toHaveLength(650);
    expect(annotated.filter((item) => item.coverageStage === 'p0_daily')).toHaveLength(120);
    expect(annotated.some((item) => item.coverageStage === 'kiosk_e2e')).toBe(true);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.every((item) => item.systemSupportStatus !== 'system_unsupported')).toBe(true);
    expect(remaining.every((item) => item.coverageStage === 'not_run')).toBe(true);
    expect(
      selectRemainingSupportedQuestionBankCases(bank.questions, 'inventory').every(
        (item) => item.persona === 'inventory',
      ),
    ).toBe(true);
  });

  it('marks management and backend capability gaps as explicit system boundaries', () => {
    const bank = parseAgentEvalQuestionMarkdown(readQuestionBankMarkdown());
    const annotated = annotateQuestionBankCoverage(bank.questions);

    expect(annotated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'qb-inventory-purchase-suggestion-055',
          systemSupportStatus: 'system_unsupported',
        }),
        expect.objectContaining({
          id: 'qb-inventory-supply-coordination-092',
          systemSupportStatus: 'system_unsupported',
        }),
        expect.objectContaining({
          id: 'qb-finance-cost-margin-042',
          systemSupportStatus: 'system_unsupported',
        }),
        expect.objectContaining({
          id: 'qb-marketing-automation-touch-092',
          systemSupportStatus: 'system_unsupported',
        }),
      ]),
    );
  });
});

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = String(item[key]);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
