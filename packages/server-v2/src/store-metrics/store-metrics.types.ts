export type StoreMetricQualityStatus = 'complete' | 'estimated' | 'partial' | 'unavailable' | 'frozen';
export type StoreMetricUnit = 'CNY' | 'percent' | 'CNY_PER_HOUR';

export type StoreMetricDefinition = {
  key: string;
  name: string;
  description: string;
  unit: StoreMetricUnit;
  version: number;
  permission: string;
  drilldownPath: string;
  sourceModels: string[];
};

export type StoreMetricQuality = {
  status: StoreMetricQualityStatus;
  reasons: string[];
};

export type StoreMetricValue = {
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
};

export type StoreMetricAlert = {
  key: string;
  metricKey: string;
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  action: string;
  path: string;
};

export type StoreMetricsOverview = {
  scope: { storeId: number; storeName: string; timezone: string; date: string };
  metrics: StoreMetricValue[];
  alerts: StoreMetricAlert[];
  generatedAt: string;
};
