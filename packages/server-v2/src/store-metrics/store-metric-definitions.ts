import type { StoreMetricDefinition } from './store-metrics.types.js';

export const STORE_METRIC_KEYS = {
  paidRevenue: 'store.paid_revenue.today',
  operatingRevenue: 'store.operating_revenue.today',
  grossMarginRate: 'store.gross_margin_rate.today',
  firstVisitArrivalRate: 'customer.first_visit_arrival_rate',
  firstVisitConversionRate: 'customer.first_visit_conversion_rate',
  newCustomer30dRepurchaseRate: 'customer.new_customer_30d_repurchase_rate',
  checkoutRebookingRate: 'reservation.checkout_rebooking_rate',
  noShowRate: 'reservation.no_show_rate',
  serviceTimeUtilizationRate: 'staff.service_time_utilization_rate',
  revenuePerServiceHour: 'staff.operating_revenue_per_service_hour',
  memberRenewalRate: 'member.renewal_rate',
  monthlyTargetCompletionRate: 'store.monthly_target_completion_rate',
} as const;

export const STORE_METRIC_TARGET_KEYS = Object.freeze([
  'store.operating_revenue.month',
]);

export const STORE_METRIC_DEFINITIONS: readonly StoreMetricDefinition[] = Object.freeze([
  ['paidRevenue', '今日实收', '今日有效外部支付减成功退款。', 'CNY', '/finance/reconciliation', ['PaymentRecord', 'RefundRecord']],
  ['operatingRevenue', '今日经营收入', '今日已完成商品交付或服务履约的确认收入。', 'CNY', '/finance/profit', ['OrderItem', 'CardUsageRecord', 'RefundItem']],
  ['grossMarginRate', '毛利率', '经营收入扣除直接耗材、商品成本和服务提成后的利润比例。', 'percent', '/finance/profit', ['DailySettlementSnapshot', 'StockMovement', 'CommissionRecord']],
  ['firstVisitArrivalRate', '新客首次到店率', '首次有效预约新客中的实际到店比例。', 'percent', '/stores/reservations', ['Reservation', 'Customer']],
  ['firstVisitConversionRate', '首次到店成交率', '首次到店新客中产生有效经营收入的比例。', 'percent', '/orders/products', ['Reservation', 'OrderItem', 'CardUsageRecord']],
  ['newCustomer30dRepurchaseRate', '30天新客复购率', '首购后30天内再次产生有效经营收入的新客比例。', 'percent', '/customers/data', ['ProductOrder', 'CardUsageRecord', 'Customer']],
  ['checkoutRebookingRate', '现场再预约率', '完成服务后当日成功预约下一次服务的客户比例。', 'percent', '/stores/reservations', ['Reservation']],
  ['noShowRate', '预约爽约率', '应到店预约中爽约或截止后取消的比例。', 'percent', '/stores/reservations', ['Reservation', 'ReservationStatusEvent']],
  ['serviceTimeUtilizationRate', '美容师工时利用率', '实际服务工时占净可售排班工时的比例。', 'percent', '/stores/scheduling', ['Schedule', 'BeauticianTimeOff', 'ServiceTask']],
  ['revenuePerServiceHour', '单位服务工时产值', '每个实际服务小时产生的经营收入。', 'CNY_PER_HOUR', '/finance/staff-commission', ['OrderItem', 'CardUsageRecord', 'ServiceTask']],
  ['memberRenewalRate', '会员续费率', '进入续费窗口的会员资产中完成续卡的比例。', 'percent', '/finance/member-assets', ['CustomerCard']],
  ['monthlyTargetCompletionRate', '门店月度目标达成率', '本月累计经营收入相对月度经营收入目标的完成比例。', 'percent', '/store-operations/metrics/targets', ['StoreMetricTarget', 'BrainStoreOperatingTarget']],
].map(([key, name, description, unit, drilldownPath, sourceModels]) => ({
  key: STORE_METRIC_KEYS[key as keyof typeof STORE_METRIC_KEYS],
  name: String(name),
  description: String(description),
  unit: unit as StoreMetricDefinition['unit'],
  version: 1,
  permission: 'core:store-metrics:view',
  drilldownPath: String(drilldownPath),
  sourceModels: sourceModels as string[],
})));

export const STORE_METRIC_DEFINITION_BY_KEY = new Map(STORE_METRIC_DEFINITIONS.map((item) => [item.key, item]));
