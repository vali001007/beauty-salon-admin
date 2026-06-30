import React, { useState } from "react";
import {
  AlarmClock,
  BarChart3,
  CalendarCheck,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  HeartPulse,
  Loader2,
  Mic,
  PackageCheck,
  Printer,
  RotateCcw,
  Send,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { Role, RoleDefinition } from "../types";

type AutomationStatus = "idle" | "loading" | "needs_info" | "draft_ready";

const iconMap = {
  BarChart3,
  CalendarCheck,
  CheckSquare,
  CreditCard,
  FileText,
  HeartPulse,
  PackageCheck,
  Printer,
  RotateCcw,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
};

function QuickCommandButton({
  iconName,
  label,
  onClick,
  disabled,
}: {
  iconName: keyof typeof iconMap;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = iconMap[iconName] ?? Sparkles;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[74px] w-full flex-col items-center justify-center rounded-2xl border border-black/5 bg-white p-3 text-[#1F1B2D] shadow-sm transition-colors hover:bg-black/[0.03] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-[#F7F5F2]">
        <Icon className="h-5 w-5 text-[#1F1B2D]" />
      </span>
      <span className="line-clamp-2 max-w-full break-words text-center text-[11px] font-medium leading-tight text-[#6F6678]">{label}</span>
    </button>
  );
}

export function SmartCommandBar({
  currentRole,
  definition,
  suggestedQuestions,
  onCommand,
  onAutomationCommand,
  automationStatus = "idle",
  disabled,
}: {
  currentRole: Role;
  definition: RoleDefinition;
  suggestedQuestions?: string[];
  onCommand: (command: string, source?: "quick_action" | "text") => void;
  onAutomationCommand?: (command: string) => void;
  automationStatus?: AutomationStatus;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const [quickActionsCollapsed, setQuickActionsCollapsed] = useState(false);
  const agentSuggestions = (suggestedQuestions ?? []).map((question) => question.trim()).filter(Boolean).slice(0, 3);
  const quickButtons = definition.quickActions.map((button) => ({
    ...button,
    source: "quick_action" as const,
    key: button.action,
  }));
  const hasQuickActions = quickButtons.length > 0;
  const suggestedPlaceholder = agentSuggestions.length
    ? `例如：${agentSuggestions.map((question) => question.replace(/[？?。.]$/, "")).join(" / ")}`
    : null;
  const placeholder =
    suggestedPlaceholder ??
    (currentRole === "manager"
      ? "例如：今日经营 / 员工表现 / 流失客户 / 库存预警"
      : currentRole === "beautician"
        ? "例如：我的下一个客户 / 张三皮肤情况 / 记录本次服务"
        : "例如：查张三 / 今日预约 / 核销次卡");

  const handleSend = () => {
    const command = inputValue.trim();
    if (!command || disabled) return;
    onCommand(command, "text");
    setInputValue("");
  };

  const handleAutomation = () => {
    if (disabled || automationStatus === "loading") return;
    onAutomationCommand?.(inputValue.trim());
    setInputValue("");
  };

  const automationButtonTitle =
    automationStatus === "needs_info"
      ? "补充自动提醒信息"
      : automationStatus === "draft_ready"
        ? "查看自动化草稿"
        : inputValue.trim()
          ? "把这句话设为自动化"
          : "查看自动管家 / 新建自动化";

  return (
    <div
      className={[
        "fixed inset-x-0 bottom-0 z-30 flex flex-col border-t border-black/5 bg-[#F7F5F2] px-4 shadow-[0_-20px_40px_rgba(0,0,0,0.03)] sm:px-6",
        quickActionsCollapsed ? "gap-3 pb-5 pt-3" : "gap-4 pb-6 pt-4",
      ].join(" ")}
    >
      {hasQuickActions && !quickActionsCollapsed ? (
        <div className="mx-auto flex w-full max-w-[900px] items-stretch gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto pb-1">
            {quickButtons.map((button) => (
              <div key={button.key} className="min-w-[76px] flex-1">
                <QuickCommandButton
                  iconName={button.icon as keyof typeof iconMap}
                  label={button.label}
                  onClick={() => onCommand(button.action, button.source)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[900px] items-center gap-3">
        {hasQuickActions ? (
          <button
            type="button"
            onClick={() => setQuickActionsCollapsed((value) => !value)}
            className="flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border border-black/10 bg-white text-[#4B4360] shadow-sm transition-colors hover:bg-black/[0.03] active:scale-95"
            aria-label={quickActionsCollapsed ? "展开快捷操作" : "收起快捷操作"}
            aria-expanded={!quickActionsCollapsed}
            title={quickActionsCollapsed ? "展开快捷操作" : "收起快捷操作"}
          >
            {quickActionsCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="mt-0.5 text-[11px] font-medium">{quickActionsCollapsed ? "快捷" : "收起"}</span>
          </button>
        ) : null}
        <div className="flex h-14 flex-1 items-center overflow-hidden rounded-2xl border border-black/10 bg-white px-4 shadow-sm transition-all focus-within:border-[#C9956C] focus-within:ring-2 focus-within:ring-[#C9956C]/20">
          <input
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSend();
            }}
            disabled={disabled}
            placeholder={placeholder}
            className="h-full flex-1 border-none bg-transparent text-base text-[#1F1B2D] outline-none placeholder:text-[#9B92A3]"
          />
          <button
            type="button"
            className="ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#6F6678] transition-colors hover:bg-[#F7F5F2]"
            title="语音输入"
          >
            <Mic className="h-5 w-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || disabled}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#C9956C] shadow-md transition-colors hover:bg-[#b0825c] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          title="发送"
        >
          <Send className="h-6 w-6 text-white" />
        </button>
        {currentRole === "manager" && onAutomationCommand ? (
          <button
            type="button"
            onClick={handleAutomation}
            disabled={disabled || automationStatus === "loading"}
            className={[
              "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border shadow-sm transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
              automationStatus === "draft_ready"
                ? "border-[#2D1B69] bg-[#2D1B69] text-white"
                : "border-black/10 bg-white text-[#2D1B69] hover:bg-[#F7F5F2]",
            ].join(" ")}
            title={automationButtonTitle}
          >
            {automationStatus === "loading" ? <Loader2 className="h-6 w-6 animate-spin" /> : <AlarmClock className="h-6 w-6" />}
            {automationStatus === "needs_info" ? (
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
