export type StoreMetricQualityStatus = 'complete' | 'estimated' | 'partial' | 'unavailable' | 'frozen';
export type StoreMetricUnit = 'CNY' | 'percent' | 'CNY_PER_HOUR';

export interface StoreMetricQuality {
  status: StoreMetricQualityStatus;
  reasons: string[];
}

export interface StoreMetricValue {
  key: string;
  name: string;
  value: number | null;
  unit: StoreMetricUnit;
  numerator: number | null;
  denominator: number | null;
  sampleCount: number;
  target: number | null;
  targetCompletionRate: number | null;
  quality: StoreMetricQuality;
  definitionVersion: number;
  updatedAt: string;
  drilldownPath: string;
}

export interface StoreMetricAlert {
  key: string;
  metricKey: string;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  action: string;
  path: string;
}

export interface StoreMetricsOverview {
  scope: { storeId: number; storeName: string; timezone: string; date: string };
  metrics: StoreMetricValue[];
  alerts: StoreMetricAlert[];
  generatedAt: string;
}

export interface StoreMetricDefinition {
  key: string;
  name: string;
  description: string;
  unit: StoreMetricUnit;
  version: number;
  permission: string;
  drilldownPath: string;
  sourceModels: string[];
}

export interface StoreMetricTarget {
  id: number;
  storeId: number;
  metricKey: string;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  warningValue?: number | null;
  criticalValue?: number | null;
  weight?: number | null;
  status: string;
}

export interface StoreMetricDrilldown {
  metric?: StoreMetricValue;
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}
