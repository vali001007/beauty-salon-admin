import { format } from "date-fns";
import { useStoreStore } from "@/stores/storeStore";

export type TerminalQuerySource = "cache-fresh" | "cache-stale" | "network" | "prefetch";
export type TerminalQueryStatus = "idle" | "loading" | "success" | "error";
export type TerminalRefreshStatus = "idle" | "refreshing" | "failed";

export type TerminalQueryKeyPart = string | number | boolean | null | undefined;
export type TerminalQueryKey = readonly TerminalQueryKeyPart[];

export interface TerminalQueryMetric {
  key: string;
  source: TerminalQuerySource;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  dataSize?: number;
  updatedAt: number;
}

export interface TerminalQueryState<T> {
  data?: T;
  status: TerminalQueryStatus;
  refreshStatus: TerminalRefreshStatus;
  error?: string;
  updatedAt?: number;
  isStale: boolean;
  source?: TerminalQuerySource;
}

export interface TerminalQueryResult<T> extends TerminalQueryState<T> {
  refresh?: Promise<TerminalQueryResult<T>>;
}

interface TerminalQueryCacheEntry<T> {
  value: T;
  updatedAt: number;
  ttlMs: number;
}

interface TerminalQueryOptions<T> {
  key: TerminalQueryKey;
  ttlMs: number;
  loader: () => Promise<T>;
  revalidate?: boolean;
  source?: Extract<TerminalQuerySource, "network" | "prefetch">;
}

const cache = new Map<string, TerminalQueryCacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const metrics: TerminalQueryMetric[] = [];
const MAX_METRICS = 200;

export const TERMINAL_QUERY_TTL = {
  bootstrap: 5 * 60_000,
  managerDashboard: 60_000,
  todayReservations: 30_000,
  staffSchedules: 5 * 60_000,
  customerGrowth: 3 * 60_000,
  inventoryAlerts: 2 * 60_000,
  cashierContext: 10 * 60_000,
  printDocuments: 30_000,
  cardVerificationContext: 3 * 60_000,
  customerSearch: 2 * 60_000,
};

function getStoreScopedKey(key: TerminalQueryKey) {
  const storeId = useStoreStore.getState().currentStoreId ?? "no-store";
  return JSON.stringify(["store", storeId, ...key]);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "查询失败";
}

function getErrorCode(error: unknown) {
  const candidate = error as { code?: unknown; status?: unknown; payload?: { code?: unknown; status?: unknown } };
  const code = candidate?.payload?.code ?? candidate?.code ?? candidate?.payload?.status ?? candidate?.status;
  return code === undefined ? undefined : String(code);
}

function estimateDataSize(value: unknown) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return undefined;
  }
}

function pushMetric(metric: TerminalQueryMetric) {
  metrics.push(metric);
  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ami-terminal-query-metric", { detail: metric }));
  }
}

async function runLoader<T>(
  serializedKey: string,
  cacheKey: TerminalQueryKey,
  ttlMs: number,
  loader: () => Promise<T>,
  source: Extract<TerminalQuerySource, "network" | "prefetch">,
): Promise<TerminalQueryResult<T>> {
  const startedAt = performance.now();
  try {
    let task = inflight.get(serializedKey) as Promise<T> | undefined;
    if (!task) {
      task = loader();
      inflight.set(serializedKey, task as Promise<unknown>);
    }
    const value = await task;
    const updatedAt = Date.now();
    cache.set(serializedKey, { value, updatedAt, ttlMs });
    pushMetric({
      key: JSON.stringify(cacheKey),
      source,
      durationMs: Math.round(performance.now() - startedAt),
      success: true,
      dataSize: estimateDataSize(value),
      updatedAt,
    });
    return {
      data: value,
      status: "success",
      refreshStatus: "idle",
      updatedAt,
      isStale: false,
      source,
    };
  } catch (error) {
    pushMetric({
      key: JSON.stringify(cacheKey),
      source,
      durationMs: Math.round(performance.now() - startedAt),
      success: false,
      errorCode: getErrorCode(error),
      updatedAt: Date.now(),
    });
    return {
      status: "error",
      refreshStatus: "failed",
      error: getErrorMessage(error),
      isStale: false,
      source,
    };
  } finally {
    inflight.delete(serializedKey);
  }
}

