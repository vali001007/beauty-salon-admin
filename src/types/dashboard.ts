export type DashboardMetricTone = 'primary' | 'rose' | 'amber' | 'slate';

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone: DashboardMetricTone;
  path: string;
}

export interface DashboardPriority {
  key: string;
  title: string;
  detail: string;
  tag: string;
  path: string;
}

export interface DashboardOverview {
  scope: {
    storeId: number | null;
    storeName: string;
    mode: 'all' | 'store';
  };
  metrics: DashboardMetric[];
  priorities: DashboardPriority[];
  ai: {
    conclusion: string;
    basis: string;
    action: string;
    path: string;
  };
  generatedAt: string;
}
