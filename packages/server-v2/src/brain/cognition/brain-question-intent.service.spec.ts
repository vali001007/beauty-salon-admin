import { BrainQuestionIntentService } from './brain-question-intent.service.js';

describe('BrainQuestionIntentService', () => {
  const service = new BrainQuestionIntentService();

  it('classifies draft requests before metric keywords', () => {
    expect(service.classify('写一条提醒客户预约空档的消息')).toMatchObject({
      intent: 'draft',
      expectedShape: 'non_metric',
      allowsScalarMetric: false,
    });
  });

  it('classifies recommendation requests before appointment keywords', () => {
    expect(service.classify('这次服务完推荐她预约哪个项目')).toMatchObject({
      intent: 'recommendation',
      expectedShape: 'non_metric',
      allowsScalarMetric: false,
    });
  });

  it('classifies best performer questions as ranking', () => {
    expect(service.classify('这个月谁的业绩最好')).toMatchObject({
      intent: 'ranking',
      expectedShape: 'ranking',
      allowsScalarMetric: false,
      expectedMetric: 'paid_revenue',
    });
  });

  it('classifies customer detail questions as list', () => {
    expect(service.classify('哪些客户消费了钱但很少用次卡')).toMatchObject({
      intent: 'list',
      expectedShape: 'list',
      allowsScalarMetric: false,
      expectedMetric: 'card_liability',
    });
  });

  it('allows direct scalar metric questions', () => {
    expect(service.classify('今天预约多少')).toMatchObject({
      intent: 'scalar_metric',
      expectedShape: 'scalar_metric',
      allowsScalarMetric: true,
      expectedMetric: 'appointment_count',
    });
  });

  it.each([
    ['这个月实收流水是多少', 'paid_revenue'],
    ['今天收了多少钱', 'paid_revenue'],
    ['这个月营业额是多少', 'paid_revenue'],
    ['今天营业额到多少了', 'paid_revenue'],
    ['本月复购率是多少', 'repurchase_rate'],
    ['这个月毛利率是多少', 'gross_margin_rate'],
    ['会员卡负债是多少', 'card_liability'],
    ['临期库存金额是多少', 'expiring_stock_value'],
  ])('allows direct scalar metric question: %s', (question, expectedMetric) => {
    expect(service.classify(question)).toMatchObject({
      intent: 'scalar_metric',
      expectedShape: 'scalar_metric',
      allowsScalarMetric: true,
      expectedMetric,
    });
  });

  it('does not treat customer profile questions as appointment count', () => {
    expect(service.classify('帮我看一下今天到店客人的画像，主要是什么年龄段')).toMatchObject({
      intent: 'diagnosis',
      expectedShape: 'non_metric',
      allowsScalarMetric: false,
    });
  });

  it('does not treat staff schedule availability questions as appointment count', () => {
    expect(service.classify('各美容师今天的排班情况，有没有空档')).toMatchObject({
      intent: 'list',
      expectedShape: 'list',
      allowsScalarMetric: false,
    });
  });

  it('does not treat staff performance decline questions as scalar revenue', () => {
    expect(service.classify('有没有员工这周业绩明显下滑')).toMatchObject({
      intent: 'diagnosis',
      expectedShape: 'non_metric',
      allowsScalarMetric: false,
    });
  });

  it('does not treat prepaid card consumption and recharge as card liability', () => {
    expect(service.classify('今天储值卡消耗了多少，新充值了多少')).toMatchObject({
      intent: 'unknown',
      expectedShape: 'unknown',
      allowsScalarMetric: false,
    });
  });

  it.each([
    ['帮我策划一个母亲节的促销活动', 'recommendation'],
    ['过期的护肤品怎么处理，有没有规定', 'recommendation'],
    ['她问我护理后回家怎么保养，我怎么回答', 'recommendation'],
  ])('routes advisory skill questions before metric keywords: %s', (question, expectedIntent) => {
    expect(service.classify(question)).toMatchObject({
      intent: expectedIntent,
      expectedShape: 'non_metric',
      allowsScalarMetric: false,
    });
  });

  it('keeps reservation schedule questions as list intent', () => {
    expect(service.classify('今天所有的预约给我列一下')).toMatchObject({
      intent: 'list',
      expectedShape: 'list',
      allowsScalarMetric: false,
    });
  });

  it.each([
    '现在库存金额大概多少',
    '库存的周转率怎么样',
    '临期产品怎么处理比较好',
    '这个月活动花了多少钱，带来了多少收入',
    '帮我算一下如果打八折，毛利还剩多少',
    '帮我查一下这个客人有没有预约',
    '今天所有的预约给我列一下',
    '张美丽的预约是几点，做什么项目',
    '有没有快过期的产品，数量多少',
    '现在缺货最紧急的是什么',
    '这周预约爽约率高不高',
    '今天有没有超时服务影响了下一个预约',
    '有没有项目成本明显上涨影响毛利的',
    '今天下午还有几个预约没到',
    '现在几点了，下午还有几个预约',
    '这周哪天最忙，哪天还有空档',
    '有客人想改期，帮我看看明天有没有空档',
    '今天有预约的客人里有没有 VIP 需要特别准备',
    '有个客人临时来了没预约，现在还能安排吗',
    '今天有几个预约是做面部的，几个是身体的',
    '帮我提醒一下明天上午的所有预约客人',
    '今天有几笔是用储值卡消费的',
    '帮我查一下上周某天的收款记录',
    '今天第一笔收款是几点，是谁的',
    '我这个月业绩是多少',
    '我今天已经做了几个客人，收入多少',
    '我还需要做多少业绩才能完成本月目标',
    '帮我看一下库存整体情况',
    '精华液现在库存还有多少',
    '帮我看一下所有低于安全库存的产品',
    '这个月次卡销售了多少金额',
    '这个月储值收款有多少',
    '这个月产品销售额是多少',
    '帮我统计一下这个月每个项目的收入占比',
    '帮我做一个本月的成本利润分析报告',
    '退款是退到原支付方式还是储值余额',
    '这个月有没有不正常的流水',
    '我要做一个非常复杂的活动，需要同时满足：拉新、促复购、清库存、提升客单价、增加员工收入',
  ])('blocks broad unsupported business requests from scalar metric fallback: %s', (question) => {
    const result = service.classify(question);

    expect(result.allowsScalarMetric).toBe(false);
  });
});
