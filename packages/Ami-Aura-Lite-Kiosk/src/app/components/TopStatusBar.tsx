import React, { useEffect, useMemo, useState } from "react";
import { Activity, Check, ChevronDown, Fingerprint, History, Lock, Printer, ScanLine, Wifi } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { AURA_ROLE_LABELS } from "../../../../../src/config/aura";
import type { AuraTerminalUser } from "../../../../../src/types/aura";
import type { Store } from "../../../../../src/types";
import { getTerminalQueryMetrics, type TerminalQueryMetric, type TerminalQuerySource } from "../services/terminalQueryClient";
import type { Role } from "../types";

type AgentEngine = "agent_v1" | "agent_v2";
type AgentV2GrayMode = "legacy_regex" | "shadow" | "kg_llm_preferred" | "kg_llm_only" | "legacy_retired";

const AGENT_ENGINE_OPTIONS: Array<{ value: AgentEngine; label: string; title: string }> = [
  { value: "agent_v1", label: "V1", title: "Agent V1：旧工具链" },
  { value: "agent_v2", label: "V2", title: "Agent V2：能力目录" },
];

const AGENT_V2_GRAY_MODE_OPTIONS: Array<{ value: AgentV2GrayMode; label: string; title: string }> = [
  { value: "kg_llm_preferred", label: "优先", title: "优先使用 KG+LLM，新链路失败时回退" },
  { value: "shadow", label: "Shadow", title: "旧链路答复，新链路旁路观测" },
  { value: "kg_llm_only", label: "仅新", title: "只使用 KG+LLM 链路" },
  { value: "legacy_regex", label: "旧链", title: "只使用旧正则/能力规则链路" },
  { value: "legacy_retired", label: "退役", title: "旧链路退役模式，保留受控回退" },
];

