export type FinanceFactType =
  | 'external_cash_in'
  | 'external_cash_out'
  | 'operating_revenue'
  | 'prepaid_addition'
  | 'liability_release'
  | 'material_cost'
  | 'product_cost'
  | 'commission_cost'
  | 'operating_cost';

export type FinanceFactQuality = 'actual' | 'estimated' | 'legacy' | 'missing';

export interface FinanceRecognitionFact {
  storeId: number;
  businessDate: string;
  recognizedAt: Date;
  factType: FinanceFactType;
  sourceType: string;
  sourceId: number;
  orderId?: number;
  orderItemId?: number;
  amount: number;
  quality: FinanceFactQuality;
  recognitionSource: string;
  reversalOfId?: number;
}

export interface FinanceReadiness {
  status: 'ready' | 'blocked' | 'unavailable';
  publishable: boolean;
  blockers: Array<{ code: string; count: number; amount?: number; actionPath: string }>;
  warnings: Array<{ code: string; count: number }>;
}
