import type { AskDataCatalogResponse, AskDataSource } from './ask-data.types.js';

export const ASK_DATA_CATALOG: AskDataCatalogResponse = {
  tables: [
    { model: 'Customer', label: '客户', description: '客户档案、会员等级、累计消费和到店信息', fields: ['id', 'storeId', 'name', 'phone', 'memberLevel', 'totalSpent', 'visitCount', 'lastVisitDate'] },
    { model: 'ProductOrder', label: '订单', description: '商品、项目、会员卡和充值订单主表', fields: ['id', 'orderNo', 'storeId', 'customerId', 'status', 'netAmount', 'payMethod', 'createdAt'] },
    { model: 'OrderItem', label: '订单明细', description: '订单里的项目、商品、卡项和充值明细', fields: ['orderId', 'itemType', 'itemId', 'name', 'quantity', 'netAmount', 'subtotal'] },
    { model: 'PaymentRecord', label: '支付流水', description: '订单支付方式、支付金额和支付时间', fields: ['orderId', 'method', 'amount', 'status', 'paidAt'] },
    { model: 'Reservation', label: '预约', description: '客户预约、服务项目、美容师和预约状态', fields: ['storeId', 'customerId', 'projectId', 'beauticianId', 'date', 'status'] },
    { model: 'Project', label: '服务项目', description: '项目名称、价格、时长和状态', fields: ['id', 'storeId', 'name', 'price', 'duration', 'status'] },
    { model: 'Beautician', label: '美容师', description: '美容师档案、门店和状态', fields: ['id', 'storeId', 'name', 'phone', 'status'] },
    { model: 'Product', label: '库存商品', description: '商品 SKU、成本价、售价、当前库存和安全库存', fields: ['id', 'storeId', 'sku', 'name', 'currentStock', 'safetyStock', 'unit', 'status'] },
    { model: 'StockMovement', label: '库存流水', description: '出入库数量、库存变化、成本和来源单据', fields: ['storeId', 'productId', 'movementType', 'quantity', 'unitCost', 'costAmount', 'occurredAt'] },
    { model: 'DailySettlement', label: '日结', description: '每日收入、退款、客数、客单价和毛利', fields: ['storeId', 'settleDate', 'totalRevenue', 'orderCount', 'customerCount', 'grossProfit'] },
    { model: 'OperatingCost', label: '经营成本', description: '房租、工资、营销、水电等月度经营成本', fields: ['storeId', 'periodMonth', 'costDate', 'category', 'amount'] },
    { model: 'CommissionRecord', label: '提成记录', description: '员工提成来源、金额和结算状态', fields: ['storeId', 'staffUserId', 'beauticianId', 'sourceAmount', 'amount', 'status', 'settleMonth'] },
    { model: 'CustomerCard', label: '客户次卡', description: '客户次卡开卡金额、剩余次数和有效期', fields: ['customerId', 'cardName', 'totalTimes', 'remainingTimes', 'paidAmount', 'status', 'expiryDate'] },
    { model: 'CardUsageRecord', label: '次卡核销', description: '次卡核销项目、确认收入、美容师和核销时间', fields: ['customerId', 'projectName', 'times', 'recognizedAmount', 'beauticianId', 'verifiedAt'] },
  ],
  examples: [
    '上个月收入按项目看',
    '库存低于安全库存的商品有哪些',
    '张三最近消费了什么',
    '本月预约取消率是多少',
  ],
};

export const SOURCE_PRESETS: Record<string, AskDataSource[]> = {
  projectRevenue: [
    {
      model: 'ProductOrder',
      fields: ['storeId', 'status', 'createdAt', 'orderNo'],
      filters: ['门店', '订单状态=已完成/已付款', '时间范围'],
      reason: '订单主表提供门店、订单状态、下单时间和订单编号。',
    },
    {
      model: 'OrderItem',
      fields: ['itemType', 'itemId', 'name', 'quantity', 'netAmount', 'subtotal'],
      filters: ['itemType=project'],
      reason: '订单明细表识别服务项目并汇总项目收入。',
    },
  ],
  lowStock: [
    {
      model: 'Product',
      fields: ['storeId', 'sku', 'name', 'currentStock', 'safetyStock', 'unit', 'status'],
      filters: ['门店', '状态=active', '当前库存<=安全库存'],
      reason: '商品表同时保存当前库存和安全库存，适合判断库存预警。',
    },
  ],
  customerRecentConsumption: [
    {
      model: 'Customer',
      fields: ['id', 'storeId', 'name', 'phone'],
      filters: ['门店', '客户姓名模糊匹配'],
      reason: '客户表用于先定位口语问题里的客户实体。',
    },
    {
      model: 'ProductOrder',
      fields: ['customerId', 'storeId', 'orderNo', 'status', 'netAmount', 'payMethod', 'createdAt'],
      filters: ['客户ID', '门店', '最近订单'],
      reason: '订单主表提供客户近期消费单据。',
    },
    {
      model: 'OrderItem',
      fields: ['name', 'itemType', 'quantity', 'netAmount', 'subtotal'],
      filters: ['订单ID'],
      reason: '订单明细表展示客户具体消费了哪些项目或商品。',
    },
  ],
  reservationCancelRate: [
    {
      model: 'Reservation',
      fields: ['storeId', 'date', 'status'],
      filters: ['门店', '预约日期范围'],
      reason: '预约表提供预约总量和取消状态，可计算取消率。',
    },
  ],
};
