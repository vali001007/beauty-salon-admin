export type FinanceMetricDataQualityStatus = 'complete' | 'estimated' | 'missing_cost' | 'missing_commission' | 'unavailable';
export type FinanceMetricCostQualityStatus = 'complete' | 'mixed' | 'estimated' | 'missing';

export type FinanceMetricMissingReason =
  | 'missing_actual_consumption'
  | 'missing_bom'
  | 'missing_card_unit_value'
  | 'missing_cost'
  | 'missing_commission'
  | 'missing_batch_cost'
  | 'product_master_estimate'
  | 'legacy_missing_snapshot';

export type FinanceMetricCostQualityReason =
  | 'missing_actual_consumption'
  | 'missing_bom'
  | 'missing_batch_cost'
  | 'product_master_estimate'
  | 'legacy_missing_snapshot'
  | 'missing_commission';

export type FinanceMetricPaymentBreakdown = {
  cash: number;
  wechat: number;
  alipay: number;
  card: number;
  total: number;
};

export type FinanceMetricDataQuality = {
  status: FinanceMetricDataQualityStatus;
  missingReasons: FinanceMetricMissingReason[];
  detail: string;
};

export type FinanceMetricCostQualityItem = {
  type: 'material' | 'product' | 'commission';
  sourceNo?: string;
  sourceId?: number;
  itemName?: string;
  amount?: number;
  reason: FinanceMetricCostQualityReason;
  suggestedAction: string;
};

export type FinanceMetricCostQuality = {
  status: FinanceMetricCostQualityStatus;
  reasons: FinanceMetricCostQualityReason[];
  items: FinanceMetricCostQualityItem[];
};

export type FinanceDailyMetric = {
  date: string;
  storeId?: number;
  storeName?: string;
  operatingRevenue: number;
  cashIncome: number;
  paymentBreakdown: FinanceMetricPaymentBreakdown;
  prepaidAmount: number;
  memberBalanceDeductCash: number;
  memberBalanceDeductGift: number;
  memberBalanceDeductTotal: number;
  cardUsageRecognized: number;
  refundAmount: number;
  materialCost: number;
  materialCostActual: number;
  materialCostEstimated: number;
  materialCostMissing: number;
  productCost: number;
  productCostActual: number;
  productCostEstimated: number;
  productCostMissing: number;
  commissionCost: number;
  grossProfit: number;
  grossMargin: number;
  orderCount: number;
  customerCount: number;
  avgTicket: number;
  dataQuality: FinanceMetricDataQuality;
  costQuality: FinanceMetricCostQuality;
};

export type FinanceMetricSummary = Omit<FinanceDailyMetric, 'date' | 'storeId' | 'storeName'> & {
  dateFrom: string;
  dateTo: string;
};

export type FinanceDailyMetricResponse = {
  summary: FinanceMetricSummary;
  items: FinanceDailyMetric[];
  total: number;
};
