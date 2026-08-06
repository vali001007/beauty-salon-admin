import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(SERVER_ROOT, '..', '..');
export const PRODUCT_LOOP_DATA_FACTS_PATH = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-product-loop-data-facts-v1.json',
);
export const SUPPLEMENTAL_QUESTION_REGISTRY_PATH = resolve(
  REPO_ROOT,
  'docs/04-测试数据/Ami-Brain-全领域题集治理/ami-brain-supplemental-question-registry-v1.json',
);
const PRODUCT_LOOP_DATA_FACTS = loadProductLoopDataFacts();
const SUPPLEMENTAL_QUESTION_REGISTRY = loadSupplementalQuestionRegistry();

const FEATURE_BUNDLES = [
  featureBundle('customer_record', '客户域', ['Customer 表'], customerEvidence(['Customer'])),
  featureBundle(
    'customer_consumption_profile',
    '客户域',
    ['Customer×CustomerCard×ProductOrder', '客户画像分析', '客户经营建议'],
    customerEvidence(['Customer', 'CustomerCard', 'ProductOrder', 'OrderItem', 'CustomerLifecycleSnapshot']),
  ),
  featureBundle(
    'customer_risk',
    '客户域',
    ['客户风险巡检'],
    customerEvidence(['Customer', 'CustomerCard', 'ProductOrder', 'CustomerPredictionSnapshot', 'CustomerServiceFeedback']),
  ),
  featureBundle(
    'customer_prediction',
    '客户域',
    ['CustomerPredictionSnapshot'],
    customerEvidence(['Customer', 'CustomerPredictionSnapshot', 'PredictionRun']),
  ),
  featureBundle('customer_api', '客户域', ['customers/* API'], customerEvidence(['Customer', 'CustomerCard', 'ProductOrder'])),

  featureBundle(
    'staff_directory_schedule',
    '员工域',
    ['Beautician/Schedule 表'],
    staffScheduleEvidence(['Beautician', 'BeauticianLevel', 'BeauticianProjectSkill', 'Schedule', 'BeauticianTimeOff', 'Project']),
  ),
  featureBundle(
    'staff_service_performance',
    '员工域',
    ['Beautician×ServiceTask×CommissionRecord', '人效分析', '员工风险巡检', '人力经营建议'],
    staffPerformanceEvidence([
      'Beautician',
      'BeauticianLevel',
      'BeauticianProjectSkill',
      'Schedule',
      'BeauticianTimeOff',
      'ServiceTask',
      'CommissionRecord',
      'Customer',
      'ProductOrder',
      'CustomerServiceFeedback',
    ]),
  ),
  featureBundle(
    'staff_terminal_self_service',
    '员工域',
    ['terminal/beautician/*'],
    terminalEvidence('src/app/pages/BeauticianManagement.tsx', "path: 'stores/beauticians'", ['Beautician', 'ServiceTask', 'CommissionRecord']),
  ),
  featureBundle(
    'smart_scheduling',
    '员工域',
    ['scheduling/* API'],
    schedulingEvidence(['Beautician', 'Schedule', 'BeauticianTimeOff', 'Reservation', 'ScheduleVersion', 'AppointmentGapOpportunityEvent']),
  ),

  featureBundle('catalog_master', '商品域', ['Project/Card/Product 表'], projectEvidence(['Project', 'Card', 'Product'])),
  featureBundle(
    'project_margin_fact',
    '商品域',
    ['Project×OrderItem×ProjectBomItem', '项目分析'],
    projectMarginEvidence(['Project', 'ProductOrder', 'OrderItem', 'ProjectBomItem', 'ConsumptionRecord']),
  ),
  featureBundle(
    'catalog_risk_advice',
    '商品域',
    ['商品风险巡检', '商品经营建议'],
    projectEvidence(['Project', 'Product', 'ProjectBomItem', 'OrderItem', 'ConsumptionRecord']),
  ),
  featureBundle('project_api', '商品域', ['projects/* API'], projectEvidence(['Project', 'Product', 'ProjectBomItem'])),

  featureBundle(
    'order_payment_fact',
    '交易域',
    ['ProductOrder/PaymentRecord 表', 'ProductOrder×OrderItem×Customer', '交易分析', '交易风险巡检'],
    orderEvidence(['ProductOrder', 'OrderItem', 'PaymentRecord', 'RefundRecord', 'Customer']),
  ),
  featureBundle(
    'card_recognized_revenue_fact',
    '交易域',
    [
      '次卡核销确认收入(card recognized revenue)',
      '实收金额(paid amount)×次卡核销确认收入(card recognized revenue)',
    ],
    cardRecognitionEvidence(['CardUsageRecord', 'PaymentRecord', 'DailySettlement', 'ProductOrder']),
  ),
  featureBundle(
    'order_profit',
    '交易域',
    ['订单利润(orders profit)'],
    profitEvidence(['ProductOrder', 'OrderItem', 'PaymentRecord', 'RefundRecord', 'OperatingCost']),
  ),
  featureBundle(
    'terminal_cashier',
    '交易域',
    ['orders/terminal 收银API'],
    terminalEvidence('src/app/pages/ProductOrderManagement.tsx', "path: 'orders/products'", ['ProductOrder', 'OrderItem', 'PaymentRecord', 'RefundRecord']),
  ),

  featureBundle(
    'reservation_service_fact',
    '履约域',
    ['Reservation/ServiceTask 表', 'Reservation×Project×Beautician', '履约分析'],
    reservationEvidence(['Reservation', 'ServiceTask', 'Project', 'Beautician', 'CardUsageRecord']),
  ),
  featureBundle(
    'fulfillment_capacity_risk',
    '履约域',
    ['履约风险/空档机会', '履约优化建议'],
    schedulingEvidence(['Reservation', 'ServiceTask', 'Schedule', 'Beautician', 'AppointmentGapOpportunityEvent']),
  ),
  featureBundle(
    'terminal_reservation',
    '履约域',
    ['reservations/terminal API'],
    terminalEvidence('src/app/pages/ProjectReservation.tsx', "path: 'stores/reservations'", ['Reservation', 'ServiceTask', 'Project', 'Beautician']),
  ),

  featureBundle(
    'inventory_stock_fact',
    '库存域',
    ['Product/StockBatch 表', 'Product×StockMovement×ProjectBomItem', '库存分析', '库存风险巡检', '销量/耗材预测'],
    inventoryEvidence(['Product', 'StockBatch', 'StockMovement', 'ProjectBomItem', 'ConsumptionRecord']),
  ),
  featureBundle(
    'inventory_procurement_action',
    '库存域',
    ['inventory/supply-platform API'],
    supplyEvidence(['Product', 'StockBatch', 'ProcurementOrder', 'ProcurementOrderItem', 'SupplySupplier', 'SupplyQuote']),
  ),

  featureBundle(
    'finance_settlement_fact',
    '财务域',
    ['DailySettlement/CommissionRecord/OperatingCost'],
    financeEvidence(['DailySettlement', 'CommissionRecord', 'OperatingCost', 'PaymentRecord', 'RefundRecord']),
  ),
  featureBundle(
    'finance_profit_analysis',
    '财务域',
    ['operation-profit×commission', '经营利润分析', '财务风险巡检', '财务经营建议'],
    profitEvidence(['DailySettlement', 'CommissionRecord', 'OperatingCost', 'ProductOrder', 'OrderItem', 'PaymentRecord']),
  ),
  featureBundle(
    'finance_action_api',
    '财务域',
    ['commission/operation-costs API'],
    financeActionEvidence(['CommissionRecord', 'OperatingCost']),
  ),

  featureBundle(
    'marketing_activity_automation',
    '营销域',
    ['MarketingActivity/AutomationStrategy', '营销策略建议', 'marketing/automation API'],
    marketingEvidence(['MarketingActivity', 'MarketingAutomationStrategy', 'MarketingAutomationExecution', 'MarketingAutomationTouch']),
  ),
  featureBundle(
    'marketing_effect_attribution',
    '营销域',
    ['Marketing×Attribution×Touch', '营销效果分析', '营销风险巡检'],
    marketingAnalyticsEvidence(['MarketingActivity', 'MarketingAttribution', 'MarketingAutomationTouch', 'MarketingEffectFact']),
  ),
  featureBundle(
    'marketing_response_prediction',
    '营销域',
    ['营销响应预测'],
    marketingAnalyticsEvidence(['CustomerPredictionSnapshot', 'PredictionRun', 'MarketingRecommendationSnapshot']),
  ),

  featureBundle(
    'supply_quote_procurement',
    '供应链域',
    ['SupplySupplier/SupplyQuote 表', 'Procurement×Supplier×Quote', '供应链分析', '供应链建议', 'supply-platform API'],
    supplyEvidence(['SupplySupplier', 'SupplyQuote', 'ProcurementOrder', 'ProcurementOrderItem', 'ProcurementReceipt', 'SupplySettlement']),
  ),

  featureBundle(
    'industry_benchmark',
    '行业域',
    ['IndustryServiceTemplate/SalaryBenchmark', 'Industry×本店数据', '行业对标建议', 'industry/adopt API'],
    industryEvidence(['IndustryServiceTemplate', 'IndustrySalaryBenchmark', 'IndustryDataSource', 'IndustryEvidence', 'IndustryAdoptionRecord']),
  ),

  featureBundle('brain_multi_turn', '横切-多轮', ['多轮上下文承接'], brainEvidence()),
  featureBundle('brain_ambiguity', '横切-歧义', ['应触发澄清追问'], brainEvidence()),
  featureBundle('brain_permission', '横切-越权', ['应越权拒绝'], brainEvidence()),
];

