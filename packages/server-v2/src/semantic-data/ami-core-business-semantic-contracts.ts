import type { CanonicalMetricPayload } from './brain-metric-candidate.types.js';

export const AMI_CORE_RUNTIME_QUERY_EXECUTOR = 'BusinessDefinitionRuntimeQueryExecutor.execute';

export interface AmiCoreBusinessMetricContract {
  readonly metricKey: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly domain: string;
  readonly capabilityKey: string;
  readonly executorSourcePath: string;
  readonly executorSymbol: string;
  readonly payload: CanonicalMetricPayload;
}

export interface AmiCoreBusinessDimensionContract {
  readonly dimensionKey: string;
  readonly name: string;
  readonly domain: string;
  readonly aliases: readonly string[];
  readonly source: { readonly model: string; readonly field: string };
  readonly derivation?: Readonly<Record<string, unknown>>;
  readonly capabilityKey: string;
  readonly capabilityKeys: readonly string[];
  readonly permissions: readonly string[];
}

const SEMANTIC_EXECUTOR_PATH =
  'packages/server-v2/src/brain/capability/executors/brain-semantic-query-capability.executor.ts';
const DOMAIN_EXECUTOR_PATH =
  'packages/server-v2/src/brain/capability/executors/brain-domain-service-capability.executor.ts';