export async function terminalQuery<T>(options: TerminalQueryOptions<T>): Promise<TerminalQueryResult<T>> {
  const serializedKey = getStoreScopedKey(options.key);
  const cached = cache.get(serializedKey) as TerminalQueryCacheEntry<T> | undefined;
  const now = Date.now();

  if (cached) {
    const isStale = now - cached.updatedAt >= cached.ttlMs;
    const source: TerminalQuerySource = isStale ? "cache-stale" : "cache-fresh";
    pushMetric({
      key: JSON.stringify(options.key),
      source,
      durationMs: 0,
      success: true,
      dataSize: estimateDataSize(cached.value),
      updatedAt: now,
    });

    const shouldRevalidate = options.revalidate !== false && isStale;
    const result: TerminalQueryResult<T> = {
      data: cached.value,
      status: "success",
      refreshStatus: shouldRevalidate ? "refreshing" : "idle",
      updatedAt: cached.updatedAt,
      isStale,
      source,
    };

    if (shouldRevalidate) {
      result.refresh = runLoader(serializedKey, options.key, options.ttlMs, options.loader, options.source ?? "network").then((fresh) => {
        if (fresh.status === "error") {
          return {
            data: cached.value,
            status: "success",
            refreshStatus: "failed",
            error: fresh.error,
            updatedAt: cached.updatedAt,
            isStale: true,
            source: "cache-stale",
          } satisfies TerminalQueryResult<T>;
        }
        return fresh;
      });
    }

    return result;
  }

  return runLoader(serializedKey, options.key, options.ttlMs, options.loader, options.source ?? "network");
}

export async function terminalPrefetch<T>(options: TerminalQueryOptions<T>) {
  const serializedKey = getStoreScopedKey(options.key);
  const cached = cache.get(serializedKey);
  if (cached && Date.now() - cached.updatedAt < cached.ttlMs) return;
  await runLoader(serializedKey, options.key, options.ttlMs, options.loader, "prefetch");
}

export function setTerminalQueryData<T>(key: TerminalQueryKey, value: T, ttlMs: number, updatedAt = Date.now()) {
  cache.set(getStoreScopedKey(key), { value, updatedAt, ttlMs });
}

export function getTerminalQuerySnapshot<T>(key: TerminalQueryKey): TerminalQueryState<T> | null {
  const entry = cache.get(getStoreScopedKey(key)) as TerminalQueryCacheEntry<T> | undefined;
  if (!entry) return null;
  return {
    data: entry.value,
    status: "success",
    refreshStatus: "idle",
    updatedAt: entry.updatedAt,
    isStale: Date.now() - entry.updatedAt >= entry.ttlMs,
    source: "cache-fresh",
  };
}

export function invalidateTerminalQueries(match: (key: unknown[]) => boolean) {
  Array.from(cache.keys()).forEach((serializedKey) => {
    try {
      const parsed = JSON.parse(serializedKey) as unknown[];
      const scopedKey = parsed.slice(2);
      if (match(scopedKey)) cache.delete(serializedKey);
    } catch {
      cache.delete(serializedKey);
    }
  });
}

export function invalidateTerminalQueryPrefixes(prefixes: string[]) {
  invalidateTerminalQueries((key) => prefixes.includes(String(key[0])));
}

export function invalidateTerminalStoreQueries() {
  const currentStoreId = useStoreStore.getState().currentStoreId ?? "no-store";
  Array.from(cache.keys()).forEach((serializedKey) => {
    try {
      const parsed = JSON.parse(serializedKey) as unknown[];
      if (parsed[0] === "store" && parsed[1] === currentStoreId) {
        cache.delete(serializedKey);
      }
    } catch {
      cache.delete(serializedKey);
    }
  });
}

export function clearTerminalQueryCache() {
  cache.clear();
  inflight.clear();
}

export function getTerminalQueryMetrics() {
  return [...metrics];
}

export function formatTerminalQueryUpdatedAt(updatedAt?: number) {
  if (!updatedAt) return "正在获取最新数据";
  const diffMs = Date.now() - updatedAt;
  if (diffMs < 60_000) return `已更新 ${format(updatedAt, "HH:mm")}`;
  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `上次更新 ${minutes} 分钟前`;
  return `已更新 ${format(updatedAt, "HH:mm")}`;
}
