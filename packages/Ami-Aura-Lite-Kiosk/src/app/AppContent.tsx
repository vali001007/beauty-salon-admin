import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { MessagePanel } from "./components/MessagePanel";
import { TopStatusBar } from "./components/TopStatusBar";
import { SmartCommandBar } from "./components/SmartCommandBar";
import { LockScreenOverlay } from "./components/LockScreenOverlay";
import { ConversationHistory } from "./components/ConversationHistory";
import { AutomationDraftCard } from "./components/AutomationDraftCard";
import { AutomationTodayCard } from "./components/AutomationTodayCard";
import { BeauticianScheduleCard } from "./components/BeauticianScheduleCard";
import { CardVerificationFlowCard } from "./components/CardVerificationFlowCard";
import { CashierFlowCard } from "./components/CashierFlowCard";
import { CardOpeningFlowCard } from "./components/CardOpeningFlowCard";
import { RechargeFlowCard } from "./components/RechargeFlowCard";
import { RegistrationFlowCard } from "./components/RegistrationFlowCard";
import { ServiceRecordFlowCard } from "./components/ServiceRecordFlowCard";
import {
  BeauticianCustomerListCard,
  BeauticianDashboardCard,
  CustomerGrowthCard,
  CustomerProfileCard,
  InventoryAlertsCard,
  ManagerDashboardCard,
  OperationResultCard,
  ReceptionDashboardCard,
  StaffPerformanceCard,
} from "./components/RoleDashboards";
import {
  confirmCardVerification,
  confirmCardOpening,
  confirmCashierPayment,
  confirmRecharge,
  confirmRegistration,
  createAutomationDraft,
  enableAutomationDraft,
  enableAutomationStrategyFromSummary,
  getAutomationExecutionDetail,
  getAutomationTodaySummary,
  markAutomationTouchFollowedUp,
  pauseAutomationStrategyFromSummary,
  previewAutomationDraft,
  runAutomationStrategyOnceFromSummary,
  submitServiceRecord,
  getAppointments,
  getBeauticianDashboard,
  getCardVerificationCards,
  getCashierShiftStatus,
  getManagerDashboard,
  isShiftRequired,
  refreshShiftRequired,
  clearAuraStartupCache,
  getRoleDefinition,
  clearConversation,
  getConversationScopeForOperator,
  getTerminalBusinessAnswer,
  getTerminalBusinessAnswerStream,
  loadAuraBootstrap,
  readAuraStartupCache,
  setActiveTerminalOperator,
  setConversationScope,
  switchAuraStore,
  tryHandleAutomationTextOperation,
  writeAuraStartupCache,
} from "./services/auraCoreService";
import type { AuraHomePayload } from "./services/auraCoreService";
import { resolveCommandIntent, shouldDisplayUserCommand } from "./intent/intentRouter";
import type { AuraCommandSource } from "./intent/intentTypes";
import {
  getTerminalTodayKey,
  isCacheableMicroAppAction,
  prefetchTerminalMicroApps,
  runMicroAppIntent,
  toTerminalDateKey,
} from "./microApps/runMicroApp";
import type { AuraPayload, MicroAppRunResult } from "./microApps/microAppTypes";
import {
  TERMINAL_QUERY_TTL,
  clearTerminalQueryCache,
  formatTerminalQueryUpdatedAt,
  getTerminalQuerySnapshot,
  setTerminalQueryData,
  terminalQuery,
  type TerminalQueryKey,
  type TerminalQueryResult,
  type TerminalQueryState,
} from "./services/terminalQueryClient";
import { initConversationScheduler, saveCurrentConversation } from "./services/conversationPersistence";
import { useAuthStore } from "../../../../src/stores/authStore";
import type {
  CardOpeningConfirmInput,
  CardVerificationConfirmInput,
  CashierConfirmInput,
  Message,
  MessageType,
  RechargeConfirmInput,
  RegistrationConfirmInput,
  Role,
  ServiceRecordConfirmInput,
  SessionContext,
  AutomationDraftData,
  AiSuggestionData,
} from "./types";
import type { AuraBootstrap } from "../../../../src/types/aura";

type Payload = AuraPayload;

function createMessage(
  type: MessageType,
  payload?: Payload | { text: string; source?: string },
  title?: string,
): Message {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    payload,
    title,
    timestamp: new Date(),
  };
}

function LoadingCard({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <Loader2 className="h-5 w-5 animate-spin text-[#2D1B69]" />
      <div>
        <div className="text-sm font-medium text-[#1F1B2D]">{text}</div>
        <div className="text-xs text-[#6F6678]">Ami_Core 正在拉取最新门店数据</div>
      </div>
    </div>
  );
}

function MessageBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-gradient-to-r from-[#C9956C] to-[#B37F57] px-4 py-3 text-sm text-white shadow-sm">
        {text}
      </div>
    </div>
  );
}

