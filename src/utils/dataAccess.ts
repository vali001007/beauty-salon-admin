import type { AuthUser, DataScopeValue } from '@/types';

export function resolveStoreFilter(user: Pick<AuthUser, 'storeIds' | 'dataScopes' | 'permissions'> | null | undefined, currentStoreId: number | null): number[] | null {
  if (!user) return [];
  if (user.permissions.includes('*') || user.dataScopes?.store === 'all') {
    return currentStoreId === null ? null : [currentStoreId];
  }
  if (currentStoreId !== null) {
    return user.storeIds.includes(currentStoreId) ? [currentStoreId] : [];
  }
  return user.storeIds;
}

export function isSelfOnlyScope(scope?: DataScopeValue): boolean {
  return scope === 'self' || scope === 'served_customers' || scope === 'assigned_customers';
}

export function shouldRequestScopedData(scope?: DataScopeValue): boolean {
  return Boolean(scope && scope !== 'all' && scope !== 'none');
}
