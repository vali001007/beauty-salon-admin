#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourcePath = resolve(
  process.cwd(),
  argumentValue('--source=') ?? '../../docs/04-测试数据/Ami-Brain-全领域实测问题集-2000.csv',
);
const outputPath = resolve(
  process.cwd(),
  argumentValue('--output=') ??
    '../../docs/04-测试数据/Ami-Ask-34视图问题集实测-2026-08-02/selection-manifest.json',
);
const targetPerView = positiveInt(argumentValue('--target-per-view='), 10);
const minimumCaseCount = positiveInt(argumentValue('--minimum-cases='), 0);
const excludeGoldPath = argumentValue('--exclude-gold=')
  ? resolve(process.cwd(), argumentValue('--exclude-gold='))
  : undefined;
const excludedGold = excludeGoldPath ? JSON.parse(readFileSync(excludeGoldPath, 'utf8')) : undefined;
const excludedQuestionChecksums = new Set(
  excludedGold
    ? [...(excludedGold.queryContracts ?? []), ...(excludedGold.boundaryContracts ?? [])].map((item) => item.checksum)
    : [],
);

const sourceText = readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, '');
const rows = parseCsv(sourceText);
const header = rows.shift();
if (!header) throw new Error('CSV header missing');
const parsedQuestions = rows
  .filter((row) => row.length >= header.length)
  .map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ''])))
  .filter((item) => item.id && item.question)
  .map((item) => ({ ...item, questionChecksum: questionChecksum(item.question) }));
const questions = parsedQuestions
  .filter((item) => !excludedQuestionChecksums.has(item.questionChecksum));

const excludedTypes = new Set(['action', 'permission', 'ambiguity', 'multi_turn']);
const unsafeQuestion = /手机号|联系电话|生日|过敏史|健康档案|标签有哪些|来源渠道|档案原文|备注/;

