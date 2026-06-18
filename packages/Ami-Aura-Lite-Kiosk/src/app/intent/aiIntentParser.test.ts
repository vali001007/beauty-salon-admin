import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuraAction } from "../../../../../src/types/aura";
import type { Role, RoleDefinition } from "../types";
import { parseAiIntentFallback } from "./aiIntentParser";

const resolveTerminalIntent = vi.hoisted(() => vi.fn());

vi.mock("@/api", () => ({
  resolveTerminalIntent,
}));

const allActions: AuraAction[] = [
  "manager.dashboard",
  "manager.staff",
  "manager.customers",
  "manager.inventory",
  "reception.appointments",
  "operation.verify",
  "operation.register",
  "operation.cashier",
  "operation.card",
  "operation.recharge",
  "operation.print",
  "operation.service-complete",
  "beautician.schedule",
  "beautician.commission",
  "beautician.customer",
  "beautician.record",
  "beautician.advice",
];

function definition(role: Role): RoleDefinition {
  return {
    role,
    title: role,
    subtitle: role,
    availableActions: allActions,
    quickActions: [],
  };
}

describe("parseAiIntentFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts allowed AI actions at the 0.55 confidence threshold", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "appointment.today.view",
      action: "reception.appointments",
      confidence: 0.55,
      slots: {},
      missingSlots: [],
      reason: "AI matched today's appointments",
    });

    const result = await parseAiIntentFallback({
      command: "看看今天预约",
      role: "reception",
      definition: definition("reception"),
      source: "text",
    });

    expect(result.action).toBe("reception.appointments");
    expect(result.confidence).toBe(0.55);
    expect(resolveTerminalIntent).toHaveBeenCalledWith({
      role: "reception",
      command: "看看今天预约",
      availableActions: allActions,
      quickActions: [],
      currentStoreName: undefined,
    });
  });

  it("accepts complete allowed actions at 0.5 confidence via the fast path", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "manager.dashboard.view",
      action: "manager.dashboard",
      confidence: 0.5,
      slots: {},
      missingSlots: [],
      reason: "complete action",
    });

    const result = await parseAiIntentFallback({
      command: "今天营业额怎么样",
      role: "manager",
      definition: definition("manager"),
      source: "text",
    });

    expect(result.action).toBe("manager.dashboard");
    expect(result.confidence).toBe(0.5);
  });

  it("falls back to AI Q&A when low-confidence actions still have missing slots", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "cashier.checkout",
      action: "operation.cashier",
      confidence: 0.5,
      slots: {},
      missingSlots: ["customerName"],
      reason: "needs customer",
    });

    const result = await parseAiIntentFallback({
      command: "帮我收一单",
      role: "reception",
      definition: definition("reception"),
      source: "text",
    });

    expect(result.action).toBeNull();
    expect(result.loadingLabel).toBe("正在基于 Ami_Core 生成回答");
  });

  it("rejects unauthorized AI actions even when confidence is high", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "manager.dashboard.view",
      action: "manager.dashboard",
      confidence: 0.95,
      slots: {},
      missingSlots: [],
      reason: "not in role actions",
    });

    const limitedDefinition: RoleDefinition = {
      ...definition("reception"),
      availableActions: ["reception.appointments"],
    };

    const result = await parseAiIntentFallback({
      command: "看经营",
      role: "reception",
      definition: limitedDefinition,
      source: "text",
    });

    expect(result.action).toBeNull();
  });
});
