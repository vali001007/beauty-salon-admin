import { useCallback, useEffect, useRef, useState } from "react";
import { getLatestAgentContextFromMessages } from "@ami/agent-core";
import type { AgentRunResult } from "@/types/agent";
import type { AuraPayload } from "../microApps/microAppTypes";
import type { Message } from "../types";

export function getLatestKioskAgentContext(messages: Message[]): Record<string, unknown> | undefined {
  return getLatestAgentContextFromMessages(messages, {
    getAgentRun: (message) => {
      const payload = message.payload as AuraPayload | undefined;
      return payload?.kind === "agentRun" ? (payload.data as AgentRunResult) : null;
    },
    getBusinessQuery: (message) => {
      const payload = message.payload as AuraPayload | undefined;
      return payload?.kind === "businessQuery" ? payload.data : null;
    },
  });
}

export function useKioskAgentConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const getLatestContext = useCallback(() => getLatestKioskAgentContext(messagesRef.current), []);

  return {
    messages,
    setMessages,
    loading,
    setLoading,
    messagesRef,
    clearMessages,
    getLatestContext,
  };
}
