import { Injectable } from '@nestjs/common';
import type { AgentV2SemanticView, AgentV2SemanticViewStatus, AgentV2TextToSqlField } from './agent-v2-text-to-sql.types.js';

const textField = (name: string, description: string, roles: AgentV2TextToSqlField['roles'] = ['dimension']): AgentV2TextToSqlField => ({
  name,
  type: 'string',
  description,
  policy: 'allow',
  roles,
});

const numberField = (name: string, description: string, roles: AgentV2TextToSqlField['roles'] = ['measure']): AgentV2TextToSqlField => ({
  name,
  type: 'number',
  description,
  policy: 'allow',
  roles,
});

const dateField = (name: string, description: string): AgentV2TextToSqlField => ({
  name,
  type: 'date',
  description,
  policy: 'allow',
  roles: ['time', 'filter'],
});

const maskedTextField = (name: string, description: string): AgentV2TextToSqlField => ({
  name,
  type: 'string',
  description,
  policy: 'mask',
  roles: ['dimension'],
});

const baseStoreFields = [numberField('store_id', '授权门店 ID', ['filter']), textField('store_name', '门店名称')];

const INITIAL_ENABLED_VIEW_NAMES = new Set([
  'agent_v2_order_summary_view',
  'agent_v2_order_item_sales_view',
  'agent_v2_project_service_sales_view',
  'agent_v2_payment_refund_view',
  'agent_v2_daily_settlement_view',
  'agent_v2_product_inventory_view',
  'agent_v2_stock_movement_view',
  'agent_v2_inventory_scrap_view',
  'agent_v2_customer_profile_summary_view',
  'agent_v2_staff_profile_view',
  'agent_v2_staff_performance_view',
  'agent_v2_reservation_view',
  'agent_v2_marketing_conversion_view',
]);

const statusFor = (viewName: string): AgentV2SemanticViewStatus => INITIAL_ENABLED_VIEW_NAMES.has(viewName) ? 'enabled' : 'planned';

function view(input: AgentV2SemanticView): AgentV2SemanticView {
  return input;
}