const FEATURE_BUNDLE_BY_CASE_CONTRACT = new Map();
const FEATURE_BUNDLE_BY_KEY = new Map();
for (const definition of FEATURE_BUNDLES) {
  if (FEATURE_BUNDLE_BY_KEY.has(definition.featureKey)) throw new Error(`duplicate product loop feature key:${definition.featureKey}`);
  FEATURE_BUNDLE_BY_KEY.set(definition.featureKey, definition);
  for (const expectedTarget of definition.expectedTargets) {
    const key = featureRegistryKey(definition.domain, expectedTarget);
    if (FEATURE_BUNDLE_BY_CASE_CONTRACT.has(key)) throw new Error(`duplicate product loop feature contract:${key}`);
    FEATURE_BUNDLE_BY_CASE_CONTRACT.set(key, definition);
  }
}

export function productLoopFeatureDefinitions() {
  return FEATURE_BUNDLES.map((definition) => ({
    featureKey: definition.featureKey,
    domain: definition.domain,
    expectedTargets: [...definition.expectedTargets],
    models: [...definition.models],
  }));
}

const NEXT_ITERATION_RULES = [
  missingRule(
    'staff_probation_and_conversion',
    /试用期|转正/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '员工试用期目标、带教、阶段评价和转正审批尚未形成业务闭环。',
    'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts',
    '当前后台没有员工试用期目标、阶段评价、带教记录或转正结论事实闭环',
  ),
  missingRule(
    'customer_ownership_history',
    /客户.*(?:被|让).*(?:别的|其他).*(?:美容师|员工).*(?:挖走|转走)|员工离职.*(?:客户|带走)|客户归属.*(?:历史|变更|流转)|离职带客/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '客户归属历史、变更事件、离职交接和流转原因尚未形成业务闭环。',
    'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts',
    '当前后台没有客户归属历史、归属变更事件或转移原因事实闭环',
  ),
  missingRule(
    'unauthorized_discount_audit',
    /未经授权.*优惠|优惠.*未经授权|私自.*优惠|违规.*折扣/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '现有订单优惠没有授权规则、审批、操作人和例外事件审计闭环。',
    'packages/server-v2/src/brain/brain-chat.service.ts',
    '当前管理端和后台只有订单优惠金额，没有优惠授权规则、审批记录、实际操作人和例外事件事实',
  ),
  missingRule(
    'equipment_maintenance',
    /设备.*(?:台账|巡检|保养|故障|维修)|(?:巡检|保养|故障|维修).*(?:设备|仪器)/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '设备台账、巡检、保养、故障和维修状态尚未形成业务闭环。',
    'packages/server-v2/src/brain/brain-chat.service.ts',
    '当前管理端和后台没有设备台账、巡检、保养、故障和维修状态事实',
  ),
  missingRule(
    'stored_value_cash_out',
    /储值.*(?:提现|套现)|(?:提现|套现).*储值/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '储值提现申请、审批、打款和异常规则尚未形成业务闭环。',
    'packages/server-v2/src/brain/brain-chat.service.ts',
    '当前管理端和后台没有储值提现申请、审批、打款和异常规则事实',
  ),
  missingRule(
    'staff_customer_churn_attribution',
    /(?:员工|美容师).*(?:客户)?流失(?:率|偏多|归因|情况)|(?:客户)?流失(?:率|偏多|归因|情况).*(?:员工|美容师)/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '按美容师归属的客户留存基线、流失事件和归因尚未形成业务闭环。',
    'packages/server-v2/src/brain/brain-chat.service.ts',
    '当前管理端和后台没有按美容师归属的客户留存基线、流失事件和归因事实',
  ),
  missingRule(
    'service_incident',
    /服务事故|过敏事故|皮肤过敏事件|服务导致.*过敏/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '服务事故、过敏事件、处置过程和责任归因尚未形成业务闭环。',
    'packages/server-v2/src/brain/brain-chat.service.ts',
    '当前管理端和后台没有服务事故、皮肤过敏事件、处置过程和责任归因事实',
  ),
  missingRule(
    'fire_safety_inspection',
    /消防.*(?:检查|隐患|整改)|(?:检查|隐患|整改).*消防/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '消防检查计划、记录、隐患、整改和到期提醒尚未形成业务闭环。',
    'packages/server-v2/src/brain/brain-chat.service.ts',
    '当前管理端和后台没有消防检查计划、检查记录、隐患、整改和到期提醒事实',
  ),
  missingRule(
    'satisfaction_collection_automation',
    /满意度.*(?:自动采集|自动问卷|自动发送问卷)|问卷.*满意度/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '客户反馈查询已存在，但满意度问卷自动发送和回执采集尚未形成闭环。',
    'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts',
    '当前管理端和后端没有客户满意度采集、问卷发送和回执事实闭环',
  ),
  missingRule(
    'stored_value_solvency_model',
    /现金储备|偿付压力|集中消费.*(?:撑住|承接)|(?:撑住|承接).*集中消费/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '可用现金储备、未来核销节奏与服务产能的统一偿付压力模型尚不存在。',
    'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts',
    '当前后台没有统一接入可用现金储备、未来核销节奏和服务产能的偿付压力模型',
  ),
  missingRule(
    'project_cost_period_attribution',
    /哪个项目.*(?:成本上涨|成本上升).*(?:毛利|利润)|项目.*(?:成本上涨|成本上升).*(?:毛利|利润)/u,
    ['data_facts'],
    '项目毛利页面和接口已存在，但缺少项目级收入、优惠、成本快照与可比期间归因事实。',
    'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts',
    '当前结算数据没有项目级收入、优惠、成本快照及可比期间归因',
  ),
  missingRule(
    'procurement_discrepancy_claim',
    /到货.*(?:索赔|退货|差异处理单)|采购.*(?:索赔|退货).*差异/u,
    ['management_entry', 'backend_api', 'data_facts'],
    '采购收货存在，但到货差异索赔、退货和责任处理单尚未形成闭环。',
    'packages/server-v2/src/brain/capability/executors/brain-focused-business-capability.executor.ts',
    '当前后台没有独立的到货差异索赔、退货和责任闭环',
  ),
];

