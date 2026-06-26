export interface PaginatedResponse<T> {
  items: T[];
  /**
   * Backward-compatible alias for older pages. New API contracts should use
   * `items` as the canonical list field.
   */
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * Some Agent endpoints can return an empty page before the latest database
   * migrations are applied. Keep this explicit so the UI can distinguish
   * "no data yet" from "schema not ready".
   */
  migrationPending?: boolean;
  reason?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export function createPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return {
    items,
    data: items,
    total,
    page,
    pageSize,
  };
}
