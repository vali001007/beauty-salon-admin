import type { PaginatedResponse } from '@/types/pagination';

export function extractArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== 'object') return [];

  const record = value as {
    items?: unknown;
    data?: unknown;
    list?: unknown;
    records?: unknown;
    rows?: unknown;
    results?: unknown;
  };

  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record.data)) return record.data as T[];
  if (Array.isArray(record.list)) return record.list as T[];
  if (Array.isArray(record.records)) return record.records as T[];
  if (Array.isArray(record.rows)) return record.rows as T[];
  if (Array.isArray(record.results)) return record.results as T[];
  if (record.items && typeof record.items === 'object') return extractArray<T>(record.items);
  if (record.data && typeof record.data === 'object') return extractArray<T>(record.data);
  return [];
}

export function normalizePaginatedResponse<TInput, TOutput>(
  response: unknown,
  normalize: (item: TInput) => TOutput,
): PaginatedResponse<TOutput> {
  const record = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  const items = extractArray<TInput>(record.items ?? record.data ?? response).map(normalize);

  return {
    ...record,
    items,
    data: items,
    total: typeof record.total === 'number' ? record.total : items.length,
    page: typeof record.page === 'number' ? record.page : 1,
    pageSize: typeof record.pageSize === 'number' ? record.pageSize : items.length,
  } as PaginatedResponse<TOutput>;
}