const EVIDENCE_REVIEW_RULES = [
  {
    featureKey: 'ambiguous_named_business_period',
    matches: (text) => hasUnboundNamedBusinessPeriod(text),
    missingComponents: ['data_facts'],
    reason:
      '题目只给出活动或节假日名称，未绑定年份、明确日期范围或后台正式活动周期；不能据此构造业务时间事实，需先逐题复核。',
  },
];

const VALID_SUPPLEMENTAL_REVIEW_STATUSES = [
  'current_release_test',
  'next_iteration_feature',
  'metric_definition_governance_required',
];

export function resolveProductLoopEligibility(item, options = {}) {
  const questionText = `${item.question ?? ''} ${item.expectedTarget ?? ''} ${item.notes ?? ''}`;
  const missing = NEXT_ITERATION_RULES.find((rule) => rule.pattern.test(questionText));
  const evidenceReview = EVIDENCE_REVIEW_RULES.find((rule) => rule.matches(questionText));
  const bundleDefinition = FEATURE_BUNDLE_BY_CASE_CONTRACT.get(featureRegistryKey(item.domain, item.expectedTarget));
  if (options.admission !== 'frozen_baseline_v1') {
    const registry = options.supplementalRegistry ?? SUPPLEMENTAL_QUESTION_REGISTRY;
    const registeredCase = registry?.cases?.find((candidate) => candidate.id === item.id);
    const reviewed = resolveSupplementalReview(item, registeredCase, options.repoRoot ?? REPO_ROOT);
    if (['current_release_test', 'metric_definition_governance_required'].includes(reviewed?.status) && missing) {
      return supplementalReviewFailure(
        item,
        registeredCase?.review,
        `题目仍命中已登记的缺失业务功能 ${missing.featureKey}；必须先移除缺失规则并补齐实现证据，不能用人工 ${reviewed.status} 标记覆盖。`,
      );
    }
    if (reviewed) return reviewed;
    return {
      status: 'evidence_review_required',
      featureKey: missing?.featureKey ?? bundleDefinition?.featureKey ?? 'unmapped_case_contract',
      reason:
        registeredCase
          ? '新增题登记存在，但题目指纹或逐题三证据复核记录无效；必须修正登记后重新生成资格产物。'
          : '新题或变更题尚未进入追加登记表；关键词命中、已有缺失功能规则或复用 domain + expectedTarget 都不能替代管理入口、正式接口和真实业务数据核对。',
      missingComponents: ['management_entry', 'backend_api', 'data_facts'],
      evidence: missing
        ? {
            candidateDecisionEvidence: {
              path: missing.decisionEvidence.path,
              anchor: missing.decisionEvidence.anchor,
            },
          }
        : bundleDefinition
          ? {
              candidateManagementEntry: bundleDefinition.managementEntries.map((entry) => entry.path),
              candidateBackendApi: bundleDefinition.backendApis.map((entry) => entry.path),
              candidateDataModels: bundleDefinition.models,
            }
          : {},
      admission: {
        source: 'supplemental_question_registry_v1',
        questionChecksum: questionContractChecksum(item),
        reviewChecksum: registeredCase?.review ? sha256(JSON.stringify(registeredCase.review)) : null,
        reviewedBy: registeredCase?.review?.reviewedBy ?? null,
        reviewedAt: registeredCase?.review?.reviewedAt ?? null,
      },
    };
  }
  if (missing) {
    return {
      status: 'next_iteration_feature',
      featureKey: missing.featureKey,
      reason: missing.reason,
      missingComponents: missing.missingComponents,
      evidence: {
        managementEntry: componentEvidence('management_entry', missing.missingComponents),
        backendApi: componentEvidence('backend_api', missing.missingComponents),
        dataFacts: componentEvidence('data_facts', missing.missingComponents),
        decisionEvidence: { path: missing.decisionEvidence.path, anchor: missing.decisionEvidence.anchor },
      },
    };
  }
  if (evidenceReview) {
    return {
      status: 'evidence_review_required',
      featureKey: evidenceReview.featureKey,
      reason: evidenceReview.reason,
      missingComponents: [...evidenceReview.missingComponents],
      evidence: {
        ...(bundleDefinition
          ? {
              managementEntry: {
                status: 'present_in_related_workflow',
                paths: bundleDefinition.managementEntries.map((entry) => entry.path),
              },
              backendApi: {
                status: 'present_in_related_workflow',
                paths: bundleDefinition.backendApis.map((entry) => entry.path),
              },
            }
          : {}),
        dataFacts: { status: 'evidence_review_required' },
      },
    };
  }

  if (!bundleDefinition) {
    return {
      status: 'evidence_review_required',
      featureKey: 'unmapped_case_contract',
      reason: `题目合同未建立逐题产品闭环证据：domain=${item.domain ?? 'unknown'}, expectedTarget=${item.expectedTarget ?? 'unknown'}。`,
      missingComponents: ['management_entry', 'backend_api', 'data_facts'],
      evidence: {},
    };
  }
  const auditedDataFacts = PRODUCT_LOOP_DATA_FACTS?.features?.[bundleDefinition.featureKey];
  if (auditedDataFacts?.status !== 'present') {
    return {
      status: 'evidence_review_required',
      featureKey: bundleDefinition.featureKey,
      reason: '管理入口和正式接口已登记，但真实业务数据的只读审计证据缺失或未通过。',
      missingComponents: ['data_facts'],
      evidence: {
        managementEntry: {
          status: 'present',
          paths: bundleDefinition.managementEntries.map((entry) => entry.path),
          routePath: 'src/app/routes.tsx',
          routeAnchors: bundleDefinition.managementEntries.map((entry) => entry.routeAnchor),
        },
        backendApi: {
          status: 'present',
          paths: bundleDefinition.backendApis.map((entry) => entry.path),
          anchors: bundleDefinition.backendApis.map((entry) => entry.anchor),
        },
        dataFacts: { status: 'evidence_review_required' },
      },
    };
  }
  return {
    status: 'current_release_test',
    featureKey: bundleDefinition.featureKey,
    reason: '相关管理入口、正式接口和持久化业务事实均已存在；若 Ami Brain 尚未接入，按本轮能力缺口处理。',
    missingComponents: [],
    evidence: {
      managementEntry: {
        status: 'present',
        paths: bundleDefinition.managementEntries.map((entry) => entry.path),
        routePath: 'src/app/routes.tsx',
        routeAnchors: bundleDefinition.managementEntries.map((entry) => entry.routeAnchor),
      },
      backendApi: {
        status: 'present',
        paths: bundleDefinition.backendApis.map((entry) => entry.path),
        anchors: bundleDefinition.backendApis.map((entry) => entry.anchor),
      },
      dataFacts: {
        status: 'present',
        path: 'packages/server-v2/prisma/schema.prisma',
        models: bundleDefinition.models,
        auditPath: relativeToRepo(PRODUCT_LOOP_DATA_FACTS_PATH),
        auditSchemaChecksum: PRODUCT_LOOP_DATA_FACTS.schemaChecksum,
        auditSnapshotChecksum: PRODUCT_LOOP_DATA_FACTS.snapshotChecksum,
        storeId: PRODUCT_LOOP_DATA_FACTS.storeId,
        modelFacts: auditedDataFacts.modelFacts,
      },
    },
  };
}

