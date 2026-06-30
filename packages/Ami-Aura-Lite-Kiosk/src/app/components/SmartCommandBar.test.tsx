// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SmartCommandBar } from "./SmartCommandBar";
import type { RoleDefinition } from "../types";

const managerDefinition: RoleDefinition = {
  role: "manager",
  title: "店长",
  subtitle: "店长 / 前台 / 美容师",
  availableActions: ["manager.dashboard", "manager.staff", "manager.inventory"],
  quickActions: [
    { label: "经营", action: "manager.dashboard", icon: "BarChart3" },
    { label: "排班", action: "manager.staff", icon: "Users" },
    { label: "库存", action: "manager.inventory", icon: "PackageCheck" },
    { label: "预约", action: "reception.appointments", icon: "CalendarCheck" },
    { label: "核销", action: "operation.verify", icon: "CheckSquare" },
    { label: "收银", action: "operation.cashier", icon: "CreditCard" },
    { label: "办卡", action: "operation.card", icon: "Wallet" },
  ],
};

const receptionDefinition: RoleDefinition = {
  role: "reception",
  title: "前台",
  subtitle: "前台接待",
  availableActions: ["reception.appointments", "operation.verify", "operation.cashier", "manager.customers"],
  quickActions: [
    { label: "预约", action: "reception.appointments", icon: "CalendarCheck" },
    { label: "核销", action: "operation.verify", icon: "CheckSquare" },
    { label: "客户增长", action: "manager.customers", icon: "Sparkles" },
    { label: "收银", action: "operation.cashier", icon: "CreditCard" },
    { label: "办卡", action: "operation.card", icon: "Wallet" },
    { label: "充值", action: "operation.recharge", icon: "Wallet" },
    { label: "打印", action: "operation.print", icon: "Printer" },
  ],
};

describe("SmartCommandBar", () => {
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

  it("collapses and expands quick actions without affecting text input", () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(<SmartCommandBar currentRole="manager" definition={managerDefinition} onCommand={onCommand} />);
    });

    expect(container.textContent).toContain("经营");
    expect(container.textContent).toContain("排班");
    expect(container.textContent).toContain("库存");
    expect(container.textContent).toContain("收起");

    const input = container.querySelector<HTMLInputElement>("input");
    const inputWrapper = input?.parentElement;
    expect(inputWrapper?.previousElementSibling?.getAttribute("aria-label")).toBe("收起快捷操作");

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="收起快捷操作"]')?.click();
    });

    expect(container.textContent).toContain("快捷");
    expect(container.textContent).not.toContain("经营");
    expect(container.textContent).not.toContain("排班");
    expect(container.textContent).not.toContain("库存");

    expect(input).not.toBeNull();
    expect(input?.disabled).toBe(false);
    expect(inputWrapper?.previousElementSibling?.getAttribute("aria-label")).toBe("展开快捷操作");

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="展开快捷操作"]')?.click();
    });

    expect(container.textContent).toContain("经营");
    expect(container.textContent).toContain("排班");
    expect(container.textContent).toContain("库存");
    expect(container.textContent).toContain("收起");
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("always submits input content as text, even when it matches a quick action", () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(<SmartCommandBar currentRole="manager" definition={managerDefinition} onCommand={onCommand} />);
    });

    const input = container.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();

    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, "manager.staff");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onCommand).toHaveBeenCalledWith("manager.staff", "text");
    expect(onCommand).not.toHaveBeenCalledWith("manager.staff", "quick_action");
  });

  it("uses persona suggested questions as input placeholder and keeps FlowCard quick actions", () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(
        <SmartCommandBar
          currentRole="manager"
          definition={managerDefinition}
          suggestedQuestions={["近期有哪些临期库存产品？", "哪些商品需要补货？", "今天经营有什么风险？", "第4个不展示"]}
          onCommand={onCommand}
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>("input");
    expect(input?.placeholder).toBe("例如：近期有哪些临期库存产品 / 哪些商品需要补货 / 今天经营有什么风险");
    expect(container.textContent).not.toContain("近期有哪些临期库存产品");
    expect(container.textContent).not.toContain("哪些商品需要补货");
    expect(container.textContent).not.toContain("今天经营有什么风险");
    expect(container.textContent).not.toContain("第4个不展示");
    expect(container.textContent).toContain("排班");
    expect(container.textContent).toContain("核销");
    expect(container.textContent).toContain("收银");
    expect(container.textContent).toContain("办卡");

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("办卡"))
        ?.click();
    });

    expect(onCommand).toHaveBeenCalledWith("operation.card", "quick_action");
    expect(onCommand).not.toHaveBeenCalledWith("近期有哪些临期库存产品？", "text");
  });

  it("keeps terminal operation quick actions visible when persona suggestions exist", () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(
        <SmartCommandBar
          currentRole="reception"
          definition={receptionDefinition}
          suggestedQuestions={["今天有哪些预约要确认？", "哪些客户到店前需要提醒？", "帮我查客户卡项状态？"]}
          onCommand={onCommand}
        />,
      );
    });

    const input = container.querySelector<HTMLInputElement>("input");
    expect(input?.placeholder).toBe("例如：今天有哪些预约要确认 / 哪些客户到店前需要提醒 / 帮我查客户卡项状态");
    expect(container.textContent).not.toContain("今天有哪些预约要确认");
    expect(container.textContent).toContain("预约");
    expect(container.textContent).toContain("核销");
    expect(container.textContent).toContain("客户增长");
    expect(container.textContent).toContain("收银");
    expect(container.textContent).toContain("办卡");
    expect(container.textContent).toContain("充值");
    expect(container.textContent).toContain("打印");

    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("收银"))
        ?.click();
    });

    expect(onCommand).toHaveBeenCalledWith("operation.cashier", "quick_action");
  });
});
