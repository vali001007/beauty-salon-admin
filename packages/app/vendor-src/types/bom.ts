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
  productName: string;
  sku: string;
  standardQty: number;
  unit: string;
}

export interface ConsumptionRecord {
  id: number;
  date: string;
  serviceName: string;
  customerName: string;
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
  currentStock: number;
  shortage: number;
}
