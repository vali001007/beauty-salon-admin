import { saveTerminalConversation } from "@/api";
import type { TerminalConversationMessage } from "@/types/terminal";
import type { Message, Role } from "../types";
import { clearConversation } from "./auraCoreService";

const ARCHIVE_CHECK_INTERVAL_MS = 60_000;
export const TERMINAL_CONVERSATION_RUNTIME = "ami_brain" as const;

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPayloadText(message: Message) {
  const payload = message.payload as any;
  if (message.type === "query") return payload?.text;
  if (message.type === "ai" && payload?.kind === "ai") return payload.data?.text;
  if (message.type === "error") return payload?.text;
  if (message.type === "operation" && payload?.kind === "operation") return payload.data?.description ?? payload.data?.title;
  if (message.type === "dashboard") {
    if (payload?.data?.summary) return payload.data.summary;
    if (payload?.kind) return `${message.title ?? "业务看板"}：${payload.kind}`;
  }
  if (message.type === "automation") {
    return payload?.data?.summary ?? payload?.data?.title;
  }
  return message.content;
}

export function toConversationMessages(messages: Message[]): TerminalConversationMessage[] {
  return messages
    .filter((message) => message.type !== "loading")
    .reduce<TerminalConversationMessage[]>((items, message) => {
      const content = String(getPayloadText(message) ?? "").trim();
      if (!content) return items;
      const role = message.type === "query" ? "user" : "assistant";
      items.push({
        role,
        content,
        timestamp: message.timestamp.getTime(),
        type: message.type,
        title: message.title,
        runtime: TERMINAL_CONVERSATION_RUNTIME,
      });
      return items;
    }, []);
}

export async function saveCurrentConversation(params: {
  role: Role;
  operatorId?: number | null;
  messages: Message[];
  date?: string;
}) {
  const messages = toConversationMessages(params.messages);
  if (!messages.length) return;
  await saveTerminalConversation({
    role: params.role,
    ...(params.operatorId ? { operatorId: params.operatorId } : {}),
    date: params.date ?? getDateKey(),
    messages,
    messageCount: messages.length,
  });
}

interface ConversationSchedulerParams {
  getRole: () => Role;
  getOperatorId?: () => number | null | undefined;
  getMessages: () => Message[];
  clearMessages: () => void;
}

export function createConversationArchiveChecker(params: ConversationSchedulerParams) {
  let activeDate = getDateKey();

  const save = (date = activeDate) =>
    saveCurrentConversation({
      role: params.getRole(),
      operatorId: params.getOperatorId?.() ?? null,
      messages: params.getMessages(),
      date,
    }).catch((error) => {
      console.warn("Ami Aura Lite 对话保存失败", error);
    });

  return () => {
    const nextDate = getDateKey();
    if (nextDate === activeDate) return;
    const archivedDate = activeDate;
    activeDate = nextDate;
    void save(archivedDate).finally(() => {
      clearConversation();
      params.clearMessages();
    });
  };
}

export function initConversationScheduler(params: ConversationSchedulerParams) {
  const checkDateChange = createConversationArchiveChecker(params);
  const interval = globalThis.setInterval(checkDateChange, ARCHIVE_CHECK_INTERVAL_MS);

  const handleBeforeUnload = () => {
    void saveCurrentConversation({
      role: params.getRole(),
      operatorId: params.getOperatorId?.() ?? null,
      messages: params.getMessages(),
      date: getDateKey(),
    }).catch((error) => {
      console.warn("Ami Aura Lite 对话保存失败", error);
    });
  };
  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    globalThis.clearInterval(interval);
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
}