export function questionContractChecksum(item) {
  const identity = {
    id: String(item.id ?? '').trim(),
    domain: String(item.domain ?? '').trim(),
    role: String(item.role ?? '').trim(),
    type: String(item.type ?? '').trim(),
    difficulty: String(item.difficulty ?? '').trim(),
    question: String(item.question ?? '').trim(),
    expectedTarget: String(item.expectedTarget ?? '').trim(),
    notes: String(item.notes ?? '').trim(),
  };
  return sha256(JSON.stringify(identity));
}

export function supplementalQuestionRegistry() {
  return structuredClone(SUPPLEMENTAL_QUESTION_REGISTRY);
}

export function assertProductLoopRegistry(repoRoot) {
  const schemaPath = resolve(repoRoot, 'packages/server-v2/prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');
  const routesPath = resolve(repoRoot, 'src/app/routes.tsx');
  const routes = readFileSync(routesPath, 'utf8');
  if (!PRODUCT_LOOP_DATA_FACTS) throw new Error('product loop data facts audit missing');
  if (
    PRODUCT_LOOP_DATA_FACTS.schemaVersion !== 'ami-brain-product-loop-data-facts/v1' ||
    PRODUCT_LOOP_DATA_FACTS.databaseHost !== 'aws-1-ap-northeast-1.pooler.supabase.com' ||
    PRODUCT_LOOP_DATA_FACTS.storeId !== 6 ||
    PRODUCT_LOOP_DATA_FACTS.schemaChecksum !== sha256(schema)
  ) {
    throw new Error('product loop data facts audit invalid or stale');
  }
  for (const definition of FEATURE_BUNDLES) {
    for (const entry of definition.managementEntries) {
      if (!existsSync(resolve(repoRoot, entry.path))) throw new Error(`product loop management path missing:${entry.path}`);
      if (!routes.includes(entry.routeAnchor)) {
        throw new Error(`product loop management route missing:${definition.featureKey}:${entry.routeAnchor}`);
      }
    }
    for (const entry of definition.backendApis) {
      const path = resolve(repoRoot, entry.path);
      if (!existsSync(path)) throw new Error(`product loop backend api path missing:${entry.path}`);
      if (!readFileSync(path, 'utf8').includes(entry.anchor)) {
        throw new Error(`product loop backend api anchor missing:${definition.featureKey}:${entry.anchor}`);
      }
    }
    for (const model of definition.models) {
      if (!schema.includes(`model ${model} `) && !schema.includes(`model ${model}{`)) {
        throw new Error(`product loop data model missing:${definition.featureKey}:${model}`);
      }
    }
  }
  for (const rule of NEXT_ITERATION_RULES) {
    const path = resolve(repoRoot, rule.decisionEvidence.path);
    if (!existsSync(path)) throw new Error(`next iteration decision evidence missing:${rule.featureKey}:${rule.decisionEvidence.path}`);
    if (!readFileSync(path, 'utf8').includes(rule.decisionEvidence.anchor)) {
      throw new Error(`next iteration decision anchor missing:${rule.featureKey}`);
    }
  }
  for (const definition of FEATURE_BUNDLES) {
    const audited = PRODUCT_LOOP_DATA_FACTS.features?.[definition.featureKey];
    if (audited?.status !== 'present') throw new Error(`product loop data facts unresolved:${definition.featureKey}`);
  }
  assertSupplementalQuestionRegistry(SUPPLEMENTAL_QUESTION_REGISTRY, repoRoot);
}

export function assertSupplementalQuestionRegistry(registry, repoRoot = REPO_ROOT) {
  if (registry?.schemaVersion !== 'ami-brain-supplemental-question-registry/v1' || !Array.isArray(registry.cases)) {
    throw new Error('supplemental question registry invalid');
  }
  const ids = registry.cases.map((item) => item?.id);
  if (ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error('supplemental question registry ids invalid');
  }
  for (const item of registry.cases) {
    if (!item.review) continue;
    const decision = resolveSupplementalReview(item, item, repoRoot);
    if (!decision) throw new Error(`supplemental question review invalid:${item.id}:unresolved`);
    if (decision.status === 'evidence_review_required') {
      continue;
    }
  }
}

function featureBundle(featureKey, domain, expectedTargets, evidence) {
  return { featureKey, domain, expectedTargets, ...evidence };
}

function evidence(managementEntries, backendApis, models) {
  return { managementEntries, backendApis, models: [...new Set(models)] };
}

function management(path, routeAnchor) {
  return { path, routeAnchor };
}

function api(path, anchor) {
  return { path, anchor };
}

function customerEvidence(models) {
  return evidence(
    [management('src/app/pages/CustomerData.tsx', "path: 'customers/data'")],
    [api('packages/server-v2/src/customers/customers.controller.ts', "@Controller('customers')")],
    models,
  );
}

function staffScheduleEvidence(models) {
  return evidence(
    [
      management('src/app/pages/BeauticianManagement.tsx', "path: 'stores/beauticians'"),
      management('src/app/pages/BeauticianLevelSettings.tsx', "path: 'stores/beautician-levels'"),
      management('src/app/pages/Scheduling.tsx', "path: 'stores/scheduling'"),
    ],
    [
      api('packages/server-v2/src/beauticians/beauticians.controller.ts', "@Get('beauticians')"),
      api('packages/server-v2/src/scheduling/scheduling.controller.ts', "@Controller('scheduling')"),
    ],
    models,
  );
}