export const AGENT_V2_TEXT_TO_SQL_SEMANTIC_VIEWS: AgentV2SemanticView[] = [
  view({
    id: 'store_summary',
    viewName: 'agent_v2_store_summary_view',
    domain: 'store',
    description: '门店基础资料和经营范围摘要。',
    status: statusFor('agent_v2_store_summary_view'),
    batch: 'P0',
    requiredPermissions: ['core:store:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'created_at',
    fields: [...baseStoreFields, textField('city', '城市'), textField('status', '门店状态'), dateField('created_at', '创建时间')],
    sampleQuestions: ['当前有哪些门店', '各门店经营状态怎么样'],
  }),
  view({
    id: 'customer_profile_summary',
    viewName: 'agent_v2_customer_profile_summary_view',
    domain: 'customer',
    description: '客户档案、会员等级、最近到店和消费摘要。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:customer:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'last_order_at',
    fields: [
      ...baseStoreFields,
      numberField('customer_id', '客户 ID', ['dimension']),
      maskedTextField('customer_name_masked', '脱敏客户姓名'),
      maskedTextField('phone_last4', '手机号后四位'),
      textField('member_level', '会员等级'),
      dateField('last_visit_at', '最近到店时间'),
      dateField('last_order_at', '最近消费时间'),
      numberField('total_paid_amount', '累计实收金额'),
      numberField('order_count', '消费订单数'),
      textField('tags_summary', '标签摘要'),
    ],
    sampleQuestions: ['最近高消费客户有哪些', '哪些客户很久没来了'],
  }),
  view({
    id: 'customer_behavior',
    viewName: 'agent_v2_customer_behavior_view',
    domain: 'customer',
    description: '客户消费、预约、小程序和营销互动行为。',
    status: 'planned',
    batch: 'P1',
    requiredPermissions: ['core:customer:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'event_at',
    fields: [
      ...baseStoreFields,
      numberField('customer_id', '客户 ID', ['dimension']),
      maskedTextField('customer_name_masked', '脱敏客户姓名'),
      textField('event_type', '行为类型'),
      dateField('event_at', '行为时间'),
      textField('event_source', '行为来源'),
      numberField('amount', '行为金额'),
      textField('channel', '渠道'),
    ],
    sampleQuestions: ['哪些客户最近互动下降', '哪些客户看了活动但没成交'],
  }),
  view({
    id: 'customer_health_skin',
    viewName: 'agent_v2_customer_health_skin_view',
    domain: 'customer',
    description: '客户肤况、皮肤测试和护理建议摘要。',
    status: 'planned',
    batch: 'P1',
    requiredPermissions: ['core:customer:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'test_at',
    fields: [
      ...baseStoreFields,
      numberField('customer_id', '客户 ID', ['dimension']),
      maskedTextField('customer_name_masked', '脱敏客户姓名'),
      textField('skin_type', '肤质'),
      textField('skin_condition_summary', '肤况摘要'),
      dateField('test_at', '测试时间'),
      textField('recommendation_summary', '建议摘要'),
    ],
    sampleQuestions: ['敏感肌客户最近做了什么项目', '哪类肤况客户最多'],
  }),
  view({
    id: 'order_summary',
    viewName: 'agent_v2_order_summary_view',
    domain: 'order',
    description: '订单、成交、实收、退款和客单价摘要。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:order:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'order_created_at',
    fields: [
      ...baseStoreFields,
      numberField('order_id', '订单 ID', ['dimension']),
      dateField('order_created_at', '下单时间'),
      numberField('customer_id', '客户 ID', ['dimension']),
      maskedTextField('customer_name_masked', '脱敏客户姓名'),
      textField('order_status', '订单状态'),
      numberField('total_amount', '订单总额'),
      numberField('paid_amount', '实收金额'),
      numberField('refund_amount', '退款金额'),
      numberField('net_amount', '净收金额'),
      textField('pay_method', '支付方式'),
    ],
    sampleQuestions: ['本月营业额多少', '上个月营业额和本月相比怎么样'],
  }),
  view({
    id: 'order_item_sales',
    viewName: 'agent_v2_order_item_sales_view',
    domain: 'product',
    description: '商品销售明细、销量排行和销售额排行。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:order:view', 'core:product:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'order_created_at',
    fields: [
      ...baseStoreFields,
      numberField('order_id', '订单 ID', ['dimension']),
      dateField('order_created_at', '订单时间'),
      numberField('product_id', '商品 ID', ['dimension']),
      textField('product_name', '商品名称'),
      textField('sku', 'SKU'),
      textField('category_name', '分类'),
      numberField('quantity', '销售数量'),
      numberField('gross_amount', '销售原额'),
      numberField('discount_amount', '优惠金额'),
      numberField('net_amount', '净销售额'),
      numberField('refund_amount', '退款金额'),
      textField('order_status', '订单状态'),
    ],
    sampleQuestions: ['本月销量最好的商品', '最近30天销售额最高的商品'],
  }),
  view({
    id: 'project_service_sales',
    viewName: 'agent_v2_project_service_sales_view',
    domain: 'project',
    description: '项目服务次数、项目销售额和项目毛利估算。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:order:view', 'core:project:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'order_created_at',
    fields: [
      ...baseStoreFields,
      numberField('project_id', '项目 ID', ['dimension']),
      textField('project_name', '项目名称'),
      textField('project_type', '项目分类'),
      dateField('order_created_at', '订单时间'),
      numberField('service_quantity', '服务次数'),
      numberField('net_amount', '项目净销售额'),
      numberField('estimated_material_cost', '预估耗材成本'),
      numberField('estimated_margin', '预估毛利'),
    ],
    sampleQuestions: ['上个月卖得最多的项目', '哪些护理项目毛利最高'],
  }),
  view({
    id: 'payment_refund',
    viewName: 'agent_v2_payment_refund_view',
    domain: 'finance',
    description: '支付、退款和售后退款摘要。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:finance:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'paid_at',
    fields: [
      ...baseStoreFields,
      numberField('order_id', '订单 ID', ['dimension']),
      dateField('paid_at', '支付时间'),
      dateField('refunded_at', '退款时间'),
      textField('payment_method', '支付方式'),
      numberField('payment_amount', '支付金额'),
      numberField('refund_amount', '退款金额'),
      textField('payment_status', '支付状态'),
      textField('refund_status', '退款状态'),
      textField('refund_reason_category', '退款原因分类'),
    ],
    sampleQuestions: ['最近退款最多的原因是什么', '本月实收退款净收是多少'],
  }),
  view({
    id: 'daily_settlement',
    viewName: 'agent_v2_daily_settlement_view',
    domain: 'finance',
    description: '日结、营收、退款、净收和订单数。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:finance:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'settlement_date',
    fields: [
      ...baseStoreFields,
      dateField('settlement_date', '日结日期'),
      numberField('revenue_amount', '营收金额'),
      numberField('paid_amount', '实收金额'),
      numberField('refund_amount', '退款金额'),
      numberField('net_amount', '净收金额'),
      numberField('order_count', '订单数'),
      numberField('customer_count', '客户数'),
    ],
    sampleQuestions: ['昨天日结情况', '本月每天营业额趋势'],
  }),
  view({
    id: 'cashier_shift',
    viewName: 'agent_v2_cashier_shift_view',
    domain: 'finance',
    description: '收银班次、交接班和班次收入。',
    status: 'planned',
    batch: 'P1',
    requiredPermissions: ['core:finance:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'opened_at',
    fields: [
      ...baseStoreFields,
      numberField('shift_id', '班次 ID', ['dimension']),
      textField('cashier_name', '收银员'),
      dateField('opened_at', '开班时间'),
      dateField('closed_at', '交班时间'),
      textField('shift_status', '班次状态'),
      numberField('system_cash', '系统现金'),
      numberField('cash_diff', '现金差异'),
    ],
    sampleQuestions: ['哪个班次收银最多', '今天有哪些未交班'],
  }),
  view({
    id: 'product_inventory',
    viewName: 'agent_v2_product_inventory_view',
    domain: 'inventory',
    description: '商品库存、安全库存、库存金额和临期信息。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:inventory:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'nearest_expiry_date',
    fields: [
      ...baseStoreFields,
      numberField('product_id', '商品 ID', ['dimension']),
      textField('product_name', '商品名称'),
      textField('sku', 'SKU'),
      textField('unit', '单位'),
      numberField('current_stock', '当前库存'),
      numberField('safety_stock', '安全库存'),
      numberField('stock_value', '库存金额'),
      dateField('nearest_expiry_date', '最近效期'),
      textField('status', '商品状态'),
    ],
    sampleQuestions: ['哪些商品缺货', '哪些商品快过期'],
  }),
  view({
    id: 'stock_movement',
    viewName: 'agent_v2_stock_movement_view',
    domain: 'inventory',
    description: '出入库、消耗、调拨和报废流水。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:inventory:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'occurred_at',
    fields: [
      ...baseStoreFields,
      numberField('movement_id', '流水 ID', ['dimension']),
      dateField('occurred_at', '发生时间'),
      textField('movement_type', '流水类型'),
      numberField('product_id', '商品 ID', ['dimension']),
      textField('product_name', '商品名称'),
      textField('sku', 'SKU'),
      numberField('quantity', '数量'),
      numberField('before_stock', '变动前库存'),
      numberField('after_stock', '变动后库存'),
      textField('source_type', '来源类型'),
    ],
    sampleQuestions: ['最近30天哪些商品消耗最多', '本周入库了哪些商品'],
  }),
  view({
    id: 'inventory_scrap',
    viewName: 'agent_v2_inventory_scrap_view',
    domain: 'inventory',
    description: '报废库存流水和报废原因。',
    status: 'enabled',
    batch: 'P0',
    requiredPermissions: ['core:inventory:view'],
    storeScopeField: 'store_id',
    defaultTimeField: 'occurred_at',
    fields: [
      ...baseStoreFields,
      numberField('movement_id', '流水 ID', ['dimension']),
      numberField('product_id', '商品 ID', ['dimension']),
      textField('product_name', '商品名称'),
      textField('sku', 'SKU'),
      numberField('scrap_quantity', '报废数量'),
      numberField('loss_amount', '报废损耗金额'),
      dateField('occurred_at', '报废时间'),
      textField('operator_name', '操作人'),
      textField('remark_summary', '报废备注摘要'),
    ],
    sampleQuestions: ['最近30天报废最多的产品有哪些', '哪类商品报废异常'],
  }),
];

const specificAdditionalViewFields: Record<string, AgentV2TextToSqlField[]> = {
  agent_v2_cashier_shift_view: [...baseStoreFields, numberField('shift_id', '班次 ID', ['dimension']), textField('cashier_name', '收银员'), dateField('opened_at', '开班时间'), dateField('closed_at', '交班时间'), textField('shift_status', '班次状态'), numberField('system_cash', '系统现金'), numberField('cash_diff', '现金差异')],
  agent_v2_purchase_procurement_view: [...baseStoreFields, numberField('procurement_id', '采购单 ID', ['dimension']), textField('procurement_no', '采购单号'), numberField('supplier_id', '供应商 ID', ['dimension']), textField('supplier_name', '供应商名称'), textField('status', '采购状态'), numberField('total_amount', '采购金额'), dateField('expected_arrival_date', '预计到货日期'), dateField('created_at', '创建时间'), dateField('received_at', '到货时间')],
  agent_v2_supplier_performance_view: [...baseStoreFields, numberField('supplier_id', '供应商 ID', ['dimension']), textField('supplier_name', '供应商名称'), numberField('procurement_count', '采购次数'), numberField('procurement_amount', '采购金额'), numberField('avg_delivery_days', '平均交付天数'), dateField('last_procurement_at', '最近采购时间')],
  agent_v2_project_catalog_view: [...baseStoreFields, numberField('project_id', '项目 ID', ['dimension']), textField('project_name', '项目名称'), textField('project_type', '项目类型'), numberField('price', '项目价格'), numberField('duration', '服务时长'), numberField('care_cycle_weeks', '护理周期周数'), numberField('treatment_course_times', '疗程次数'), textField('status', '项目状态'), dateField('updated_at', '更新时间')],
  agent_v2_card_asset_view: [...baseStoreFields, numberField('customer_id', '客户 ID', ['dimension']), maskedTextField('customer_name_masked', '脱敏客户姓名'), numberField('customer_card_id', '客户卡 ID', ['dimension']), textField('card_name', '卡项名称'), numberField('total_times', '总次数'), numberField('remaining_times', '剩余次数'), numberField('paid_amount', '购卡实收金额'), dateField('expiry_date', '到期日期'), textField('status', '卡状态')],
  agent_v2_card_usage_view: [...baseStoreFields, numberField('customer_id', '客户 ID', ['dimension']), maskedTextField('customer_name_masked', '脱敏客户姓名'), textField('card_name', '卡项名称'), textField('project_name', '项目名称'), numberField('times', '核销次数'), numberField('remaining_times', '剩余次数'), numberField('recognized_amount', '确认收入金额'), dateField('verified_at', '核销时间')],
  agent_v2_customer_balance_view: [...baseStoreFields, numberField('customer_id', '客户 ID', ['dimension']), maskedTextField('customer_name_masked', '脱敏客户姓名'), numberField('cash_balance', '现金余额'), numberField('gift_balance', '赠送余额'), textField('status', '账户状态'), dateField('updated_at', '更新时间')],
  agent_v2_reservation_view: [...baseStoreFields, numberField('reservation_id', '预约 ID', ['dimension']), numberField('customer_id', '客户 ID', ['dimension']), maskedTextField('customer_name_masked', '脱敏客户姓名'), numberField('project_id', '项目 ID', ['dimension']), textField('project_name', '项目名称'), numberField('beautician_id', '美容师 ID', ['dimension']), textField('beautician_name', '美容师姓名'), dateField('date', '预约日期'), textField('start_time', '开始时间'), textField('status', '预约状态')],
  agent_v2_schedule_resource_view: [...baseStoreFields, numberField('resource_id', '资源 ID', ['dimension']), textField('resource_name', '资源名称'), textField('resource_type', '资源类型'), textField('status', '资源状态'), numberField('booking_count', '预约占用次数'), dateField('latest_booking_date', '最近预约日期')],
  agent_v2_staff_profile_view: [...baseStoreFields, numberField('staff_id', '员工 ID', ['dimension']), textField('staff_name', '员工姓名'), textField('level_name', '员工等级'), textField('status', '员工状态'), dateField('created_at', '创建时间')],
  agent_v2_staff_performance_view: [...baseStoreFields, numberField('staff_id', '员工 ID', ['dimension']), textField('staff_name', '员工姓名'), dateField('settle_month', '结算月份'), numberField('paid_amount', '实收金额'), numberField('average_order_amount', '客单价'), numberField('commission_amount', '提成金额'), numberField('service_count', '服务次数')],
  agent_v2_service_quality_view: [...baseStoreFields, numberField('service_task_id', '服务任务 ID', ['dimension']), numberField('customer_id', '客户 ID', ['dimension']), numberField('project_id', '项目 ID', ['dimension']), textField('project_name', '项目名称'), numberField('beautician_id', '美容师 ID', ['dimension']), textField('beautician_name', '美容师姓名'), textField('status', '服务状态'), dateField('appointment_time', '预约时间'), dateField('completed_at', '完成时间')],
  agent_v2_marketing_activity_view: [...baseStoreFields, numberField('activity_id', '活动 ID', ['dimension']), textField('activity_title', '活动名称'), textField('status', '活动状态'), textField('publish_status', '发布状态'), dateField('start_at', '开始时间'), dateField('end_at', '结束时间'), numberField('participants', '参与人数'), numberField('conversion', '转化数')],
  agent_v2_marketing_conversion_view: [...baseStoreFields, numberField('activity_id', '活动 ID', ['dimension']), textField('activity_title', '活动名称'), numberField('event_count', '访问事件数'), numberField('lead_count', '线索数'), numberField('conversion_count', '转化数'), numberField('attributed_revenue', '归因收入'), dateField('latest_event_at', '最近事件时间')],
  agent_v2_marketing_automation_view: [...baseStoreFields, textField('automation_source', '自动化来源'), textField('trigger_type', '触发类型'), textField('status', '执行状态'), numberField('task_count', '任务数'), dateField('latest_task_at', '最近任务时间'), numberField('completed_count', '完成数')],
  agent_v2_promotion_offer_view: [...baseStoreFields, numberField('promotion_id', '促销 ID', ['dimension']), textField('promotion_name', '促销名称'), textField('type', '促销类型'), textField('scenario', '适用场景'), textField('discount_text', '优惠说明'), numberField('issued_count', '发放数'), numberField('used_count', '使用数'), textField('status', '状态'), dateField('start_at', '开始时间'), dateField('end_at', '结束时间')],
  agent_v2_customer_app_funnel_view: [...baseStoreFields, textField('channel', '渠道'), textField('event_type', '事件类型'), numberField('event_count', '事件数'), numberField('customer_count', '客户数'), dateField('latest_event_at', '最近事件时间')],
  agent_v2_recommendation_prediction_view: [...baseStoreFields, textField('scope', '推荐范围'), textField('type', '推荐类型'), numberField('card_count', '卡片数'), textField('source_version', '来源版本'), dateField('generated_at', '生成时间'), dateField('expires_at', '过期时间')],
  agent_v2_appointment_gap_view: [...baseStoreFields, numberField('opportunity_id', '机会 ID', ['dimension']), dateField('date', '日期'), textField('start_time', '开始时间'), textField('end_time', '结束时间'), numberField('available_capacity', '可用容量'), numberField('estimated_revenue', '预估收入'), numberField('candidate_count', '候选客户数'), textField('status', '状态')],
  agent_v2_operating_cost_view: [...baseStoreFields, numberField('cost_id', '成本 ID', ['dimension']), dateField('period_month', '所属月份'), dateField('cost_date', '成本日期'), textField('category', '成本类别'), numberField('amount', '成本金额'), textField('allocation_type', '分摊类型')],
  agent_v2_store_comparison_view: [...baseStoreFields, dateField('period_month', '所属月份'), numberField('revenue_amount', '营收金额'), numberField('refund_amount', '退款金额'), numberField('order_count', '订单数'), numberField('customer_count', '客户数')],
  agent_v2_terminal_device_view: [...baseStoreFields, numberField('device_id', '设备 ID', ['dimension']), textField('device_code', '设备编码'), textField('device_name', '设备名称'), textField('model', '设备型号'), textField('status', '设备状态'), textField('app_version', '应用版本'), textField('printer_status', '打印机状态'), dateField('last_online_at', '最近在线时间')],
  agent_v2_print_job_view: [...baseStoreFields, numberField('print_job_id', '打印任务 ID', ['dimension']), textField('job_no', '任务编号'), textField('source_type', '来源类型'), textField('title', '打印标题'), numberField('copies', '份数'), textField('status', '打印状态'), dateField('created_at', '创建时间'), dateField('completed_at', '完成时间')],
  agent_v2_industry_template_view: [...baseStoreFields, numberField('template_id', '模板 ID', ['dimension']), textField('template_name', '模板名称'), textField('category', '模板分类'), textField('price_range', '参考价格区间'), numberField('care_cycle_weeks', '护理周期周数'), numberField('treatment_course_times', '疗程次数'), textField('status', '模板状态'), dateField('updated_at', '更新时间')],
};

const specificAdditionalDefaultTimeFields: Record<string, string> = {
  agent_v2_cashier_shift_view: 'opened_at',
  agent_v2_purchase_procurement_view: 'created_at',
  agent_v2_supplier_performance_view: 'last_procurement_at',
  agent_v2_project_catalog_view: 'updated_at',
  agent_v2_card_asset_view: 'expiry_date',
  agent_v2_card_usage_view: 'verified_at',
  agent_v2_customer_balance_view: 'updated_at',
  agent_v2_reservation_view: 'date',
  agent_v2_schedule_resource_view: 'latest_booking_date',
  agent_v2_staff_profile_view: 'created_at',
  agent_v2_staff_performance_view: 'settle_month',
  agent_v2_service_quality_view: 'appointment_time',
  agent_v2_marketing_activity_view: 'start_at',
  agent_v2_marketing_conversion_view: 'latest_event_at',
  agent_v2_marketing_automation_view: 'latest_task_at',
  agent_v2_promotion_offer_view: 'start_at',
  agent_v2_customer_app_funnel_view: 'latest_event_at',
  agent_v2_recommendation_prediction_view: 'generated_at',
  agent_v2_appointment_gap_view: 'date',
  agent_v2_operating_cost_view: 'cost_date',
  agent_v2_store_comparison_view: 'period_month',
  agent_v2_terminal_device_view: 'last_online_at',
  agent_v2_print_job_view: 'created_at',
  agent_v2_industry_template_view: 'updated_at',
};

const additionalViews: AgentV2SemanticView[] = [
  ['purchase_procurement', 'agent_v2_purchase_procurement_view', 'supply', '采购、到货和供应链订单', 'P1', ['core:supply:view']],
  ['supplier_performance', 'agent_v2_supplier_performance_view', 'supply', '供应商、报价、资质和结算', 'P1', ['core:supply:view']],
  ['project_catalog', 'agent_v2_project_catalog_view', 'project', '项目、项目分类和项目 BOM', 'P1', ['core:project:view']],
  ['card_asset', 'agent_v2_card_asset_view', 'card', '卡项、客户卡和会员权益', 'P0', ['core:card:view']],
  ['card_usage', 'agent_v2_card_usage_view', 'card', '卡项核销和权益消耗', 'P0', ['core:card:view']],
  ['customer_balance', 'agent_v2_customer_balance_view', 'card', '储值余额和储值交易', 'P1', ['core:card:view']],
  ['reservation', 'agent_v2_reservation_view', 'reservation', '预约、到店和爽约', 'P0', ['core:reservation:view']],
  ['schedule_resource', 'agent_v2_schedule_resource_view', 'schedule', '排班、请假、资源和可用性', 'P1', ['core:schedule:view']],
  ['staff_profile', 'agent_v2_staff_profile_view', 'staff', '员工、美容师、等级和技能', 'P0', ['core:staff:view']],
  ['staff_performance', 'agent_v2_staff_performance_view', 'staff', '员工业绩、人效和提成', 'P0', ['core:staff:view', 'core:finance:view']],
  ['service_quality', 'agent_v2_service_quality_view', 'service', '服务任务和护理记录质量', 'P1', ['core:service:view']],
  ['marketing_activity', 'agent_v2_marketing_activity_view', 'marketing', '营销活动、页面和素材', 'P0', ['core:marketing:view']],
  ['marketing_conversion', 'agent_v2_marketing_conversion_view', 'marketing', '营销线索、归因和转化', 'P0', ['core:marketing:view']],
  ['marketing_automation', 'agent_v2_marketing_automation_view', 'marketing', '自动触达和策略执行', 'P1', ['core:marketing:view']],
  ['promotion_offer', 'agent_v2_promotion_offer_view', 'marketing', '优惠、促销和权益配置', 'P1', ['core:marketing:view']],
  ['customer_app_funnel', 'agent_v2_customer_app_funnel_view', 'channel', '小程序绑定、访问和渠道漏斗', 'P1', ['core:customer:view']],
  ['recommendation_prediction', 'agent_v2_recommendation_prediction_view', 'recommendation', '推荐、预测和客户机会', 'P1', ['core:marketing:view']],
  ['appointment_gap', 'agent_v2_appointment_gap_view', 'reservation', '预约空档机会和邀约候选', 'P1', ['core:reservation:view']],
  ['operating_cost', 'agent_v2_operating_cost_view', 'finance', '经营成本和费用项目', 'P1', ['core:finance:view']],
  ['store_comparison', 'agent_v2_store_comparison_view', 'store', '多店对比和经营排行', 'P1', ['core:store:view', 'core:finance:view']],
  ['terminal_device', 'agent_v2_terminal_device_view', 'terminal', '终端设备、会话和健康', 'P2', ['core:terminal:view']],
  ['print_job', 'agent_v2_print_job_view', 'terminal', '打印任务和打印状态', 'P2', ['core:terminal:view']],
  ['industry_template', 'agent_v2_industry_template_view', 'industry', '行业项目和商品模板', 'P2', ['core:industry:view']],
].map(([id, viewName, domain, description, batch, requiredPermissions]) =>
  view({
    id: String(id),
    viewName: String(viewName),
    domain: String(domain),
    description: String(description),
    status: statusFor(String(viewName)),
    batch: batch as AgentV2SemanticView['batch'],
    requiredPermissions: requiredPermissions as string[],
    storeScopeField: 'store_id',
    defaultTimeField: specificAdditionalDefaultTimeFields[String(viewName)],
    fields: specificAdditionalViewFields[String(viewName)],
    sampleQuestions: [],
  }),
);

const adminViewFields: Record<string, AgentV2TextToSqlField[]> = {
  agent_v2_user_role_permission_view: [...baseStoreFields, numberField('user_id', '用户 ID', ['dimension']), textField('user_name', '用户姓名'), textField('role_key', '角色编码'), textField('role_name', '角色名称'), textField('permissions', '权限摘要'), textField('user_status', '用户状态')],
  agent_v2_agent_governance_view: [numberField('run_id', '运行 ID', ['dimension']), textField('run_no', '运行编号'), textField('status', '状态'), textField('source_version_id', '来源版本'), textField('target_version_id', '目标版本'), dateField('started_at', '开始时间'), dateField('completed_at', '完成时间'), textField('error_message', '错误摘要')],
  agent_v2_ai_audit_view: [...baseStoreFields, numberField('audit_id', '审计 ID', ['dimension']), numberField('user_id', '用户 ID', ['dimension']), textField('model_name', '模型名称'), textField('scenario', '场景'), textField('status', '状态'), dateField('created_at', '创建时间')],
  agent_v2_data_quality_view: [...baseStoreFields, numberField('customer_count', '客户数'), numberField('product_count', '商品数'), numberField('order_count', '订单数'), numberField('missing_phone_customer_count', '缺手机号客户数'), dateField('checked_at', '检查时间')],
};

const adminViewMeta: Record<string, { requiredPermissions: string[]; storeScopeField?: string; defaultTimeField?: string; batch: AgentV2SemanticView['batch'] }> = {
  agent_v2_user_role_permission_view: { requiredPermissions: ['core:system:permissions'], storeScopeField: 'store_id', batch: 'P2' },
  agent_v2_agent_governance_view: { requiredPermissions: ['core:agent-governance:view'], defaultTimeField: 'started_at', batch: 'P1' },
  agent_v2_ai_audit_view: { requiredPermissions: ['core:agent-governance:view'], storeScopeField: 'store_id', defaultTimeField: 'created_at', batch: 'P2' },
  agent_v2_data_quality_view: { requiredPermissions: ['core:system:view'], storeScopeField: 'store_id', defaultTimeField: 'checked_at', batch: 'P2' },
};

const adminViews: AgentV2SemanticView[] = [
  ['user_role_permission', 'agent_v2_user_role_permission_view', 'system', '用户、角色和权限摘要'],
  ['agent_governance', 'agent_v2_agent_governance_view', 'agent', 'Agent 能力、发布和健康治理'],
  ['ai_audit', 'agent_v2_ai_audit_view', 'agent', 'AI 审计和 Agent 运行摘要'],
  ['data_quality', 'agent_v2_data_quality_view', 'system', '数据质量、缺字段和异常数据'],
].map(([id, viewName, domain, description]) => {
  const meta = adminViewMeta[String(viewName)];
  return view({
    id: String(id),
    viewName: String(viewName),
    domain: String(domain),
    description: String(description),
    status: 'planned',
    batch: meta.batch,
    adminOnly: true,
    requiredPermissions: meta.requiredPermissions,
    storeScopeField: meta.storeScopeField,
    defaultTimeField: meta.defaultTimeField,
    fields: adminViewFields[String(viewName)],
    sampleQuestions: [],
  });
});

const ALL_VIEWS = [...AGENT_V2_TEXT_TO_SQL_SEMANTIC_VIEWS, ...additionalViews, ...adminViews];

@Injectable()
export class AgentV2SemanticViewRegistryService {
  list(input?: { includePlanned?: boolean; includeAdmin?: boolean }) {
    return ALL_VIEWS.filter((item) => {
      if (!input?.includePlanned && item.status !== 'enabled') return false;
      if (!input?.includeAdmin && item.adminOnly) return false;
      return true;
    });
  }

  allDefinitions() {
    return [...ALL_VIEWS];
  }

  findByName(viewName: string) {
    return ALL_VIEWS.find((item) => item.viewName === viewName) ?? null;
  }

  findMany(viewNames: string[]) {
    const names = new Set(viewNames);
    return ALL_VIEWS.filter((item) => names.has(item.viewName));
  }

  recall(question: string, input?: { includePlanned?: boolean; includeAdmin?: boolean }) {
    const text = question.toLowerCase();
    const candidates = this.list(input)
      .map((viewDef) => ({ view: viewDef, score: this.score(viewDef, text) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((item) => item.view);
    return candidates.length ? candidates : this.defaultViews(input);
  }

  toPromptSchema(views: AgentV2SemanticView[]) {
    return views.map((viewDef) => ({
      viewName: viewDef.viewName,
      domain: viewDef.domain,
      description: viewDef.description,
      defaultTimeField: viewDef.defaultTimeField,
      storeScopeField: viewDef.storeScopeField,
      fields: viewDef.fields
        .filter((field) => field.policy !== 'deny')
        .map((field) => ({ name: field.name, type: field.type, description: field.description, policy: field.policy })),
    }));
  }

  private defaultViews(input?: { includePlanned?: boolean; includeAdmin?: boolean }) {
    return this.list(input).filter((item) => ['agent_v2_order_summary_view', 'agent_v2_customer_profile_summary_view'].includes(item.viewName));
  }

  private score(viewDef: AgentV2SemanticView, text: string) {
    const haystack = `${viewDef.viewName} ${viewDef.domain} ${viewDef.description} ${viewDef.sampleQuestions.join(' ')}`.toLowerCase();
    let score = 0;
    for (const token of this.questionTokens(text)) {
      if (haystack.includes(token)) score += 2;
    }
    if (/销量|销售|卖得|商品|sku/i.test(text) && viewDef.viewName === 'agent_v2_order_item_sales_view') score += 20;
    if (/报废|损耗|消耗|出入库|库存/i.test(text) && viewDef.viewName === 'agent_v2_inventory_scrap_view') score += 20;
    if (/营业额|营收|实收|退款|净收|日结/i.test(text) && viewDef.viewName === 'agent_v2_order_summary_view') score += 18;
    if (/客户|高消费|复购|沉睡|很久没来|流失/i.test(text) && viewDef.viewName === 'agent_v2_customer_profile_summary_view') score += 18;
    if (/互动|行为|访问|浏览|看了活动|复购下降|复购减少|消费下降/i.test(text) && viewDef.viewName === 'agent_v2_customer_behavior_view') score += 16;
    if (/员工|美容师|绩效|人效|客单价|提成/i.test(text) && viewDef.viewName === 'agent_v2_staff_performance_view') score += 18;
    if (/营销|活动|转化|线索|渠道/i.test(text) && viewDef.viewName === 'agent_v2_marketing_conversion_view') score += 18;
    if (/供应商|采购|到货|交付/i.test(text) && viewDef.viewName === 'agent_v2_supplier_performance_view') score += 18;
    if (/会员卡|卡项|权益|到期|过期|剩余次数/i.test(text) && viewDef.viewName === 'agent_v2_card_asset_view') score += 18;
    if (/小程序|绑定|客户.*端/i.test(text) && viewDef.viewName === 'agent_v2_customer_app_funnel_view') score += 22;
    if (/agent|能力|发布|manifest|dry-run/i.test(text) && viewDef.viewName === 'agent_v2_agent_governance_view') score += 18;
    return score;
  }

  private questionTokens(text: string) {
    return text
      .split(/[\s,，。？?、/]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);
  }
}
