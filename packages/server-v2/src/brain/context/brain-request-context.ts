export interface BrainRequestContext {
  userId: number;
  storeId: number;
  visibleStoreIds: number[];
  permissions: string[];
  deniedPermissions: string[];
  requestId: string;
  timezone: string;
}
