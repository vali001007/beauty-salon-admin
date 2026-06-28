// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getLatestKioskAgentContext, useKioskAgentConversation } from "./useKioskAgentConversation";
import type { Message } from "../types";

function createAgentRunMessage(runId: number): Message {
  return {
    id: `agent-${runId}`,
    type: "dashboard",
    timestamp: new Date("2026-06-27T10:00:00.000Z"),
    payload: {
      kind: "agentRun",
      data: {
        runId,
        runNo: `AG${runId}`,
        status: "completed",
        answer: "回答",
        toolResults: [{ status: "success", title: "消费客户清单", summary: "昨天共有 2 位消费客户。" }],
        actions: [{ label: "生成复购承接清单", action: "agent:tool:customer.followup.task.draft", riskLevel: "medium" }],
        evidence: {
          source: ["ProductOrder", "OrderItem", "Customer"],
          metricDefinition: "消费客户清单按有效订单聚合。",
          filters: ["timeRange=昨天"],
        },
      },
    },
  } as Message;
}

function createFlowCardMessage(type: "cashier" | "cardVerification", title: string): Message {
  return {
    id: `${type}-flow`,
    type,
    title,
    timestamp: new Date("2026-06-27T10:01:00.000Z"),
    payload: {
      kind: type,
      data: { title },
    },
  } as Message;
}

describe("useKioskAgentConversation", () => {
  it("extracts latest agent run context for follow-up append", () => {
    const context = getLatestKioskAgentContext([createAgentRunMessage(101), createAgentRunMessage(202)]);

    expect(context).toMatchObject({
      previousRun: {
        runId: 202,
        runNo: "AG202",
        status: "completed",
        toolResults: [{ title: "消费客户清单" }],
        actions: [{ action: "agent:tool:customer.followup.task.draft" }],
        evidence: { source: ["ProductOrder", "OrderItem", "Customer"] },
      },
    });
  });

  it("keeps the last AgentRun context after cashier and verification FlowCards", () => {
    const context = getLatestKioskAgentContext([
      createAgentRunMessage(404),
      createFlowCardMessage("cashier", "收银开单"),
      createFlowCardMessage("cardVerification", "次卡核销"),
    ]);

    expect(context).toMatchObject({
      previousRun: {
        runId: 404,
        runNo: "AG404",
        status: "completed",
      },
    });
  });

  it("keeps messages in a ref and clears them from a single hook boundary", () => {
    const { result } = renderHook(() => useKioskAgentConversation());

    act(() => {
      result.current.setMessages([createAgentRunMessage(303)]);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.getLatestContext()).toMatchObject({ previousRun: { runId: 303 } });

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.messagesRef.current).toEqual([]);
    expect(result.current.getLatestContext()).toBeUndefined();
  });
});
