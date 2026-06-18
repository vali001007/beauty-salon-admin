import React, { useEffect, useMemo } from 'react';
import { Building2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useStoreStore } from '../../stores/storeStore';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '@/config/permissions';

const ALL_STORES_VALUE = '__all__';

export function StoreSwitcher() {
  const { stores, currentStoreId, setCurrentStore, loadStores } = useStoreStore();
  const user = useAuthStore((state) => state.user);

  const isSuperAdmin = hasPermission(user?.permissions ?? [], '*');

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  // Filter stores based on user role
  const accessibleStores = useMemo(() => {
    if (isSuperAdmin) return stores;
    if (!user?.storeIds?.length) return [];
    return stores.filter((s) => user.storeIds.includes(s.id));
  }, [stores, isSuperAdmin, user?.storeIds]);

  const handleValueChange = (value: string) => {
    if (value === ALL_STORES_VALUE) {
      setCurrentStore(null);
    } else {
      setCurrentStore(Number(value));
    }
  };

  const selectValue =
    currentStoreId === null ? ALL_STORES_VALUE : String(currentStoreId);

  return (
    <Select value={selectValue} onValueChange={handleValueChange}>
      <SelectTrigger size="sm" className="w-[160px] gap-1.5 border-border bg-card shadow-sm">
        <Building2 className="size-4 text-muted-foreground shrink-0" />
        <SelectValue placeholder="选择门店" />
      </SelectTrigger>
      <SelectContent>
        {isSuperAdmin && (
          <SelectItem value={ALL_STORES_VALUE}>全部门店</SelectItem>
        )}
        {accessibleStores.map((store) => (
          <SelectItem key={store.id} value={String(store.id)}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