function DeviceBadge({
  icon: Icon,
  status,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  status: "success" | "warning" | "error";
  label: string;
}) {
  const colors = {
    success: "text-emerald-500",
    warning: "text-amber-500",
    error: "text-rose-500",
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-[#6F6678]">
      <Icon className={`w-4 h-4 ${colors[status]}`} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function StoreSwitcher({
  currentStoreId,
  storeName,
  availableStores,
  disabled,
  onChange,
}: {
  currentStoreId: number | null;
  storeName: string;
  availableStores: Store[];
  disabled?: boolean;
  onChange: (storeId: number) => void;
}) {
  if (availableStores.length <= 1) {
    return <div className="truncate text-base font-semibold text-[#1F1B2D]">{storeName}</div>;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button className="inline-flex max-w-[280px] items-center gap-1 rounded-lg px-2 py-1 text-base font-semibold text-[#1F1B2D] transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60">
          <span className="truncate">{storeName}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#6F6678]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 max-h-[320px] min-w-[240px] overflow-y-auto rounded-xl border border-black/5 bg-white p-1 shadow-lg"
          align="start"
        >
          {availableStores.map((store) => (
            <DropdownMenu.Item
              key={store.id}
              onClick={() => onChange(store.id)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-[#1F1B2D] outline-none hover:bg-[#F7F5F2] data-[highlighted]:bg-[#F7F5F2]"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{store.name}</span>
                {store.address ? <span className="block truncate text-xs text-[#6F6678]">{store.address}</span> : null}
              </span>
              {currentStoreId === store.id ? <Check className="h-4 w-4 shrink-0 text-[#C9956C]" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function getAccountDisplayName(user?: AuraTerminalUser | null) {
  return user?.name || user?.username || "选择账号";
}

function isTerminalUserDisabled(user: AuraTerminalUser) {
  return user.disabled === true || user.terminalAccess === false || user.availableRoles.length === 0;
}

function AccountSwitcher({
  currentUserId,
  currentRole,
  availableUsers,
  disabled,
  onChange,
}: {
  currentUserId: number | null;
  currentRole: Role;
  availableUsers: AuraTerminalUser[];
  disabled?: boolean;
  onChange: (userId: number) => void;
}) {
  const currentUser =
    availableUsers.find((user) => user.id === currentUserId) ??
    availableUsers[0] ??
    null;
  const currentLabel = currentUser?.roleLabel ?? AURA_ROLE_LABELS[currentRole];

  if (availableUsers.length <= 1) {
    return (
      <div className="min-w-0 rounded-lg px-2 py-1 text-sm text-[#1F1B2D]">
        <div className="max-w-[180px] truncate font-medium">{getAccountDisplayName(currentUser)}</div>
        <div className="text-[11px] text-[#6F6678]">{currentLabel}</div>
      </div>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button className="inline-flex min-w-0 max-w-[220px] items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-[#1F1B2D] transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60">
          <span className="min-w-0">
            <span className="block truncate font-medium">{getAccountDisplayName(currentUser)}</span>
            <span className="block text-[11px] text-[#6F6678]">{currentLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#6F6678]" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 max-h-[360px] min-w-[260px] overflow-y-auto rounded-xl border border-black/5 bg-white p-1 shadow-lg"
          align="start"
        >
          {availableUsers.map((user) => {
            const userDisabled = isTerminalUserDisabled(user);
            return (
              <DropdownMenu.Item
                key={user.id}
                disabled={userDisabled}
                onSelect={(event) => {
                  if (userDisabled) {
                    event.preventDefault();
                    return;
                  }
                  onChange(user.id);
                }}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-[#1F1B2D] outline-none hover:bg-[#F7F5F2] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-[#F7F5F2]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{getAccountDisplayName(user)}</span>
                  <span className="mt-0.5 block truncate text-xs text-[#6F6678]">
                    {user.username} · {userDisabled ? (user.disabledReason ?? "未配置终端权限") : user.roleLabel}
                  </span>
                </span>
                {currentUserId === user.id ? <Check className="h-4 w-4 shrink-0 text-[#C9956C]" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function getMetricKeyLabel(key: string) {
  try {
    const parsed = JSON.parse(key) as unknown[];
    return parsed.map((item) => String(item)).join(" / ");
  } catch {
    return key;
  }
}

function getSourceLabel(source: TerminalQuerySource) {
  const labels: Record<TerminalQuerySource, string> = {
    "cache-fresh": "命中",
    "cache-stale": "旧数据",
    network: "网络",
    prefetch: "预取",
  };
  return labels[source];
}

function getMetricTone(metric: TerminalQueryMetric) {
  if (!metric.success) return "text-rose-600";
  if (metric.durationMs >= 1200) return "text-amber-600";
  if (metric.source.startsWith("cache")) return "text-emerald-600";
  return "text-[#2D1B69]";
}

function QueryDiagnostics() {
  const [metrics, setMetrics] = useState<TerminalQueryMetric[]>(() => getTerminalQueryMetrics());

  useEffect(() => {
    const handleMetric = () => setMetrics(getTerminalQueryMetrics());
    window.addEventListener("ami-terminal-query-metric", handleMetric);
    return () => window.removeEventListener("ami-terminal-query-metric", handleMetric);
  }, []);

  const summary = useMemo(() => {
    const recent = metrics.slice(-50);
    const cacheHits = recent.filter((item) => item.source === "cache-fresh" || item.source === "cache-stale").length;
    const failures = recent.filter((item) => !item.success).length;
    const slow = recent.filter((item) => item.durationMs >= 1200).length;
    const network = recent.filter((item) => item.source === "network" || item.source === "prefetch");
    const averageNetworkMs = network.length
      ? Math.round(network.reduce((total, item) => total + item.durationMs, 0) / network.length)
      : 0;
    return {
      total: recent.length,
      cacheHitRate: recent.length ? Math.round((cacheHits / recent.length) * 100) : 0,
      failures,
      slow,
      averageNetworkMs,
    };
  }, [metrics]);

  const latestMetrics = metrics.slice(-8).reverse();
  const hasRisk = summary.failures > 0 || summary.slow > 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/5 ${
            hasRisk ? "text-amber-600" : "text-[#6F6678]"
          }`}
          title="查询性能"
        >
          <Activity className="h-5 w-5" />
          {hasRisk ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-500" /> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          className="z-50 w-[360px] rounded-xl border border-black/5 bg-white p-4 text-[#1F1B2D] shadow-xl shadow-black/10"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">查询性能</div>
              <div className="text-xs text-[#6F6678]">最近 {summary.total} 次终端查询</div>
            </div>
            <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${hasRisk ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
              {hasRisk ? "需关注" : "正常"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: "命中率", value: `${summary.cacheHitRate}%` },
              { label: "均耗时", value: `${summary.averageNetworkMs}ms` },
              { label: "慢查询", value: String(summary.slow) },
              { label: "失败", value: String(summary.failures) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-[#F7F5F2] px-2 py-2 text-center">
                <div className="text-[11px] text-[#6F6678]">{item.label}</div>
                <div className="mt-1 text-sm font-semibold text-[#1F1B2D]">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 max-h-64 overflow-y-auto">
            {latestMetrics.length ? (
              <div className="grid gap-2">
                {latestMetrics.map((metric, index) => (
                  <div key={`${metric.key}-${metric.updatedAt}-${index}`} className="rounded-lg border border-black/5 px-3 py-2">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-medium text-[#1F1B2D]">{getMetricKeyLabel(metric.key)}</span>
                      <span className={`shrink-0 font-semibold ${getMetricTone(metric)}`}>
                        {metric.success ? `${metric.durationMs}ms` : "失败"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-[#6F6678]">
                      <span>{getSourceLabel(metric.source)}</span>
                      <span>{metric.dataSize ? `${Math.round(metric.dataSize / 1024)}KB` : metric.errorCode ?? ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-[#F7F5F2] px-3 py-4 text-center text-sm text-[#6F6678]">暂无查询记录</div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AgentEngineSwitch({
  value,
  onChange,
}: {
  value: AgentEngine;
  onChange: (engine: AgentEngine) => void;
}) {
  return (
    <div className="hidden items-center rounded-full border border-black/10 bg-[#F7F5F2] p-0.5 md:flex" title="Agent 架构切换">
      {AGENT_ENGINE_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-8 min-w-10 rounded-full px-3 text-xs font-semibold transition-colors ${
              active ? "bg-[#2D1B69] text-white shadow-sm" : "text-[#6F6678] hover:bg-white hover:text-[#1F1B2D]"
            }`}
            title={option.title}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function AgentV2GrayModeSwitch({
  value,
  onChange,
}: {
  value: AgentV2GrayMode;
  onChange: (mode: AgentV2GrayMode) => void;
}) {
  return (
    <div className="hidden items-center rounded-full border border-[#2D1B69]/15 bg-[#2D1B69]/5 p-0.5 lg:flex" title="Agent V2 灰度策略">
      {AGENT_V2_GRAY_MODE_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-8 min-w-9 rounded-full px-2 text-[11px] font-semibold transition-colors ${
              active ? "bg-[#C9956C] text-white shadow-sm" : "text-[#6F6678] hover:bg-white hover:text-[#1F1B2D]"
            }`}
            title={option.title}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function TopStatusBar({
  storeName,
  currentStoreId,
  availableStores,
  employeeName,
  currentRole,
  currentUserId,
  availableUsers,
  agentEngine,
  agentV2GrayMode,
  switchingStore,
  switchingUser,
  onStoreChange,
  onUserChange,
  onAgentEngineChange,
  onAgentV2GrayModeChange,
  onHistory,
  onLock,
  onFingerprint,
}: {
  storeName: string;
  currentStoreId: number | null;
  availableStores: Store[];
  employeeName: string;
  currentRole: Role;
  currentUserId: number | null;
  availableUsers: AuraTerminalUser[];
  agentEngine: AgentEngine;
  agentV2GrayMode: AgentV2GrayMode;
  switchingStore?: boolean;
  switchingUser?: boolean;
  onStoreChange: (storeId: number) => void;
  onUserChange: (userId: number) => void;
  onAgentEngineChange: (engine: AgentEngine) => void;
  onAgentV2GrayModeChange: (mode: AgentV2GrayMode) => void;
  onHistory: () => void;
  onLock: () => void;
  onFingerprint: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-black/5 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <StoreSwitcher
            currentStoreId={currentStoreId}
            storeName={storeName}
            availableStores={availableStores}
            disabled={switchingStore}
            onChange={onStoreChange}
          />
          <div className="truncate text-xs text-[#6F6678]">{employeeName}</div>
        </div>
        <div className="h-4 w-px bg-black/10" />
        <AccountSwitcher
          currentUserId={currentUserId}
          currentRole={currentRole}
          availableUsers={availableUsers}
          disabled={switchingUser}
          onChange={onUserChange}
        />
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-[#C9956C] to-[#2D1B69] text-white">
          A
        </div>
        <div className="hidden text-lg font-bold tracking-tight text-[#1F1B2D] sm:block">Ami Aura Lite</div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-3 sm:flex">
          <DeviceBadge icon={Wifi} status="success" label="网络正常" />
          <DeviceBadge icon={Printer} status="warning" label="打印机" />
          <DeviceBadge icon={ScanLine} status="success" label="扫码器" />
        </div>
        <div className="h-4 w-px bg-black/10" />
        <AgentEngineSwitch value={agentEngine} onChange={onAgentEngineChange} />
        {agentEngine === "agent_v2" ? (
          <AgentV2GrayModeSwitch value={agentV2GrayMode} onChange={onAgentV2GrayModeChange} />
        ) : null}
        <QueryDiagnostics />
        <button
          type="button"
          onClick={onHistory}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6F6678] transition-colors hover:bg-black/5"
          title="历史记录"
        >
          <History className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onFingerprint}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6F6678] transition-colors hover:bg-black/5"
          title="指纹"
        >
          <Fingerprint className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onLock}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6F6678] transition-colors hover:bg-black/5"
          title="锁屏"
        >
          <Lock className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