export const AMI_CORE_BUSINESS_METRIC_CONTRACTS: readonly AmiCoreBusinessMetricContract[] = Object.freeze([
  metricContract({
    metricKey: 'product_sales_quantity',
    name: '商品销量',
    aliases: ['商品销量', '产品销量', '销售数量', '卖出数量'],
    domain: 'product',
    capabilityKey: 'product_sales_ranking',
    executorSymbol: 'BrainSemanticQueryCapabilityExecutor.productSalesRanking',
    description: '指定周期内当前门店已完成或已支付商品订单明细的销售数量。',
    valueType: 'count',
    measure: { aggregation: 'sum', model: 'OrderItem', field: 'quantity' },
    sourceModels: ['ProductOrder', 'OrderItem', 'Product'],
    joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
    filters: [
      { model: 'OrderItem', field: 'itemType', operator: 'eq', value: 'product' },
      { model: 'ProductOrder', field: 'status', operator: 'in', value: ['completed', 'paid'] },
    ],
    dimensions: ['productId', 'productName'],
    timeField: 'ProductOrder.createdAt',
    storeScope: {
      mode: 'current_store',
      model: 'OrderItem',
      field: 'storeId',
      joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
    },
    permission: 'core:order:products',
    template: 'template:product_sales',
    outputField: 'product_sales_quantity',
    exceptionPolicy: {
      cancelled: '仅统计 completed/paid 订单，取消订单不计入。',
      refunded: '整单退款状态不计入；部分退款数量需由退款明细口径另行扣减。',
      gifts: '赠品按实际出库数量计入销量，销售额指标单独处理。',
      fallback: '无法确认订单状态或商品类型时不计入并返回数据缺口。',
    },
    allowedTaskTypes: ['query', 'ranking'],
  }),
  metricContract({
    metricKey: 'project_service_count',
    name: '项目服务次数',
    aliases: ['项目服务次数', '项目次数', '护理项目次数'],
    domain: 'project',
    capabilityKey: 'project_service_ranking',
    capabilityKeys: ['store_operations_overview'],
    executorSymbol: 'BrainSemanticQueryCapabilityExecutor.projectServiceRanking',
    description: '指定周期内当前门店已完成或已支付项目订单明细的服务数量；次卡核销另列口径。',
    valueType: 'count',
    measure: { aggregation: 'sum', model: 'OrderItem', field: 'quantity' },
    sourceModels: ['ProductOrder', 'OrderItem', 'Project', 'CardUsageRecord'],
    joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
    filters: [
      { model: 'OrderItem', field: 'itemType', operator: 'eq', value: 'project' },
      { model: 'ProductOrder', field: 'status', operator: 'in', value: ['completed', 'paid'] },
    ],
    dimensions: ['projectId', 'projectName'],
    timeField: 'ProductOrder.createdAt',
    storeScope: {
      mode: 'current_store',
      model: 'OrderItem',
      field: 'storeId',
      joinPath: [{ fromModel: 'OrderItem', relationField: 'order', toModel: 'ProductOrder' }],
    },
    permission: 'core:project-order-profit:view',
    template: 'template:project_service',
    outputField: 'project_service_count',
    exceptionPolicy: {
      cancelled: '仅统计 completed/paid 订单，取消订单不计入。',
      refunded: '整单退款状态不计入；部分退款数量需由退款明细口径另行扣减。',
      gifts: '赠送项目按实际订单数量计入服务次数并在销售额指标中单独处理。',
      fallback: '次卡核销尚未并入口径时明确标注订单项目服务次数，不混算。',
    },
    allowedTaskTypes: ['query', 'ranking'],
  }),
  metricContract({
    metricKey: 'paid_amount',
    name: '实收金额',
    aliases: ['实收金额', '实收', '营业额', '营收', '流水', 'paid_revenue'],
    domain: 'finance',
    capabilityKey: 'order_revenue_analysis',
    capabilityKeys: ['finance_payment_breakdown', 'finance_risk_overview', 'store_operations_overview'],
    executorSymbol: 'BrainSemanticQueryCapabilityExecutor.orderRevenueAnalysis',
    description: '指定周期内当前门店支付成功记录的实收金额。',
    valueType: 'money',
    measure: { aggregation: 'sum', model: 'PaymentRecord', field: 'amount' },
    sourceModels: ['ProductOrder', 'PaymentRecord', 'RefundRecord'],
    joinPath: [{ fromModel: 'PaymentRecord', relationField: 'order', toModel: 'ProductOrder' }],
    filters: [{ model: 'PaymentRecord', field: 'status', operator: 'in', value: ['paid', 'success', 'completed'] }],
    dimensions: ['paymentMethod'],
    timeField: 'PaymentRecord.paidAt',
    storeScope: {
      mode: 'current_store',
      model: 'PaymentRecord',
      field: 'storeId',
      joinPath: [{ fromModel: 'PaymentRecord', relationField: 'order', toModel: 'ProductOrder' }],
    },
    permission: 'core:finance:view',
    template: 'template:order_revenue',
    outputField: 'paid_amount',
    exceptionPolicy: {
      cancelled: '未支付和取消支付记录不计入。',
      refunded: '实收为支付成功金额，退款金额由退款指标单独展示，不在本指标中静默抵扣。',
      gifts: '赠品不直接改变支付记录金额。',
      fallback: 'paidAt 为空的有效支付记录按 createdAt 口径另行治理，当前不纳入。',
    },
    allowedTaskTypes: ['query'],
  }),
  metricContract({
    metricKey: 'refund_amount',
    name: '退款金额',
    aliases: ['退款金额', '退款', '退回金额', '售后退款'],
    domain: 'finance',
    capabilityKey: 'finance_risk_overview',
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.financeRiskOverview',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    description: '指定周期内当前门店已完成退款记录的退款金额。',
    valueType: 'money',
    measure: { aggregation: 'sum', model: 'RefundRecord', field: 'amount' },
    sourceModels: ['RefundRecord', 'ProductOrder'],
    joinPath: [{ fromModel: 'RefundRecord', relationField: 'order', toModel: 'ProductOrder' }],
    filters: [{ model: 'RefundRecord', field: 'status', operator: 'in', value: ['refunded', 'success', 'completed'] }],
    dimensions: [],
    timeField: 'RefundRecord.refundedAt',
    storeScope: {
      mode: 'current_store',
      model: 'RefundRecord',
      field: 'storeId',
      joinPath: [{ fromModel: 'RefundRecord', relationField: 'order', toModel: 'ProductOrder' }],
    },
    permission: 'core:finance:view',
    template: 'template:finance_risk',
    outputField: 'refund_amount',
    exceptionPolicy: {
      cancelled: '申请中、失败或已取消的退款不计入。',
      refunded: '仅统计状态为 refunded/success/completed 的真实退款记录。',
      gifts: '赠品没有支付金额时不产生退款金额。',
      fallback: 'refundedAt 为空或无法关联原订单门店时不计入并返回数据缺口。',
    },
    allowedTaskTypes: ['query', 'diagnosis'],
    sensitive: true,
  }),
  metricContract({
    metricKey: 'refund_count',
    name: '退款笔数',
    aliases: ['退款笔数', '退款几笔', '退款次数'],
    domain: 'finance',
    capabilityKey: 'finance_risk_overview',
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.financeRiskOverview',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    description: '指定周期内当前门店已完成退款记录的笔数。',
    valueType: 'count',
    measure: { aggregation: 'count', model: 'RefundRecord', field: 'id' },
    sourceModels: ['RefundRecord', 'ProductOrder'],
    joinPath: [{ fromModel: 'RefundRecord', relationField: 'order', toModel: 'ProductOrder' }],
    filters: [{ model: 'RefundRecord', field: 'status', operator: 'in', value: ['refunded', 'success', 'completed'] }],
    dimensions: [],
    timeField: 'RefundRecord.refundedAt',
    storeScope: {
      mode: 'current_store',
      model: 'RefundRecord',
      field: 'storeId',
      joinPath: [{ fromModel: 'RefundRecord', relationField: 'order', toModel: 'ProductOrder' }],
    },
    permission: 'core:finance:view',
    template: 'template:finance_risk',
    outputField: 'refund_count',
    exceptionPolicy: {
      cancelled: '申请中、失败或已取消的退款不计入。',
      refunded: '仅统计状态为 refunded/success/completed 的真实退款记录。',
      gifts: '赠品没有退款记录时不产生退款笔数。',
      fallback: 'refundedAt 为空或无法关联原订单门店时不计入并返回数据缺口。',
    },
    allowedTaskTypes: ['query', 'diagnosis'],
    sensitive: true,
  }),
  metricContract({
    metricKey: 'discount_amount',
    name: '优惠金额',
    aliases: ['优惠金额', '折扣金额', '折扣优惠', '让利金额'],
    domain: 'finance',
    capabilityKey: 'finance_risk_overview',
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.financeRiskOverview',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    description: '指定周期内当前门店有效订单已记录的优惠金额合计。',
    valueType: 'money',
    measure: { aggregation: 'sum', model: 'ProductOrder', field: 'totalDiscountAmount' },
    sourceModels: ['ProductOrder'],
    joinPath: [],
    filters: [{ model: 'ProductOrder', field: 'status', operator: 'notIn', value: ['cancelled', 'canceled', 'refunded', '已取消'] }],
    dimensions: [],
    timeField: 'ProductOrder.createdAt',
    storeScope: { mode: 'current_store', model: 'ProductOrder', field: 'storeId', joinPath: [] },
    permission: 'core:finance:view',
    template: 'template:finance_risk',
    outputField: 'discount_amount',
    exceptionPolicy: {
      cancelled: '取消或整单退款订单不计入优惠金额。',
      refunded: '部分退款不自动重算原订单优惠，需由退款分摊口径另行治理。',
      gifts: '赠品价值不等同于订单优惠金额，未记录在 totalDiscountAmount 时不估算。',
      fallback: '订单未记录优惠金额时按 0 处理，不从原价与成交价反推。',
    },
    allowedTaskTypes: ['query', 'diagnosis'],
    sensitive: true,
  }),
  metricContract({
    metricKey: 'operating_cost_amount',
    name: '经营成本',
    aliases: ['经营成本', '运营成本', '成本支出', '门店成本'],
    domain: 'finance',
    capabilityKey: 'finance_risk_overview',
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.financeRiskOverview',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    description: '指定周期内当前门店经营成本记录的金额合计，可按成本类别拆分。',
    valueType: 'money',
    measure: { aggregation: 'sum', model: 'OperatingCost', field: 'amount' },
    sourceModels: ['OperatingCost'],
    joinPath: [],
    filters: [],
    dimensions: ['costCategory'],
    timeField: 'OperatingCost.costDate',
    storeScope: { mode: 'current_store', model: 'OperatingCost', field: 'storeId', joinPath: [] },
    permission: 'core:finance:view',
    template: 'template:finance_cost',
    outputField: 'operating_cost_amount',
    exceptionPolicy: {
      cancelled: '已删除或冲销成本必须通过业务记录调整，不在查询时静默修正。',
      refunded: '退款使用独立退款指标，不与经营成本混算。',
      gifts: '赠送活动产生的真实成本按已登记成本类别计入。',
      fallback: '缺少成本日期或类别时保留在未分类数据缺口，不自动归类。',
    },
    allowedTaskTypes: ['query', 'ranking', 'diagnosis'],
  }),
  resolverMetricContract({
    metricKey: 'staff_service_count',
    name: '员工服务次数',
    aliases: ['员工服务次数', '美容师服务次数', '美容师接客次数', '员工接客数'],
    domain: 'staff',
    capabilityKey: 'manager_staff_overview',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.managerStaffOverview',
    description: '指定周期内当前门店按美容师归属统计的有效服务任务数量。',
    sourceModels: ['Beautician', 'ServiceTask'],
    dimensions: ['beauticianId', 'beauticianName'],
    permission: 'core:beautician-performance:view',
    additionalPermissions: ['core:store:reservations'],
    template: 'template:staff_performance',
    outputField: 'staff_service_count',
    valueType: 'count',
    resolver: {
      kind: 'domain_service',
      key: 'manager_staff_analysis',
      dimensionFields: { beauticianId: 'beauticianId', beauticianName: 'name' },
      expression: { op: 'field', field: 'serviceCount' },
      overallAggregation: 'sum',
    },
    storeModel: 'Beautician',
    exceptionPolicy: {
      cancelled: '已取消服务任务不计入员工服务次数。',
      refunded: '退款不反向推断服务是否发生，以服务任务状态为准。',
      gifts: '赠送服务如形成有效服务任务，计入员工服务次数。',
      fallback: '缺少美容师归属的服务任务不计入个人排行，并在结果中提示未归属数据。',
    },
    allowedTaskTypes: ['query', 'ranking', 'diagnosis'],
  }),
  resolverMetricContract({
    metricKey: 'staff_unique_customer_count',
    name: '员工服务客户数',
    aliases: ['员工服务客户数', '美容师接待客户数', '美容师接客人数', '员工接客人数'],
    domain: 'staff',
    capabilityKey: 'manager_staff_overview',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.managerStaffOverview',
    description: '指定周期内当前门店按美容师归属去重统计的已服务客户数量。',
    sourceModels: ['Beautician', 'ServiceTask', 'Customer'],
    dimensions: ['beauticianId', 'beauticianName'],
    permission: 'core:beautician-performance:view',
    additionalPermissions: ['core:store:reservations'],
    template: 'template:staff_performance',
    outputField: 'staff_unique_customer_count',
    valueType: 'count',
    resolver: {
      kind: 'domain_service',
      key: 'manager_staff_analysis',
      dimensionFields: { beauticianId: 'beauticianId', beauticianName: 'name' },
      expression: { op: 'field', field: 'uniqueCustomerCount' },
      overallAggregation: 'sum',
    },
    storeModel: 'Beautician',
    exceptionPolicy: {
      cancelled: '已取消服务任务不计入员工服务客户数。',
      refunded: '退款不反向推断客户是否已接受服务，以服务任务状态为准。',
      gifts: '赠送服务如形成有效服务任务，对应客户计入员工服务客户数。',
      fallback: '缺少美容师或客户归属的服务任务不计入个人排行，并在结果中提示未归属数据。',
    },
    allowedTaskTypes: ['query', 'ranking', 'diagnosis'],
  }),
  resolverMetricContract({
    metricKey: 'staff_customer_repurchase_rate',
    name: '员工客户复购率',
    aliases: ['员工客户复购率', '美容师客户复购率', '谁的客户复购率最高'],
    domain: 'staff',
    capabilityKey: 'manager_staff_overview',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.managerStaffOverview',
    description: '指定周期内当前门店按美容师统计的重复服务客户数除以独立服务客户数。',
    sourceModels: ['Beautician', 'ServiceTask', 'Customer'],
    dimensions: ['beauticianId', 'beauticianName'],
    permission: 'core:beautician-performance:view',
    additionalPermissions: ['core:store:reservations'],
    template: 'template:staff_performance',
    outputField: 'staff_customer_repurchase_rate',
    valueType: 'percent',
    resolver: {
      kind: 'domain_service',
      key: 'manager_staff_analysis',
      dimensionFields: { beauticianId: 'beauticianId', beauticianName: 'name' },
      expression: {
        op: 'divide',
        numerator: { op: 'field', field: 'repeatCustomerCount' },
        denominator: { op: 'field', field: 'uniqueCustomerCount' },
        zero: 'zero',
      },
      overallAggregation: 'avg',
    },
    storeModel: 'Beautician',
    exceptionPolicy: {
      cancelled: '已取消服务任务不计入客户数与复购客户数。',
      refunded: '退款不反向推断服务是否发生，以有效服务任务为准。',
      gifts: '赠送服务如形成有效服务任务，计入服务客户与复购客户判断。',
    fallback: '独立服务客户数为 0 时复购率为 0，并明确显示样本量。',
    },
    allowedTaskTypes: ['query', 'ranking', 'diagnosis'],
    sensitive: true,
  }),
  resolverMetricContract({
    metricKey: 'staff_commission_amount',
    name: '员工提成金额',
    aliases: ['员工提成', '美容师提成', '提成金额', '谁提成最高'],
    domain: 'staff',
    capabilityKey: 'manager_staff_overview',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.managerStaffOverview',
    description: '指定周期内当前门店按美容师汇总的有效提成记录金额。',
    sourceModels: ['Beautician', 'CommissionRecord'],
    dimensions: ['beauticianId', 'beauticianName'],
    permission: 'core:beautician-performance:view',
    additionalPermissions: ['core:store:reservations'],
    template: 'template:staff_performance',
    outputField: 'staff_commission_amount',
    valueType: 'money',
    resolver: {
      kind: 'domain_service',
      key: 'manager_staff_analysis',
      dimensionFields: { beauticianId: 'beauticianId', beauticianName: 'name' },
      expression: { op: 'field', field: 'commissionAmount' },
      overallAggregation: 'sum',
    },
    storeModel: 'Beautician',
    exceptionPolicy: {
      cancelled: '已取消或拒绝的提成记录不计入。',
      refunded: '退款调整以后端提成记录最终金额为准，不在查询时二次估算。',
      gifts: '没有形成有效提成记录的赠送服务不产生提成金额。',
      fallback: '缺少美容师归属的提成记录不计入个人排行并返回数据缺口。',
    },
    allowedTaskTypes: ['query', 'ranking', 'diagnosis'],
    sensitive: true,
  }),
  resolverMetricContract({
    metricKey: 'staff_performance_score',
    name: '员工表现评分',
    aliases: ['员工表现评分', '员工表现', '员工业绩', '美容师业绩'],
    domain: 'staff',
    capabilityKey: 'staff_performance_ranking',
    capabilityKeys: ['beautician_service_overview', 'store_operations_overview', 'manager_staff_overview'],
    executorSymbol: 'BrainSemanticQueryCapabilityExecutor.staffPerformanceRanking',
    description: '按服务次数、实收贡献和复购客户数计算的员工综合表现评分。',
    sourceModels: ['Beautician', 'ServiceTask', 'CommissionRecord', 'BeauticianTimeOff'],
    dimensions: ['beauticianId', 'beauticianName'],
    permission: 'core:beautician-performance:view',
    template: 'template:staff_performance',
    outputField: 'staff_performance_score',
    resolver: {
      kind: 'domain_service',
      key: 'manager_staff_analysis',
      dimensionFields: { beauticianId: 'beauticianId', beauticianName: 'name' },
      expression: {
        op: 'multiply',
        left: {
          op: 'add',
          operands: [
            weightedRatio('serviceCount', 10, 0.5),
            weightedRatio('revenueAmount', 5000, 0.3),
            weightedRatio('repeatCustomerCount', 5, 0.2),
          ],
        },
        right: { op: 'constant', value: 100 },
      },
      overallAggregation: 'avg',
    },
    storeModel: 'Beautician',
    exceptionPolicy: {
      cancelled: '已取消服务任务不计入服务次数；已取消或拒绝的佣金记录不计入业绩贡献。',
      refunded: '退款不由评分公式自行推断，以佣金记录中已调整后的 sourceAmount 为准。',
      gifts: '赠送服务如已形成有效服务任务则计入服务次数；没有佣金记录时不产生业绩贡献。',
      fallback: '缺少员工归属的数据不参与个人排名，并在结果中提示未归属数据。',
    },
  }),
  resolverMetricContract({
    metricKey: 'new_customer_count',
    name: '周期新增客户数',
    aliases: ['新增客户数', '新客数', '新来了多少新客'],
    domain: 'customer',
    capabilityKey: 'customer_facts',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.customerFactsLookup',
    description: '指定周期内当前门店创建客户档案的去重客户数。',
    sourceModels: ['Customer', 'ProductOrder'],
    dimensions: [],
    permission: 'core:customer:view',
    template: 'template:customer_acquisition',
    outputField: 'new_customer_count',
    valueType: 'count',
    resolver: {
      kind: 'domain_service',
      key: 'customer_acquisition_conversion_summary',
      dimensionFields: {},
      expression: { op: 'field', field: 'newCustomerCount' },
      overallAggregation: 'sum',
    },
    storeModel: 'Customer',
    exceptionPolicy: {
      cancelled: '客户档案未软删除即计入周期新增客户，订单取消不影响新增客户数。',
      refunded: '退款不影响客户建档事实。',
      gifts: '赠送不影响客户建档事实。',
      fallback: '客户档案缺少来源不影响新客计数，但渠道分析需单独显示未记录。',
    },
    allowedTaskTypes: ['query', 'diagnosis'],
  }),
  resolverMetricContract({
    metricKey: 'new_customer_conversion_count',
    name: '周期新客转化数',
    aliases: ['新客转化数', '新客成交数', '新客首单人数', '转化了多少新客'],
    domain: 'customer',
    capabilityKey: 'customer_facts',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.customerFactsLookup',
    description: '指定周期新增客户中，在建档后且周期结束前完成至少一笔有效正金额订单的去重客户数。',
    sourceModels: ['Customer', 'ProductOrder'],
    dimensions: [],
    permission: 'core:customer:view',
    template: 'template:customer_acquisition',
    outputField: 'new_customer_conversion_count',
    valueType: 'count',
    resolver: {
      kind: 'domain_service',
      key: 'customer_acquisition_conversion_summary',
      dimensionFields: {},
      expression: { op: 'field', field: 'convertedCustomerCount' },
      overallAggregation: 'sum',
    },
    storeModel: 'Customer',
    exceptionPolicy: {
      cancelled: '取消、已取消或整单退款订单不计为转化。',
      refunded: '整单退款订单不计为转化；部分退款但仍保留正净额的订单继续视为有效消费。',
      gifts: '净额为 0 的赠送订单不计为转化。',
      fallback: '只统计建档后至周期结束的有效订单，不用预约或卡项创建替代首单转化。',
    },
    allowedTaskTypes: ['query', 'diagnosis'],
  }),
  resolverMetricContract({
    metricKey: 'new_customer_conversion_rate',
    name: '周期新客转化率',
    aliases: ['新客转化率', '新客成交率', '首单转化率'],
    domain: 'customer',
    capabilityKey: 'customer_facts',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.customerFactsLookup',
    description: '周期新客转化数除以周期新增客户数。',
    sourceModels: ['Customer', 'ProductOrder'],
    dimensions: [],
    permission: 'core:customer:view',
    template: 'template:customer_acquisition',
    outputField: 'new_customer_conversion_rate',
    valueType: 'percent',
    resolver: {
      kind: 'domain_service',
      key: 'customer_acquisition_conversion_summary',
      dimensionFields: {},
      expression: {
        op: 'divide',
        numerator: { op: 'field', field: 'convertedCustomerCount' },
        denominator: { op: 'field', field: 'newCustomerCount' },
        zero: 'zero',
      },
      overallAggregation: 'avg',
    },
    storeModel: 'Customer',
    exceptionPolicy: {
      cancelled: '沿用周期新客转化数的订单状态规则。',
      refunded: '沿用周期新客转化数的退款规则。',
      gifts: '沿用周期新客转化数的零金额赠送规则。',
      fallback: '周期新增客户数为 0 时转化率返回 0，并同时展示样本量。',
    },
    allowedTaskTypes: ['query', 'diagnosis'],
  }),
  resolverMetricContract({
    metricKey: 'average_return_interval_days',
    name: '客户平均回访间隔',
    aliases: ['平均回访间隔', '平均多久回来一次', '老客回店间隔'],
    domain: 'customer',
    capabilityKey: 'customer_facts',
    executorSourcePath: DOMAIN_EXECUTOR_PATH,
    executorSymbol: 'BrainDomainServiceCapabilityExecutor.customerFactsLookup',
    description: '统计周期内重复消费客户相邻两次有效消费时间间隔的平均天数。',
    sourceModels: ['Customer', 'ProductOrder'],
    dimensions: [],
    permission: 'core:customer:view',
    template: 'template:customer_retention',
    outputField: 'average_return_interval_days',
    valueType: 'duration',
    resolver: {
      kind: 'domain_service',
      key: 'customer_retention_summary',
      dimensionFields: {},
      expression: { op: 'field', field: 'averageReturnIntervalDays' },
      overallAggregation: 'avg',
    },
    storeModel: 'Customer',
    exceptionPolicy: {
      cancelled: '取消和整单退款订单不计入间隔。',
      refunded: '部分退款订单仍保留消费时间点，退款金额不影响间隔天数。',
      gifts: '零金额赠送订单不计入有效消费间隔。',
      fallback: '未指定时间时统一使用最近 180 天；没有重复消费样本时返回无可计算样本。',
    },
    allowedTaskTypes: ['query', 'diagnosis'],
  }),
  resolverMetricContract({
    metricKey: 'stock_risk_score',
    name: '库存风险评分',
    aliases: ['库存风险评分', '库存风险', '缺货风险'],
    domain: 'inventory',
    capabilityKey: 'inventory_risk_ranking',
    capabilityKeys: ['inventory_operations_overview', 'inventory_procurement_advice'],
    executorSymbol: 'BrainSemanticQueryCapabilityExecutor.inventoryRiskRanking',
    description: '当前库存低于安全库存的缺口数量，数值越高风险越高。',
    sourceModels: ['Product'],
    dimensions: ['productId', 'productName'],
    permission: 'core:inventory:stock',
    template: 'template:inventory_risk',
    outputField: 'stock_risk_score',
    resolver: {
      kind: 'domain_service',
      key: 'inventory_risk_summary',
      dimensionFields: { productId: 'productId', productName: 'name' },
      expression: {
        op: 'clamp',
        value: {
          op: 'subtract',
          left: { op: 'field', field: 'safetyStock' },
          right: { op: 'field', field: 'currentStock' },
        },
        min: 0,
        max: 1000000,
      },
      overallAggregation: 'sum',
    },
    storeModel: 'Product',
    exceptionPolicy: {
      cancelled: '不适用。',
      refunded: '退货入库应先形成库存流水，再影响当前库存。',
      gifts: '赠品出库应计入当前库存。',
      fallback: '安全库存缺失时不生成风险分数，并返回商品配置缺口。',
    },
  }),
  resolverMetricContract({
    metricKey: 'follow_up_priority_score',
    name: '客户跟进优先级评分',
    aliases: ['客户跟进优先级评分', '跟进优先级', '客户优先级', '召回优先级'],
    domain: 'customer',
    capabilityKey: 'customer_priority_recommendation',
    capabilityKeys: ['marketing_growth_overview'],
    executorSymbol: 'BrainSemanticQueryCapabilityExecutor.customerPriorityRecommendation',
    description: '取后台客户机会池中每位客户当前有效机会的最高分，作为人工跟进优先级。',
    sourceModels: ['CustomerOpportunity', 'Customer'],
    dimensions: ['customerId', 'customerName'],
    permission: 'core:marketing:analytics',
    template: 'template:customer_follow_up',
    outputField: 'follow_up_priority_score',
    resolver: {
      kind: 'domain_service',
      key: 'marketing_follow_up_opportunities',
      dimensionFields: { customerId: 'customerId', customerName: 'customerName' },
      expression: { op: 'field', field: 'score' },
      overallAggregation: 'max',
    },
    storeModel: 'CustomerOpportunity',
    allowedTaskTypes: ['query', 'ranking', 'recommendation'],
    exceptionPolicy: {
      cancelled: '已关闭、已取消或已删除的客户机会不参与跟进优先级。',
      refunded: '退款影响由后台预测与机会生成链路更新，不在 Ami Brain 查询时二次计算。',
      gifts: '赠送权益的影响由后台机会生成规则统一处理。',
      fallback: '没有当前有效客户机会时返回数据缺口，不使用另一套临时公式补分。',
    },
  }),
]);

