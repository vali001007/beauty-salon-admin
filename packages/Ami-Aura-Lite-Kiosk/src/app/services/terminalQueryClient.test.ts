import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTerminalQueryCache,
  invalidateTerminalQueryPrefixes,
  terminalQuery,
} from "./terminalQueryClient";

let currentStoreId = 1;

vi.mock("@/stores/storeStore", () => ({
  useStoreStore: {
    getState: () => ({ currentStoreId }),
  },
}));

describe("terminalQueryClient", () => {
  beforeEach(() => {
    currentStoreId = 1;
    clearTerminalQueryCache();
    vi.useRealTimers();
  });

  it("returns fresh cache immediately without revalidating", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ value: "first" })
      .mockResolvedValueOnce({ value: "second" });

    const first = await terminalQuery({ key: ["manager-dashboard"], ttlMs: 60_000, loader });
    const second = await terminalQuery({ key: ["manager-dashboard"], ttlMs: 60_000, loader });

    expect(first.data).toEqual({ value: "first" });
    expect(second.data).toEqual({ value: "first" });
    expect(second.source).toBe("cache-fresh");
    expect(second.refreshStatus).toBe("idle");
    expect(second.refresh).toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("returns stale cache immediately and revalidates in background", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ value: "first" })
      .mockResolvedValueOnce({ value: "second" });

    await terminalQuery({ key: ["manager-dashboard"], ttlMs: 1, loader });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const stale = await terminalQuery({ key: ["manager-dashboard"], ttlMs: 1, loader });

    expect(stale.data).toEqual({ value: "first" });
    expect(stale.source).toBe("cache-stale");
    expect(stale.refreshStatus).toBe("refreshing");
    expect(loader).toHaveBeenCalledTimes(2);
    await expect(stale.refresh).resolves.toMatchObject({
      data: { value: "second" },
      source: "network",
      refreshStatus: "idle",
    });
  });

  it("keeps cached data when background refresh fails", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ value: "cached" })
      .mockRejectedValueOnce(new Error("network down"));

    await terminalQuery({ key: ["today-reservations"], ttlMs: 1, loader });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const stale = await terminalQuery({ key: ["today-reservations"], ttlMs: 1, loader });

    expect(stale.data).toEqual({ value: "cached" });
    expect(stale.source).toBe("cache-stale");
    await expect(stale.refresh).resolves.toMatchObject({
      data: { value: "cached" },
      refreshStatus: "failed",
      error: "network down",
    });
  });

  it("invalidates entries by query prefix", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ value: "cached" })
      .mockResolvedValueOnce({ value: "fresh" });

    await terminalQuery({ key: ["inventory-alerts"], ttlMs: 60_000, loader });
    invalidateTerminalQueryPrefixes(["inventory-alerts"]);
    const result = await terminalQuery({ key: ["inventory-alerts"], ttlMs: 60_000, loader });

    expect(result.data).toEqual({ value: "fresh" });
    expect(result.source).toBe("network");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("scopes cache entries by current store", async () => {
    const loader = vi.fn()
      .mockResolvedValueOnce({ value: "store-1" })
      .mockResolvedValueOnce({ value: "store-2" });

    const firstStore = await terminalQuery({ key: ["cashier-context"], ttlMs: 60_000, loader });
    currentStoreId = 2;
    const secondStore = await terminalQuery({ key: ["cashier-context"], ttlMs: 60_000, loader });
    currentStoreId = 1;
    const firstStoreAgain = await terminalQuery({ key: ["cashier-context"], ttlMs: 60_000, loader });

    expect(firstStore.data).toEqual({ value: "store-1" });
    expect(secondStore.data).toEqual({ value: "store-2" });
    expect(firstStoreAgain.data).toEqual({ value: "store-1" });
    expect(firstStoreAgain.source).toBe("cache-fresh");
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
