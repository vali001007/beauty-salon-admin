export type DataQualityStatus = 'complete' | 'estimated' | 'missing_cost' | 'missing_bom' | 'missing_commission' | 'unavailable';

export type MissingCostReason =
  | 'missing_cost'
  | 'missing_bom'
  | 'missing_batch_cost'
  | 'missing_commission'
  | 'missing_project_master'
  | 'missing_actual_consumption'
  | 'product_master_estimate'
  | 'legacy_missing_snapshot'
  | 'missing_card_unit_value';

export type DateRange = {
  from: Date;
  to: Date;
};

export type IncomeBreakdownKey = 'single_service' | 'card_consumption' | 'product_sales' | 'card_sales' | 'recharge' | 'refund';

export type CostBreakdownKey =
  | 'material'
  | 'product'
  | 'commission'
  | 'rent'
  | 'salary'
  | 'marketing'
  | 'utilities'
  | 'depreciation'
  | 'supplies_adjustment'
  | 'other';

export type OperationAlertLevel = 'info' | 'warning' | 'critical';

export type OperationAlert = {
  key: string;
  level: OperationAlertLevel;
  title: string;
  detail: string;
  action?: string;
  path?: string;
};
