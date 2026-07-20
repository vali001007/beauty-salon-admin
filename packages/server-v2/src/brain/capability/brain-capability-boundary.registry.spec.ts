import { matchBrainCapabilityBoundary } from './brain-capability-boundary.registry.js';

describe('matchBrainCapabilityBoundary', () => {
  it.each([
    ['我们的优惠券平均核销周期是多久', 'coupon_redemption_lifecycle_not_available'],
    ['有没有供应商可以接受临期产品退换货', 'supplier_expiry_return_policy_not_available'],
    ['帮我生成一份退款明细报告', 'refund_detail_report_not_connected'],
    ['帮我找45天没来的客户，然后给她们发一条召回消息', 'arbitrary_audience_send_not_connected'],
    ['我想在每次服务结束后自动发一条感谢消息', 'service_completion_auto_message_not_connected'],
    ['帮我算一下盈亏平衡点，每月至少要做多少收入', 'break_even_definition_not_available'],
    ['员工最近情绪不好影响服务，同时营业额也在下滑，有关系吗', 'staff_emotion_revenue_attribution_not_available'],
    ['平均每个客人消耗多少耗材', 'material_consumption_per_customer_not_connected'],
    ['帮我列出所有客户的消费明细', 'bulk_customer_consumption_export_not_connected'],
    ['这次护理发现客人有一处皮肤问题，怎么记录和处理', 'service_skin_change_record_not_available'],
    ['客人说想改变护理方案，我应该怎么和她沟通', 'active_customer_care_plan_change_context_not_connected'],
    ['帮我设置一个客户45天没来自动发提醒的规则', 'marketing_automation_rule_publish_not_open'],
    ['我想让系统自动给快过期次卡的客户发消息', 'marketing_automation_rule_publish_not_open'],
    ['能不能在客户生日当天自动送一个小礼物', 'marketing_automation_rule_publish_not_open'],
    ['帮我设置一个新客来店三天后自动跟进的流程', 'marketing_automation_rule_publish_not_open'],
    ['帮我做一个疗程快结束时自动提醒续购的规则', 'marketing_automation_rule_publish_not_open'],
    ['这个客人想改变护理方向，我怎么给她分析', 'active_customer_care_plan_change_context_not_connected'],
    ['有没有长期未消耗的大额储值需要关注', 'stored_value_aging_risk_not_connected'],
    ['有没有办法让系统自动识别客户的节假日并发关怀', 'customer_holiday_automation_trigger_not_connected'],
    ['今天有没有可能爽约的预约需要提前联系', 'reservation_no_show_prediction_not_connected'],
    ['新招了个美容师，怎么快速帮她建立客源', 'new_beautician_customer_growth_loop_not_connected'],
  ])('matches governed capability gap for %s', (question, code) => {
    expect(matchBrainCapabilityBoundary(question)).toMatchObject({ code });
  });

  it('does not block supported payment breakdown questions', () => {
    expect(matchBrainCapabilityBoundary('今天现金收了多少，微信支付宝各多少')).toBeUndefined();
    expect(matchBrainCapabilityBoundary('帮我预测下个季度的营业额')).toBeUndefined();
  });
});
