import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../types";
import { createConversationArchiveChecker, saveCurrentConversation, toConversationMessages } from "./conversationPersistence";

const saveTerminalConversation = vi.hoisted(() => vi.fn());
const clearConversation = vi.hoisted(() => vi.fn());

vi.mock("@/api", () => ({
  saveTerminalConversation,
}));

vi.mock("./auraCoreService", () => ({
  clearConversation,
}));

function message(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? "message-1",
    type: partial.type ?? "query",
    payload: partial.payload,
    title: partial.title,
    content: partial.content,
    timestamp: partial.timestamp ?? new Date("2026-06-08T10:00:00.000Z"),
  };
}

describe("conversationPersistence", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("converts visible terminal messages into compact conversation records", () => {
    const records = toConversationMessages([
      message({ type: "query", payload: { text: "张三最近来过吗" }, title: "用户指令" }),
      message({
        type: "ai",
        payload: { kind: "ai", data: { text: "张三上次到店是 6 月 1 日。" } },
        title: "Ami 智能问答",
      }),
      message({ type: "loading", title: "正在加载" }),
      message({ type: "error", payload: { text: "请求失败" } }),
    ]);

    expect(records).toEqual([
      expect.objectContaining({ role: "user", content: "张三最近来过吗", type: "query", title: "用户指令", runtime: "ami_brain" }),
      expect.objectContaining({ role: "assistant", content: "张三上次到店是 6 月 1 日。", type: "ai", title: "Ami 智能问答", runtime: "ami_brain" }),
      expect.objectContaining({ role: "assistant", content: "请求失败", type: "error", runtime: "ami_brain" }),
    ]);
  });

  it("saves the current conversation with the provided role and date", async () => {
    await saveCurrentConversation({
      role: "beautician",
      date: "2026-06-08",
      messages: [
        message({ type: "query", payload: { text: "他的卡还有几次" } }),
        message({ type: "ai", payload: { kind: "ai", data: { text: "还剩 3 次。" } } }),
      ],
    });

    expect(saveTerminalConversation).toHaveBeenCalledWith({
      role: "beautician",
      date: "2026-06-08",
      messages: [
        expect.objectContaining({ role: "user", content: "他的卡还有几次", runtime: "ami_brain" }),
        expect.objectContaining({ role: "assistant", content: "还剩 3 次。", runtime: "ami_brain" }),
      ],
      messageCount: 2,
    });
  });

  it("saves the current conversation with operator isolation when an operator is provided", async () => {
    await saveCurrentConversation({
      role: "manager",
      operatorId: 18,
      date: "2026-06-08",
      messages: [
        message({ type: "query", payload: { text: "今天最值得跟进的客户" } }),
        message({ type: "ai", payload: { kind: "ai", data: { text: "已返回 10 位客户。" } } }),
      ],
    });

    expect(saveTerminalConversation).toHaveBeenCalledWith({
      role: "manager",
      operatorId: 18,
      date: "2026-06-08",
      messages: [
        expect.objectContaining({ role: "user", content: "今天最值得跟进的客户", runtime: "ami_brain" }),
        expect.objectContaining({ role: "assistant", content: "已返回 10 位客户。", runtime: "ami_brain" }),
      ],
      messageCount: 2,
    });
  });

  it("archives the previous day and clears runtime/UI conversation after the date changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 8, 23, 59, 30));

    const clearMessages = vi.fn();
    const checkDateChange = createConversationArchiveChecker({
      getRole: () => "reception",
      getMessages: () => [message({ type: "query", payload: { text: "查客户张三" } })],
      clearMessages,
    });

    vi.setSystemTime(new Date(2026, 5, 9, 0, 0, 31));
    checkDateChange();
    await vi.waitFor(() => expect(saveTerminalConversation).toHaveBeenCalledTimes(1));

    expect(saveTerminalConversation).toHaveBeenCalledWith({
      role: "reception",
      date: "2026-06-08",
      messages: [expect.objectContaining({ role: "user", content: "查客户张三", runtime: "ami_brain" })],
      messageCount: 1,
    });
    await vi.waitFor(() => expect(clearConversation).toHaveBeenCalledTimes(1));
    expect(clearMessages).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
