export interface Service {
  id: number;
  name: string;
  duration: number;
  price: number;
  bomCount: number;
  bom: BOMItem[];
}

export interface BOMItem {
  id: number;
  productId?: number;
  productName: string;
  sku: string;
  standardQty: number;
  unit: string;
  costPrice?: number;
  productStatus?: string;
}

export interface BomPayloadItem {
  productId?: number;
  productName?: string;
  sku?: string;
  standardQty: number;
  unit?: string;
}

export interface ConsumptionRecord {
  id: number;
  date: string;
  orderNo?: string;
  serviceName: string;
  customerName: string;
  serviceEmployee?: string;
  beautician: string;
  storeName: string;
  productName: string;
  standardQty: number;
  actualQty: number;
  deviation: number;
  isAbnormal: boolean;
}

export interface ForecastItem {
  productName: string;
  sku: string;
  forecastConsumption: number;
  scheduledConsumption?: number;
  recentDailyConsumption?: number;
  currentStock: number;
  shortage: number;
}
