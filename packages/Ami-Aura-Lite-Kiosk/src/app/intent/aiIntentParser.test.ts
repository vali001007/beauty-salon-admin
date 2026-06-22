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
  "customer.followup",
  "business.query",
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

  it("accepts governed business query actions at the 0.55 confidence threshold", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "business_query.ask",
      action: "business.query",
      confidence: 0.55,
      slots: {},
      missingSlots: [],
      reason: "AI matched governed query",
    });

    const result = await parseAiIntentFallback({
      command: "看看今天预约数量",
      role: "reception",
      definition: definition("reception"),
      source: "text",
    });

    expect(result.action).toBe("business.query");
    expect(result.confidence).toBe(0.55);
    expect(resolveTerminalIntent).toHaveBeenCalledWith({
      role: "reception",
      command: "看看今天预约数量",
      availableActions: allActions,
      quickActions: [],
      currentStoreName: undefined,
    });
  });

  it("does not accept fixed quick-action flows from typed text even when confidence is high", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "manager.dashboard.view",
      action: "manager.dashboard",
      confidence: 0.95,
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

    expect(result.action).toBeNull();
    expect(result.loadingLabel).toBe("正在基于 Ami_Core 生成回答");
  });

  it("falls back to AI Q&A when typed text is classified as cashier", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "cashier.checkout",
      action: "operation.cashier",
      confidence: 0.95,
      slots: {},
      missingSlots: [],
      reason: "AI matched cashier",
    });

    const result = await parseAiIntentFallback({
      command: "今天收银多少",
      role: "reception",
      definition: definition("reception"),
      source: "text",
    });

    expect(result.action).toBeNull();
    expect(result.loadingLabel).toBe("正在基于 Ami_Core 生成回答");
  });

  it("falls back to AI Q&A when voice input is classified as a fixed quick-action flow", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "recharge.create",
      action: "operation.recharge",
      confidence: 0.95,
      slots: {},
      missingSlots: [],
      reason: "AI matched recharge",
    });

    const result = await parseAiIntentFallback({
      command: "帮我充值",
      role: "reception",
      definition: definition("reception"),
      source: "voice",
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

  it("does not send quick action cards to AI intent parsing for text input", async () => {
    resolveTerminalIntent.mockResolvedValue({
      intentName: "unknown.clarify",
      action: null,
      confidence: 0.2,
      slots: {},
      missingSlots: [],
      reason: "ambiguous text",
    });

    const quickDefinition: RoleDefinition = {
      ...definition("reception"),
      quickActions: [
        { label: "预约", action: "reception.appointments", icon: "CalendarCheck" },
        { label: "收银", action: "operation.cashier", icon: "CreditCard" },
      ],
    };

    await parseAiIntentFallback({
      command: "收银",
      role: "reception",
      definition: quickDefinition,
      source: "text",
    });

    expect(resolveTerminalIntent).toHaveBeenCalledWith({
      role: "reception",
      command: "收银",
      availableActions: allActions,
      quickActions: [],
      currentStoreName: undefined,
    });
  });
});
