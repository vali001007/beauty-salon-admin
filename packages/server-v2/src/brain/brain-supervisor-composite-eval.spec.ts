import { BrainOrchestratorService } from './orchestrator/brain-orchestrator.service.js';

describe('Brain Supervisor composite task evaluation gate', () => {
  const samples = [
    '为什么本周利润下降',
    '本周毛利下滑是什么原因',
    '收入下降了，帮我综合诊断',
    '业绩异常变差，看看问题在哪',
    '为什么这个月利润变差',
    '找出高流失客户并生成召回方案',
    '找出沉睡客户，给我一个召回方案',
    '高流失客户怎么跟进和召回',
    '好久没来的客户，找出并准备召回',
    '流失客户名单和后续跟进方案',
    '明天下午有空档，找合适客户并准备提醒',
    '今天下午有空位，找客户填空档并提醒',
    '明天上午空档怎么匹配客户预约',
    '找需要护理的客户填明天空档',
    '下午有空余，准备客户预约提醒',
    '临期库存如何促销',
    '快过期产品怎么做活动',
    '临期产品怎么卖又不伤毛利',
    '过期风险库存的促销处理方案',
    '快过期库存做什么促销活动',
  ];
  const orchestrator = new BrainOrchestratorService();
  const context = {
    userId: 9,
    storeId: 2,
    visibleStoreIds: [2],
    permissions: ['*'],
    deniedPermissions: [],
    requestId: 'req',
    timezone: 'Asia/Shanghai',
  };

  it.each(samples)('creates a traceable DAG for: %s', (message) => {
    const plan = orchestrator.createTaskPlan({
      message,
      runtimeIntent: {
        intent: /(利润|毛利|收入|业绩)/.test(message) ? 'diagnosis' : 'recommendation',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'composite_eval',
      },
      cognition: {
        normalizedText: message,
        terms: [],
        metrics: [],
        dimensions: [],
        entities: [],
        unsupportedTerms: [],
        intent: { key: 'general_assistant', confidence: 0.8, reason: 'composite_eval' },
        needsClarification: false,
      },
      context,
    });

    expect(plan).toBeDefined();
    expect(plan?.nodes.length).toBeGreaterThanOrEqual(4);
    expect(plan?.nodes.at(-1)).toMatchObject({ id: 'supervisor_summary', kind: 'summary' });
    expect(plan?.nodes.filter((node) => node.kind === 'adapter').every((node) => node.requiredPermissions.length > 0)).toBe(true);
  });
});
