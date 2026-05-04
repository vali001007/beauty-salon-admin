import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { PaginatedResponse, PaginationParams } from '../types/pagination';

export function usePagination<T>(
  fetchFn: (params: PaginationParams & Record<string, any>) => Promise<PaginatedResponse<T>>,
  filters?: Record<string, any>
) {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(10);
  const [loading, setLoading] = useState(false);

  // Use a ref to trigger re-fetches for refresh without changing deps
  const refreshKey = useRef(0);
  const [, setRefreshTrigger] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchFn({
        page,
        pageSize,
        ...filters,
      });
      setData(response.data);
      setTotal(response.total);
    } catch {
      toast.error('数据加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [fetchFn, page, pageSize, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setPage = useCallback((newPage: number) => {
    setPageState(newPage);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPageState(1);
  }, []);

  const refresh = useCallback(() => {
    refreshKey.current += 1;
    setRefreshTrigger(refreshKey.current);
    fetchData();
  }, [fetchData]);

  return {
    data,
    total,
    page,
    pageSize,
    loading,
    setPage,
    setPageSize,
    refresh,
  };
}
