import { getTerminalCustomerSelectContext } from "@/api";
import type {
  TerminalCustomerSelectItem,
  TerminalCustomerSelectQuery,
  TerminalCustomerSelectResponse,
  TerminalCustomerSelectScene,
} from "@/types/terminal";
import { terminalPrefetch, terminalQuery, TERMINAL_QUERY_TTL } from "./terminalQueryClient";
import { getActiveTerminalOperatorParams } from "./terminalOperatorContext";

export type CustomerSelectScene = TerminalCustomerSelectScene;
export type CustomerSelectItem = TerminalCustomerSelectItem;
export type CustomerSelectResponse = TerminalCustomerSelectResponse;

const DEFAULT_LIMIT = 50;

function normalizeQuery(query: TerminalCustomerSelectQuery = {}): Required<Pick<TerminalCustomerSelectQuery, "scene" | "limit">> &
  Omit<TerminalCustomerSelectQuery, "scene" | "limit"> {
  return {
    ...query,
    scene: query.scene ?? "appointment",
    keyword: query.keyword?.trim() ?? "",
    limit: Math.min(Math.max(Number(query.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), 100),
  };
}

function buildQueryKey(query: TerminalCustomerSelectQuery) {
  const normalized = normalizeQuery(query);
  return [
    "customer-select",
    normalized.scene,
    normalized.keyword ?? "",
    normalized.limit,
    normalized.customerIds ?? "",
    normalized.operatorId ?? "default",
    normalized.onlyMyCustomers ? "mine" : "all",
    normalized.includeInactive ? "inactive" : "active",
  ];
}

export async function searchTerminalCustomers(query: TerminalCustomerSelectQuery = {}) {
  const normalized = normalizeQuery({ ...getActiveTerminalOperatorParams(), ...query });
  const result = await terminalQuery({
    key: buildQueryKey(normalized),
    ttlMs: normalized.keyword ? TERMINAL_QUERY_TTL.customerSearch : 2 * 60_000,
    loader: () => getTerminalCustomerSelectContext(normalized),
  });
  if (result.status === "error") {
    throw new Error(result.error ?? "客户查询失败");
  }
  return result.data;
}

export async function prefetchTerminalCustomers(scene: CustomerSelectScene) {
  const query = normalizeQuery({ ...getActiveTerminalOperatorParams(), scene, limit: DEFAULT_LIMIT });
  await terminalPrefetch({
    key: buildQueryKey(query),
    ttlMs: 2 * 60_000,
    loader: () => getTerminalCustomerSelectContext(query),
  });
}

export function toCustomerSelectItems(response?: CustomerSelectResponse | null): CustomerSelectItem[] {
  return Array.isArray(response?.items) ? response.items : [];
}
