import { BrainAnswerGraderService } from './brain-answer-grader.service.js';

describe('BrainAnswerGraderService', () => {
  const grader = new BrainAnswerGraderService();

  it('marks ranking questions answered by scalar metric as false positive', () => {
    const result = grader.grade({
      question: '这个月谁的业绩最好',
      answer: '实收流水为 19907.10 元。',
      citations: [{ sourceType: 'metric', sourceId: 'paid_revenue', label: '实收流水' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('false_positive_granularity_mismatch');
    expect(result.expectedShape).toBe('ranking');
    expect(result.actualShape).toBe('scalar_metric');
  });

  it('marks list questions answered by scalar metric as false positive', () => {
    const result = grader.grade({
      question: '哪些客户消费了钱但很少用次卡',
      answer: '次卡/储值负债为 1068699.14 元。',
      citations: [{ sourceType: 'metric', sourceId: 'card_liability', label: '次卡/储值负债' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('false_positive_granularity_mismatch');
    expect(result.expectedShape).toBe('list');
    expect(result.actualShape).toBe('scalar_metric');
  });

  it('marks comparison questions answered by single period metric as false positive', () => {
    const result = grader.grade({
      question: '这个月跟上个月比收入差多少',
      answer: '实收流水为 19907.10 元。',
      citations: [{ sourceType: 'metric', sourceId: 'paid_revenue', label: '实收流水' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('false_positive_granularity_mismatch');
    expect(result.expectedShape).toBe('comparison');
    expect(result.actualShape).toBe('scalar_metric');
  });

  it('marks draft requests answered by metric as false positive', () => {
    const result = grader.grade({
      question: '写一条提醒客户预约空档的消息',
      answer: '预约数为 384。',
      citations: [{ sourceType: 'metric', sourceId: 'appointment_count', label: '预约数' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('false_positive_intent_mismatch');
    expect(result.expectedIntent).toBe('draft');
    expect(result.actualIntent).toBe('metric_query');
  });

  it('never counts an explicit capability boundary answer as usable', () => {
    const result = grader.grade({
      question: '我们店里的 VIP 客户有多少个',
      answer: '当前客户事实能力尚未注册该业务口径，不会编造回答。',
      citations: [{ sourceType: 'db_skill', sourceId: 'capability_customer_facts', label: '客户事实查询' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('unsupported_intent');
  });

  it('classifies cashier and card-redemption interface requests as actions', () => {
    const result = grader.grade({
      question: '帮我打开核销界面，客人要用次卡',
      answer: '次卡核销预览：确认前不会执行核销。',
      citations: [{ sourceType: 'skill', sourceId: 'front_desk_action_preview', label: '前台动作预览' }],
      brainStatus: 'completed',
    });

    expect(result.expectedIntent).toBe('action');
  });

  it('keeps direct scalar metric answers usable', () => {
    const result = grader.grade({
      question: '今天预约多少',
      answer: '预约数为 3。',
      citations: [{ sourceType: 'metric', sourceId: 'appointment_count', label: '预约数' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('usable_exact');
    expect(result.expectedShape).toBe('scalar_metric');
    expect(result.actualShape).toBe('scalar_metric');
  });

  it('grades model-driven business definition KPI blocks as metric answers', () => {
    const result = grader.grade({
      question: '今天营业额到多少了',
      answer: '已完成经营任务，结构化结果见下方。',
      citations: [
        {
          sourceType: 'business_definition',
          sourceId: 'metric.paid_amount@4',
          label: '业务定义：实收金额',
        },
      ],
      blocks: [{ kind: 'kpi', items: [{ label: '指标：实收金额', value: '116377.31' }] }],
      expectedIntent: 'metric_query',
      expectedMetric: 'paid_amount',
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({
      status: 'usable_exact',
      actualMetric: 'paid_amount',
      actualShape: 'scalar_metric',
      groundingType: 'metric_query',
      legacyUsableWithCitation: true,
    });
  });

  it('uses structured ranking blocks instead of generic wrapper text', () => {
    const result = grader.grade({
      question: '本月商品销售排行',
      answer: '已完成经营任务，结构化结果见下方。',
      citations: [
        {
          sourceType: 'business_definition',
          sourceId: 'metric.product_sales_quantity@4',
          label: '业务定义：商品销售数量',
        },
      ],
      blocks: [{ kind: 'ranking', rows: [{ productName: '眼霜', productSalesQuantity: 14 }] }],
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({ status: 'usable_exact', actualIntent: 'ranking', actualShape: 'ranking' });
  });

  it('distinguishes product sales amount from whole-store paid revenue', () => {
    const result = grader.grade({
      question: '这个月产品销售额是多少',
      answer: '本月商品销售额 3580.00 元。',
      citations: [{ sourceType: 'business_definition', sourceId: 'metric.product_sales_amount@1', label: '业务定义：商品销售额' }],
      blocks: [{ kind: 'kpi', items: [{ label: '商品销售额', value: '3580.00 元' }] }],
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({
      status: 'usable_exact',
      expectedMetric: 'product_sales_amount',
      actualMetric: 'product_sales_amount',
      actualShape: 'scalar_metric',
    });
  });

  it('grades inventory consumption rankings against the governed outbound metric', () => {
    const result = grader.grade({
      question: '哪些耗材消耗速度最快',
      answer: '消耗量最高的是美容棉片，共出库 30 件。',
      citations: [{ sourceType: 'business_definition', sourceId: 'metric.inventory_consumption_quantity@1', label: '业务定义：库存消耗量' }],
      blocks: [{ kind: 'ranking', rows: [{ productName: '美容棉片', value: 30 }] }],
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({
      status: 'usable_exact',
      expectedMetric: 'inventory_consumption_quantity',
      actualMetric: 'inventory_consumption_quantity',
      actualShape: 'ranking',
    });
  });

  it('keeps a metric-grounded diagnosis classified as diagnosis', () => {
    const result = grader.grade({
      question: '最近新客转化效果好不好，问题出在哪',
      answer: '新增客户 11 人，已转化 0 人。当前缺少未转化原因归因事实。',
      citations: [{ sourceType: 'business_definition', sourceId: 'metric.new_customer_conversion_rate@1', label: '业务定义：新客转化率' }],
      blocks: [
        { kind: 'kpi', items: [{ label: '转化率', value: '0.0%' }] },
        { kind: 'diagnosis', findings: [{ title: '归因边界', detail: '缺少未转化原因事实', severity: 'info' }] },
      ],
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({
      status: 'usable_exact',
      expectedIntent: 'diagnosis',
      actualIntent: 'diagnosis',
      expectedShape: 'non_metric',
      actualShape: 'non_metric',
    });
  });

  it('keeps a metric-backed staff ranking as ranking instead of scalar metric intent', () => {
    const result = grader.grade({
      question: '谁的客户复购率最高',
      answer: '本月客户复购率最高的是沈晴，复购率 35.0%。',
      citations: [
        { sourceType: 'business_definition', sourceId: 'metric.staff_customer_repurchase_rate@1', label: '业务定义：员工客户复购率' },
        { sourceType: 'db_skill', sourceId: 'manager_staff_analysis', label: '员工客户复购分析' },
      ],
      blocks: [{ kind: 'ranking', rows: [{ staff: '沈晴', customerRepurchaseRate: 0.35 }] }],
      expectedIntent: 'ranking',
      expectedMetric: 'staff_customer_repurchase_rate',
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({
      status: 'usable_exact',
      actualIntent: 'ranking',
      actualShape: 'ranking',
      actualMetric: 'staff_customer_repurchase_rate',
    });
  });

  it('keeps gross margin rate answers usable when the question asks for rate', () => {
    const result = grader.grade({
      question: '这个月的毛利率是多少',
      answer: '毛利率为 56.9%。',
      citations: [{ sourceType: 'metric', sourceId: 'gross_margin_rate', label: '毛利率' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('usable_exact');
    expect(result.expectedMetric).toBe('gross_margin_rate');
  });

  it('keeps draft skill answers usable without metric citations', () => {
    const result = grader.grade({
      question: '写一条提醒客户预约空档的消息',
      answer: '您好，店里近期有可预约空档，方便的话可以回复我帮您安排。',
      citations: [{ sourceType: 'skill', sourceId: 'marketing_draft_appointment_reminder', label: '预约提醒文案' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('usable_exact');
    expect(result.expectedIntent).toBe('draft');
    expect(result.actualIntent).toBe('draft');
    expect(result.groundingType).toBe('template_skill');
  });

  it('does not count template skills as usable for fact diagnosis questions', () => {
    const result = grader.grade({
      question: '今天退款有几笔，金额多少，有没有风险',
      answer: '活动方案：\n1. 目标客群：老客。\n2. 权益：护理套餐加赠。',
      citations: [{ sourceType: 'skill', sourceId: 'marketing_campaign_plan', label: '营销活动方案' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('false_positive_intent_mismatch');
    expect(result.groundingType).toBe('template_skill');
    expect(result.reason).toContain('事实数据');
  });

  it('counts VIP exclusive campaign planning as recommendation instead of customer list', () => {
    const result = grader.grade({
      question: '帮我做一个针对 VIP 客户的专属活动',
      answer: '门店促销活动方案：\n1. 目标客群：优先触达近 90 天有消费记录的老客和会员。',
      citations: [{ sourceType: 'skill', sourceId: 'marketing_campaign_plan', label: '营销活动方案' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('usable_exact');
    expect(result.expectedIntent).toBe('recommendation');
    expect(result.groundingType).toBe('template_skill');
  });

  it('classifies metric, db skill and preview action grounding separately', () => {
    expect(
      grader.grade({
        question: '今天预约多少',
        answer: '预约数为 3。',
        citations: [{ sourceType: 'metric', sourceId: 'appointment_count', label: '预约数' }],
        brainStatus: 'completed',
      }).groundingType,
    ).toBe('metric_query');

    expect(
      grader.grade({
        question: '今天所有的预约给我列一下',
        answer: '预约清单：\n1. 10:00 李女士 - 补水护理',
        citations: [{ sourceType: 'skill', sourceId: 'reception_reservation_schedule', label: '前台预约清单' }],
        brainStatus: 'completed',
      }).groundingType,
    ).toBe('db_skill');

    expect(
      grader.grade({
        question: '帮我给客户改约到明天下午',
        answer: '客户预约动作预览：确认前不会写入预约。',
        citations: [{ sourceType: 'skill', sourceId: 'reception_action_preview', label: '前台动作预览' }],
        brainStatus: 'completed',
      }).groundingType,
    ).toBe('preview_action');
  });

  it('accepts runtime-native db_skill citations as grounded list answers', () => {
    const result = grader.grade({
      question: '今天所有的预约给我列一下',
      answer: '预约清单：共 0 个。',
      citations: [{ sourceType: 'db_skill', sourceId: 'capability_reservation_list', label: '门店预约清单' }],
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({
      status: 'usable_exact',
      groundingType: 'db_skill',
      expectedShape: 'list',
      actualShape: 'list',
    });
  });

  it('keeps list skill answers usable when the answer has list granularity', () => {
    const result = grader.grade({
      question: '现在哪些产品库存不够了',
      answer: '低库存产品：\n1. 补水面膜：当前 2，安全库存 5。',
      citations: [{ sourceType: 'skill', sourceId: 'inventory_risk_summary', label: '库存风险摘要' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('usable_exact');
    expect(result.expectedShape).toBe('list');
    expect(result.actualShape).toBe('list');
    expect(result.groundingType).toBe('db_skill');
  });

  it('classifies deep domain analysis citations as database-grounded skills', () => {
    const result = grader.grade({
      question: '今天来了几个客人，现在还有几个在店',
      answer:
        '今天经营分析：实收 0.00 元，0 单，客单价 0.00 元，到店客户 0 人、当前在店 0 人，新客 0 人、老客 0 人。',
      citations: [{ sourceType: 'skill', sourceId: 'store_manager_operations_analysis', label: '店长经营分析' }],
      brainStatus: 'completed',
    });

    expect(result.groundingType).toBe('db_skill');
  });

  it.each(['store_manager_staff_analysis', 'inventory_procurement_analysis', 'finance_cost_liability_analysis', 'front_desk_catalog_snapshot'])(
    'classifies new real-data domain skill %s as database grounded',
    (sourceId) => {
      const result = grader.grade({
        question: '给我看一下明细',
        answer: '业务明细：\n1. 当前记录 1 条。',
        citations: [{ sourceType: 'skill', sourceId, label: '真实业务分析' }],
        brainStatus: 'completed',
      });
      expect(result.groundingType).toBe('db_skill');
    },
  );

  it('classifies all persisted preview skills as preview actions', () => {
    const result = grader.grade({
      question: '帮我设置一个新客自动跟进规则',
      answer: '规则预览，确认前不会启用。',
      citations: [{ sourceType: 'skill', sourceId: 'marketing_automation_rule_preview', label: '规则预览' }],
      brainStatus: 'completed',
    });
    expect(result.groundingType).toBe('preview_action');
  });

  it('keeps a multi-fact operations answer as list even when it contains ranking sections', () => {
    const result = grader.grade({
      question: '今天来了几个客人，现在还有几个在店',
      answer:
        '今天经营分析：实收 0.00 元，0 单，客单价 0.00 元，到店客户 0 人、当前在店 0 人，新客 0 人、老客 0 人。\n项目排行：暂无项目数据。\n员工服务量：暂无员工服务数据。',
      citations: [{ sourceType: 'skill', sourceId: 'store_manager_operations_analysis', label: '店长经营分析' }],
      brainStatus: 'completed',
    });

    expect(result.expectedShape).toBe('list');
    expect(result.actualShape).toBe('list');
    expect(result.status).toBe('usable_exact');
  });

  it('treats successful exact customer lookup as a non-metric answer', () => {
    const result = grader.grade({
      question: '有个客人说她叫李梅，手机尾号3256，帮我找一下',
      answer: '客户：李梅，手机 ***3256，会员等级 金卡会员。',
      citations: [{ sourceType: 'skill', sourceId: 'front_desk_customer_exact_lookup', label: '前台客户精确查询' }],
      brainStatus: 'completed',
    });

    expect(result.expectedShape).toBe('non_metric');
    expect(result.status).toBe('usable_exact');
  });

  it('classifies an exact customer miss as not found instead of a false positive', () => {
    const result = grader.grade({
      question: '帮我查一下张雯，她上次来是什么时候',
      answer: '当前门店没有找到匹配客户，请核对姓名或手机号后四位。',
      citations: [{ sourceType: 'skill', sourceId: 'front_desk_customer_exact_lookup', label: '前台客户精确查询' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('not_found');
  });

  it('classifies missing customer identity as an unsupported clarification', () => {
    const result = grader.grade({
      question: '这个客人有没有在我们店消费过',
      answer: '请提供客户姓名或手机号后四位，我才能在当前门店范围内精确查询；不会根据“这个客人”猜测身份。',
      citations: [{ sourceType: 'skill', sourceId: 'front_desk_customer_exact_lookup', label: '前台客户精确查询' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('unsupported_intent');
  });

  it('recognizes pending-arrival customer searches as list questions', () => {
    const result = grader.grade({
      question: '帮我搜一下今天预约了但还没来的客人',
      answer: '待到店名单：\n当前没有待到店客户。',
      citations: [{ sourceType: 'skill', sourceId: 'front_desk_operations_snapshot', label: '前台现场运营快照' }],
      brainStatus: 'completed',
    });

    expect(result.expectedShape).toBe('list');
    expect(result.status).toBe('usable_exact');
  });

  it('grades explicitly split payment-method amounts as a list instead of a scalar total', () => {
    const result = grader.grade({
      question: '今天现金收了多少，微信支付宝各多少',
      answer: '排行：\n1. 支付方式=现金，金额=0.00，笔数=0\n2. 支付方式=微信，金额=0.00，笔数=0\n3. 支付方式=支付宝，金额=0.00，笔数=0',
      blocks: [{ kind: 'ranking', rows: [{ paymentMethod: '现金', amount: 0 }] }],
      citations: [{ sourceType: 'db_skill', sourceId: 'capability_finance_payment_breakdown', label: '财务支付方式拆分' }],
      brainStatus: 'completed',
    });

    expect(result.expectedIntent).toBe('list');
    expect(result.expectedShape).toBe('list');
    expect(result.actualShape).toBe('ranking');
    expect(result.status).toBe('usable_exact');
  });

  it('counts a database-backed domain skill with the requested scalar as partially usable', () => {
    const result = grader.grade({
      question: '我这个月业绩是多少',
      answer: '本月个人服务分析：关联业绩 1800.00 元，提成 180.00 元，完成 3 单。',
      citations: [{ sourceType: 'skill', sourceId: 'beautician_personal_performance', label: '美容师个人服务与提成分析' }],
      brainStatus: 'completed',
    });

    expect(result.expectedShape).toBe('scalar_metric');
    expect(result.groundingType).toBe('db_skill');
    expect(result.status).toBe('usable_partial');
  });

  it('treats a structured clarification as an exact supported outcome without citations', () => {
    const result = grader.grade({
      question: '帮我看看这个',
      answer: '请明确你要查看的业务对象。',
      blocks: [{ kind: 'clarification', question: '请明确你要查看的业务对象。', options: [] }],
      citations: [],
      expectedIntent: 'clarify',
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({
      status: 'usable_exact',
      expectedIntent: 'clarify',
      actualIntent: 'clarify',
      expectedShape: 'clarification',
      actualShape: 'clarification',
      groundingType: 'none',
    });
  });

  it('accepts a scalar database skill as exact when it cites the governed metric definition', () => {
    const result = grader.grade({
      question: '这个月店里实际收了多少钱',
      answer: '本月实收合计：28756.30 元。',
      blocks: [{ kind: 'kpi', items: [{ label: '本月实收合计', value: '28756.30 元' }] }],
      citations: [
        { sourceType: 'db_skill', sourceId: 'capability_finance_payment_breakdown', label: '财务支付方式拆分' },
        { sourceType: 'business_definition', sourceId: 'metric.paid_amount@8', label: '业务定义：实收金额' },
      ],
      brainStatus: 'completed',
    });

    expect(result.expectedShape).toBe('scalar_metric');
    expect(result.actualShape).toBe('scalar_metric');
    expect(result.actualMetric).toBe('paid_amount');
    expect(result.groundingType).toBe('db_skill');
    expect(result.status).toBe('usable_exact');
  });

  it('counts member balance flow KPIs as a database-backed scalar answer', () => {
    const result = grader.grade({
      question: '今天储值卡消耗了多少，新充值了多少',
      answer: '储值消耗：200.00 元；新充值入账：1200.00 元。',
      blocks: [{ kind: 'kpi', items: [{ label: '储值消耗', value: '200.00 元' }] }],
      citations: [{ sourceType: 'db_skill', sourceId: 'capability_member_balance_flow_summary', label: '会员储值充值与消耗流水' }],
      brainStatus: 'completed',
    });

    expect(result.expectedShape).toBe('scalar_metric');
    expect(result.status).toBe('usable_partial');
  });

  it('grades structured dormant-customer reactivation evidence as usable', () => {
    const result = grader.grade({
      question: '哪些沉睡客户最近有点被唤醒的迹象',
      answer: '最近发现 1 位沉睡客户出现唤醒迹象，赵女士已预约并实际到店。',
      citations: [
        { sourceType: 'business_definition', sourceId: 'metric.dormant_reactivation_customer_count@1', label: '沉睡客户唤醒迹象人数' },
        { sourceType: 'db_skill', sourceId: 'dormant_customer_reactivation_evidence', label: '营销触达与到店消费证据' },
      ],
      brainStatus: 'completed',
      blocks: [{
        kind: 'table',
        columns: ['customerName', 'signalSummary'],
        rows: [{ customerName: '赵女士', signalSummary: '新建有效预约、实际到店' }],
      }],
    });

    expect(result.status).toBe('usable_exact');
  });

  it('distinguishes product margin ranking from whole-store gross margin', () => {
    const result = grader.grade({
      question: '哪些产品毛利率最高',
      answer: '商品毛利率最高的是眼霜，毛利率 60.0%。',
      citations: [{ sourceType: 'business_definition', sourceId: 'metric.product_gross_margin_rate@1', label: '业务定义：商品毛利率' }],
      blocks: [{ kind: 'ranking', rows: [{ productName: '眼霜', grossMarginRate: '60.0%' }] }],
      brainStatus: 'completed',
    });

    expect(result).toMatchObject({ status: 'usable_exact', expectedMetric: 'product_gross_margin_rate', actualMetric: 'product_gross_margin_rate', actualShape: 'ranking' });
  });

  it('does not count a configured-target miss as a partial scalar answer', () => {
    const result = grader.grade({
      question: '这个月目标完成率多少了，还差多远',
      answer: '本月尚未配置经营目标。请先录入收入、预约和新客目标，Ami Brain 不会自行编造目标值。',
      citations: [{ sourceType: 'skill', sourceId: 'store_operating_target', label: '门店经营目标配置' }],
      brainStatus: 'completed',
    });

    expect(result.status).not.toBe('usable_partial');
  });

  it('grades recall contact priority against the governed follow-up priority metric', () => {
    const result = grader.grade({
      question: '我想做个召回活动，哪些客户最值得联系',
      answer: '优先联系客户：\n1. 李女士，评分 100。',
      citations: [{ sourceType: 'business_definition', sourceId: 'metric.follow_up_priority_score@3', label: '客户跟进优先级评分' }],
      brainStatus: 'completed',
    });

    expect(result.expectedMetric).toBe('follow_up_priority_score');
    expect(result.actualMetric).toBe('follow_up_priority_score');
    expect(result.status).toBe('usable_exact');
  });

  it.each([
    ['今天收了多少钱', 'metric_query'],
    ['这个月营业额是多少', 'metric_query'],
    ['帮我看一下库存整体情况', 'diagnosis'],
    ['帮我找一下办了卡但还没预约的新客', 'list'],
  ])('detects business intent for %s', (question, expectedIntent) => {
    const sourceId = expectedIntent === 'metric_query' ? 'paid_revenue' : 'inventory_detail_analysis';
    const sourceType = expectedIntent === 'metric_query' ? 'metric' : 'skill';
    const result = grader.grade({
      question,
      answer: expectedIntent === 'metric_query' ? '实收流水为 100.00 元。' : '明细：\n1. 当前没有命中记录。',
      citations: [{ sourceType, sourceId, label: '测试引用' }],
      brainStatus: 'completed',
    });

    expect(result.expectedIntent).toBe(expectedIntent);
  });

  it.each([
    [
      '有没有什么产品只剩最后几瓶了',
      '低库存产品：\n1. 补水面膜：当前 2，安全库存 5。',
      'inventory_risk_summary',
      'list',
    ],
    [
      '这批快过期的产品怎么处理最合适',
      '临期产品处理建议：\n1. 先下架复核批次和有效期。\n2. 可用产品优先安排合规消耗。',
      'inventory_disposal_advice',
      'non_metric',
    ],
    [
      '我今天第一个客人几点来',
      '今日服务安排：共 1 个客人。\n1. 2026-07-10 10:00 李女士 - 补水护理',
      'beautician_service_summary',
      'list',
    ],
    [
      '她问我护理后回家怎么保养，我怎么回答',
      '护理后居家建议：24 小时内避免刺激性护肤，7 天内回访观察反馈。',
      'beautician_follow_up_advice',
      'non_metric',
    ],
    [
      '帮我策划一个母亲节的促销活动',
      '活动方案：\n1. 目标客群：老客和会员。\n2. 权益：护理套餐加赠。',
      'marketing_campaign_plan',
      'non_metric',
    ],
    [
      '最近销售下滑，有什么活动可以拉动一下',
      '活动方案：\n1. 目标客群：流失风险客户。\n2. 节奏：先小范围试发。',
      'marketing_campaign_plan',
      'non_metric',
    ],
    [
      '今天所有的预约给我列一下',
      '预约清单：\n1. 10:00 李女士 - 补水护理',
      'reception_reservation_schedule',
      'list',
    ],
  ])('keeps role skill granularity usable: %s', (question, answer, sourceId, expectedShape) => {
    const result = grader.grade({
      question,
      answer,
      citations: [{ sourceType: 'skill', sourceId, label: '角色技能' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('usable_exact');
    expect(result.expectedShape).toBe(expectedShape);
  });

  it('does not count skill answers as usable for direct scalar metric questions', () => {
    const result = grader.grade({
      question: '今天预约多少',
      answer: '今日经营概览：预约 3 个。',
      citations: [{ sourceType: 'skill', sourceId: 'manager_daily_overview', label: '店长经营概览' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('false_positive_granularity_mismatch');
    expect(result.expectedShape).toBe('scalar_metric');
  });

  it.each([
    [
      '这周预约爽约率高不高',
      '本周有效预约 10 个，已到店 7 个，爽约 1 个；到店率 70.0%，爽约率 10.0%。',
      'front_desk_operations_snapshot',
      'diagnosis',
      'non_metric',
    ],
    [
      '今天有没有超时服务影响了下一个预约',
      '今天发现 1 个超时服务影响后续预约：\n1. 王美容师 14:00 的护理实际延迟到 15:20，影响 15:00 的下一预约。',
      'front_desk_service_overrun_analysis',
      'diagnosis',
      'non_metric',
    ],
    [
      '帮我看一下今天所有到店客人的基本信息',
      '今日到店客户：\n1. 李女士 - 10:00 补水护理，已到店。',
      'front_desk_operations_snapshot',
      'list',
      'list',
    ],
    [
      '今天有没有可能爽约的预约需要提前联系',
      '待确认/高风险预约：\n1. 14:00 李女士 - 补水护理，尚未确认，建议提前联系。',
      'front_desk_no_show_risk_list',
      'list',
      'list',
    ],
    [
      '帮我看一下今天赵美容师的预约安排',
      '赵美容师预约清单：\n1. 10:00 李女士 - 补水护理。',
      'front_desk_reservation_schedule',
      'list',
      'list',
    ],
    [
      '有个客人临时来了没预约，现在还能安排吗',
      '临时到店安排建议：当前有 1 名美容师可接新单，1 张床位未占用，可以先确认项目时长后安排。',
      'front_desk_walk_in_availability',
      'recommendation',
      'non_metric',
    ],
    [
      '今天有没有需要特别准备物品的预约',
      '预约准备清单：\n1. 10:00 李女士 - 补水护理：准备舒缓产品。',
      'front_desk_reservation_schedule',
      'list',
      'list',
    ],
    [
      '帮我看一下这周的预约密度，哪里有空位',
      '预约密度排行：\n1. 2026-07-11：3 个。\n空位：2026-07-12 预约 0 个。',
      'front_desk_reservation_schedule',
      'list',
      'list',
    ],
    [
      '帮我统计一下今天的到店率，爽约了几个',
      '今天有效预约 10 个，已到店 7 个，爽约 1 个；到店率 70.0%，爽约率 10.0%。',
      'front_desk_operations_snapshot',
      'diagnosis',
      'non_metric',
    ],
    [
      '帮我算一下如果打八折，毛利还剩多少',
      '本月当前毛利率 60.0%。按成本不变模拟，打 8 折后毛利率约 50.0%。',
      'finance_discount_margin_simulation',
      'recommendation',
      'non_metric',
    ],
  ])(
    'matches adversarial business intent and granularity: %s',
    (question, answer, sourceId, expectedIntent, expectedShape) => {
      const result = grader.grade({
        question,
        answer,
        citations: [{ sourceType: 'skill', sourceId, label: '真实业务技能' }],
        brainStatus: 'completed',
      });

      expect(result.expectedIntent).toBe(expectedIntent);
      expect(result.expectedShape).toBe(expectedShape);
      expect(result.status).toBe('usable_exact');
    },
  );

  it('treats an appointment date correction as a list request', () => {
    const result = grader.grade({
      question: '不是今天的预约，是明天的',
      answer: '预约清单：共 1 个。\n1. 10:00 李女士 - 补水护理',
      citations: [{ sourceType: 'skill', sourceId: 'front_desk_reservation_schedule', label: '预约清单' }],
      brainStatus: 'completed',
    });

    expect(result.expectedIntent).toBe('list');
    expect(result.status).toBe('usable_exact');
  });

  it.each([
    [
      '今天店里情况怎么样，给我来个总结',
      '今日经营概览：实收流水 1200.00 元，预约 6 个，活跃客户 4 人。',
      'manager_daily_overview',
    ],
    [
      '今天退款有几笔，金额多少',
      '财务风险摘要：退款 2 笔，金额 200.00 元；优惠 50.00 元。',
      'finance_risk_summary',
    ],
    [
      '我今天有几个客人，分别几点',
      '今日服务安排：共 1 个客人。\n1. 2026-07-10 10:00 李女士 - 补水护理',
      'beautician_service_summary',
    ],
  ])('keeps role skill answer usable: %s', (question, answer, sourceId) => {
    const result = grader.grade({
      question,
      answer,
      citations: [{ sourceType: 'skill', sourceId, label: '角色技能' }],
      brainStatus: 'completed',
    });

    expect(result.status).toBe('usable_exact');
  });
});
