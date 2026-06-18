import { Injectable } from '@nestjs/common';

export type TerminalDashboardCacheEntry<T = unknown> = {
  value: T;
  expiresAt: number;
};

@Injectable()
export class TerminalDashboardCacheService {
  private readonly cache = new Map<string, TerminalDashboardCacheEntry>();

  getKey(parts: Array<string | number | undefined | null>) {
    return parts.map((part) => String(part ?? '')).join(':');
  }

  get<T>(key: string): TerminalDashboardCacheEntry<T> | undefined {
    return this.cache.get(key) as TerminalDashboardCacheEntry<T> | undefined;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(storeId: number | undefined | null, prefixes: string[]) {
    const storeToken = String(storeId ?? '');
    Array.from(this.cache.keys()).forEach((key) => {
      const [prefix, scopedStoreId] = key.split(':');
      if (prefixes.includes(prefix) && (!storeToken || scopedStoreId === storeToken)) {
        this.cache.delete(key);
      }
    });
  }
}
