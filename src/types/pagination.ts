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
