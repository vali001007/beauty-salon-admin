import { BrainRoleIntentRouterService } from './brain-role-intent-router.service.js';

describe('BrainRoleIntentRouterService', () => {
  const router = new BrainRoleIntentRouterService();

  it('routes draft questions with appointment keywords to marketing adapter, not scalar metrics', () => {
    const plan = router.route({
      message: '写一条提醒客户预约空档的消息',
      roleHint: 'marketing',
      runtimeIntent: {
        intent: 'draft',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'draft_request_before_metric_keyword',
      },
    });

    expect(plan).toMatchObject({
      role: 'marketing',
      domain: 'marketing_growth',
      intent: 'draft',
      answerShape: 'non_metric',
      adapterKey: 'marketing_growth',
      grounding: 'template_skill',
    });
    expect(plan.expectedMetric).toBeUndefined();
  });

  it('requires analytics permission for customer prediction queries instead of marketing write permission', () => {
    const plan = router.route({
      message: '预测张女士的流失风险和复购概率',
      roleHint: 'marketing',
      runtimeIntent: {
        intent: 'diagnosis',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'prediction_snapshot_query',
      },
    });

    expect(plan.adapterKey).toBe('marketing_growth');
    expect(plan.requiredPermissions).toEqual(['core:marketing:analytics']);
  });

  it('routes staff busy and free questions to the reception domain adapter', () => {
    const plan = router.route({
      message: '现在店里哪些美容师在忙，哪些空着',
      roleHint: 'store_manager',
      runtimeIntent: {
        intent: 'list',
        expectedShape: 'list',
        allowsScalarMetric: false,
        reason: 'staff_schedule_requires_schedule_list',
      },
    });

    expect(plan).toMatchObject({
      role: 'receptionist',
      domain: 'front_desk',
      intent: 'list',
      answerShape: 'list',
      adapterKey: 'front_desk',
      requiredPermissions: ['core:store:reservations'],
    });
  });

  it('routes six role hints to explicit domain adapters', () => {
    const samples = [
      ['store_manager', '今天店里情况怎么样，给我来个总结', 'store_manager'],
      ['receptionist', '今天所有的预约给我列一下', 'front_desk'],
      ['marketing', '帮我策划一个母亲节的促销活动', 'marketing_growth'],
      ['beautician', '下一个客人有什么注意事项', 'beautician_service'],
      ['inventory', '现在哪些产品库存不够了', 'inventory_procurement'],
      ['finance', '今天退款有几笔，金额多少', 'finance_risk'],
    ] as const;

    for (const [roleHint, message, adapterKey] of samples) {
      const plan = router.route({
        message,
        roleHint,
        runtimeIntent: {
          intent: 'diagnosis',
          expectedShape: 'non_metric',
          allowsScalarMetric: false,
          reason: 'test',
        },
      });
      expect(plan.adapterKey).toBe(adapterKey);
      expect(plan.unsupportedReason).toBeUndefined();
    }
  });

  it('does not route unknown scalar-like questions to broad role adapters', () => {
    const plan = router.route({
      message: '帮我看一下客户满意度整体情况',
      roleHint: 'store_manager',
      runtimeIntent: {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'no_supported_question_intent_detected',
        unsupportedAnswer: '当前问题尚未接入真实口径。',
      },
    });

    expect(plan.adapterKey).toBeUndefined();
    expect(plan.unsupportedReason).toContain('当前问题尚未接入真实口径');
  });

  it('keeps paid revenue comparison on semantic metric fallback', () => {
    const plan = router.route({
      message: '今天和昨天比营业额差多少',
      roleHint: 'store_manager',
      runtimeIntent: {
        intent: 'comparison',
        expectedShape: 'comparison',
        allowsScalarMetric: false,
        expectedMetric: 'paid_revenue',
        reason: 'comparison_question_requires_comparison_shape',
      },
    });

    expect(plan.adapterKey).toBeUndefined();
    expect(plan.domain).toBe('semantic_metric');
  });

  it('routes marketing fact questions to marketing adapter with db grounding', () => {
    const samples = ['今天有没有重要客户来店，需要特别关注的', '有没有客户对优惠很敏感，老是等打折才来', '最近哪个时间段新客最多，从哪些渠道来'];

    for (const message of samples) {
      const plan = router.route({
        message,
        roleHint: 'marketing',
        runtimeIntent: {
          intent: 'diagnosis',
          expectedShape: 'non_metric',
          allowsScalarMetric: false,
          reason: 'marketing_fact_requires_adapter',
        },
      });

      expect(plan).toMatchObject({
        role: 'marketing',
        domain: 'marketing_growth',
        adapterKey: 'marketing_growth',
        grounding: 'db_skill',
      });
    }
  });

  it('routes beautician ranking questions to the manager staff analysis', () => {
    const plan = router.route({
      message: '哪个美容师接的客人最多',
      roleHint: 'store_manager',
      runtimeIntent: {
        intent: 'ranking',
        expectedShape: 'ranking',
        allowsScalarMetric: false,
        reason: 'ranking_question_requires_grouped_shape',
      },
    });

    expect(plan.adapterKey).toBe('store_manager');
    expect(plan.grounding).toBe('db_skill');
  });

  it('does not route complaint ranking to staff performance facts', () => {
    const plan = router.route({
      message: '哪个美容师的客诉最多，最近有没有',
      roleHint: 'store_manager',
      runtimeIntent: { intent: 'ranking', expectedShape: 'ranking', allowsScalarMetric: false, reason: 'ranking' },
    });
    expect(plan.adapterKey).toBeUndefined();
  });

  it('routes discount margin simulation to the finance domain skill', () => {
    const plan = router.route({
      message: '帮我算一下如果打八折，毛利还剩多少',
      roleHint: 'marketing',
      runtimeIntent: {
        intent: 'diagnosis',
        expectedShape: 'scalar_metric',
        allowsScalarMetric: false,
        reason: 'simulation_requires_missing_cost_context',
      },
    });

    expect(plan.adapterKey).toBe('finance_risk');
    expect(plan.requiredPermissions).toContain('core:finance:view');
  });

  it('does not route unsupported marketing attribution questions to campaign templates', () => {
    const samples = ['储值赠送方案定在什么比例客户更愿意储值', '哪个渠道带来的客户质量最好'];

    for (const message of samples) {
      const plan = router.route({
        message,
        roleHint: 'marketing',
        runtimeIntent: {
          intent: 'diagnosis',
          expectedShape: 'non_metric',
          allowsScalarMetric: false,
          reason: 'unsupported_marketing_detail',
        },
      });

      expect(plan.adapterKey).toBeUndefined();
      expect(plan.unsupportedReason).toContain('domain adapter');
    }
  });

  it.each([
    '帮我设置一个新客来店三天后自动跟进的流程',
    '帮我做一个疗程快结束时自动提醒续购的规则',
    '帮我设置一个活动后自动复盘效果的提醒',
    '帮我设置一个超过一定金额消费自动升级会员等级的规则',
  ])('routes marketing automation writes to preview actions: %s', (message) => {
    const plan = router.route({
      message,
      roleHint: 'marketing',
      runtimeIntent: { intent: 'unknown', expectedShape: 'unknown', allowsScalarMetric: false, reason: 'test' },
    });
    expect(plan.adapterKey).toBe('marketing_growth');
    expect(plan.intent).toBe('action');
    expect(plan.grounding).toBe('preview_action');
  });

  it('routes execution of an existing marketing strategy with update permission', () => {
    const plan = router.route({
      message: '执行自动触达策略沉睡客户唤醒',
      roleHint: 'store_manager',
      runtimeIntent: { intent: 'unknown', expectedShape: 'unknown', allowsScalarMetric: false, reason: 'test' },
    });

    expect(plan).toMatchObject({
      adapterKey: 'marketing_growth',
      intent: 'action',
      grounding: 'preview_action',
      reason: 'marketing_strategy_execute_preview',
      requiredPermissions: ['core:marketing:update'],
    });
  });

  it('does not turn customer-specific reception lookups into generic previews or finance summaries', () => {
    const supportedCustomerFacts = [
      '这个客人的储值余额还有多少',
      '她的皮肤有没有什么过敏或者特殊注意事项',
      '帮我找一下今天预约了但是要改期的客人',
      '我们店现在有没有空余的床位',
    ];
    for (const message of supportedCustomerFacts) {
      const plan = router.route({
        message,
        roleHint: 'receptionist',
        runtimeIntent: {
          intent: 'diagnosis',
          expectedShape: 'non_metric',
          allowsScalarMetric: false,
          reason: 'customer_specific_lookup',
        },
      });
      expect(plan.adapterKey).toBe('front_desk');
    }

    const samples = ['这个客人消费满多少可以升级会员'];

    for (const message of samples) {
      const plan = router.route({
        message,
        roleHint: 'receptionist',
        runtimeIntent: {
          intent: 'diagnosis',
          expectedShape: 'non_metric',
          allowsScalarMetric: false,
          reason: 'customer_specific_lookup_missing_entity',
        },
      });

      expect(plan.adapterKey).toBeUndefined();
      expect(plan.unsupportedReason).toContain('domain adapter');
    }

    for (const message of ['帮我打开收银界面，客人要结账了', '帮我打开核销界面，客人要用次卡']) {
      const plan = router.route({
        message,
        roleHint: 'receptionist',
        runtimeIntent: {
          intent: 'diagnosis',
          expectedShape: 'non_metric',
          allowsScalarMetric: false,
          reason: 'front_desk_controlled_action',
        },
      });
      expect(plan.adapterKey).toBe('front_desk');
    }

    const paymentPlan = router.route({
      message: '今天第一笔收款是几点，是谁的',
      roleHint: 'receptionist',
      runtimeIntent: {
        intent: 'diagnosis',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'finance_detail',
      },
    });
    expect(paymentPlan.adapterKey).toBe('finance_risk');
  });

  it('routes front desk service advice questions to reception adapter', () => {
    const plan = router.route({
      message: '有客人说要投诉，我应该怎么处理',
      roleHint: 'receptionist',
      runtimeIntent: {
        intent: 'recommendation',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'front_desk_service_advice',
      },
    });

    expect(plan).toMatchObject({
      role: 'receptionist',
      domain: 'front_desk',
      adapterKey: 'front_desk',
      grounding: 'template_skill',
    });
  });

  it.each([
    ['receptionist', '张美丽的预约是几点，做什么项目', 'front_desk'],
    ['receptionist', '现在几点了，下一个预约是谁，什么时候', 'front_desk'],
    ['receptionist', '客人等待时间太长，我能给她什么补偿或安抚', 'front_desk'],
    ['receptionist', '客人要买产品带走，我们现在有什么产品可以卖', 'inventory_procurement'],
  ])('routes reception scenarios to a real domain adapter: %s', (roleHint, message, adapterKey) => {
    const plan = router.route({
      message,
      roleHint,
      runtimeIntent: { intent: 'unknown', expectedShape: 'unknown', allowsScalarMetric: false, reason: 'test' },
    });
    expect(plan.adapterKey).toBe(adapterKey);
  });

  it.each([
    ['store_manager', '现在库存金额大概多少', 'inventory_procurement'],
    ['receptionist', '今天有几笔是用储值卡消费的', 'finance_risk'],
    ['marketing', '帮我算一下如果打八折，毛利还剩多少', 'finance_risk'],
    ['store_manager', '帮我找一下三个月没来消费的客户', 'marketing_growth'],
  ])('routes explicit role questions to the real business domain: %s %s', (roleHint, message, adapterKey) => {
    const result = router.route({
      message,
      roleHint,
      runtimeIntent: {
        intent: 'unknown',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'unknown',
      },
    });

    expect(result.adapterKey).toBe(adapterKey);
    expect(result.requiredPermissions.length).toBeGreaterThan(0);
  });

  it('infers strong beautician schedule phrases even when runtime intent is unknown', () => {
    const plan = router.route({
      message: '下一个客人是谁，做什么项目',
      roleHint: 'beautician',
      runtimeIntent: {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'runtime_unknown',
      },
    });

    expect(plan).toMatchObject({
      role: 'beautician',
      domain: 'beautician_service',
      adapterKey: 'beautician_service',
      intent: 'list',
      answerShape: 'list',
    });
  });

  it('does not route unsupported beautician customer-record writes to generic advice', () => {
    const samples = ['帮我建一个跟进任务，提醒我两周后联系这个客人', '帮我查一下上次给这个客人做护理时记了什么', '这个客人今天对某个产品不满意，帮我记录一下'];

    for (const message of samples) {
      const plan = router.route({
        message,
        roleHint: 'beautician',
        runtimeIntent: {
          intent: 'unknown',
          expectedShape: 'unknown',
          allowsScalarMetric: false,
          reason: 'customer_record_missing_write_adapter',
        },
      });

      expect(plan.adapterKey).toBeUndefined();
      expect(plan.unsupportedReason).toContain('domain adapter');
    }
  });

  it('infers strong beautician advice phrases when runtime intent is unknown', () => {
    const plan = router.route({
      message: '她下次应该做什么，间隔多久比较合适',
      roleHint: 'beautician',
      runtimeIntent: {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'runtime_unknown',
      },
    });

    expect(plan).toMatchObject({
      role: 'beautician',
      domain: 'beautician_service',
      adapterKey: 'beautician_service',
      intent: 'recommendation',
      answerShape: 'non_metric',
    });
  });

  it('routes customer care and follow-up requests to the customer service adapter', () => {
    const carePlan = router.route({
      message: '写一条生日关怀话术',
      roleHint: 'customer_service',
      runtimeIntent: {
        intent: 'draft',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'draft_request',
      },
    });
    const actionPlan = router.route({
      message: '给这些客户创建跟进任务',
      roleHint: 'customer_service',
      runtimeIntent: {
        intent: 'unknown',
        expectedShape: 'unknown',
        allowsScalarMetric: false,
        reason: 'runtime_unknown',
      },
    });

    expect(carePlan).toMatchObject({
      role: 'customer_service',
      domain: 'customer_service',
      adapterKey: 'customer_service',
      requiredPermissions: ['core:customer:view'],
    });
    expect(actionPlan).toMatchObject({
      role: 'customer_service',
      adapterKey: 'customer_service',
      intent: 'action',
      grounding: 'preview_action',
    });
  });

  it.each([
    ['最近情况怎么样', 'recommendation', 'store_manager', 'store_manager'],
    ['有什么问题吗', 'unknown', 'store_manager', 'store_manager'],
    ['给我来一个报告', 'unknown', 'store_manager', 'store_manager'],
    ['帮我搞一下活动', 'unknown', 'store_manager', 'marketing_growth'],
    ['钱的事情', 'unknown', 'store_manager', 'finance_risk'],
    ['不是今天的预约，是明天的', 'unknown', 'store_manager', 'front_desk'],
    ['帮我把今年所有数据都分析一遍', 'unknown', 'store_manager', 'store_manager'],
    ['帮我设计一套完整的客户生命周期运营方案', 'recommendation', 'store_manager', 'marketing_growth'],
    ['帮我预测下个季度的营业额', 'unknown', 'store_manager', 'store_manager'],
  ])('routes supported broad edge request to a grounded adapter: %s', (message, intent, roleHint, adapterKey) => {
    const plan = router.route({
      message,
      roleHint,
      runtimeIntent: {
        intent: intent as 'unknown' | 'recommendation',
        expectedShape: 'non_metric',
        allowsScalarMetric: false,
        reason: 'edge_request',
      },
    });

    expect(plan.adapterKey).toBe(adapterKey);
    expect(plan.unsupportedReason).toBeUndefined();
  });

  it('does not parse a temporal correction as a customer name', () => {
    const plan = router.route({
      message: '不是今天的预约，是明天的',
      roleHint: 'store_manager',
      runtimeIntent: { intent: 'unknown', expectedShape: 'non_metric', allowsScalarMetric: false, reason: 'edge_correction' },
    });

    expect(plan).toMatchObject({
      adapterKey: 'front_desk',
      intent: 'list',
      reason: 'front_desk_reservation_time_correction',
    });
  });

  it('routes a beautician personal repeat-rate benchmark away from front desk', () => {
    const plan = router.route({
      message: '我的复购率在店里算高还是低',
      roleHint: 'beautician',
      runtimeIntent: {
        intent: 'list',
        expectedShape: 'list',
        allowsScalarMetric: false,
        expectedMetric: 'repurchase_rate',
        reason: 'personal_metric_benchmark',
      },
    });

    expect(plan.adapterKey).toBe('beautician_service');
    expect(plan.role).toBe('beautician');
  });
});
