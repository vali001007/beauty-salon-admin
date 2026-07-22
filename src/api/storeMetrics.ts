export {
  realCreateStoreMetricTarget as createStoreMetricTarget,
  realGetStoreMetricDefinitions as getStoreMetricDefinitions,
  realGetStoreMetricDrilldown as getStoreMetricDrilldown,
  realGetStoreMetricsOverview as getStoreMetricsOverview,
  realGetStoreMetricTargets as getStoreMetricTargets,
  realUpdateStoreMetricTarget as updateStoreMetricTarget,
} from './real/storeMetrics';
export type * from '@/types/storeMetrics';