export const AMI_CORE_BUSINESS_DIMENSION_CONTRACTS: readonly AmiCoreBusinessDimensionContract[] = Object.freeze([
  dimension('productId', '商品 ID', 'product', ['商品编号'], 'OrderItem', 'itemId', 'product_sales_ranking', [
    'core:brain:use',
  ]),
  dimension('productName', '商品名称', 'product', ['商品', '产品名称'], 'OrderItem', 'name', 'product_sales_ranking', [
    'core:brain:use',
  ]),
  dimension('projectId', '项目 ID', 'project', ['项目编号'], 'OrderItem', 'itemId', 'project_service_ranking', [
    'core:project-order-profit:view',
  ]),
  dimension('projectName', '项目名称', 'project', ['项目', '服务项目'], 'OrderItem', 'name', 'project_service_ranking', [
    'core:project-order-profit:view',
  ]),
  dimension('beauticianId', '美容师 ID', 'staff', ['员工编号'], 'Beautician', 'id', 'staff_performance_ranking', [
    'core:beautician-performance:view',
  ], ['manager_staff_overview']),
  dimension('beauticianName', '美容师姓名', 'staff', ['员工', '美容师'], 'Beautician', 'name', 'staff_performance_ranking', [
    'core:beautician-performance:view',
  ], ['manager_staff_overview']),
  dimension('customerId', '客户 ID', 'customer', ['客户编号'], 'Customer', 'id', 'customer_priority_recommendation', [
    'core:brain:use',
  ]),
  dimension('customerName', '客户姓名', 'customer', ['客户', '顾客姓名'], 'Customer', 'name', 'customer_priority_recommendation', [
    'core:brain:use',
  ]),
  dimension('customerSource', '客户来源', 'customer', ['新客来源', '获客渠道', '来源渠道'], 'Customer', 'source', 'customer_facts', [
    'core:customer:view',
  ]),
  dimension(
    'customerAgeGroup',
    '到店客户年龄段',
    'customer',
    ['客户年龄段', '年龄画像', '到店年龄分布'],
    'Customer',
    'age',
    'customer_facts',
    ['core:customer:view'],
    [],
    {
      kind: 'age_bucket',
      birthdayFallbackField: 'birthday',
      asOf: 'requested_range_end',
      buckets: ['24岁及以下', '25-34岁', '35-44岁', '45-54岁', '55岁及以上'],
      unknownPolicy: 'separate_count',
      population: 'unique_arrived_customers',
    },
  ),
  dimension('paymentMethod', '支付方式', 'finance', ['收款方式', '支付渠道', '现金', '微信', '支付宝', '银行卡', '储值余额'], 'PaymentRecord', 'method', 'finance_payment_breakdown', [
    'core:finance:view',
  ], ['finance_risk_overview']),
  dimension('costCategory', '成本类别', 'finance', ['费用类别', '成本分类', '支出类别'], 'OperatingCost', 'category', 'finance_risk_overview', [
    'core:finance:view',
  ]),
  dimension('marketingChannel', '营销渠道', 'marketing', ['渠道', '触达渠道', '微信', '短信', '小程序'], 'MarketingAutomationTouch', 'channel', 'marketing_growth_overview', [
    'core:marketing:analytics',
  ]),
]);

