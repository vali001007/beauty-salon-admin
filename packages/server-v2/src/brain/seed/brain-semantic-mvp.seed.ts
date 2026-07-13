export const BRAIN_MVP_DOMAINS = [
  { domain: 'customer', entities: ['customer', 'health_profile', 'customer_lifecycle', 'customer_opportunity'] },
  { domain: 'staff', entities: ['beautician', 'level', 'skill', 'schedule', 'commission'] },
  { domain: 'catalog', entities: ['project', 'project_type', 'product', 'product_category', 'bom', 'card'] },
  { domain: 'transaction', entities: ['product_order', 'project_order', 'card_order', 'payment', 'refund', 'balance_account'] },
  { domain: 'fulfillment', entities: ['reservation', 'service_task', 'card_verification', 'resource_slot'] },
  { domain: 'inventory', entities: ['stock_batch', 'stock_movement', 'purchase_order', 'transfer_order', 'expiry_warning'] },
  { domain: 'finance', entities: ['cashier_shift', 'daily_settlement', 'operation_cost', 'commission_record', 'profit_metric'] },
  { domain: 'marketing', entities: ['campaign', 'marketing_page', 'automation_rule', 'touch_event', 'attribution', 'recommendation'] },
  { domain: 'supply_chain', entities: ['supplier', 'supplier_sku', 'quote', 'shipment', 'settlement'] },
  { domain: 'industry', entities: ['service_template', 'product_template', 'bom_template', 'knowledge_entry', 'salary_benchmark'] },
] as const;

export const BRAIN_MVP_METRICS = [
  { metricKey: 'paid_revenue', name: '实收流水', domain: 'transaction', permissions: ['core:finance:view'] },
  { metricKey: 'gross_margin', name: '毛利额', domain: 'finance', permissions: ['core:operation-profit:view'] },
  { metricKey: 'gross_margin_rate', name: '毛利率', domain: 'finance', permissions: ['core:operation-profit:view'] },
  { metricKey: 'appointment_count', name: '预约数', domain: 'fulfillment', permissions: ['core:store:reservations'] },
  { metricKey: 'reservation_arrival_rate', name: '到店率', domain: 'fulfillment', permissions: ['core:store:reservations'] },
  { metricKey: 'card_liability', name: '次卡/储值负债', domain: 'finance', permissions: ['core:prepaid-liability:view'] },
  { metricKey: 'card_consumption_rate', name: '次卡履约率', domain: 'fulfillment', permissions: ['core:order:card-usage'] },
  { metricKey: 'repurchase_rate', name: '复购率', domain: 'customer', permissions: ['core:customer:view'] },
  { metricKey: 'customer_unit_price', name: '客单价', domain: 'transaction', permissions: ['core:order:products'] },
  { metricKey: 'staff_productivity', name: '人效', domain: 'staff', permissions: ['core:finance:view'] },
  { metricKey: 'stockout_sku_count', name: '缺货 SKU 数', domain: 'inventory', permissions: ['core:inventory:stock'] },
  { metricKey: 'expiring_stock_value', name: '临期库存金额', domain: 'inventory', permissions: ['core:inventory:expiry'] },
  { metricKey: 'marketing_roi', name: '营销 ROI', domain: 'marketing', permissions: ['core:marketing:analytics'] },
  { metricKey: 'churn_high_risk_customer_count', name: '高流失风险客户数', domain: 'customer', permissions: ['core:marketing:analytics'] },
] as const;

export const BRAIN_MVP_DIMENSIONS = [
  { dimensionKey: 'store', name: '门店', domain: 'common' },
  { dimensionKey: 'date', name: '日期', domain: 'common' },
  { dimensionKey: 'month', name: '月份', domain: 'common' },
  { dimensionKey: 'customer_segment', name: '客户分层', domain: 'customer' },
  { dimensionKey: 'beautician', name: '美容师', domain: 'staff' },
  { dimensionKey: 'project', name: '项目', domain: 'catalog' },
  { dimensionKey: 'product_category', name: '商品品类', domain: 'catalog' },
  { dimensionKey: 'marketing_channel', name: '营销渠道', domain: 'marketing' },
] as const;

export const BRAIN_MVP_RELATIONS = [
  { relationKey: 'customer_has_card', from: 'customer', to: 'card', name: '客户持有次卡' },
  { relationKey: 'card_verified_by_task', from: 'card', to: 'service_task', name: '次卡通过服务任务核销' },
  { relationKey: 'service_task_assigned_to_beautician', from: 'service_task', to: 'beautician', name: '服务任务由美容师执行' },
  { relationKey: 'order_contains_order_item', from: 'order', to: 'order_item', name: '订单包含明细' },
  { relationKey: 'project_consumes_bom_product', from: 'project', to: 'product', name: '项目消耗 BOM 商品' },
  { relationKey: 'product_stock_from_supplier', from: 'product', to: 'supplier', name: '商品库存来自供应商' },
  { relationKey: 'customer_in_lifecycle_stage', from: 'customer', to: 'customer_lifecycle', name: '客户处于生命周期阶段' },
  { relationKey: 'customer_opportunity_touched_by_marketing', from: 'customer_opportunity', to: 'touch_event', name: '客户机会被营销触达' },
] as const;
