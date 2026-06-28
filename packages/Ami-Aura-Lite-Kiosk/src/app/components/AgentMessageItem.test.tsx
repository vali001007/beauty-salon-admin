// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunResult, AuraResponseBlock } from "@/types/agent";
import { AgentMessageItem } from "./AgentMessageItem";

type TestAgentRunResult = AgentRunResult & {
  renderedBlocks?: AuraResponseBlock[];
  followUpSuggestions?: string[];
};

function createAgentResult(overrides: Partial<TestAgentRunResult> = {}): TestAgentRunResult {
  return {
    runId: 101,
    runNo: "AR-101",
    status: "completed",
    answer: "已完成分析。",
    toolResults: [],
    actions: [],
    ...overrides,
  };
}

describe("AgentMessageItem", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders at most three follow-up suggestions and submits the selected question", () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            followUpSuggestions: ["看客户明细", "生成回访话术", "安排明日跟进", "第4个不展示"],
          })}
          onCommand={onCommand}
        />,
      );
    });

    expect(container.textContent).toContain("看客户明细");
    expect(container.textContent).toContain("生成回访话术");
    expect(container.textContent).toContain("安排明日跟进");
    expect(container.textContent).not.toContain("第4个不展示");

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("生成回访话术"))
        ?.click();
    });

    expect(onCommand).toHaveBeenCalledWith("生成回访话术");
  });

  it("uses follow_up_chips blocks when top-level suggestions are empty", () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            renderedBlocks: [
              {
                kind: "follow_up_chips",
                suggestions: ["查看库存明细", "生成采购建议"],
              },
            ],
          })}
          onCommand={onCommand}
        />,
      );
    });

    expect(container.textContent).toContain("查看库存明细");

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("查看库存明细"))
        ?.click();
    });

    expect(onCommand).toHaveBeenCalledWith("查看库存明细");
  });

  it("renders top-level suggested actions and limitations", () => {
    const onAction = vi.fn();

    act(() => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            actions: [{ label: "生成回访话术", action: "customer.followup.draft", riskLevel: "low" }],
            evidence: {
              source: ["订单", "客户"],
              metricDefinition: "昨日已支付订单客户",
              filters: ["paidAt=昨天"],
              limitations: ["仅统计本店"],
            },
          })}
          onAction={onAction}
        />,
      );
    });

    expect(container.textContent).toContain("数据来源 · 订单、客户");
    expect(container.textContent).toContain("限制说明：仅统计本店");
    expect(container.textContent).toContain("生成回访话术");

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("生成回访话术"))
        ?.click();
    });

    expect(onAction).toHaveBeenCalledWith("customer.followup.draft");
  });

  it("does not repeat top-level actions as follow-up suggestions", () => {
    act(() => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            actions: [
              { label: "查看订单明细", action: "orders.view", riskLevel: "low" },
              { label: "生成复购跟进草稿", action: "customer.followup.draft", riskLevel: "low" },
            ],
            followUpSuggestions: ["查看订单明细", "生成复购跟进草稿", "分析高价值客户"],
          })}
        />,
      );
    });

    expect(container.textContent?.match(/查看订单明细/g) ?? []).toHaveLength(1);
    expect(container.textContent?.match(/生成复购跟进草稿/g) ?? []).toHaveLength(1);
    expect(container.textContent).toContain("分析高价值客户");
  });

  it("renders no_data as an empty-state notice instead of a failure", () => {
    act(() => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            answer: "",
            toolResults: [{ status: "no_data", title: "临期库存", summary: "未来 90 天暂无临期库存。" }],
          })}
        />,
      );
    });

    expect(container.textContent).toContain("暂无数据");
    expect(container.textContent).toContain("未来 90 天暂无临期库存。");
    expect(container.textContent).not.toContain("执行失败");
  });

  it("renders unsupported tool outcomes as an ability-gap notice", () => {
    act(() => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            answer: "",
            toolResults: [{ status: "unsupported", title: "暂不支持", summary: "当前暂不支持查询这个指标。" }],
          })}
        />,
      );
    });

    expect(container.textContent).toContain("暂不支持");
    expect(container.textContent).toContain("当前暂不支持查询这个指标。");
    expect(container.textContent).not.toContain("执行失败");
  });

  it("renders failed tool outcomes as a failure notice", () => {
    act(() => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            status: "failed",
            answer: "",
            toolResults: [{ status: "failed", title: "库存工具失败", summary: "库存数据加载失败。" }],
          })}
        />,
      );
    });

    expect(container.textContent).toContain("执行失败");
    expect(container.textContent).toContain("库存数据加载失败。");
  });

  it("renders the route badge when Agent Router selects a persona", () => {
    act(() => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            personaCode: "inventory",
            routeDecision: {
              personaCode: "inventory",
              confidence: 0.88,
              reason: "命中库存能力",
              candidates: [{ personaCode: "inventory", score: 0.88, matchedCapabilities: ["临期库存"] }],
              clarificationNeeded: false,
              mode: "auto",
            },
          })}
        />,
      );
    });

    expect(container.textContent).toContain("由 库存采购 Agent 处理");
  });

  it("does not duplicate answer, evidence, or actions already represented by blocks", async () => {
    const onAction = vi.fn();

    await act(async () => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({
            answer: "找到 5 个临期库存商品。",
            renderedBlocks: [
              { kind: "text", content: "找到 5 个临期库存商品。" },
              {
                kind: "inventory_item_card",
                title: "临期库存清单",
                itemName: "水润柔肤水",
                metrics: [{ label: "临期库存", value: "70瓶", tone: "warning" }],
                actions: [{ label: "查看库存预警", actionId: "inventory.alerts.view", riskLevel: "low" }],
              },
              {
                kind: "evidence_panel",
                sources: ["商品", "库存批次"],
                metricDefinition: "未来 90 天仍有库存的临期商品",
              },
            ],
            actions: [{ label: "查看库存预警", action: "inventory.alerts.view", riskLevel: "low" }],
            followUpSuggestions: ["查看库存预警", "分析临期处理方案"],
            evidence: {
              source: ["商品", "库存批次"],
              metricDefinition: "未来 90 天仍有库存的临期商品",
              filters: [],
            },
          })}
          onAction={onAction}
        />,
      );
    });

    await act(async () => {
      await vi.dynamicImportSettled();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent?.match(/找到 5 个临期库存商品。/g) ?? []).toHaveLength(1);
    expect(container.textContent?.match(/数据来源/g) ?? []).toHaveLength(1);
    expect(container.textContent?.match(/查看库存预警/g) ?? []).toHaveLength(1);
    expect(container.textContent).toContain("分析临期处理方案");

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("查看库存预警"))
        ?.click();
    });

    expect(onAction).toHaveBeenCalledWith("inventory.alerts.view");
  });

  it("submits negative feedback with run id for quality analytics", async () => {
    const onFeedback = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <AgentMessageItem
          data={createAgentResult({ runId: 101 })}
          onFeedback={onFeedback}
        />,
      );
    });

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("无用"))
        ?.click();
    });

    expect(onFeedback).toHaveBeenCalledWith(101, false);
    expect(container.textContent).toContain("已记录");
  });
});
