export type FinanceMetricDataQualityStatus = 'complete' | 'estimated' | 'missing_cost' | 'missing_commission' | 'unavailable';
export type FinanceMetricCostQualityStatus = 'complete' | 'mixed' | 'estimated' | 'missing';

export type FinanceMetricMissingReason =
  | 'missing_actual_consumption'
  | 'missing_bom'
  | 'missing_batch_cost'
  | 'missing_card_unit_value'
  | 'missing_cost'
  | 'missing_commission'
  | 'product_master_estimate'
  | 'legacy_missing_snapshot';

export interface FinanceMetricPaymentBreakdown {
  cash: number;
  wechat: number;
  alipay: number;
  card: number;
  total: number;
}

export interface FinanceMetricDataQuality {
  status: FinanceMetricDataQualityStatus;
  missingReasons: FinanceMetricMissingReason[];
  detail: string;
}

export interface FinanceMetricCostQualityItem {
  type: 'material' | 'product' | 'commission';
  sourceNo?: string;
  sourceId?: number;
  itemName?: string;
  amount?: number;
  reason: FinanceMetricMissingReason;
  suggestedAction: string;
}

export interface FinanceMetricCostQuality {
  status: FinanceMetricCostQualityStatus;
  reasons: FinanceMetricMissingReason[];
  items: FinanceMetricCostQualityItem[];
}

export interface FinanceDailyMetric {
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
  materialCostActual?: number;
  materialCostEstimated?: number;
  materialCostMissing?: number;
  productCost: number;
  productCostActual?: number;
  productCostEstimated?: number;
  productCostMissing?: number;
  commissionCost: number;
  costQuality?: FinanceMetricCostQuality;
  grossProfit: number;
  grossMargin: number;
  orderCount: number;
  customerCount: number;
  avgTicket: number;
  dataQuality: FinanceMetricDataQuality;
}

export interface FinanceMetricSummary extends Omit<FinanceDailyMetric, 'date' | 'storeId' | 'storeName'> {
  dateFrom: string;
  dateTo: string;
}

export interface FinanceMetricResponse {
  summary: FinanceMetricSummary;
  items: FinanceDailyMetric[];
  total: number;
}

export interface FinanceMetricQuery {
  storeId?: number;
  dateFrom?: string;
  dateTo?: string;
}