function metricContract(
  input: Omit<AmiCoreBusinessMetricContract, 'payload' | 'executorSourcePath'> & {
    description: string;
    valueType: CanonicalMetricPayload['valueType'];
    measure: CanonicalMetricPayload['measure'];
    sourceModels: string[];
    joinPath: CanonicalMetricPayload['joinPath'];
    filters: CanonicalMetricPayload['filters'];
    dimensions: string[];
    timeField: string;
    storeScope: CanonicalMetricPayload['storeScope'];
    permission: string;
    additionalPermissions?: string[];
    template: string;
    outputField: string;
    exceptionPolicy: CanonicalMetricPayload['exceptionPolicy'];
    allowedTaskTypes: CanonicalMetricPayload['allowedTaskTypes'];
    executorSourcePath?: string;
    sensitive?: boolean;
    capabilityKeys?: string[];
  },
): AmiCoreBusinessMetricContract {
  const capabilityKeys = [...new Set([input.capabilityKey, ...(input.capabilityKeys ?? [])])];
  const payload: CanonicalMetricPayload = {
    metricKey: input.metricKey,
    aliases: [...input.aliases],
    description: input.description,
    valueType: input.valueType,
    allowedTaskTypes: input.allowedTaskTypes,
    sensitive: input.sensitive ?? input.metricKey === 'staff_performance_score',
    measure: input.measure,
    sourceModels: input.sourceModels,
    joinPath: input.joinPath,
    filters: input.filters,
    dimensions: input.dimensions,
    timePolicy: {
      mode: 'event_time',
      field: input.timeField,
      boundary: '[start,end)',
      timezone: 'Asia/Shanghai',
    },
    storeScope: input.storeScope,
    permissionPolicies: capabilityKeys.map((bindingRef) => ({
      bindingRef,
      allOf: [...new Set(['core:brain:use', input.permission, ...(input.additionalPermissions ?? [])])],
    })),
    exceptionPolicy: input.exceptionPolicy,
    bindings: {
      template: [input.template],
      capability: capabilityKeys,
      executor: [AMI_CORE_RUNTIME_QUERY_EXECUTOR],
      outputField: [input.outputField],
      sort: { outputField: input.outputField, direction: 'desc', missing: 'error' },
    },
  };
  return Object.freeze({
    metricKey: input.metricKey,
    name: input.name,
    aliases: Object.freeze([...input.aliases]),
    domain: input.domain,
    capabilityKey: input.capabilityKey,
    executorSourcePath: input.executorSourcePath ?? SEMANTIC_EXECUTOR_PATH,
    executorSymbol: input.executorSymbol,
    payload,
  });
}