function staffPerformanceEvidence(models) {
  return evidence(
    [
      management('src/app/pages/operation-profit/BeauticianPerformance.tsx', "path: 'operation-profit/beautician-performance'"),
      management('src/app/pages/CustomerFeedbackWorkbench.tsx', "path: 'customers/feedback'"),
      management('src/app/pages/Scheduling.tsx', "path: 'stores/scheduling'"),
    ],
    [
      api('packages/server-v2/src/operation-profit/operation-profit.controller.ts', "@Controller('operation-profit')"),
      api('packages/server-v2/src/customer-feedback/customer-feedback.controller.ts', "@Controller('customer-feedback')"),
      api('packages/server-v2/src/scheduling/scheduling.controller.ts', "@Controller('scheduling')"),
    ],
    models,
  );
}

function projectEvidence(models) {
  return evidence(
    [management('src/app/pages/ProjectManagement.tsx', "path: 'stores/projects'")],
    [api('packages/server-v2/src/projects/projects.controller.ts', "@Get('projects')")],
    models,
  );
}

function projectMarginEvidence(models) {
  return evidence(
    [management('src/app/pages/operation-profit/ProjectMarginAnalysis.tsx', "path: 'operation-profit/project-margins'")],
    [api('packages/server-v2/src/operation-profit/operation-profit.controller.ts', "@Controller('operation-profit')")],
    models,
  );
}

function orderEvidence(models) {
  return evidence(
    [management('src/app/pages/ProductOrderManagement.tsx', "path: 'orders/products'")],
    [api('packages/server-v2/src/orders/orders.controller.ts', "@Controller('orders')")],
    models,
  );
}

function cardRecognitionEvidence(models) {
  return evidence(
    [
      management('src/app/pages/CardVerification.tsx', "path: 'orders/card-usage'"),
      management('src/app/pages/operation-profit/PrepaidLiabilityAnalysis.tsx', "path: 'operation-profit/card-liabilities'"),
    ],
    [
      api('packages/server-v2/src/cards/cards.controller.ts', "@Controller('cards')"),
      api('packages/server-v2/src/operation-profit/operation-profit.controller.ts', "@Controller('operation-profit')"),
    ],
    models,
  );
}

function profitEvidence(models) {
  return evidence(
    [management('src/app/pages/operation-profit/OperationProfitOverview.tsx', "path: 'operation-profit/overview'")],
    [api('packages/server-v2/src/operation-profit/operation-profit.controller.ts', "@Controller('operation-profit')")],
    models,
  );
}

function reservationEvidence(models) {
  return evidence(
    [management('src/app/pages/ProjectReservation.tsx', "path: 'stores/reservations'")],
    [api('packages/server-v2/src/reservations/reservations.controller.ts', "@Controller('reservations')")],
    models,
  );
}

function schedulingEvidence(models) {
  return evidence(
    [management('src/app/pages/Scheduling.tsx', "path: 'stores/scheduling'")],
    [
      api('packages/server-v2/src/scheduling/scheduling.controller.ts', "@Controller('scheduling')"),
      api('packages/server-v2/src/scheduling/gap-opportunity.controller.ts', "@Controller('scheduling/gap-opportunities')"),
    ],
    models,
  );
}

function terminalEvidence(managementPath, routeAnchor, models) {
  return evidence(
    [management(managementPath, routeAnchor)],
    [api('packages/server-v2/src/terminal/terminal.controller.ts', "@Controller('terminal")],
    models,
  );
}

function inventoryEvidence(models) {
  return evidence(
    [management('src/app/pages/StockManagement.tsx', "path: 'inventory/stock'")],
    [api('packages/server-v2/src/inventory/inventory.controller.ts', "@Controller('inventory')")],
    models,
  );
}

function supplyEvidence(models) {
  return evidence(
    [management('src/app/pages/supply-platform/SupplyPlatformMvp.tsx', "path: 'supply-platform'")],
    [api('packages/server-v2/src/supply-platform/supply-platform.controller.ts', "@Controller('supply-platform')")],
    models,
  );
}

function financeEvidence(models) {
  return evidence(
    [management('src/app/pages/finance/FinanceOverview.tsx', "path: 'finance'")],
    [api('packages/server-v2/src/finance-metrics/finance-metrics.controller.ts', "@Controller('finance/metrics')")],
    models,
  );
}

function financeActionEvidence(models) {
  return evidence(
    [
      management('src/app/pages/finance/CommissionRecords.tsx', "path: 'finance/commission-records'"),
      management('src/app/pages/operation-profit/OperationCostSettings.tsx', "path: 'operation-profit/costs'"),
    ],
    [
      api('packages/server-v2/src/commission/commission.controller.ts', "@Controller('commission')"),
      api('packages/server-v2/src/operation-profit/operation-costs.controller.ts', "@Controller('operation-costs')"),
    ],
    models,
  );
}

function marketingEvidence(models) {
  return evidence(
    [management('src/app/pages/MarketingWorkbench.tsx', "path: 'customer-marketing/workbench'")],
    [api('packages/server-v2/src/marketing/marketing.controller.ts', "@Controller('marketing')")],
    models,
  );
}

function marketingAnalyticsEvidence(models) {
  return evidence(
    [management('src/app/pages/MarketingAnalytics.tsx', "path: 'customer-marketing/effect-analysis'")],
    [api('packages/server-v2/src/marketing/marketing.controller.ts', "@Controller('marketing')")],
    models,
  );
}

function industryEvidence(models) {
  return evidence(
    [management('src/app/pages/IndustryDataPlatform.tsx', "path: 'industry'")],
    [api('packages/server-v2/src/industry/industry.controller.ts', "@Controller('industry')")],
    models,
  );
}

function brainEvidence() {
  return evidence(
    [management('src/app/pages/brain/BrainWorkspace.tsx', "path: 'brain'")],
    [api('packages/server-v2/src/brain/brain.controller.ts', "@Controller('brain')")],
    ['BrainConversation', 'BrainRun', 'BrainRelease'],
  );
}

function featureRegistryKey(domain, expectedTarget) {
  return `${String(domain ?? '').trim()}\u0000${String(expectedTarget ?? '').trim()}`;
}

