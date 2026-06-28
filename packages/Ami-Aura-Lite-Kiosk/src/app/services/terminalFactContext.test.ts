import { describe, expect, it } from "vitest";
import { buildTerminalFactContext } from "./terminalFactContext";
import type { Message } from "../types";

describe("terminalFactContext", () => {
  it("extracts serializable inventory facts and truncates by group limit", () => {
    const messages: Message[] = [
      {
        id: "m1",
        type: "dashboard",
        timestamp: new Date("2026-06-28T01:00:00.000Z"),
        payload: {
          kind: "inventory",
          data: {
            title: "库存",
            lowStock: [{ id: 1, productName: "补水精华", currentStock: 1, safetyStock: 5 }],
            expiring: [
              { id: 2, productName: "修护精华", batchNo: "B001", remainingDays: 12, stock: 3, supplier: "供应商A" },
              { id: 3, productName: "清洁面膜", batchNo: "B002", remainingDays: 18, stock: 2 },
            ],
            replenishment: [{ id: 4, productName: "一次性手套", suggestedQty: 20 }],
          },
        },
      },
    ];

    const context = buildTerminalFactContext(messages, { maxItems: 2, now: new Date("2026-06-28T02:00:00.000Z") });

    expect(context.inventory.items).toHaveLength(2);
    expect(context.inventory.items[0]).toMatchObject({ kind: "low_stock", productName: "补水精华" });
    expect(context.inventory.items[1]).toMatchObject({ kind: "expiring_inventory", productName: "修护精华" });
    expect(context.inventory.limitations).toContain("超过 2 条时已截断。");
    expect(() => JSON.stringify(context)).not.toThrow();
  });

  it("masks sensitive customer fields before adding facts", () => {
    const messages: Message[] = [
      {
        id: "m1",
        type: "dashboard",
        timestamp: new Date("2026-06-28T01:00:00.000Z"),
        payload: {
          kind: "customer",
          data: {
            customer: {
              id: 8,
              name: "马美琳",
              phone: "13812345678",
              wechat: "may-123",
              address: "不应注入",
              memberLevel: "金卡",
            },
          },
        },
      },
    ];

    const context = buildTerminalFactContext(messages, {
      operator: { id: 3, name: "林店长", phone: "13900001111" },
      device: { role: "manager", personaCode: "manager" },
      now: new Date("2026-06-28T02:00:00.000Z"),
    });

    expect(context.customers.items[0]).toMatchObject({
      id: 8,
      name: "马美琳",
      phoneMasked: "138****5678",
      memberLevel: "金卡",
    });
    expect(context.customers.items[0]).not.toHaveProperty("phone");
    expect(context.customers.items[0]).not.toHaveProperty("wechat");
    expect(context.customers.items[0]).not.toHaveProperty("address");
    expect(context.operator.items[0]).toMatchObject({ id: 3, name: "林店长", phoneMasked: "139****1111" });
  });
});
