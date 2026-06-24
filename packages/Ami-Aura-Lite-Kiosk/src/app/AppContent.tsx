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
  AgentRunResultCard,
  BusinessQueryResultCard,
  CustomerGrowthCard,
  FollowUpTasksCard,
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
  approveBusinessAgentAction,
  createAutomationDraft,
  enableAutomationDraft,
  enableAutomationStrategyFromSummary,
  getAutomationExecutionDetail,
  getAutomationTodaySummary,
  markAutomationTouchFollowedUp,
  pauseAutomationStrategyFromSummary,
  previewAutomationDraft,
  rejectBusinessAgentAction,
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
  writeAuraStartupCache,
} from "./services/auraCoreService";
import type { AuraHomePayload } from "./services/auraCoreService";
import type { AgentRunResult } from "@/types/agent";
import type { BusinessQueryContext, BusinessQueryResponse } from "@/types/businessQuery";
import {
  agentActionToCommand,
  buildUnsupportedInternalActionResult,
  businessQueryActionToCommand,
  isInternalActionCode,
  resolveTerminalActionResult,
} from "./intent/actionCommands";
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
  OperationResultData,
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

const FIXED_FLOW_MESSAGE_TYPES = new Set<MessageType>([
  "cardVerification",
  "cashier",
  "cardOpening",
  "registration",
  "recharge",
  "serviceRecord",
]);

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

function getLatestBusinessQueryContext(messages: Message[]): BusinessQueryContext | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const payload = messages[index]?.payload as AuraPayload | undefined;
    if (payload?.kind !== "businessQuery") continue;
    const data = payload.data as BusinessQueryResponse;
    if (!data.card?.items?.length) continue;
    return {
      previousResponse: {
        domain: data.domain,
        capability: data.capability,
        queryPlan: data.queryPlan,
        card: data.card,
      },
    };
  }
  return undefined;
}

function getLatestAgentContext(messages: Message[]): Record<string, unknown> | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const payload = messages[index]?.payload as AuraPayload | undefined;
    if (payload?.kind === "agentRun") {
      const data = payload.data as AgentRunResult;
      return {
        previousRun: {
          runId: data.runId,
          runNo: data.runNo,
          status: data.status,
          plan: data.plan,
          toolResults: data.toolResults,
          actions: data.actions,
          evidence: data.evidence,
        },
      };
    }
    if (payload?.kind === "businessQuery") {
      return { previousBusinessQuery: getLatestBusinessQueryContext(messages) };
    }
  }
  return undefined;
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