const definitions = [
  rule('agent_v3_order_summary_view', '订单摘要', ['ProductOrder/PaymentRecord 表', 'ProductOrder×OrderItem×Customer', '交易分析'], /^(?!.*(?:产品订单|项目订单)).*(?:订单|营业额|实收|客单价|消费记录|消费明细|大额订单)/),
  rule('agent_v3_order_item_sales_view', '商品销售', ['ProductOrder/PaymentRecord 表', 'ProductOrder×OrderItem×Customer', '项目分析', '库存分析', '订单利润(orders profit)'], /产品订单|各品类销售额|产品动销|哪些产品动销|连带销售的订单|产品订单的成本和毛利/),
  rule('agent_v3_project_service_sales_view', '项目服务销售', ['Project×OrderItem×ProjectBomItem', '项目分析', '订单利润(orders profit)', 'ProductOrder/PaymentRecord 表'], /项目.*(?:卖了多少|最受欢迎|销量排行|贡献了主要营收|毛利|利润)|项目订单金额/),
  rule('agent_v3_payment_refund_view', '支付与退款', ['ProductOrder/PaymentRecord 表', 'ProductOrder×OrderItem×Customer', '交易分析', '交易风险巡检'], /支付方式|退款|实收流水|支付和金额/),
  rule('agent_v3_daily_settlement_view', '日结', ['DailySettlement/CommissionRecord/OperatingCost', '交易分析', '财务风险巡检'], /日结|营业额.*趋势|订单量.*趋势|每日收入|净收趋势/),
  rule('agent_v3_product_inventory_view', '商品库存', ['Product/StockBatch 表', 'Product×StockMovement×ProjectBomItem', '库存风险巡检', '库存分析', '销量/耗材预测'], /现在还有多少库存|缺货|临期|安全库存|库存总价值|低于安全库存|即将过期|积压过期|库存结构/),
  rule('agent_v3_stock_movement_view', '库存流水', ['Product/StockBatch 表', 'Product×StockMovement×ProjectBomItem', '库存分析'], /库存变化|入库了多少|出入库流水|消耗了多少|耗材消耗排行|消耗趋势|耗占比/),
  emptyRule('agent_v3_inventory_scrap_view', '库存报废', '题库没有报废、报损或库存损失查询题。'),
  rule('ask_data_customer_profile_summary_view', '客户档案摘要', ['Customer 表', '客户画像分析', 'Customer×CustomerCard×ProductOrder'], /会员等级|上次到店|累计消费|最近.*到店的客户|客户结构|消费额Top|高价值客户|金卡会员|钻石会员/),
  rule('agent_v3_staff_profile_view', '员工档案', ['Beautician/Schedule 表'], /在职美容师|是什么职级/),
  rule('ask_data_staff_performance_view', '员工绩效', ['Beautician×ServiceTask×CommissionRecord'], /哪个美容师业绩最高|的提成是多少|按.*业绩.*榜单/),
  rule('agent_v3_reservation_view', '预约', ['Reservation/ServiceTask 表', 'Reservation×Project×Beautician', '履约分析'], /预约|到店人数|爽约率|取消率/),
  rule('agent_v3_marketing_conversion_view', '营销转化', ['MarketingActivity/AutomationStrategy', 'Marketing×Attribution×Touch', '营销效果分析'], /新增了多少线索|活动带来了多少营收|活动归因的收益|触达的客户有多少转化|线索转化率|活动.*转化/),
  rule('agent_v3_card_asset_view', '次卡资产', ['Customer×CustomerCard×ProductOrder', '客户风险巡检', '客户经营建议', 'Project×OrderItem×ProjectBomItem', '商品风险巡检'], /哪些客户同时有储值余额和未用完|快到期但剩余次数还很多|快到期的客户该怎么促约|快过期还没核销完/),
  rule('agent_v3_card_usage_view', '次卡核销', ['Project×OrderItem×ProjectBomItem', '项目分析', 'Reservation/ServiceTask 表', '订单利润(orders profit)'], /核销|确认收入|履约/),
  rule('agent_v3_customer_balance_view', '客户余额', ['Customer×CustomerCard×ProductOrder', '客户风险巡检'], /储值余额|现金余额|赠送余额/),
  rule('agent_v3_service_quality_view', '服务质量', ['Reservation/ServiceTask 表', 'terminal/beautician/*', 'Beautician×ServiceTask×CommissionRecord', '客户风险巡检'], /服务任务|服务完成率|护理完成|服务状态|满意度|投诉或体验不佳/),
  rule('agent_v3_appointment_gap_view', '预约空档', ['Reservation/ServiceTask 表', '履约风险/空档机会'], /哪些时段还有空|有大量空档时段/),
  rule('agent_v3_project_catalog_view', '项目目录', ['Project/Card/Product 表'], /店里一共有多少个项目|的价格是多少|做一次要多久|属于哪个项目类型|哪些项目是推荐项目/),
  rule('agent_v3_marketing_activity_view', '营销活动', ['MarketingActivity/AutomationStrategy', '营销效果分析'], /有哪些营销活动在跑|活动的参与人数|所有活动的效果|无效活动在空跑/),
  rule('agent_v3_marketing_automation_view', '自动触达', ['MarketingActivity/AutomationStrategy', 'Marketing×Attribution×Touch', '营销效果分析', '营销风险巡检'], /自动化策略|发出去多少条触达|触达的成功率|跟进任务|自动化触达失败率|转化漏斗/),
  rule('agent_v3_promotion_offer_view', '优惠活动', ['MarketingActivity/AutomationStrategy'], /优惠券在用|优惠活动|促销活动/),
  rule('ask_data_operating_cost_view', '经营成本', ['DailySettlement/CommissionRecord/OperatingCost', 'operation-profit×commission', '经营利润分析', '财务风险巡检'], /经营成本|成本明细|成本科目|成本结构|成本超预算|异常成本支出|人力成本占比/),
  rule('agent_v3_purchase_procurement_view', '采购', ['SupplySupplier/SupplyQuote 表', 'Procurement×Supplier×Quote', '供应链分析', '库存分析'], /采购单|采购总额|采购金额|采购成本|采购结构|采购返点|发货在途|结算待付款/),
  rule('agent_v3_supplier_performance_view', '供应商表现', ['SupplySupplier/SupplyQuote 表', 'Procurement×Supplier×Quote', '供应链分析'], /哪些供应商合作最多|各供应商的采购金额|供应商集中度/),
  rule('ask_data_confirmed_profit_view', '已确认实际利润', ['DailySettlement/CommissionRecord/OperatingCost', 'operation-profit×commission', '经营利润分析', '订单利润(orders profit)'], /经营利润|毛利率|毛利是多少|利润贡献|毛利.*变化|利润.*差异|盈亏平衡|订单.*毛利|利润情况/),
  rule('ask_data_reconciliation_issue_view', '财务对账异常', ['财务风险巡检', 'DailySettlement/CommissionRecord/OperatingCost', '交易风险巡检'], /对账|对平|日结平不平|现金和系统数对得上|支付和金额对不上/),
  rule('ask_data_member_liability_view', '会员履约负债', ['DailySettlement/CommissionRecord/OperatingCost', 'operation-profit×commission', '经营利润分析', '财务风险巡检'], /负债/),
  rule('ask_data_staff_capacity_view', '排班与员工产能', ['Beautician/Schedule 表', 'Beautician×ServiceTask×CommissionRecord', '人效分析', '员工风险巡检'], /排班|产能利用率|排班工时|排班过载|闲置产能|产能缺口/),
  emptyRule('ask_data_transfer_status_view', '库存调拨', '题库只有 5 道“从别的店调货”写操作题，没有调拨状态查询题。'),
  rule('ask_data_bom_consumption_variance_view', 'BOM 实际消耗偏差', ['库存风险巡检'], /BOM理论消耗.*实际出库/),
  rule('ask_data_customer_feedback_view', '客户反馈', ['客户风险巡检', 'Beautician×ServiceTask×CommissionRecord'], /投诉|体验不佳|满意度|客户反馈|低评分/),
  rule('ask_data_customer_lifecycle_view', '客户生命周期', ['CustomerPredictionSnapshot'], /流失风险有多高|客户价值分层预测/),
  rule('ask_data_marketing_roi_view', '营销 ROI', ['Marketing×Attribution×Touch', '营销效果分析', '营销风险巡检'], /ROI|营销投入产出|获客成本|拓客成本|营销预算|活动在亏钱/),
];