function hasUnboundNamedBusinessPeriod(text) {
  const segments = String(text ?? '')
    .split(/(?:→|->|第\s*\d+\s*轮\s*[:：])/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.some((segment) => {
    const namedPeriodPattern = /(?:双十一|双十二|618|六一八|国庆|春节|五一|劳动节|元旦|中秋|端午|七夕)(?:期间|假期|前后)?/u;
    if (!namedPeriodPattern.test(segment)) return false;
    const boundNamedPeriodPattern =
      /(?:20\d{2}年?|(?:今年|去年|前年)(?:的)?)\s*(?:双十一|双十二|618|六一八|国庆|春节|五一|劳动节|元旦|中秋|端午|七夕)(?:期间|假期|前后)?/u;
    const explicitDateRangePattern =
      /(?:20\d{2}年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*日\s*(?:至|到|[-~～—])\s*(?:20\d{2}年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*日/u;
    return !boundNamedPeriodPattern.test(segment) && !explicitDateRangePattern.test(segment);
  });
}

function missingRule(featureKey, pattern, missingComponents, reason, path, anchor) {
  return { featureKey, pattern, missingComponents, reason, decisionEvidence: { path, anchor } };
}

function componentEvidence(component, missingComponents) {
  return missingComponents.includes(component) ? { status: 'missing' } : { status: 'present_in_related_workflow' };
}

function resolveSupplementalReview(item, registeredCase, repoRoot = REPO_ROOT) {
  const review = registeredCase?.review;
  if (!review) return null;
  const questionChecksum = questionContractChecksum(item);
  if (questionChecksum !== questionContractChecksum(registeredCase) || review.questionChecksum !== questionChecksum) {
    return supplementalReviewFailure(item, review, '题目内容与已复核指纹不一致，原资格已失效。');
  }
  if (!review.reviewedBy || !/^\d{4}-\d{2}-\d{2}T/.test(review.reviewedAt ?? '')) {
    return supplementalReviewFailure(item, review, '逐题复核缺少复核人或 ISO 时间。');
  }
  if (!VALID_SUPPLEMENTAL_REVIEW_STATUSES.includes(review.status)) {
    return supplementalReviewFailure(item, review, '逐题复核结论无效。');
  }
  const evidenceReview = review.evidenceReview;
  const componentStatuses = {
    management_entry: evidenceReview?.managementEntry,
    backend_api: evidenceReview?.backendApi,
    data_facts: evidenceReview?.dataFacts,
  };
  if (Object.values(componentStatuses).some((status) => !['present', 'missing'].includes(status))) {
    return supplementalReviewFailure(item, review, '逐题复核必须明确标记管理入口、正式接口和真实业务数据三项状态。');
  }
  const missingComponents = Object.entries(componentStatuses)
    .filter(([, status]) => status === 'missing')
    .map(([component]) => component);
  const admission = {
    source: 'supplemental_question_registry_v1',
    questionChecksum,
    reviewChecksum: sha256(JSON.stringify(review)),
    reviewedBy: review.reviewedBy,
    reviewedAt: review.reviewedAt,
  };

  if (review.status === 'next_iteration_feature') {
    if (!missingComponents.length || !String(review.reason ?? '').trim()) {
      return supplementalReviewFailure(item, review, '下一轮功能标记必须至少有一项缺失证据并写明产品原因。');
    }
    const decisionEvidence = review.decisionEvidence;
    if (!decisionEvidence?.path || !decisionEvidence?.anchor) {
      return supplementalReviewFailure(item, review, '下一轮功能标记缺少可核对的产品决策证据。');
    }
    const decisionPath = resolve(repoRoot, decisionEvidence.path);
    if (!existsSync(decisionPath) || !readFileSync(decisionPath, 'utf8').includes(decisionEvidence.anchor)) {
      return supplementalReviewFailure(item, review, '下一轮功能的产品决策证据路径或锚点无效。');
    }
    const questionText = `${item.question ?? ''} ${item.expectedTarget ?? ''} ${item.notes ?? ''}`;
    const missingRule = NEXT_ITERATION_RULES.find((rule) => rule.pattern.test(questionText));
    const bundleDefinition = FEATURE_BUNDLE_BY_KEY.get(review.featureKey);
    const contractBundle = FEATURE_BUNDLE_BY_CASE_CONTRACT.get(featureRegistryKey(item.domain, item.expectedTarget));
    if (missingRule) {
      const declaredMissing = [...missingComponents].sort();
      const governedMissing = [...missingRule.missingComponents].sort();
      if (
        review.featureKey !== missingRule.featureKey ||
        JSON.stringify(declaredMissing) !== JSON.stringify(governedMissing) ||
        decisionEvidence.path !== missingRule.decisionEvidence.path ||
        decisionEvidence.anchor !== missingRule.decisionEvidence.anchor
      ) {
        return supplementalReviewFailure(
          item,
          review,
          '下一轮功能结论与已登记的缺失业务规则不一致，不能用人工标记覆盖产品闭环事实。',
        );
      }
    } else {
      if (!bundleDefinition || !contractBundle || contractBundle.featureKey !== bundleDefinition.featureKey) {
        return supplementalReviewFailure(
          item,
          review,
          '下一轮功能结论未绑定题目对应的已登记功能合同，也未命中正式缺失业务规则。',
        );
      }
      if (
        evidenceReview.managementEntry === 'missing' ||
        evidenceReview.backendApi === 'missing' ||
        evidenceReview.dataFacts !== 'missing'
      ) {
        return supplementalReviewFailure(
          item,
          review,
          '该功能合同已证明管理入口和正式接口存在；只有题目所需真实业务数据缺失时才能标记下一轮数据候选。',
        );
      }
    }
    return {
      status: 'next_iteration_feature',
      featureKey: review.featureKey,
      reason: review.reason,
      missingComponents,
      evidence: {
        managementEntry: reviewComponentEvidence(evidenceReview.managementEntry),
        backendApi: reviewComponentEvidence(evidenceReview.backendApi),
        dataFacts: reviewComponentEvidence(evidenceReview.dataFacts),
        decisionEvidence: { path: decisionEvidence.path, anchor: decisionEvidence.anchor },
      },
      admission,
    };
  }

  if (review.status === 'metric_definition_governance_required') {
    if (missingComponents.length) {
      return supplementalReviewFailure(
        item,
        review,
        '口径治理题必须先证明管理入口、正式接口和真实业务数据三项均为 present；三证据缺失不能用口径待定规避。',
      );
    }
    if (!String(review.reason ?? '').trim()) {
      return supplementalReviewFailure(item, review, '口径治理题必须写明待冻结的数据口径或指标定义。');
    }
    const bundleDefinition = FEATURE_BUNDLE_BY_KEY.get(review.featureKey);
    const contractBundle = FEATURE_BUNDLE_BY_CASE_CONTRACT.get(featureRegistryKey(item.domain, item.expectedTarget));
    if (!bundleDefinition || !contractBundle || contractBundle.featureKey !== bundleDefinition.featureKey) {
      return supplementalReviewFailure(
        item,
        review,
        '口径治理题必须绑定题目对应的已登记功能合同，不能借用同领域其他功能。',
      );
    }
    const decisionEvidence = review.decisionEvidence ?? review.metricDefinitionEvidence;
    if (!decisionEvidence?.path || !decisionEvidence?.anchor) {
      return supplementalReviewFailure(item, review, '口径治理题缺少可核对的数据口径或指标定义决策证据。');
    }
    const decisionPath = resolve(repoRoot, decisionEvidence.path);
    if (!existsSync(decisionPath) || !readFileSync(decisionPath, 'utf8').includes(decisionEvidence.anchor)) {
      return supplementalReviewFailure(item, review, '口径治理题的数据口径或指标定义证据路径或锚点无效。');
    }
    return {
      status: 'metric_definition_governance_required',
      featureKey: bundleDefinition.featureKey,
      reason: review.reason,
      missingComponents: [],
      evidence: {
        managementEntry: reviewComponentEvidence(evidenceReview.managementEntry),
        backendApi: reviewComponentEvidence(evidenceReview.backendApi),
        dataFacts: reviewComponentEvidence(evidenceReview.dataFacts),
        metricDefinition: {
          status: 'governance_required',
          decisionEvidence: { path: decisionEvidence.path, anchor: decisionEvidence.anchor },
        },
      },
      admission,
    };
  }

  if (missingComponents.length) {
    return supplementalReviewFailure(item, review, '本轮可执行题的三项产品闭环证据必须全部为 present。');
  }
  if (!['release-core', 'standard-regression', 'extended-rotation'].includes(review.suiteAssignment)) {
    return supplementalReviewFailure(
      item,
      review,
      '本轮可执行题必须明确指定 release-core、standard-regression 或 extended-rotation 之一。',
    );
  }
  admission.suiteAssignment = review.suiteAssignment;
  const bundleDefinition = FEATURE_BUNDLE_BY_KEY.get(review.featureKey);
  if (!bundleDefinition) {
    return supplementalReviewFailure(item, review, '本轮可执行题引用了未登记的功能合同。');
  }
  const contractBundle = FEATURE_BUNDLE_BY_CASE_CONTRACT.get(featureRegistryKey(item.domain, item.expectedTarget));
  if (!contractBundle || contractBundle.featureKey !== bundleDefinition.featureKey) {
    return supplementalReviewFailure(
      item,
      review,
      '本轮可执行题的 domain + expectedTarget 与声明的功能合同不一致，不能借用同领域其他功能的页面、接口或数据证据。',
    );
  }
  const businessOperation = requiredBusinessOperation(item);
  const managementEvidence = validateQuestionManagementEvidence({
    item,
    review,
    questionChecksum,
    businessOperation,
    bundleDefinition,
    repoRoot,
  });
  if (managementEvidence.error) {
    return supplementalReviewFailure(item, review, managementEvidence.error);
  }
  const backendApiEvidence = validateQuestionBackendApiEvidence({
    item,
    review,
    questionChecksum,
    businessOperation,
    bundleDefinition,
    repoRoot,
  });
  if (backendApiEvidence.error) {
    return supplementalReviewFailure(item, review, backendApiEvidence.error);
  }
  const auditedDataFacts = PRODUCT_LOOP_DATA_FACTS?.features?.[bundleDefinition.featureKey];
  if (auditedDataFacts?.status !== 'present') {
    return supplementalReviewFailure(item, review, '本轮可执行题引用的真实数据审计缺失或未通过。');
  }
  const requiredModels = [...new Set(review.requiredDataModels ?? [])];
  if (!requiredModels.length || requiredModels.some((model) => !bundleDefinition.models.includes(model))) {
    return supplementalReviewFailure(item, review, '本轮可执行题必须声明属于该功能合同的 requiredDataModels。');
  }
  const dataEvidence = review.dataEvidence;
  const evidenceModels = [...new Set(dataEvidence?.requiredDataModels ?? [])];
  if (
    dataEvidence?.questionChecksum !== questionChecksum ||
    dataEvidence?.auditSnapshotChecksum !== PRODUCT_LOOP_DATA_FACTS.snapshotChecksum ||
    dataEvidence?.storeId !== PRODUCT_LOOP_DATA_FACTS.storeId ||
    !String(dataEvidence?.path ?? '').trim() ||
    !String(dataEvidence?.anchor ?? '').trim() ||
    JSON.stringify(evidenceModels.sort()) !== JSON.stringify([...requiredModels].sort())
  ) {
    return supplementalReviewFailure(
      item,
      review,
      '本轮可执行题必须绑定与题目 checksum、当前数据快照、门店和 requiredDataModels 一致的题目级真实数据证据。',
    );
  }
  const dataEvidencePath = resolve(repoRoot, dataEvidence.path);
  const dataEvidenceRaw = existsSync(dataEvidencePath) ? readFileSync(dataEvidencePath, 'utf8') : '';
  if (
    !isQuestionLevelDataEvidencePath(dataEvidence.path) ||
    !dataEvidenceRaw.includes(dataEvidence.anchor) ||
    !dataEvidenceRaw.includes(questionChecksum)
  ) {
    return supplementalReviewFailure(item, review, '题目级真实数据证据路径或锚点无效。');
  }
  const allowEmptyModels = new Set(review.allowEmptyModels ?? []);
  const acceptedGlobalModels = new Set(review.acceptedGlobalModels ?? []);
  if (
    [...allowEmptyModels, ...acceptedGlobalModels].some((model) => !requiredModels.includes(model)) ||
    (acceptedGlobalModels.size && !String(review.globalScopeRationale ?? '').trim())
  ) {
    return supplementalReviewFailure(item, review, '空数据或全局数据例外必须限定在 requiredDataModels，并提供全局范围说明。');
  }
  const factsByModel = new Map((auditedDataFacts.modelFacts ?? []).map((fact) => [fact.model, fact]));
  for (const model of requiredModels) {
    const fact = factsByModel.get(model);
    if (fact?.status !== 'queried') {
      return supplementalReviewFailure(item, review, `必需数据模型 ${model} 未完成只读审计。`);
    }
    if (!(fact.count > 0) && !allowEmptyModels.has(model)) {
      return supplementalReviewFailure(item, review, `必需数据模型 ${model} 没有真实记录，且未声明为空结果测试。`);
    }
    if (fact.scope === 'global' && !acceptedGlobalModels.has(model)) {
      return supplementalReviewFailure(item, review, `必需数据模型 ${model} 只有全局计数，尚未确认适用于当前题目。`);
    }
  }
  return {
    status: 'current_release_test',
    featureKey: bundleDefinition.featureKey,
    reason: review.reason || '逐题核对确认管理入口、正式接口和题目所需真实业务事实均已存在。',
    missingComponents: [],
    evidence: {
      managementEntry: {
        status: 'present',
        operation: businessOperation,
        questionChecksum,
        entries: managementEvidence.entries,
      },
      backendApi: {
        status: 'present',
        operation: businessOperation,
        questionChecksum,
        entries: backendApiEvidence.entries,
      },
      dataFacts: {
        status: 'present',
        path: 'packages/server-v2/prisma/schema.prisma',
        models: requiredModels,
        allowEmptyModels: [...allowEmptyModels],
        acceptedGlobalModels: [...acceptedGlobalModels],
        globalScopeRationale: review.globalScopeRationale ?? null,
        auditPath: relativeToRepo(PRODUCT_LOOP_DATA_FACTS_PATH),
        auditSchemaChecksum: PRODUCT_LOOP_DATA_FACTS.schemaChecksum,
        auditSnapshotChecksum: PRODUCT_LOOP_DATA_FACTS.snapshotChecksum,
        storeId: PRODUCT_LOOP_DATA_FACTS.storeId,
        modelFacts: requiredModels.map((model) => factsByModel.get(model)),
        questionEvidence: {
          path: dataEvidence.path,
          anchor: dataEvidence.anchor,
          questionChecksum: dataEvidence.questionChecksum,
          auditSnapshotChecksum: dataEvidence.auditSnapshotChecksum,
          storeId: dataEvidence.storeId,
          requiredDataModels: evidenceModels,
        },
      },
    },
    admission,
  };
}

function supplementalReviewFailure(item, review, reason) {
  return {
    status: 'evidence_review_required',
    featureKey: review?.featureKey ?? 'unmapped_case_contract',
    reason,
    missingComponents: ['management_entry', 'backend_api', 'data_facts'],
    evidence: {},
    admission: {
      source: 'supplemental_question_registry_v1',
      questionChecksum: questionContractChecksum(item),
      reviewChecksum: review ? sha256(JSON.stringify(review)) : null,
    },
  };
}

function reviewComponentEvidence(status) {
  return { status };
}

function validateQuestionManagementEvidence({
  item,
  review,
  questionChecksum,
  businessOperation,
  bundleDefinition,
  repoRoot,
}) {
  const evidence = review.managementEvidence;
  if (
    evidence?.questionChecksum !== questionChecksum ||
    evidence?.operation !== businessOperation ||
    !Array.isArray(evidence?.entries) ||
    !evidence.entries.length
  ) {
    return {
      error: `本轮可执行题必须绑定与题目 checksum 和业务操作 ${businessOperation} 一致的题目级管理入口证据。`,
    };
  }
  const allowedEntries = new Map(bundleDefinition.managementEntries.map((entry) => [entry.path, entry]));
  const normalized = [];
  for (const entry of evidence.entries) {
    const registered = allowedEntries.get(entry?.path);
    if (
      !registered ||
      entry.routePath !== 'src/app/routes.tsx' ||
      entry.routeAnchor !== registered.routeAnchor ||
      !String(entry.interactionAnchor ?? '').trim()
    ) {
      return { error: '题目级管理入口证据未绑定已登记页面、正式路由和具体交互锚点。' };
    }
    const pagePath = resolve(repoRoot, entry.path);
    const routePath = resolve(repoRoot, entry.routePath);
    const pageRaw = existsSync(pagePath) ? readFileSync(pagePath, 'utf8') : '';
    const routeRaw = existsSync(routePath) ? readFileSync(routePath, 'utf8') : '';
    if (!pageRaw.includes(entry.interactionAnchor) || !routeRaw.includes(entry.routeAnchor)) {
      return { error: `题目级管理入口证据路径或锚点无效：${entry.path}` };
    }
    normalized.push({
      path: entry.path,
      routePath: entry.routePath,
      routeAnchor: entry.routeAnchor,
      interactionAnchor: entry.interactionAnchor,
    });
  }
  return { entries: normalized };
}

function validateQuestionBackendApiEvidence({
  item,
  review,
  questionChecksum,
  businessOperation,
  bundleDefinition,
  repoRoot,
}) {
  const evidence = review.backendApiEvidence;
  if (
    evidence?.questionChecksum !== questionChecksum ||
    evidence?.operation !== businessOperation ||
    !Array.isArray(evidence?.entries) ||
    !evidence.entries.length
  ) {
    return {
      error: `本轮可执行题必须绑定与题目 checksum 和业务操作 ${businessOperation} 一致的题目级正式 API 证据。`,
    };
  }
  const allowedPaths = new Set(bundleDefinition.backendApis.map((entry) => entry.path));
  const allowedMethods = allowedHttpMethods(businessOperation);
  const normalized = [];
  for (const entry of evidence.entries) {
    const method = String(entry?.httpMethod ?? '').toUpperCase();
    const route = String(entry?.route ?? '').trim();
    const handlerAnchor = String(entry?.handlerAnchor ?? '').trim();
    const permissionAnchor = String(entry?.permissionAnchor ?? '').trim();
    if (
      !allowedPaths.has(entry?.path) ||
      !allowedMethods.has(method) ||
      !route ||
      !handlerAnchor ||
      !permissionAnchor
    ) {
      return { error: '题目级正式 API 证据未绑定已登记后端、匹配的 HTTP 方法、路由、处理器和权限锚点。' };
    }
    const apiPath = resolve(repoRoot, entry.path);
    const apiRaw = existsSync(apiPath) ? readFileSync(apiPath, 'utf8') : '';
    const decoratorAnchor = `@${httpDecorator(method)}('${route}')`;
    if (
      !apiRaw.includes(decoratorAnchor) ||
      !apiRaw.includes(handlerAnchor) ||
      !apiRaw.includes(permissionAnchor)
    ) {
      return { error: `题目级正式 API 证据路径或锚点无效：${entry.path}` };
    }
    normalized.push({
      path: entry.path,
      httpMethod: method,
      route,
      decoratorAnchor,
      handlerAnchor,
      permissionAnchor,
    });
  }
  return { entries: normalized };
}

function requiredBusinessOperation(item) {
  const text = `${item?.question ?? ''} ${item?.notes ?? ''}`;
  if (/删除|移除|注销/u.test(text)) return 'delete';
  if (/新建|创建|新增|添加|录入|建档/u.test(text)) return 'create';
  if (/修改|更新|调整|改成|设置|变更/u.test(text)) return 'update';
  if (/确认|执行|发送|群发|退款|充值|采购|下单|调货|采纳|核销/u.test(text)) return 'execute';
  return 'read';
}

function allowedHttpMethods(operation) {
  return {
    read: new Set(['GET']),
    create: new Set(['POST']),
    update: new Set(['PUT', 'PATCH']),
    delete: new Set(['DELETE']),
    execute: new Set(['POST', 'PUT', 'PATCH']),
  }[operation] ?? new Set();
}

function httpDecorator(method) {
  return { GET: 'Get', POST: 'Post', PUT: 'Put', PATCH: 'Patch', DELETE: 'Delete' }[method] ?? method;
}

function isQuestionLevelDataEvidencePath(path) {
  const normalized = String(path ?? '').replaceAll('\\', '/');
  return (
    normalized.startsWith('docs/04-测试数据/Ami-Brain-题目级产品闭环证据/') ||
    normalized.startsWith('packages/server-v2/scripts/fixtures/')
  );
}

function loadProductLoopDataFacts() {
  if (!existsSync(PRODUCT_LOOP_DATA_FACTS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PRODUCT_LOOP_DATA_FACTS_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function loadSupplementalQuestionRegistry() {
  if (!existsSync(SUPPLEMENTAL_QUESTION_REGISTRY_PATH)) {
    return { schemaVersion: 'ami-brain-supplemental-question-registry/v1', cases: [] };
  }
  try {
    return JSON.parse(readFileSync(SUPPLEMENTAL_QUESTION_REGISTRY_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function relativeToRepo(path) {
  return path.replace(`${REPO_ROOT}/`, '');
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
