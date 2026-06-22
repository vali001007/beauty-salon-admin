import type { PaginatedResponse, PaginationParams } from './pagination';

export type OperationCostCategory =
  | 'rent'
  | 'salary'
  | 'commission'
  | 'marketing'
  | 'utilities'
  | 'depreciation'
  | 'supplies_adjustment'
  | 'other';

export type DataQualityStatus = 'complete' | 'estimated' | 'missing_cost' | 'missing_bom' | 'missing_commission' | 'unavailable';

export type MissingCostReason =
  | 'missing_cost'
  | 'missing_bom'
  | 'missing_commission'
  | 'missing_project_master'
  | 'missing_actual_consumption'
  | 'missing_card_unit_value';

export type OperationAlertLevel = 'info' | 'warning' | 'critical';

export interface DateRangeParams {
  storeId?: number;
  from: string;
  to: string;
}

export interface OperationProfitQuery extends DateRangeParams {
  basis?: 'cash' | 'operating';
}

export interface ProjectMarginQuery extends OperationProfitQuery, PaginationParams {
  status?: string;
}

export interface ProductMarginQuery extends OperationProfitQuery, PaginationParams {
  status?: string;
  keyword?: string;
  categoryId?: number;
  sortBy?: 'salesAmount' | 'grossProfit' | 'marginRate' | 'quantity';
}

export interface PrepaidLiabilityQuery extends PaginationParams {
  storeId?: number;
  riskOnly?: boolean;
}

export interface BeauticianPerformanceQuery extends OperationProfitQuery {
  beauticianId?: number;
}

export interface OperationCostQuery extends PaginationParams {
  storeId?: number;
  periodMonth?: string;
  category?: OperationCostCategory;
}

export interface OperationCost {
  id: number;
  storeId: number;
  storeName?: string;
  periodMonth: string;
  costDate: string;
  category: OperationCostCategory;
  amount: number;
  allocationType: string;
  relatedCampaignId?: number | null;
  relatedEmployeeId?: number | null;
  remark?: string | null;
  createdBy?: number | null;
  creatorName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OperationCostPayload {
  storeId?: number;
  periodMonth: string;
  costDate: string;
  category: OperationCostCategory;
  amount: number;
  allocationType?: string;
  relatedCampaignId?: number;
  relatedEmployeeId?: number;
  remark?: string;
}

export interface CopyOperationCostsPayload {
  storeId?: number;
  fromPeriodMonth: string;
  toPeriodMonth: string;
}

export interface OperationMetricSummary {
  cashIncome: number;
  operatingIncome: number;
  grossProfit: number;
  operatingProfit: number;
  grossMargin: number;
  netMargin: number;
  customerCount: number;
  avgTicket: number;
  cardConsumptionRate: number;
}

export interface AmountBreakdown {
  key: string;
  label: string;
  amount: number;
  estimated?: boolean;
  cashOnly?: boolean;
}

export interface OperationProfitTrendPoint {
  date: string;
  cashIncome: number;
  operatingIncome: number;
  grossProfit: number;
  operatingProfit: number;
}

export interface OperationAlert {
  key: string;
  level: OperationAlertLevel;
  title: string;
  detail: string;
  action?: string;
  path?: string;
}

export interface DataQuality {
  status: DataQualityStatus;
  missingCostReasons: MissingCostReason[];
  detail: string;
}

export interface OperationProfitOverview {
  period: { from: string; to: string };
  basis: 'cash' | 'operating';
  summary: OperationMetricSummary;
  incomeBreakdown: AmountBreakdown[];
  costBreakdown: AmountBreakdown[];
  trend: OperationProfitTrendPoint[];
  alerts: OperationAlert[];
  dataQuality: DataQuality;
}

export interface ProjectMarginRow {
  projectId: number;
  projectName: string;
  projectType?: string;
  standardPrice: number;
  avgDealPrice: number;
  serviceCount: number;
  serviceIncome: number;
  standardMaterialCost: number;
  actualMaterialCost: number;
  commissionCost: number;
  contributionProfit: number;
  marginRate: number;
  status: 'high_profit' | 'normal' | 'low_margin' | 'loss' | 'needs_optimization' | 'cost_missing' | string;
  missingCostReasons: MissingCostReason[];
}

export type ProductCostSource = 'order_snapshot' | 'stock_movement' | 'product_master' | 'missing' | 'mixed';

export interface ProductMarginSourceOrder {
  orderId: number;
  orderNo: string;
  orderItemId: number;
  orderedAt?: string;
  customerName?: string;
  quantity: number;
  salesAmount: number;
  refundAmount: number;
  netSalesAmount: number;
  commissionCost: number;
}

export interface ProductMarginRow {
  productId: number;
  productName: string;
  sku?: string;
  categoryId?: number;
  categoryName?: string;
  brand?: string;
  quantitySold: number;
  salesAmount: number;
  refundAmount: number;
  netSalesAmount: number;
  unitCost: number;
  costSource: ProductCostSource;
  productCost: number;
  commissionCost: number;
  grossProfit: number;
  marginRate: number;
  avgDealPrice: number;
  retailPrice: number;
  orderCount?: number;
  sourceOrders?: ProductMarginSourceOrder[];
  status: 'high_profit' | 'normal' | 'low_margin' | 'loss' | 'cost_missing' | string;
  missingCostReasons: MissingCostReason[];
}

export interface PrepaidLiabilityRow {
  customerId: number;
  customerName: string;
  customerCardId: number;
  cardId?: number;
  cardName: string;
  totalTimes: number;
  remainingTimes: number;
  estimatedRemainingValue: number;
  expiryDate: string;
  lastUsedAt?: string;
  riskLevel: 'low' | 'medium' | 'high' | string;
  riskReasons: string[];
}

export interface BeauticianPerformanceRow {
  beauticianId: number;
  beauticianName: string;
  storeId: number;
  storeName?: string;
  serviceIncome: number;
  serviceCount: number;
  customerCount: number;
  avgTicket: number;
  cardSalesAmount: number;
  commissionCost: number;
  contributionProfit: number;
  repurchaseRate: number;
  missingCostReasons: MissingCostReason[];
}

export type OperationCostPage = PaginatedResponse<OperationCost>;
export type ProductMarginPage = PaginatedResponse<ProductMarginRow>;
export type ProjectMarginPage = PaginatedResponse<ProjectMarginRow>;
export type PrepaidLiabilityPage = PaginatedResponse<PrepaidLiabilityRow>;
export type BeauticianPerformancePage = PaginatedResponse<BeauticianPerformanceRow>;
