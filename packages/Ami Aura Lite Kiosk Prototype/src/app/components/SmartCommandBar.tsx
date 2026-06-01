import React, { useState } from "react";
import {
  BarChart3,
  CalendarCheck,
  CheckSquare,
  CreditCard,
  FileText,
  HeartPulse,
  Mic,
  PackageCheck,
  Printer,
  Send,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { Role, RoleDefinition } from "../types";

const iconMap = {
  BarChart3,
  CalendarCheck,
  CheckSquare,
  CreditCard,
  FileText,
  HeartPulse,
  PackageCheck,
  Printer,
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
      <span className="whitespace-nowrap text-[11px] font-medium text-[#6F6678]">{label}</span>
    </button>
  );
}

export function SmartCommandBar({
  currentRole,
  definition,
  onCommand,
  disabled,
}: {
  currentRole: Role;
  definition: RoleDefinition;
  onCommand: (command: string) => void;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");
  const placeholder =
    currentRole === "manager"
      ? "例如：今日经营 / 员工表现 / 流失客户 / 库存预警"
      : currentRole === "beautician"
        ? "例如：我的下一个客户 / 张三皮肤情况 / 记录本次服务"
        : "例如：查张三 / 今日预约 / 核销次卡";

  const handleSend = () => {
    const command = inputValue.trim();
    if (!command || disabled) return;
    onCommand(command);
    setInputValue("");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-4 border-t border-black/5 bg-[#F7F5F2] px-4 pb-6 pt-4 shadow-[0_-20px_40px_rgba(0,0,0,0.03)] sm:px-6">
      <div className="mx-auto flex w-full max-w-[900px] items-center gap-3 overflow-x-auto pb-1">
        {definition.quickActions.map((button) => (
          <div key={button.action} className="min-w-[76px] flex-1">
            <QuickCommandButton
              iconName={button.icon as keyof typeof iconMap}
              label={button.label}
              onClick={() => onCommand(button.action)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-[900px] items-center gap-3">
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
      </div>
    </div>
  );
}