function resolverMetricContract(
  input: Omit<AmiCoreBusinessMetricContract, 'payload' | 'executorSourcePath'> & {
    description: string;
    sourceModels: string[];
    dimensions: string[];
    permission: string;
    additionalPermissions?: string[];
    template: string;
    outputField: string;
    resolver: NonNullable<CanonicalMetricPayload['measure']['resolver']>;
    storeModel: string;
    exceptionPolicy: CanonicalMetricPayload['exceptionPolicy'];
    allowedTaskTypes?: CanonicalMetricPayload['allowedTaskTypes'];
    capabilityKeys?: string[];
    executorSourcePath?: string;
    valueType?: CanonicalMetricPayload['valueType'];
    sensitive?: boolean;
  },
): AmiCoreBusinessMetricContract {
  return metricContract({
    ...input,
    valueType: input.valueType ?? 'score',
    measure: { aggregation: 'score', resolver: input.resolver },
    joinPath: [],
    filters: [],
    timeField: `${input.storeModel}.createdAt`,
    storeScope: { mode: 'current_store', model: input.storeModel, field: 'storeId', joinPath: [] },
    allowedTaskTypes: input.allowedTaskTypes ?? ['query', 'ranking'],
  });
}

function weightedRatio(field: string, denominator: number, weight: number) {
  return {
    op: 'multiply' as const,
    left: {
      op: 'clamp' as const,
      value: {
        op: 'divide' as const,
        numerator: { op: 'field' as const, field },
        denominator: { op: 'constant' as const, value: denominator },
        zero: 'error' as const,
      },
      min: 0,
      max: 1,
    },
    right: { op: 'constant' as const, value: weight },
  };
}

function dimension(
  dimensionKey: string,
  name: string,
  domain: string,
  aliases: string[],
  model: string,
  field: string,
  capabilityKey: string,
  permissions: string[],
  capabilityKeys: string[] = [],
  derivation?: Record<string, unknown>,
): AmiCoreBusinessDimensionContract {
  const allCapabilityKeys = [...new Set([capabilityKey, ...capabilityKeys])];
  return Object.freeze({
    dimensionKey,
    name,
    domain,
    aliases: Object.freeze(aliases),
    source: Object.freeze({ model, field }),
    ...(derivation ? { derivation: Object.freeze(structuredClone(derivation)) } : {}),
    capabilityKey,
    capabilityKeys: Object.freeze(allCapabilityKeys),
    permissions: Object.freeze(permissions),
  });
}