function SystemNotice({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-[#2D1B69]/10 bg-[#2D1B69]/6 px-4 py-3 text-sm text-[#1F1B2D]">
      <Sparkles className="h-4 w-4 text-[#2D1B69]" />
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-[#6F6678]">{subtitle}</div>
      </div>
    </div>
  );
}

function QueryStatusLine({ title }: { title?: string }) {
  if (!title || !/(已更新|上次更新|正在后台刷新|刷新失败)/.test(title)) return null;
  const isRefreshing = title.includes("正在后台刷新");
  const isFailed = title.includes("刷新失败");
  const text = title.includes(" · ") ? title.split(" · ").slice(1).join(" · ") : title;
  return (
    <div
      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
        isFailed
          ? "border-rose-100 bg-rose-50 text-rose-600"
          : "border-[#2D1B69]/10 bg-white/70 text-[#6F6678]"
      }`}
    >
      <span>{text}</span>
      {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2D1B69]" /> : null}
    </div>
  );
}

function CashierFlowWithShiftConfig({
  data,
  onConfirm,
}: {
  data: import("./types").CashierFlowData;
  onConfirm: (input: CashierConfirmInput) => Promise<void>;
}) {
  const cashierContextDisablesShift = data.shiftRequired === false;
  const [shiftRequired, setShiftRequired] = useState(!cashierContextDisablesShift && isShiftRequired());

  useEffect(() => {
    if (cashierContextDisablesShift) {
      setShiftRequired(false);
      return;
    }
    let mounted = true;
    refreshShiftRequired().then((required) => {
      if (mounted) setShiftRequired(required);
    });
    return () => {
      mounted = false;
    };
  }, [cashierContextDisablesShift, data.subtitle, data.generatedAt]);

  return (
    <CashierFlowCard
      data={{ ...data, shiftRequired }}
      onConfirm={onConfirm}
      loadShiftStatus={shiftRequired ? getCashierShiftStatus : undefined}
    />
  );
}

function isTerminalServiceAdviceStructured(value: unknown): value is NonNullable<AiSuggestionData["structured"]> & {
  preChecks: string[];
  keySteps: string[];
  materialUsage: string[];
  followUpAdvice: string;
  nextBookingHint: string;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as { preChecks?: unknown }).preChecks) &&
      Array.isArray((value as { keySteps?: unknown }).keySteps),
  );
}

function isNextBestActionStructured(value: unknown): value is NonNullable<AiSuggestionData["structured"]> & {
  action: string;
  reason: string;
  projectName?: string;
  urgency: string;
  confidence: number;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { action?: unknown }).action === "string" &&
      typeof (value as { reason?: unknown }).reason === "string" &&
      typeof (value as { urgency?: unknown }).urgency === "string",
  );
}

function StructuredList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl bg-[#F7F5F2] p-3">
      <div className="text-xs font-medium text-[#6F6678]">{title}</div>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-[#1F1B2D]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9956C]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiSuggestionCard({ data }: { data: AiSuggestionData }) {
  const structured = data.structured;
  return (
    <div className="rounded-2xl border border-[#2D1B69]/10 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#2D1B69]">
        <Sparkles className="h-4 w-4" />
        {data.title}
      </div>
      {isTerminalServiceAdviceStructured(structured) ? (
        <div className="grid gap-3">
          <div className="rounded-xl border border-[#2D1B69]/10 bg-[#2D1B69]/6 p-3 text-sm leading-6 text-[#1F1B2D]">
            <div className="mb-1 text-xs font-medium text-[#6F6678]">方案判断</div>
            <p className="whitespace-pre-wrap">{data.text}</p>
          </div>
          <StructuredList title="服务前确认" items={structured.preChecks} />
          <StructuredList title="关键步骤" items={structured.keySteps} />
          <StructuredList title="耗材提示" items={structured.materialUsage} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[#F7F5F2] p-3 text-sm leading-6 text-[#1F1B2D]">
              <div className="mb-1 text-xs font-medium text-[#6F6678]">服务后跟进</div>
              {structured.followUpAdvice}
            </div>
            <div className="rounded-xl bg-[#F7F5F2] p-3 text-sm leading-6 text-[#1F1B2D]">
              <div className="mb-1 text-xs font-medium text-[#6F6678]">下次预约</div>
              {structured.nextBookingHint}
            </div>
          </div>
        </div>
      ) : isNextBestActionStructured(structured) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-[#F7F5F2] p-3">
            <div className="text-xs font-medium text-[#6F6678]">下一步动作</div>
            <div className="mt-1 text-sm font-semibold text-[#1F1B2D]">{structured.action}</div>
          </div>
          <div className="rounded-xl bg-[#F7F5F2] p-3">
            <div className="text-xs font-medium text-[#6F6678]">优先级 / 置信度</div>
            <div className="mt-1 text-sm font-semibold text-[#1F1B2D]">
              {structured.urgency} · {Math.round(Number(structured.confidence ?? 0) * 100)}%
            </div>
          </div>
          {structured.projectName ? (
            <div className="rounded-xl bg-[#F7F5F2] p-3 sm:col-span-2">
              <div className="text-xs font-medium text-[#6F6678]">推荐项目</div>
              <div className="mt-1 text-sm font-semibold text-[#1F1B2D]">{structured.projectName}</div>
            </div>
          ) : null}
          <div className="rounded-xl bg-[#F7F5F2] p-3 text-sm leading-6 text-[#1F1B2D] sm:col-span-2">
            <div className="mb-1 text-xs font-medium text-[#6F6678]">推荐理由</div>
            {structured.reason}
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-6 text-[#1F1B2D]">{data.text}</p>
      )}
      <div className="mt-3 text-xs text-[#6F6678]">建议由 Ami AI 生成，业务事实以 Ami_Core 卡片数据为准</div>
    </div>
  );
}

function getRoleHomeQueryConfig(role: Role): {
  key: TerminalQueryKey;
  ttlMs: number;
  loader: () => Promise<AuraHomePayload["data"]>;
  toPayload: (data: AuraHomePayload["data"]) => AuraHomePayload;
} {
  const today = toTerminalDateKey(new Date());
  if (role === "manager") {
    return {
      key: ["manager-dashboard", today],
      ttlMs: TERMINAL_QUERY_TTL.managerDashboard,
      loader: getManagerDashboard,
      toPayload: (data) => ({ kind: "manager", data: data as Awaited<ReturnType<typeof getManagerDashboard>> }),
    };
  }
  if (role === "beautician") {
    return {
      key: ["beautician-dashboard", today],
      ttlMs: TERMINAL_QUERY_TTL.todayReservations,
      loader: getBeauticianDashboard,
      toPayload: (data) => ({ kind: "beautician", data: data as Awaited<ReturnType<typeof getBeauticianDashboard>> }),
    };
  }
  return {
    key: ["today-reservations", today],
    ttlMs: TERMINAL_QUERY_TTL.todayReservations,
    loader: getAppointments,
    toPayload: (data) => ({ kind: "reception", data: data as Awaited<ReturnType<typeof getAppointments>> }),
  };
}

function getQueryStateTitleSuffix(state?: Pick<TerminalQueryState<unknown>, "refreshStatus" | "updatedAt">) {
  if (!state) return "";
  if (state.refreshStatus === "refreshing") {
    return ` · ${formatTerminalQueryUpdatedAt(state.updatedAt)}，正在后台刷新`;
  }
  if (state.refreshStatus === "failed") {
    return " · 刷新失败，已显示上次数据";
  }
  return state.updatedAt ? ` · ${formatTerminalQueryUpdatedAt(state.updatedAt)}` : "";
}

function createHomeMessages(role: Role, payload: AuraHomePayload, state?: Pick<TerminalQueryState<unknown>, "refreshStatus" | "updatedAt">) {
  return [
    createMessage("dashboard", payload, `${getRoleDefinition(role).title} 首页${getQueryStateTitleSuffix(state)}`),
  ];
}

function hydrateRoleHomeQueryCache(role: Role, payload: AuraHomePayload) {
  const today = getTerminalTodayKey();
  if (role === "manager" && payload.kind === "manager") {
    setTerminalQueryData(["manager-dashboard", today], payload.data, TERMINAL_QUERY_TTL.managerDashboard);
  }
  if (role === "reception" && payload.kind === "reception") {
    setTerminalQueryData(["today-reservations", today], payload.data, TERMINAL_QUERY_TTL.todayReservations);
  }
  if (role === "beautician" && payload.kind === "beautician") {
    setTerminalQueryData(["beautician-dashboard", today], payload.data, TERMINAL_QUERY_TTL.todayReservations);
  }
}

function getRolePrefetchActions(role: Role) {
  if (role === "manager") {
    return [
      "manager.dashboard",
      "manager.staff",
      "manager.customers",
      "manager.inventory",
      "reception.appointments",
      "operation.cashier",
      "operation.verify",
    ];
  }
  if (role === "beautician") {
    return ["beautician.schedule", "reception.appointments", "operation.verify"];
  }
  return ["reception.appointments", "operation.cashier", "operation.verify"];
}

function getStartupPrefetchActions(currentRole: Role, availableRoles: Role[]) {
  const orderedRoles = [
    currentRole,
    ...availableRoles.filter((role) => role !== currentRole),
  ];
  const roles = orderedRoles.length ? orderedRoles : [currentRole];
  const seen = new Set<string>();
  const actions: string[] = [];

  roles.forEach((role) => {
    getRolePrefetchActions(role).forEach((action) => {
      if (!seen.has(action)) {
        seen.add(action);
        actions.push(action);
      }
    });
  });

  return actions;
}

function createSessionFromBootstrap(bootstrap: AuraBootstrap): SessionContext {
  return {
    user: bootstrap.currentUser,
    store: bootstrap.currentStore,
  };
}

export default function AppContent() {
  const [isLocked, setIsLocked] = useState(false);
  const [session, setSession] = useState<SessionContext | null>(null);
  const [bootstrap, setBootstrap] = useState<AuraBootstrap | null>(null);
  const [currentRole, setCurrentRole] = useState<Role>("reception");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [suppressBlockingLoading, setSuppressBlockingLoading] = useState(false);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [latestAutomationDraft, setLatestAutomationDraft] = useState<AutomationDraftData | null>(null);
  const [showConversationHistory, setShowConversationHistory] = useState(false);
  const [switchingStore, setSwitchingStore] = useState(false);
  const [switchingUser, setSwitchingUser] = useState(false);
  const [loadingText, setLoadingText] = useState("正在接入 Ami_Core");
  const [error, setError] = useState<string | null>(null);

  const roleDefinition = useMemo(() => getRoleDefinition(currentRole), [currentRole]);
  const availableRoles = bootstrap?.availableRoles ?? [currentRole];
  const availableStores = bootstrap?.availableStores ?? [];
  const availableUsers = bootstrap?.terminalUsers ?? [];
  const currentOperatorId = bootstrap?.currentUser?.id ?? session?.user?.id ?? null;
  const hasInlineLoading = messages.some((message) => message.type === "loading");
  const messagesRef = useRef<Message[]>(messages);
  const currentRoleRef = useRef<Role>(currentRole);
  const currentOperatorIdRef = useRef<number | null>(currentOperatorId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentRoleRef.current = currentRole;
  }, [currentRole]);

  useEffect(() => {
    currentOperatorIdRef.current = currentOperatorId;
  }, [currentOperatorId]);

  useEffect(() => {
    setActiveTerminalOperator(currentOperatorId, currentRole);
    setConversationScope(getConversationScopeForOperator(currentOperatorId, currentRole));
  }, [currentOperatorId, currentRole]);

  const appendMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const appendRunResult = (result: MicroAppRunResult) => {
    const createdMessages = result.messages.map((message) => createMessage(message.type, message.payload, message.title));
    setMessages((prev) => [...prev, ...createdMessages]);

    if (!result.refresh || createdMessages.length === 0) return;

    const createdIds = createdMessages.map((message) => message.id);
    void result.refresh
      .then((freshResult) => {
        const nextMessages = freshResult.messages.map((message, index) => ({
          ...createMessage(message.type, message.payload, message.title),
          id: createdIds[index] ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }));
        setMessages((prev) => {
          const replaced = prev.map((message) => {
            const index = createdIds.indexOf(message.id);
            return index >= 0 ? nextMessages[index] ?? message : message;
          });
          const existingIds = new Set(createdIds);
          const appended = nextMessages.filter((message) => !existingIds.has(message.id));
          return appended.length ? [...replaced, ...appended] : replaced;
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "后台刷新失败，已显示上次数据");
      });
  };

  const appendStreamingAiAnswer = async (stream: NonNullable<MicroAppRunResult["aiStream"]>) => {
    const baseData: AiSuggestionData = {
      title: "Ami 智能问答",
      text: "",
      source: "Ami AI",
    };
    const aiMessage = createMessage("ai", { kind: "ai", data: baseData });
    let text = "";
    setMessages((prev) => [...prev, aiMessage]);

    try {
      for await (const chunk of getTerminalBusinessAnswerStream(stream)) {
        text += chunk;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === aiMessage.id
              ? {
                  ...message,
                  payload: {
                    kind: "ai",
                    data: {
                      ...baseData,
                      text,
                    },
                  },
                }
              : message,
          ),
        );
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === aiMessage.id
            ? {
                ...message,
                payload: {
                  kind: "ai",
                  data: {
                    ...baseData,
                    text: err instanceof Error ? err.message : "AI 回复暂不可用，请稍后重试。",
                  },
                },
              }
            : message,
        ),
      );
    }
  };

  const schedulePrefetch = (role: Role, roles: Role[] = availableRoles) => {
    window.setTimeout(() => {
      void prefetchTerminalMicroApps(getStartupPrefetchActions(role, roles));
    }, 600);
  };

  const persistAndClearConversation = async () => {
    await saveCurrentConversation({
      role: currentRoleRef.current,
      operatorId: currentOperatorIdRef.current,
      messages: messagesRef.current,
    }).catch((error) => {
      console.warn("Ami Aura Lite 对话保存失败", error);
    });
    clearConversation();
  };

  const handleLock = async () => {
    await persistAndClearConversation();
    setShowConversationHistory(false);
    setMessages([]);
    setIsLocked(true);
  };

  const handleUnlock = () => {
    setIsLocked(false);
    void loadRoleHome(currentRoleRef.current, { bootstrapForCache: bootstrap });
  };

  const handleSwitchAccount = async () => {
    await persistAndClearConversation();
    useAuthStore.getState().logout();
    clearAuraStartupCache();
    clearTerminalQueryCache();
    setShowConversationHistory(false);
    setSession(null);
    setBootstrap(null);
    setMessages([]);
    setIsLocked(false);
    setLoading(true);
    setSuppressBlockingLoading(false);
    setLoadingText("正在重新接入 Ami_Core");
    setError(null);

    try {
      const nextBootstrap = await loadAuraBootstrap();
      setActiveTerminalOperator(nextBootstrap.currentUser?.id ?? null, nextBootstrap.currentRole);
      setSession(createSessionFromBootstrap(nextBootstrap));
      setBootstrap(nextBootstrap);
      setCurrentRole(nextBootstrap.currentRole);
      await loadRoleHome(nextBootstrap.currentRole, { bootstrapForCache: nextBootstrap });
      schedulePrefetch(nextBootstrap.currentRole, nextBootstrap.availableRoles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新接入失败");
      setMessages([createMessage("error", { text: "Ami_Core 重新接入失败", source: "core" })]);
    } finally {
      setLoading(false);
    }
  };

  const handleAutomationSummary = async () => {
    if (currentRole !== "manager") return;

    appendMessage(createMessage("query", { text: "查看今天自动完成了什么" }, "自动化指令"));
    setLoading(true);
    setSuppressBlockingLoading(false);
    setAutomationLoading(true);
    setLoadingText("正在刷新自动化摘要");
    setError(null);

    try {
      appendMessage(createMessage("loading", undefined, "正在刷新自动化摘要"));
      const data = await getAutomationTodaySummary();
      setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
      appendMessage(createMessage("automation", { kind: "automationSummary", data }));
    } catch (err) {
      setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
      appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "自动化摘要加载失败", source: "automation" }));
    } finally {
      setAutomationLoading(false);
      setLoading(false);
    }
  };

  const handleAutomationCommand = async (command: string) => {
    if (currentRole !== "manager") return;
    if (!command.trim()) {
      await handleAutomationSummary();
      return;
    }

    const displayText = command.trim();
    appendMessage(createMessage("query", { text: displayText }, "自动化指令"));
    setLoading(true);
    setSuppressBlockingLoading(false);
    setAutomationLoading(true);
    setLoadingText("正在生成自动化草稿");
    setError(null);

    try {
      appendMessage(createMessage("loading", undefined, "正在生成自动化草稿"));
      const draft = await createAutomationDraft({
        role: currentRole,
        command,
        pendingDraft: latestAutomationDraft?.status === "needs_info" ? latestAutomationDraft : null,
      });
      setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
      setLatestAutomationDraft(draft);
      appendMessage(createMessage("automation", { kind: "automation", data: draft }));
    } catch (err) {
      setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
      appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "自动化草稿生成失败", source: "automation" }));
    } finally {
      setAutomationLoading(false);
      setLoading(false);
    }
  };

  const handleEnableAutomation = async (draft: AutomationDraftData) => {
    const persisted = await enableAutomationDraft(draft);
    setLatestAutomationDraft(persisted);
    return persisted;
  };

  const handleAutomationDraftChange = (draft: AutomationDraftData) => {
    setLatestAutomationDraft(draft);
  };

  const handleEnableAutomationStrategy = async (strategyId: number) => {
    const data = await enableAutomationStrategyFromSummary(strategyId);
    appendMessage(createMessage("automation", { kind: "automationSummary", data }));
  };

  const handlePauseAutomationStrategy = async (strategyId: number) => {
    const data = await pauseAutomationStrategyFromSummary(strategyId);
    appendMessage(createMessage("automation", { kind: "automationSummary", data }));
  };

  const handleRunAutomationStrategyOnce = async (strategyId: number) => {
    return runAutomationStrategyOnceFromSummary(strategyId);
  };

  const loadRoleHome = async (
    role: Role,
    options: {
      bootstrapForCache?: AuraBootstrap | null;
      silent?: boolean;
      preserveMessagesOnError?: boolean;
      messageMode?: "replace" | "append";
    } = {},
  ) => {
    const queryConfig = getRoleHomeQueryConfig(role);
    const cachedHome = getTerminalQuerySnapshot<AuraHomePayload["data"]>(queryConfig.key);

    if (!options.silent && !cachedHome?.data) {
      setLoading(true);
      setSuppressBlockingLoading(false);
      setLoadingText(`正在加载${getRoleDefinition(role).title}`);
    }
    if (!options.silent && cachedHome?.data) {
      setLoading(false);
      setSuppressBlockingLoading(true);
    }
    setError(null);
    try {
      const state = await terminalQuery({
        key: queryConfig.key,
        ttlMs: queryConfig.ttlMs,
        loader: queryConfig.loader,
      });
      if (!state.data) {
        throw new Error(state.error ?? "门店数据加载失败");
      }

      const payload = queryConfig.toPayload(state.data);
      hydrateRoleHomeQueryCache(role, payload);
      const createdMessages = createHomeMessages(role, payload, state);
      const homeMessageId = createdMessages[0]?.id;
      setMessages((prev) => (options.messageMode === "append" ? [...prev, ...createdMessages] : createdMessages));
      const bootstrapForCache = options.bootstrapForCache ?? bootstrap;
      if (bootstrapForCache) {
        writeAuraStartupCache({ bootstrap: bootstrapForCache, currentRole: role, homePayload: payload });
      }

      if (state.refresh && homeMessageId) {
        void state.refresh
          .then((freshState: TerminalQueryResult<AuraHomePayload["data"]>) => {
            const nextData = freshState.data ?? state.data;
            if (!nextData) return;
            const nextPayload = queryConfig.toPayload(nextData);
            hydrateRoleHomeQueryCache(role, nextPayload);
            const nextMessage = createHomeMessages(role, nextPayload, freshState)[0];
            setMessages((prev) => prev.map((message) => (message.id === homeMessageId ? { ...nextMessage, id: homeMessageId } : message)));
            const nextBootstrapForCache = options.bootstrapForCache ?? bootstrap;
            if (freshState.refreshStatus !== "failed" && nextBootstrapForCache) {
              writeAuraStartupCache({ bootstrap: nextBootstrapForCache, currentRole: role, homePayload: nextPayload });
            }
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "后台刷新失败，已显示上次数据");
            setMessages((prev) =>
              prev.map((message) =>
                message.id === homeMessageId
                  ? {
                      ...message,
                      title: `${getRoleDefinition(role).title} 首页${getQueryStateTitleSuffix({ refreshStatus: "failed", updatedAt: state.updatedAt })}`,
                    }
                  : message,
              ),
            );
          });
      }
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      if (!options.preserveMessagesOnError) {
        const errorMessage = createMessage("error", { text: "门店数据加载失败", source: "core" });
        setMessages((prev) => (options.messageMode === "append" ? [...prev, errorMessage] : [errorMessage]));
      }
      return null;
    } finally {
      if (!options.silent) {
        setLoading(false);
        setSuppressBlockingLoading(false);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const cachedStartup = readAuraStartupCache();

    if (cachedStartup) {
      setSession(createSessionFromBootstrap(cachedStartup.bootstrap));
      setBootstrap(cachedStartup.bootstrap);
      setCurrentRole(cachedStartup.currentRole);
      hydrateRoleHomeQueryCache(cachedStartup.currentRole, cachedStartup.homePayload);
      setMessages(createHomeMessages(cachedStartup.currentRole, cachedStartup.homePayload));
      setLoading(false);
    }

    (async () => {
      try {
        if (!cachedStartup) {
          setLoading(true);
          setSuppressBlockingLoading(false);
          setLoadingText("正在接入 Ami_Core");
        }
      const nextBootstrap = await loadAuraBootstrap();
      const nextSession = createSessionFromBootstrap(nextBootstrap);
      if (!mounted) return;
      setActiveTerminalOperator(nextBootstrap.currentUser?.id ?? null, nextBootstrap.currentRole);
      setSession(nextSession);
        setBootstrap(nextBootstrap);
        setCurrentRole(nextBootstrap.currentRole);
        await loadRoleHome(nextBootstrap.currentRole, {
          bootstrapForCache: nextBootstrap,
          silent: Boolean(cachedStartup),
          preserveMessagesOnError: Boolean(cachedStartup),
        });
        schedulePrefetch(nextBootstrap.currentRole, nextBootstrap.availableRoles);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "初始化失败");
        if (!cachedStartup) {
          setMessages([
            createMessage("error", { text: "Ami_Core 会话初始化失败", source: "core" }),
          ]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return initConversationScheduler({
      getRole: () => currentRoleRef.current,
      getOperatorId: () => currentOperatorIdRef.current,
      getMessages: () => messagesRef.current,
      clearMessages: () => setMessages([]),
    });
  }, []);

  const handleUserChange = async (operatorId: number) => {
    if (loading || switchingUser || currentOperatorIdRef.current === operatorId) return;

    setSwitchingUser(true);
    setLoading(true);
    setSuppressBlockingLoading(false);
    setLoadingText("正在切换账号");
    setError(null);

    try {
      await persistAndClearConversation();
      clearTerminalQueryCache();
      const nextBootstrap = await loadAuraBootstrap({ operatorId });
      const nextRole = nextBootstrap.currentRole;
      setActiveTerminalOperator(nextBootstrap.currentUser?.id ?? operatorId, nextRole);
      setConversationScope(getConversationScopeForOperator(nextBootstrap.currentUser?.id ?? operatorId, nextRole));
      setSession(createSessionFromBootstrap(nextBootstrap));
      setBootstrap(nextBootstrap);
      setCurrentRole(nextRole);
      setLatestAutomationDraft(null);
      setShowConversationHistory(false);
      setMessages([]);
      await loadRoleHome(nextRole, { bootstrapForCache: nextBootstrap });
      schedulePrefetch(nextRole, nextBootstrap.availableRoles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "账号切换失败");
      appendMessage(createMessage("error", { text: "账号切换失败，请稍后重试", source: "core" }));
    } finally {
      setSwitchingUser(false);
      setLoading(false);
    }
  };

  const handleStoreChange = async (storeId: number) => {
    const activeStoreId = bootstrap?.currentStore?.id ?? session?.store?.id ?? null;
    if (loading || switchingStore || activeStoreId === storeId) return;

    setSwitchingStore(true);
    setLoading(true);
    setSuppressBlockingLoading(false);
    setLoadingText("正在切换门店");
    setError(null);

    try {
      await persistAndClearConversation();
      clearTerminalQueryCache();
      const nextBootstrap = await switchAuraStore(
        storeId,
        currentOperatorIdRef.current ? { operatorId: currentOperatorIdRef.current } : undefined,
      );
      const nextRole = nextBootstrap.currentRole;
      const normalizedBootstrap = nextBootstrap;
      setActiveTerminalOperator(normalizedBootstrap.currentUser?.id ?? null, nextRole);
      setConversationScope(getConversationScopeForOperator(normalizedBootstrap.currentUser?.id ?? null, nextRole));

      setSession({
        user: normalizedBootstrap.currentUser,
        store: normalizedBootstrap.currentStore,
      });
      setBootstrap(normalizedBootstrap);
      setCurrentRole(nextRole);
      await loadRoleHome(nextRole, { bootstrapForCache: normalizedBootstrap });
      schedulePrefetch(nextRole, normalizedBootstrap.availableRoles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "门店切换失败");
      appendMessage(createMessage("error", { text: "门店切换失败，请稍后重试", source: "core" }));
    } finally {
      setSwitchingStore(false);
      setLoading(false);
    }
  };

  const handleCommand = async (command: string, source: AuraCommandSource = "text") => {
    if (source === "text" && currentRole === "manager" && latestAutomationDraft?.status === "needs_info") {
      await handleAutomationCommand(command);
      return;
    }

    if (source === "text" && currentRole === "manager") {
      try {
        const automationSummary = await tryHandleAutomationTextOperation(command);
        if (automationSummary) {
          appendMessage(createMessage("query", { text: command }, "自动化指令"));
          appendMessage(createMessage("automation", { kind: "automationSummary", data: automationSummary }));
          return;
        }
      } catch (err) {
        appendMessage(createMessage("query", { text: command }, "自动化指令"));
        appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "自动化操作失败，请稍后重试", source: "automation" }));
        return;
      }
    }

    const intent = await resolveCommandIntent({ command, role: currentRole, definition: roleDefinition, source });
    if (shouldDisplayUserCommand(intent)) {
      appendMessage(createMessage("query", { text: command }, "用户指令"));
    }
    const shouldDelayLoading = source === "quick_action" || isCacheableMicroAppAction(intent.action);
    setSuppressBlockingLoading(shouldDelayLoading);
    setLoading(true);
    setLoadingText(intent.loadingLabel);
    setError(null);

    const appendAiHint = async (businessSummary: string, aiCommand = command) => {
      try {
        const data = await getTerminalBusinessAnswer({ role: currentRole, command: aiCommand, businessContext: businessSummary });
        appendMessage(createMessage("ai", { kind: "ai", data }));
      } catch {
        appendMessage(
          createMessage("ai", {
            kind: "ai",
            data: {
              title: "Ami 建议",
              text: "Ami 建议暂不可用，业务数据已正常返回。",
              source: "Ami AI",
            },
          }),
        );
      }
    };

    let loadingMessageShown = false;
    let loadingTimer: number | null = null;

    try {
      if (shouldDelayLoading) {
        loadingTimer = window.setTimeout(() => {
          loadingMessageShown = true;
          appendMessage(createMessage("loading", undefined, intent.loadingLabel));
        }, 300);
      } else {
        loadingMessageShown = true;
        appendMessage(createMessage("loading", undefined, intent.loadingLabel));
      }

      const result = await runMicroAppIntent(intent, command);
      if (loadingTimer !== null) {
        window.clearTimeout(loadingTimer);
      }
      setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
      if (!loadingMessageShown && shouldDelayLoading) {
        setLoadingText("");
      }
      appendRunResult(result);
      if (result.aiStream) {
        await appendStreamingAiAnswer(result.aiStream);
      }
      if (result.aiSummary && source !== "quick_action") {
        await appendAiHint(result.aiSummary, result.aiCommand);
      }
    } catch (err) {
      if (loadingTimer !== null) {
        window.clearTimeout(loadingTimer);
      }
      setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
      appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "请求失败", source: "core" }));
    } finally {
      setLoading(false);
      setSuppressBlockingLoading(false);
    }
  };

  const storeName = session?.store?.name ?? bootstrap?.currentStore?.name ?? "Ami Aura Lite";
  const employeeName = session?.user?.name ?? bootstrap?.currentUser?.name ?? "未登录";

  const handleCardVerificationConfirm = async (input: CardVerificationConfirmInput) => {
    const data = await confirmCardVerification(input);
    appendMessage(createMessage("operation", { kind: "operation", data }));
  };

  const handleCashierConfirm = async (input: CashierConfirmInput) => {
    const data = await confirmCashierPayment(input);
    appendMessage(createMessage("operation", { kind: "operation", data }));
  };

  const handleCardOpeningConfirm = async (input: CardOpeningConfirmInput) => {
    const data = await confirmCardOpening(input);
    appendMessage(createMessage("operation", { kind: "operation", data }));
  };

  const handleRegistrationConfirm = async (input: RegistrationConfirmInput) => {
    const data = await confirmRegistration(input);
    appendMessage(createMessage("operation", { kind: "operation", data }));
  };

  const handleServiceRecordConfirm = async (input: ServiceRecordConfirmInput) => {
    const data = await submitServiceRecord(input);
    appendMessage(createMessage("operation", { kind: "operation", data }));
  };

  const handleRechargeConfirm = async (input: RechargeConfirmInput) => {
    const data = await confirmRecharge(input);
    appendMessage(createMessage("operation", { kind: "operation", data }));
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#F7F5F2] font-sans">
      {isLocked ? (
        <LockScreenOverlay storeName={storeName} onUnlock={handleUnlock} onSwitchAccount={handleSwitchAccount} />
      ) : null}

      <TopStatusBar
        storeName={storeName}
        currentStoreId={session?.store?.id ?? bootstrap?.currentStore?.id ?? null}
        availableStores={availableStores}
        employeeName={employeeName}
        currentRole={currentRole}
        currentUserId={currentOperatorId}
        availableUsers={availableUsers}
        switchingStore={switchingStore}
        switchingUser={switchingUser}
        onStoreChange={handleStoreChange}
        onUserChange={handleUserChange}
        onHistory={() => setShowConversationHistory(true)}
        onLock={handleLock}
        onFingerprint={() => loadRoleHome(currentRole, { bootstrapForCache: bootstrap })}
      />

      {showConversationHistory ? (
        <ConversationHistory
          currentRole={currentRole}
          operatorId={currentOperatorId}
          currentUserName={employeeName}
          onClose={() => setShowConversationHistory(false)}
        />
      ) : null}

      <MessagePanel messages={messages}>
        <div className="flex w-full flex-col gap-4 pb-36">
          {loading && !hasInlineLoading && !suppressBlockingLoading ? <LoadingCard text={loadingText} /> : null}
          {error ? <SystemNotice title="Ami_Core 请求异常" subtitle={error} /> : null}

          {messages.map((message) => {
            const key = message.id;

            if (message.type === "query") {
              return <MessageBubble key={key} text={(message.payload as { text: string })?.text ?? ""} />;
            }

            if (message.type === "error") {
              const text = (message.payload as { text?: string })?.text ?? "请求失败";
              return (
                <div key={key} className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-600">
                  {text}
                </div>
              );
            }

            if (message.type === "loading") {
              return <LoadingCard key={key} text={message.title ?? "正在加载"} />;
            }

            if (message.type === "ai") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "ai") return <AiSuggestionCard key={key} data={payload.data} />;
            }

            if (message.type === "automation") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "automation") {
                const canAnswerSuggestion =
                  payload.data.status === "needs_info" && latestAutomationDraft?.id === payload.data.id ? handleAutomationCommand : undefined;
                return (
                  <AutomationDraftCard
                    key={key}
                    data={payload.data}
                    onEnable={handleEnableAutomation}
                    onSuggestion={canAnswerSuggestion}
                    onPreview={previewAutomationDraft}
                    onDraftChange={handleAutomationDraftChange}
                  />
                );
              }
              if (payload?.kind === "automationSummary") {
                return (
                  <AutomationTodayCard
                    key={key}
                    data={payload.data}
                    onRefresh={handleAutomationSummary}
                    onEnableStrategy={handleEnableAutomationStrategy}
                    onPauseStrategy={handlePauseAutomationStrategy}
                    onRunStrategyOnce={handleRunAutomationStrategyOnce}
                    onCreateTemplate={handleAutomationCommand}
                    onLoadExecutionDetail={getAutomationExecutionDetail}
                    onMarkTouchFollowedUp={markAutomationTouchFollowedUp}
                  />
                );
              }
            }

            if (message.type === "dashboard") {
              const payload = message.payload as Payload | undefined;
              if (!payload) return null;
              if (payload.kind === "manager") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <ManagerDashboardCard data={payload.data} />
                  </div>
                );
              }
              if (payload.kind === "reception") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <ReceptionDashboardCard
                      data={payload.data}
                      onQuickAction={(action) => handleCommand(action, "quick_action")}
                      onOperationResult={(data) => appendMessage(createMessage("operation", { kind: "operation", data }))}
                    />
                  </div>
                );
              }
              if (payload.kind === "beautician") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <BeauticianDashboardCard data={payload.data} focus={payload.focus} />
                  </div>
                );
              }
              if (payload.kind === "beauticianCustomers") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <BeauticianCustomerListCard data={payload.data} onViewDetail={(action) => handleCommand(action, "quick_action")} />
                  </div>
                );
              }
              if (payload.kind === "staff") {
                return (
                  <div key={key} className="grid min-w-0 gap-2">
                    <QueryStatusLine title={message.title} />
                    <StaffPerformanceCard items={payload.data} />
                  </div>
                );
              }
              if (payload.kind === "growth") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <CustomerGrowthCard customers={payload.data} />
                  </div>
                );
              }
              if (payload.kind === "inventory") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <InventoryAlertsCard data={payload.data} />
                  </div>
                );
              }
              if (payload.kind === "customer") return <CustomerProfileCard key={key} data={payload.data} />;
            }

            if (message.type === "beauticianSchedule") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "beauticianSchedule") {
                return <BeauticianScheduleCard key={key} data={payload.data} />;
              }
            }

            if (message.type === "cardVerification") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "cardVerification") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <CardVerificationFlowCard
                      data={payload.data}
                      onLoadCustomerCards={getCardVerificationCards}
                      onConfirm={handleCardVerificationConfirm}
                    />
                  </div>
                );
              }
            }

            if (message.type === "cashier") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "cashier") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <CashierFlowWithShiftConfig data={payload.data} onConfirm={handleCashierConfirm} />
                  </div>
                );
              }
            }

            if (message.type === "cardOpening") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "cardOpening") {
                return <CardOpeningFlowCard key={key} data={payload.data} onConfirm={handleCardOpeningConfirm} />;
              }
            }

            if (message.type === "registration") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "registration") {
                return <RegistrationFlowCard key={key} data={payload.data} onConfirm={handleRegistrationConfirm} />;
              }
            }

            if (message.type === "recharge") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "recharge") {
                return <RechargeFlowCard key={key} data={payload.data} onConfirm={handleRechargeConfirm} />;
              }
            }

            if (message.type === "serviceRecord") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "serviceRecord") {
                return <ServiceRecordFlowCard key={key} data={payload.data} onConfirm={handleServiceRecordConfirm} />;
              }
            }

            if (message.type === "operation") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "operation") {
                return <OperationResultCard key={key} data={payload.data} timestamp={message.timestamp} />;
              }
            }

            return null;
          })}
        </div>
      </MessagePanel>

      <SmartCommandBar
        currentRole={currentRole}
        definition={roleDefinition}
        onCommand={handleCommand}
        onAutomationCommand={handleAutomationCommand}
        automationStatus={automationLoading ? "loading" : latestAutomationDraft?.status ?? "idle"}
        disabled={loading}
      />
    </div>
  );
}