const typeScore = { query_single: 60, query_cross: 50, analysis: 40, risk: 30, prediction: 20, advice: 10 };
const candidatePools = definitions.map((definition) => {
  if (definition.forceEmpty) return [];
  const candidates = questions
    .filter((item) => !excludedTypes.has(item.type))
    .filter((item) => !unsafeQuestion.test(item.question))
    .filter((item) => definition.targets.includes(item.expected_target))
    .filter((item) => definition.pattern.test(item.question))
    .map((item) => ({
      ...item,
      score: (typeScore[item.type] ?? 0) + (item.difficulty === 'easy' ? 3 : item.difficulty === 'medium' ? 2 : 1),
    }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id, 'en'));
  const unique = [];
  const seen = new Set();
  for (const item of candidates) {
    if (seen.has(item.question)) continue;
    seen.add(item.question);
    unique.push(item);
  }
  return unique;
});
const assignedQuestionIdsByView = assignUniqueQuestions(candidatePools, targetPerView);
const views = definitions.map((definition, viewIndex) => {
  const candidates = candidatePools[viewIndex];
  const assignedQuestionIds = assignedQuestionIdsByView[viewIndex];
  const selected = candidates
    .filter((item) => assignedQuestionIds.has(item.id))
    .slice(0, targetPerView)
    .map(({ score, ...item }) => item);
  return {
    viewName: definition.viewName,
    label: definition.label,
    selectionRule: definition.selectionRule,
    availableCount: candidates.length,
    selectedCount: selected.length,
    targetCount: targetPerView,
    coverageStatus: selected.length >= targetPerView ? 'covered' : selected.length ? 'insufficient' : 'uncovered',
    gapReason: selected.length >= targetPerView ? undefined : definition.gapReason ?? `仅找到 ${selected.length} 道直接匹配查询题。`,
    questions: selected,
  };
});