function AuraLoginPage({
  error,
  loading,
  onLogin,
}: {
  error: string | null;
  loading: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState(import.meta.env.VITE_DEMO_USERNAME || "admin");
  const [password, setPassword] = useState(import.meta.env.VITE_DEMO_PASSWORD || "");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onLogin(username.trim(), password);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#F7F5F2] px-6 font-sans">
      <form
        onSubmit={handleSubmit}
        className="grid w-full max-w-[420px] gap-5 rounded-[28px] border border-black/10 bg-white p-8 shadow-[0_18px_50px_rgba(31,27,45,0.12)]"
      >
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7B5CFF] to-[#C9956C] text-lg font-semibold text-white">
            A
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-[#1F1B2D]">Ami Aura Lite</h1>
          <p className="mt-2 text-sm text-[#6F687A]">登录 Ami_Core 后进入门店智能终端。</p>
        </div>

        <label className="grid gap-2 text-sm font-medium text-[#1F1B2D]">
          账号
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="h-12 rounded-2xl border border-black/10 bg-[#F7F5F2] px-4 text-base font-normal outline-none transition focus:border-[#C9956C] focus:bg-white"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-[#1F1B2D]">
          密码
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="h-12 rounded-2xl border border-black/10 bg-[#F7F5F2] px-4 text-base font-normal outline-none transition focus:border-[#C9956C] focus:bg-white"
          />
        </label>

        {error ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          className="flex h-12 items-center justify-center rounded-2xl bg-[#1F1B2D] text-sm font-semibold text-white transition hover:bg-[#302945] disabled:cursor-not-allowed disabled:bg-[#C8C2D1]"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          登录终端
        </button>
      </form>
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

function shouldReplaceWithRoleHome(prev: Message[], messageMode?: "replace" | "append") {
  if (messageMode === "append") return true;
  if (prev.length === 0) return true;
  return prev.length === 1 && prev[0]?.type === "dashboard";
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
  const [showLogin, setShowLogin] = useState(false);
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
  const conversationEpochRef = useRef(0);

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

  const getConversationEpoch = () => conversationEpochRef.current;

  const isConversationEpochActive = (epoch: number) => conversationEpochRef.current === epoch;

  const advanceConversationEpoch = () => {
    conversationEpochRef.current += 1;
    return conversationEpochRef.current;
  };

  const appendMessage = (message: Message, epoch = getConversationEpoch()) => {
    if (!isConversationEpochActive(epoch)) return;
    setMessages((prev) => (isConversationEpochActive(epoch) ? [...prev, message] : prev));
  };

  const appendRunResult = (
    result: MicroAppRunResult,
    epoch = getConversationEpoch(),
    options?: { prependMessages?: Message[]; replaceFixedFlowCards?: boolean },
  ) => {
    if (!isConversationEpochActive(epoch)) return;
    const createdMessages = result.messages.map((message) => createMessage(message.type, message.payload, message.title));
    setMessages((prev) => {
      if (!isConversationEpochActive(epoch)) return prev;
      const shouldReplaceFixedFlowCards =
        options?.replaceFixedFlowCards && createdMessages.some((message) => FIXED_FLOW_MESSAGE_TYPES.has(message.type));
      const baseMessages = shouldReplaceFixedFlowCards
        ? prev.filter((message) => !FIXED_FLOW_MESSAGE_TYPES.has(message.type))
        : prev;
      const missingPrependedMessages = (options?.prependMessages ?? []).filter(
        (message) => !baseMessages.some((item) => item.id === message.id),
      );
      return [...baseMessages, ...missingPrependedMessages, ...createdMessages];
    });

    if (!result.refresh || createdMessages.length === 0) return;

    const createdIds = createdMessages.map((message) => message.id);
    void result.refresh
      .then((freshResult) => {
        if (!isConversationEpochActive(epoch)) return;
        const nextMessages = freshResult.messages.map((message, index) => ({
          ...createMessage(message.type, message.payload, message.title),
          id: createdIds[index] ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }));
        setMessages((prev) => {
          if (!isConversationEpochActive(epoch)) return prev;
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
        if (!isConversationEpochActive(epoch)) return;
        setError(err instanceof Error ? err.message : "后台刷新失败，已显示上次数据");
      });
  };

  const appendStreamingAiAnswer = async (stream: NonNullable<MicroAppRunResult["aiStream"]>, epoch = getConversationEpoch()) => {
    if (!isConversationEpochActive(epoch)) return;
    const baseData: AiSuggestionData = {
      title: "Ami 智能问答",
      text: "",
      source: "Ami AI",
    };
    const aiMessage = createMessage("ai", { kind: "ai", data: baseData });
    let text = "";
    setMessages((prev) => (isConversationEpochActive(epoch) ? [...prev, aiMessage] : prev));

    try {
      for await (const chunk of getTerminalBusinessAnswerStream(stream)) {
        if (!isConversationEpochActive(epoch)) return;
        text += chunk;
        setMessages((prev) =>
          isConversationEpochActive(epoch)
            ? prev.map((message) =>
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
              )
            : prev,
        );
      }
    } catch (err) {
      if (!isConversationEpochActive(epoch)) return;
      setMessages((prev) =>
        isConversationEpochActive(epoch)
          ? prev.map((message) =>
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
            )
          : prev,
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
    advanceConversationEpoch();
    setShowConversationHistory(false);
    setMessages([]);
    setIsLocked(true);
  };

  const handleUnlock = () => {
    setIsLocked(false);
    void loadRoleHome(currentRoleRef.current, { bootstrapForCache: bootstrap, epoch: getConversationEpoch() });
  };

  const handleSwitchAccount = async () => {
    await persistAndClearConversation();
    advanceConversationEpoch();
    useAuthStore.getState().logout();
    clearAuraStartupCache();
    clearTerminalQueryCache();
    setShowConversationHistory(false);
    setSession(null);
    setBootstrap(null);
    setMessages([]);
    setIsLocked(false);
    setShowLogin(true);
    setLoading(false);
    setSuppressBlockingLoading(false);
    setError(null);
  };

  const handleAutomationSummary = async () => {
    if (currentRole !== "manager") return;
    const epoch = getConversationEpoch();

    appendMessage(createMessage("query", { text: "查看今天自动完成了什么" }, "自动化指令"), epoch);
    setLoading(true);
    setSuppressBlockingLoading(false);
    setAutomationLoading(true);
    setLoadingText("正在刷新自动化摘要");
    setError(null);

    try {
      appendMessage(createMessage("loading", undefined, "正在刷新自动化摘要"), epoch);
      const data = await getAutomationTodaySummary();
      if (!isConversationEpochActive(epoch)) return;
      setMessages((prev) => (isConversationEpochActive(epoch) ? prev.filter((msg) => msg.type !== "loading") : prev));
      appendMessage(createMessage("automation", { kind: "automationSummary", data }), epoch);
    } catch (err) {
      if (!isConversationEpochActive(epoch)) return;
      setMessages((prev) => (isConversationEpochActive(epoch) ? prev.filter((msg) => msg.type !== "loading") : prev));
      appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "自动化摘要加载失败", source: "automation" }), epoch);
    } finally {
      if (isConversationEpochActive(epoch)) {
        setAutomationLoading(false);
        setLoading(false);
      }
    }
  };

  const handleAutomationCommand = async (command: string) => {
    if (currentRole !== "manager") return;
    if (!command.trim()) {
      await handleAutomationSummary();
      return;
    }

    const epoch = getConversationEpoch();
    const displayText = command.trim();
    appendMessage(createMessage("query", { text: displayText }, "自动化指令"), epoch);
    setLoading(true);
    setSuppressBlockingLoading(false);
    setAutomationLoading(true);
    setLoadingText("正在生成自动化草稿");
    setError(null);

    try {
      appendMessage(createMessage("loading", undefined, "正在生成自动化草稿"), epoch);
      const draft = await createAutomationDraft({
        role: currentRole,
        command,
        pendingDraft: latestAutomationDraft?.status === "needs_info" ? latestAutomationDraft : null,
      });
      if (!isConversationEpochActive(epoch)) return;
      setMessages((prev) => (isConversationEpochActive(epoch) ? prev.filter((msg) => msg.type !== "loading") : prev));
      setLatestAutomationDraft(draft);
      appendMessage(createMessage("automation", { kind: "automation", data: draft }), epoch);
    } catch (err) {
      if (!isConversationEpochActive(epoch)) return;
      setMessages((prev) => (isConversationEpochActive(epoch) ? prev.filter((msg) => msg.type !== "loading") : prev));
      appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "自动化草稿生成失败", source: "automation" }), epoch);
    } finally {
      if (isConversationEpochActive(epoch)) {
        setAutomationLoading(false);
        setLoading(false);
      }
    }
  };

  const handleEnableAutomation = async (draft: AutomationDraftData) => {
    const epoch = getConversationEpoch();
    const persisted = await enableAutomationDraft(draft);
    if (!isConversationEpochActive(epoch)) return persisted;
    setLatestAutomationDraft(persisted);
    return persisted;
  };

  const handleAutomationDraftChange = (draft: AutomationDraftData) => {
    setLatestAutomationDraft(draft);
  };

  const handleEnableAutomationStrategy = async (strategyId: number) => {
    const epoch = getConversationEpoch();
    const data = await enableAutomationStrategyFromSummary(strategyId);
    appendMessage(createMessage("automation", { kind: "automationSummary", data }), epoch);
  };

  const handlePauseAutomationStrategy = async (strategyId: number) => {
    const epoch = getConversationEpoch();
    const data = await pauseAutomationStrategyFromSummary(strategyId);
    appendMessage(createMessage("automation", { kind: "automationSummary", data }), epoch);
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
      epoch?: number;
    } = {},
  ) => {
    const epoch = options.epoch ?? getConversationEpoch();
    const queryConfig = getRoleHomeQueryConfig(role);
    const cachedHome = getTerminalQuerySnapshot<AuraHomePayload["data"]>(queryConfig.key);

    if (!isConversationEpochActive(epoch)) return null;
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
      if (!isConversationEpochActive(epoch)) return null;
      if (!state.data) {
        throw new Error(state.error ?? "门店数据加载失败");
      }

      const payload = queryConfig.toPayload(state.data);
      hydrateRoleHomeQueryCache(role, payload);
      const createdMessages = createHomeMessages(role, payload, state);
      const homeMessageId = createdMessages[0]?.id;
      setMessages((prev) => {
        if (!isConversationEpochActive(epoch)) return prev;
        if (options.messageMode === "append") return [...prev, ...createdMessages];
        return shouldReplaceWithRoleHome(prev, options.messageMode) ? createdMessages : prev;
      });
      const bootstrapForCache = options.bootstrapForCache ?? bootstrap;
      if (bootstrapForCache) {
        writeAuraStartupCache({ bootstrap: bootstrapForCache, currentRole: role, homePayload: payload });
      }

      if (state.refresh && homeMessageId) {
        void state.refresh
          .then((freshState: TerminalQueryResult<AuraHomePayload["data"]>) => {
            if (!isConversationEpochActive(epoch)) return;
            const nextData = freshState.data ?? state.data;
            if (!nextData) return;
            const nextPayload = queryConfig.toPayload(nextData);
            hydrateRoleHomeQueryCache(role, nextPayload);
            const nextMessage = createHomeMessages(role, nextPayload, freshState)[0];
            setMessages((prev) =>
              isConversationEpochActive(epoch)
                ? prev.map((message) => (message.id === homeMessageId ? { ...nextMessage, id: homeMessageId } : message))
                : prev,
            );
            const nextBootstrapForCache = options.bootstrapForCache ?? bootstrap;
            if (freshState.refreshStatus !== "failed" && nextBootstrapForCache) {
              writeAuraStartupCache({ bootstrap: nextBootstrapForCache, currentRole: role, homePayload: nextPayload });
            }
          })
          .catch((err) => {
            if (!isConversationEpochActive(epoch)) return;
            setError(err instanceof Error ? err.message : "后台刷新失败，已显示上次数据");
            setMessages((prev) =>
              isConversationEpochActive(epoch)
                ? prev.map((message) =>
                    message.id === homeMessageId
                      ? {
                          ...message,
                          title: `${getRoleDefinition(role).title} 首页${getQueryStateTitleSuffix({ refreshStatus: "failed", updatedAt: state.updatedAt })}`,
                        }
                      : message,
                  )
                : prev,
            );
          });
      }
      return payload;
    } catch (err) {
      if (!isConversationEpochActive(epoch)) return null;
      setError(err instanceof Error ? err.message : "加载失败");
      if (!options.preserveMessagesOnError) {
        const errorMessage = createMessage("error", { text: "门店数据加载失败", source: "core" });
        setMessages((prev) => {
          if (!isConversationEpochActive(epoch)) return prev;
          if (options.messageMode === "append") return [...prev, errorMessage];
          return shouldReplaceWithRoleHome(prev, options.messageMode) ? [errorMessage] : prev;
        });
      }
      return null;
    } finally {
      if (!options.silent && isConversationEpochActive(epoch)) {
        setLoading(false);
        setSuppressBlockingLoading(false);
      }
    }
  };

  const handleLogin = async (username: string, password: string) => {
    const epoch = advanceConversationEpoch();
    setLoading(true);
    setSuppressBlockingLoading(false);
    setLoadingText("正在登录 Ami_Core");
    setError(null);

    try {
      await useAuthStore.getState().login({ username, password });
      clearAuraStartupCache();
      clearTerminalQueryCache();
      const nextBootstrap = await loadAuraBootstrap();
      if (!isConversationEpochActive(epoch)) return;
      setActiveTerminalOperator(nextBootstrap.currentUser?.id ?? null, nextBootstrap.currentRole);
      setSession(createSessionFromBootstrap(nextBootstrap));
      setBootstrap(nextBootstrap);
      setCurrentRole(nextBootstrap.currentRole);
      setMessages([]);
      setShowLogin(false);
      await loadRoleHome(nextBootstrap.currentRole, { bootstrapForCache: nextBootstrap, epoch });
      if (isConversationEpochActive(epoch)) {
        schedulePrefetch(nextBootstrap.currentRole, nextBootstrap.availableRoles);
      }
    } catch (err) {
      if (!isConversationEpochActive(epoch)) return;
      setError(err instanceof Error ? err.message : "登录失败，请检查账号和密码");
    } finally {
      if (isConversationEpochActive(epoch)) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const cachedStartup = readAuraStartupCache();

    if (cachedStartup) {
      setSession(createSessionFromBootstrap(cachedStartup.bootstrap));
      setBootstrap(cachedStartup.bootstrap);
      setShowLogin(false);
      setCurrentRole(cachedStartup.currentRole);
      hydrateRoleHomeQueryCache(cachedStartup.currentRole, cachedStartup.homePayload);
      setMessages(createHomeMessages(cachedStartup.currentRole, cachedStartup.homePayload));
      setLoading(false);
    }

    if (!cachedStartup && !localStorage.getItem("token")) {
      setShowLogin(true);
      setLoading(false);
      return () => {
        mounted = false;
      };
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
        setShowLogin(false);
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
          setShowLogin(true);
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
    const targetUser = availableUsers.find((user) => user.id === operatorId);
    if (
      targetUser &&
      (targetUser.disabled === true || targetUser.terminalAccess === false || targetUser.availableRoles.length === 0)
    ) {
      setError(targetUser.disabledReason ?? "该账号未配置智能终端权限");
      return;
    }

    const epoch = advanceConversationEpoch();
    setSwitchingUser(true);
    setLoading(true);
    setSuppressBlockingLoading(false);
    setLoadingText("正在切换账号");
    setError(null);

    try {
      await persistAndClearConversation();
      clearTerminalQueryCache();
      const nextBootstrap = await loadAuraBootstrap({ operatorId });
      if (!isConversationEpochActive(epoch)) return;
      const nextRole = nextBootstrap.currentRole;
      setActiveTerminalOperator(nextBootstrap.currentUser?.id ?? operatorId, nextRole);
      setConversationScope(getConversationScopeForOperator(nextBootstrap.currentUser?.id ?? operatorId, nextRole));
      setSession(createSessionFromBootstrap(nextBootstrap));
      setBootstrap(nextBootstrap);
      setCurrentRole(nextRole);
      setLatestAutomationDraft(null);
      setShowConversationHistory(false);
      setMessages([]);
      await loadRoleHome(nextRole, { bootstrapForCache: nextBootstrap, epoch });
      if (isConversationEpochActive(epoch)) {
        schedulePrefetch(nextRole, nextBootstrap.availableRoles);
      }
    } catch (err) {
      if (!isConversationEpochActive(epoch)) return;
      setError(err instanceof Error ? err.message : "账号切换失败");
      appendMessage(createMessage("error", { text: "账号切换失败，请稍后重试", source: "core" }), epoch);
    } finally {
      if (isConversationEpochActive(epoch)) {
        setSwitchingUser(false);
        setLoading(false);
      }
    }
  };

  const handleStoreChange = async (storeId: number) => {
    const activeStoreId = bootstrap?.currentStore?.id ?? session?.store?.id ?? null;
    if (loading || switchingStore || activeStoreId === storeId) return;

    const epoch = advanceConversationEpoch();
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
      if (!isConversationEpochActive(epoch)) return;
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
      await loadRoleHome(nextRole, { bootstrapForCache: normalizedBootstrap, epoch });
      if (isConversationEpochActive(epoch)) {
        schedulePrefetch(nextRole, normalizedBootstrap.availableRoles);
      }
    } catch (err) {
      if (!isConversationEpochActive(epoch)) return;
      setError(err instanceof Error ? err.message : "门店切换失败");
      appendMessage(createMessage("error", { text: "门店切换失败，请稍后重试", source: "core" }), epoch);
    } finally {
      if (isConversationEpochActive(epoch)) {
        setSwitchingStore(false);
        setLoading(false);
      }
    }
  };

  const handleCommand = async (command: string, source: AuraCommandSource = "text") => {
    const epoch = getConversationEpoch();

    const intent = await resolveCommandIntent({ command, role: currentRole, definition: roleDefinition, source });
    if (!isConversationEpochActive(epoch)) return;
    const userCommandMessage = shouldDisplayUserCommand(intent)
      ? createMessage("query", { text: command }, "用户指令")
      : null;
    if (shouldDisplayUserCommand(intent)) {
      appendMessage(userCommandMessage!, epoch);
    }
    const shouldDelayLoading = source === "quick_action" || isCacheableMicroAppAction(intent.action);
    setSuppressBlockingLoading(shouldDelayLoading);
    setLoading(true);
    setLoadingText(intent.loadingLabel);
    setError(null);

    const appendAiHint = async (businessSummary: string, aiCommand = command) => {
      try {
        const data = await getTerminalBusinessAnswer({ role: currentRole, command: aiCommand, businessContext: businessSummary });
        if (!isConversationEpochActive(epoch)) return;
        appendMessage(createMessage("ai", { kind: "ai", data }), epoch);
      } catch {
        if (!isConversationEpochActive(epoch)) return;
        appendMessage(
          createMessage("ai", {
            kind: "ai",
            data: {
              title: "Ami 建议",
              text: "Ami 建议暂不可用，业务数据已正常返回。",
              source: "Ami AI",
            },
          }),
          epoch,
        );
      }
    };

    let loadingMessageShown = false;
    let loadingTimer: number | null = null;

    try {
      if (shouldDelayLoading) {
        loadingTimer = window.setTimeout(() => {
          if (!isConversationEpochActive(epoch)) return;
          loadingMessageShown = true;
          appendMessage(createMessage("loading", undefined, intent.loadingLabel), epoch);
        }, 300);
      } else {
        loadingMessageShown = true;
        appendMessage(createMessage("loading", undefined, intent.loadingLabel), epoch);
      }

      const result = await runMicroAppIntent(intent, command, {
        agentContext: intent.action === "business.query" ? getLatestAgentContext(messagesRef.current) : undefined,
        businessQueryContext: intent.action === "business.query" ? getLatestBusinessQueryContext(messagesRef.current) : undefined,
      });
      if (!isConversationEpochActive(epoch)) return;
      if (loadingTimer !== null) {
        window.clearTimeout(loadingTimer);
      }
      setMessages((prev) => (isConversationEpochActive(epoch) ? prev.filter((msg) => msg.type !== "loading") : prev));
      if (!loadingMessageShown && shouldDelayLoading) {
        setLoadingText("");
      }
      appendRunResult(result, epoch, {
        prependMessages: userCommandMessage ? [userCommandMessage] : undefined,
        replaceFixedFlowCards: source === "quick_action",
      });
      if (result.aiStream) {
        await appendStreamingAiAnswer(result.aiStream, epoch);
      }
      if (result.aiSummary && (source === "text" || source === "voice")) {
        await appendAiHint(result.aiSummary, result.aiCommand);
      }
    } catch (err) {
      if (!isConversationEpochActive(epoch)) return;
      if (loadingTimer !== null) {
        window.clearTimeout(loadingTimer);
      }
      setMessages((prev) => (isConversationEpochActive(epoch) ? prev.filter((msg) => msg.type !== "loading") : prev));
      appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "请求失败", source: "core" }), epoch);
    } finally {
      if (isConversationEpochActive(epoch)) {
        setLoading(false);
        setSuppressBlockingLoading(false);
      }
    }
  };

  const storeName = session?.store?.name ?? bootstrap?.currentStore?.name ?? "Ami Aura Lite";
  const employeeName = session?.user?.name ?? bootstrap?.currentUser?.name ?? "未登录";

  const handleCardVerificationConfirm = async (input: CardVerificationConfirmInput) => {
    const epoch = getConversationEpoch();
    const data = await confirmCardVerification(input);
    appendMessage(createMessage("operation", { kind: "operation", data }), epoch);
  };

  const handleCashierConfirm = async (input: CashierConfirmInput) => {
    const epoch = getConversationEpoch();
    const data = await confirmCashierPayment(input);
    appendMessage(createMessage("operation", { kind: "operation", data }), epoch);
  };

  const handleCardOpeningConfirm = async (input: CardOpeningConfirmInput) => {
    const epoch = getConversationEpoch();
    const data = await confirmCardOpening(input);
    appendMessage(createMessage("operation", { kind: "operation", data }), epoch);
  };

  const handleRegistrationConfirm = async (input: RegistrationConfirmInput) => {
    const epoch = getConversationEpoch();
    const data = await confirmRegistration(input);
    appendMessage(createMessage("operation", { kind: "operation", data }), epoch);
  };

  const handleServiceRecordConfirm = async (input: ServiceRecordConfirmInput) => {
    const epoch = getConversationEpoch();
    const data = await submitServiceRecord(input);
    appendMessage(createMessage("operation", { kind: "operation", data }), epoch);
  };

  const handleRechargeConfirm = async (input: RechargeConfirmInput) => {
    const epoch = getConversationEpoch();
    const data = await confirmRecharge(input);
    appendMessage(createMessage("operation", { kind: "operation", data }), epoch);
  };

  const handleAgentApprovalApprove = async (approvalId: number) => {
    const epoch = getConversationEpoch();
    setLoading(true);
    setLoadingText("正在执行已确认的 Agent 动作");
    try {
      const data = await approveBusinessAgentAction(approvalId, currentRoleRef.current, "终端人工确认执行");
      appendMessage(createMessage("dashboard", { kind: "agentRun", data }, "Agent 动作已执行"), epoch);
    } catch (err) {
      appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "Agent 动作执行失败", source: "agent" }), epoch);
    } finally {
      if (isConversationEpochActive(epoch)) {
        setLoading(false);
        setLoadingText("");
      }
    }
  };

  const handleAgentApprovalReject = async (approvalId: number) => {
    const epoch = getConversationEpoch();
    setLoading(true);
    setLoadingText("正在拒绝 Agent 动作");
    try {
      const data = await rejectBusinessAgentAction(approvalId, currentRoleRef.current, "终端人工拒绝执行");
      appendMessage(createMessage("dashboard", { kind: "agentRun", data }, "Agent 动作已拒绝"), epoch);
    } catch (err) {
      appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "Agent 动作拒绝失败", source: "agent" }), epoch);
    } finally {
      if (isConversationEpochActive(epoch)) {
        setLoading(false);
        setLoadingText("");
      }
    }
  };

  const appendOperationResult = (data: OperationResultData, epoch = getConversationEpoch()) => {
    appendMessage(createMessage("operation", { kind: "operation", data }), epoch);
  };

  const handleStructuredAction = async (action: string, mapper: (action: string) => string) => {
    const epoch = getConversationEpoch();
    const actionResult = resolveTerminalActionResult(action);
    if (actionResult) {
      appendOperationResult(actionResult, epoch);
      return;
    }

    const command = mapper(action);
    if (command === action && isInternalActionCode(action)) {
      appendOperationResult(buildUnsupportedInternalActionResult(), epoch);
      return;
    }

    await handleCommand(command, "system");
  };

  const handleBusinessQueryAction = (action: string) => handleStructuredAction(action, businessQueryActionToCommand);
  const handleAgentResultAction = (action: string) => handleStructuredAction(action, agentActionToCommand);

  if (showLogin && !bootstrap) {
    return <AuraLoginPage error={error} loading={loading} onLogin={handleLogin} />;
  }

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
        onFingerprint={() => loadRoleHome(currentRole, { bootstrapForCache: bootstrap, epoch: getConversationEpoch() })}
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
        <div data-message-items className="flex w-full flex-col gap-4 pb-36">
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
                      onOperationResult={(data) => appendOperationResult(data)}
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
              if (payload.kind === "followUpTasks") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <FollowUpTasksCard data={payload.data} />
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
              if (payload.kind === "businessQuery") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <BusinessQueryResultCard data={payload.data} onAction={handleBusinessQueryAction} />
                  </div>
                );
              }
              if (payload.kind === "agentRun") {
                return (
                  <div key={key} className="grid gap-2">
                    <QueryStatusLine title={message.title} />
                    <AgentRunResultCard
                      data={payload.data}
                      onAction={handleAgentResultAction}
                      onApprove={handleAgentApprovalApprove}
                      onReject={handleAgentApprovalReject}
                    />
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
