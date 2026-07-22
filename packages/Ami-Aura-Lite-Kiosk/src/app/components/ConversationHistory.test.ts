import { describe, expect, it } from "vitest";
import type { TerminalConversationRecord } from "@/types/terminal";
import { isAmiBrainConversation } from "./ConversationHistory";

function record(messages: TerminalConversationRecord["messages"]): TerminalConversationRecord {
  return {
    id: 1,
    deviceId: "AURA-1001",
    storeId: 1,
    role: "manager",
    date: "2026-07-21",
    messages,
    messageCount: messages.length,
    createdAt: "2026-07-21T01:00:00.000Z",
    updatedAt: "2026-07-21T01:00:00.000Z",
  };
}

describe("Ami Brain conversation history filter", () => {
  it("shows conversations saved by Ami Brain", () => {
    expect(isAmiBrainConversation(record([
      { role: "user", content: "今天经营怎么样", timestamp: 1, runtime: "ami_brain" },
      { role: "assistant", content: "今日经营正常", timestamp: 2, runtime: "ami_brain" },
    ]))).toBe(true);
  });

  it("hides legacy conversations without runtime provenance", () => {
    expect(isAmiBrainConversation(record([
      { role: "user", content: "旧版问题", timestamp: 1 },
      { role: "assistant", content: "旧版回答", timestamp: 2 },
    ]))).toBe(false);
  });
});
