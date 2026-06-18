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
    { label: "员工", action: "manager.staff", icon: "Users" },
    { label: "库存", action: "manager.inventory", icon: "PackageCheck" },
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
    expect(container.textContent).toContain("员工");
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
    expect(container.textContent).not.toContain("员工");
    expect(container.textContent).not.toContain("库存");

    expect(input).not.toBeNull();
    expect(input?.disabled).toBe(false);
    expect(inputWrapper?.previousElementSibling?.getAttribute("aria-label")).toBe("展开快捷操作");

    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label="展开快捷操作"]')?.click();
    });

    expect(container.textContent).toContain("经营");
    expect(container.textContent).toContain("员工");
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
});
