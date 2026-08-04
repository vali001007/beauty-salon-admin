import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAskDataGoldQuestionContract } from '../prisma/ask-data-gold-question-contracts.ts';
import { validateAskDataGoldRoutePlanMatch } from '../prisma/ask-data-gold-plan-match.ts';

function contract(question, expectedView) {
  return buildAskDataGoldQuestionContract({
    sourceSuite: 'ask_supplemental',
    sourceId: `contract-${question}`,
    sourceRole: 'manager',
    question,
    expectedView,
  });
}

test('rejects extra semantic metrics and views even when the required promotion view is present', () => {
  const gold = {
    expectedMetricKeys: ['promotion_offer'],
    acceptableViews: ['agent_v3_promotion_offer_view'],
    requiredViews: ['agent_v3_promotion_offer_view'],
  };
  const invalid = validateAskDataGoldRoutePlanMatch(gold, {
    semanticMetricKeys: ['promotion_offer', 'marketing_activity'],
    candidateViews: ['agent_v3_promotion_offer_view', 'agent_v3_marketing_activity_view'],
    planMetricKeys: ['promotion_offer', 'marketing_activity'],
    planRequiredViews: ['agent_v3_promotion_offer_view', 'agent_v3_marketing_activity_view'],
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.reasonCodes.includes('gold_semantic_metric_unexpected'));
  assert.ok(invalid.reasonCodes.includes('gold_candidate_view_unexpected'));
  assert.ok(invalid.reasonCodes.includes('gold_plan_metric_unexpected'));
  assert.ok(invalid.reasonCodes.includes('gold_plan_view_unexpected'));

  assert.deepEqual(validateAskDataGoldRoutePlanMatch(gold, {
    semanticMetricKeys: ['promotion_offer'],
    candidateViews: ['agent_v3_promotion_offer_view'],
    planMetricKeys: ['promotion_offer'],
    planRequiredViews: ['agent_v3_promotion_offer_view'],
  }), { valid: true, reasonCodes: [] });
});

test('governs every stored-balance plus unused-card question as a two-view contract', () => {
  for (const [sourceId, cardName] of [
    ['BQ0048', '综合养护 20 次卡'],
    ['BQ0058', '敏感修护 8 次卡'],
    ['BQ0068', '焕肤清洁 12 次卡'],
    ['BQ0078', '抗衰管理 6 次卡'],
  ]) {
    const value = buildAskDataGoldQuestionContract({
      sourceSuite: 'ami_brain_2000',
      sourceId,
      sourceRole: 'manager',
      question: `哪些客户同时有储值余额和未用完的${cardName}`,
      expectedView: 'agent_v3_customer_balance_view',
    });
    assert.deepEqual(value.expectedMetricKeys, ['customer_balance', 'card_assets']);
    assert.deepEqual(value.requiredViews, ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view']);
    assert.deepEqual(value.acceptableViews, ['agent_v3_customer_balance_view', 'agent_v3_card_asset_view']);
  }
});

test('governs grouped structures, rankings and scalar reservation counts', () => {
  assert.equal(contract('这个季度支付方式结构分析', 'agent_v3_payment_refund_view').requiredResultMode, 'grouped');
  assert.equal(contract('开业至今成本结构分析', 'ask_data_operating_cost_view').requiredResultMode, 'grouped');
  assert.equal(contract('这个季度和上个季度的成本结构有什么变化', 'ask_data_operating_cost_view').requiredResultMode, 'trend');
  assert.equal(contract('本周末哪些项目贡献了主要营收', 'agent_v3_project_service_sales_view').requiredResultMode, 'ranking');
  const sellThrough = contract('今年产品动销分析', 'agent_v3_order_item_sales_view');
  assert.equal(sellThrough.requiredResultMode, 'grouped');
  assert.ok(sellThrough.requiredOutputFields.includes('product_id'));
  assert.ok(sellThrough.requiredOutputFields.includes('product_name'));
  assert.equal(contract('顾然这半年有几个预约', 'agent_v3_reservation_view').requiredResultMode, 'scalar');
});

test('requires every requested face and body reservation count', () => {
  const value = contract('今天有几个预约是做面部的，几个是身体的', 'agent_v3_reservation_view');
  assert.equal(value.requiredResultMode, 'scalar');
  assert.deepEqual(value.requiredOutputFields, ['face_reservation_count', 'body_reservation_count']);
});

test('governs the last afternoon reservation as a single customer detail row', () => {
  const value = buildAskDataGoldQuestionContract({
    sourceSuite: 'agent_650',
    sourceId: 'frontdesk-048',
    sourceRole: 'frontdesk',
    question: '今天下午最后一个预约是几点，是谁',
    expectedView: 'agent_v3_reservation_view',
  });
  assert.equal(value.requiredResultMode, 'detail');
  assert.deepEqual(value.requiredOutputFields, [
    'reservation_id',
    'customer_id',
    'customer_name_masked',
    'date',
    'start_time',
    'project_name',
  ]);
});

test('governs loss-making activity output as an activity-level ROI result', () => {
  const value = contract('今年哪些活动在亏钱', 'ask_data_marketing_roi_view');
  assert.equal(value.requiredResultMode, 'grouped');
  for (const field of ['activity_id', 'activity_title', 'attributed_net_revenue', 'marketing_cost', 'marketing_profit', 'roi']) {
    assert.ok(value.requiredOutputFields.includes(field), `missing ${field}`);
  }
});

test('preserves threshold, year and denominator ambiguities without generic clarification', () => {
  assert.deepEqual(
    contract('最近三个月退款率正常吗', 'agent_v3_payment_refund_view').allowedClarificationSlots,
    ['threshold'],
  );
  assert.deepEqual(
    contract('双十一期间退款率正常吗', 'agent_v3_payment_refund_view').allowedClarificationSlots,
    ['year', 'threshold'],
  );
  assert.deepEqual(
    contract('最近30天耗占比的趋势', 'agent_v3_stock_movement_view').allowedClarificationSlots,
    ['comparison_relation'],
  );
  assert.deepEqual(
    contract('最近三个月有没有可疑的连续退款', 'agent_v3_payment_refund_view').allowedClarificationSlots,
    ['threshold'],
  );
  assert.deepEqual(
    contract('哪些产品最近14天即将过期且库存金额高', 'agent_v3_product_inventory_view').allowedClarificationSlots,
    ['threshold'],
  );
});

test('does not clarify explicitly governed refund thresholds', () => {
  assert.deepEqual(
    contract('最近三个月退款率高于10%吗', 'agent_v3_payment_refund_view').allowedClarificationSlots,
    [],
  );
  assert.deepEqual(
    contract('最近三个月退款率高于上月吗', 'agent_v3_payment_refund_view').allowedClarificationSlots,
    [],
  );
  assert.deepEqual(
    contract('现在库存金额大概多少', 'agent_v3_product_inventory_view').allowedClarificationSlots,
    [],
  );
});

test('removes unsupported order-level cross-sell ratios from the current Ask query denominator', () => {
  for (const sourceId of ['BQ0669', 'BQ0680']) {
    const value = buildAskDataGoldQuestionContract({
      sourceSuite: 'ami_brain_2000',
      sourceId,
      sourceRole: 'finance',
      question: sourceId === 'BQ0669' ? '最近三个月连带销售的订单比例' : '这个季度连带销售的订单比例',
      expectedView: 'agent_v3_order_item_sales_view',
    });
    assert.equal(value.supportClass, 'admin_supported_ask_not_open');
    assert.deepEqual(value.expectedMetricKeys, []);
    assert.deepEqual(value.requiredViews, []);
  }
});

test('requires object-level outputs for the known false-positive questions', () => {
  const reservation = buildAskDataGoldQuestionContract({
    sourceSuite: 'agent_650', sourceId: 'beautician-015', sourceRole: 'beautician',
    question: '下午两点那个客人想做什么项目', expectedView: 'agent_v3_reservation_view',
  });
  assert.equal(reservation.requiredResultMode, 'detail');
  for (const field of ['customer_id', 'customer_name_masked', 'start_time', 'project_id', 'project_name']) {
    assert.ok(reservation.requiredOutputFields.includes(field), `missing reservation field ${field}`);
  }

  const inventory = buildAskDataGoldQuestionContract({
    sourceSuite: 'agent_650', sourceId: 'inventory-003', sourceRole: 'inventory',
    question: '有没有什么产品只剩最后几瓶了', expectedView: 'agent_v3_product_inventory_view',
  });
  assert.equal(inventory.requiredResultMode, 'detail');
  for (const field of ['product_id', 'product_name', 'current_stock', 'safety_stock']) {
    assert.ok(inventory.requiredOutputFields.includes(field), `missing inventory field ${field}`);
  }
});

test('requires thresholds for qualitative high-volume judgements', () => {
  const cases = [
    ['BQ0122', '哪些客户的储值余额异常偏高', 'agent_v3_customer_balance_view'],
    ['BQ0960', '这半年有大量空档时段吗', 'agent_v3_appointment_gap_view'],
    ['BQ1783', '供应商集中度会不会太高', 'agent_v3_supplier_performance_view'],
  ];
  for (const [sourceId, question, expectedView] of cases) {
    const value = buildAskDataGoldQuestionContract({
      sourceSuite: 'ami_brain_2000', sourceId, sourceRole: 'manager', question, expectedView,
    });
    assert.equal(value.supportClass, 'clarification_required');
    assert.deepEqual(value.allowedClarificationSlots, ['threshold']);
  }
});

test('keeps unguided reconciliation and qualitative rate judgements out of the query denominator', () => {
  const cases = [
    ['finance-086', '这个月的现金收入有没有核对过', 'admin_supported_ask_not_open', []],
    ['inventory-040', '帮我查一下我们的库存损耗率高不高', 'clarification_required', ['threshold']],
    ['manager-083', '这周预约爽约率高不高', 'clarification_required', ['threshold']],
    ['marketing-062', '我给客户发了优惠券，核销率高不高', 'clarification_required', ['threshold']],
  ];
  for (const [sourceId, question, supportClass, slots] of cases) {
    const value = buildAskDataGoldQuestionContract({
      sourceSuite: 'agent_650', sourceId, sourceRole: 'manager', question,
      expectedView: sourceId === 'finance-086' ? 'ask_data_reconciliation_issue_view' : undefined,
    });
    assert.equal(value.supportClass, supportClass);
    assert.deepEqual(value.allowedClarificationSlots, slots);
  }
});

test('removes card redemption-rate questions whose governed denominator is unavailable', () => {
  const questions = new Map([
    ['BQ0503', '敏感修护 8 次卡的核销率是多少'],
    ['BQ0514', '焕肤清洁 12 次卡的核销率是多少'],
    ['BQ0525', '抗衰管理 6 次卡的核销率是多少'],
  ]);
  for (const [sourceId, question] of questions) {
    const value = buildAskDataGoldQuestionContract({
      sourceSuite: 'ami_brain_2000',
      sourceId,
      sourceRole: 'manager',
      question,
      expectedView: 'agent_v3_card_usage_view',
    });
    assert.equal(value.supportClass, 'admin_supported_ask_not_open');
    assert.deepEqual(value.expectedMetricKeys, []);
    assert.deepEqual(value.requiredViews, []);
    assert.deepEqual(value.requiredOutputFields, []);
  }
});

test('requires governed dimensions and actual rate outputs for known false positives', () => {
  const categories = contract('最近三个月各品类销售额', 'agent_v3_order_item_sales_view');
  assert.equal(categories.requiredResultMode, 'grouped');
  assert.ok(categories.requiredDimensionKeys.includes('product_category'));
  assert.ok(categories.requiredOutputFields.includes('category_name'));
  assert.ok(categories.requiredOutputFields.includes('net_sales_amount'));

  const balances = contract('客户储值总余额从高到低怎么排', 'agent_v3_customer_balance_view');
  assert.equal(balances.requiredResultMode, 'ranking');
  for (const field of ['customer_id', 'customer_name_masked', 'cash_balance', 'gift_balance']) {
    assert.ok(balances.requiredOutputFields.includes(field), `missing balance field ${field}`);
  }

  const activityRoi = contract('最近7天哪些活动ROI最高', 'ask_data_marketing_roi_view');
  assert.equal(activityRoi.requiredResultMode, 'ranking');
  for (const field of ['activity_id', 'activity_title', 'roi']) {
    assert.ok(activityRoi.requiredOutputFields.includes(field), `missing activity ROI field ${field}`);
  }

  const opportunity = contract('机会评分最高的前 10 位客户', 'ask_data_customer_lifecycle_view');
  assert.equal(opportunity.requiredResultMode, 'ranking');
  for (const field of ['customer_id', 'customer_name_masked', 'top_score']) {
    assert.ok(opportunity.requiredOutputFields.includes(field), `missing opportunity field ${field}`);
  }

  const marketingRate = contract('最近7天营销页的线索转化率', 'agent_v3_marketing_conversion_view');
  assert.deepEqual(marketingRate.requiredOutputFields, ['lead_count', 'conversion_count', 'conversion_rate']);

  const automationRate = contract('最近 30 天自动触达完成率', 'agent_v3_marketing_automation_view');
  assert.deepEqual(automationRate.requiredOutputFields, ['task_count', 'completed_count', 'completion_rate']);

  const grossMargin = contract('本月的毛利率', 'ask_data_confirmed_profit_view');
  assert.deepEqual(grossMargin.requiredOutputFields, ['operating_revenue', 'gross_profit', 'gross_margin_rate']);

  const costShare = buildAskDataGoldQuestionContract({
    sourceSuite: 'ami_brain_2000',
    sourceId: 'BQ1305',
    sourceRole: 'finance',
    question: '去年同期各成本科目占比',
    expectedView: 'ask_data_operating_cost_view',
  });
  assert.equal(costShare.requiredResultMode, 'grouped');
  assert.deepEqual(costShare.requiredDimensionKeys, ['category']);
  assert.deepEqual(costShare.requiredOutputFields, ['category', 'operating_cost', 'cost_share']);

  for (const question of ['本月各次卡名称的核销次数分别是多少', '最近 7 天每种次卡分别核销了多少次']) {
    const cardUsage = contract(question, 'agent_v3_card_usage_view');
    assert.equal(cardUsage.requiredResultMode, 'grouped');
    assert.ok(cardUsage.requiredOutputFields.includes('card_name'));
    assert.ok(cardUsage.requiredOutputFields.includes('usage_times'));
  }
});