const selectedQuestions = views.flatMap((view) =>
  view.questions.map((question) => ({ ...question, expectedView: view.viewName, expectedViewLabel: view.label })),
);
if (selectedQuestions.length < minimumCaseCount) {
  throw new Error(`insufficient_selected_cases:${selectedQuestions.length}:${minimumCaseCount}`);
}
const coveredViews = views.filter((view) => view.coverageStatus === 'covered').length;
const selectedQuestionsChecksum = createHash('sha256').update(JSON.stringify(selectedQuestions.map((item) => ({
  id: item.id,
  questionChecksum: item.questionChecksum,
  expectedView: item.expectedView,
})))).digest('hex');
const manifest = {
  generatedAt: new Date().toISOString(),
  sourcePath,
  sourceChecksum: createHash('sha256').update(sourceText).digest('hex'),
  selectionMode: excludeGoldPath ? 'new_holdout_candidate' : 'view_coverage',
  excludeGoldPath,
  excludedGoldChecksum: excludedGold?.checksum,
  excludedQuestionCount: excludedQuestionChecksums.size,
  sourceQuestionCount: parsedQuestions.length,
  eligibleQuestionCount: questions.length,
  targetPerView,
  minimumCaseCount,
  viewCount: views.length,
  coveredViews,
  insufficientViews: views.filter((view) => view.coverageStatus !== 'covered').map((view) => ({
    viewName: view.viewName,
    label: view.label,
    selectedCount: view.selectedCount,
    gapReason: view.gapReason,
  })),
  selectedCaseCount: selectedQuestions.length,
  selectedQuestionsChecksum,
  checksum: createHash('sha256').update(JSON.stringify({
    sourceChecksum: createHash('sha256').update(sourceText).digest('hex'),
    excludedGoldChecksum: excludedGold?.checksum,
    selectedQuestionsChecksum,
  })).digest('hex'),
  views,
  selectedQuestions,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...pick(manifest, ['sourceQuestionCount', 'viewCount', 'coveredViews', 'selectedCaseCount', 'insufficientViews']) }, null, 2));

function rule(viewName, label, targets, pattern, gapReason) {
  return { viewName, label, targets, pattern, gapReason, selectionRule: `expected_target in [${targets.join(', ')}] and question matches ${pattern}` };
}

function emptyRule(viewName, label, gapReason) {
  return { viewName, label, forceEmpty: true, selectionRule: 'no valid read-only query in source bank', gapReason };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function argumentValue(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function questionChecksum(question) {
  return createHash('sha256').update(normalizeQuestion(question)).digest('hex');
}

function normalizeQuestion(value) {
  return value.trim().toLowerCase().replace(/[\s，。！？?、；;：:（）()“”"'`]+/g, '');
}

function pick(object, keys) {
  return Object.fromEntries(keys.map((key) => [key, object[key]]));
}

function assignUniqueQuestions(candidatePools, capacity) {
  const slots = candidatePools
    .flatMap((candidates, viewIndex) =>
      Array.from({ length: capacity }, (_, slotIndex) => ({
        key: `${viewIndex}:${slotIndex}`,
        viewIndex,
        candidateCount: candidates.length,
      })),
    )
    .filter((slot) => slot.candidateCount > 0)
    .sort((left, right) => left.candidateCount - right.candidateCount || left.viewIndex - right.viewIndex);
  const slotByKey = new Map(slots.map((slot) => [slot.key, slot]));
  const questionToSlot = new Map();
  const slotToQuestion = new Map();

  for (const slot of slots) tryAssign(slot.key, new Set());

  const assigned = candidatePools.map(() => new Set());
  for (const [slotKey, questionId] of slotToQuestion) {
    const slot = slotByKey.get(slotKey);
    if (slot) assigned[slot.viewIndex].add(questionId);
  }
  return assigned;

  function tryAssign(slotKey, visitedQuestionIds) {
    const slot = slotByKey.get(slotKey);
    if (!slot) return false;
    for (const candidate of candidatePools[slot.viewIndex]) {
      if (visitedQuestionIds.has(candidate.id)) continue;
      visitedQuestionIds.add(candidate.id);
      const occupiedSlotKey = questionToSlot.get(candidate.id);
      if (occupiedSlotKey && !tryAssign(occupiedSlotKey, visitedQuestionIds)) continue;
      questionToSlot.set(candidate.id, slotKey);
      slotToQuestion.set(slotKey, candidate.id);
      return true;
    }
    return false;
  }
}
