import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { MessagePanel } from "./components/MessagePanel";
import { TopStatusBar } from "./components/TopStatusBar";
import { SmartCommandBar } from "./components/SmartCommandBar";
import { LockScreenOverlay } from "./components/LockScreenOverlay";
import { AutomationDraftCard } from "./components/AutomationDraftCard";
import { AutomationTodayCard } from "./components/AutomationTodayCard";
import { CardVerificationFlowCard } from "./components/CardVerificationFlowCard";
import { CashierFlowCard } from "./components/CashierFlowCard";
import { CardOpeningFlowCard } from "./components/CardOpeningFlowCard";
import { RechargeFlowCard } from "./components/RechargeFlowCard";
import { RegistrationFlowCard } from "./components/RegistrationFlowCard";
import {
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
  getAppointments,
  getBeauticianDashboard,
  getCardVerificationCards,
  getManagerDashboard,
  getRoleDefinition,
  getTerminalBusinessAnswer,
  loadAuraBootstrap,
  readAuraStartupCache,
  switchAuraStore,
  tryHandleAutomationTextOperation,
  writeAuraStartupCache,
} from "./services/auraCoreService";
import type { AuraHomePayload } from "./services/auraCoreService";
import { resolveCommandIntent, shouldDisplayUserCommand } from "./intent/intentRouter";
import type { AuraCommandSource } from "./intent/intentTypes";
import { runMicroAppIntent } from "./microApps/runMicroApp";
import type { AuraPayload } from "./microApps/microAppTypes";
import { AURA_ROLE_DATA_SCOPES, AURA_ROLE_PERMISSIONS } from "../../../../src/config/aura";
import type {
  CardOpeningConfirmInput,
  CardVerificationConfirmInput,
  CashierConfirmInput,
  Message,
  MessageType,
  RechargeConfirmInput,
  RegistrationConfirmInput,
  Role,
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

async function renderDashboard(role: Role): Promise<AuraHomePayload> {
  if (role === "manager") {
    return { kind: "manager", data: await getManagerDashboard() };
  }
  if (role === "beautician") {
    return { kind: "beautician", data: await getBeauticianDashboard() };
  }
  return { kind: "reception", data: await getAppointments() };
}

function createHomeMessages(role: Role, payload: AuraHomePayload) {
  return [
    createMessage("dashboard", payload, `${getRoleDefinition(role).title} 首页`),
  ];
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
  const [automationLoading, setAutomationLoading] = useState(false);
  const [latestAutomationDraft, setLatestAutomationDraft] = useState<AutomationDraftData | null>(null);
  const [switchingStore, setSwitchingStore] = useState(false);
  const [loadingText, setLoadingText] = useState("正在接入 Ami_Core");
  const [error, setError] = useState<string | null>(null);

  const roleDefinition = useMemo(() => getRoleDefinition(currentRole), [currentRole]);
  const availableRoles = bootstrap?.availableRoles ?? [currentRole];
  const availableStores = bootstrap?.availableStores ?? [];
  const hasInlineLoading = messages.some((message) => message.type === "loading");

  const appendMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const handleAutomationSummary = async () => {
    if (currentRole !== "manager") return;

    appendMessage(createMessage("query", { text: "查看今天自动完成了什么" }, "自动化指令"));
    setLoading(true);
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
    const data = await runAutomationStrategyOnceFromSummary(strategyId);
    appendMessage(createMessage("automation", { kind: "automationSummary", data }));
  };

  const loadRoleHome = async (
    role: Role,
    options: { bootstrapForCache?: AuraBootstrap | null; silent?: boolean; preserveMessagesOnError?: boolean } = {},
  ) => {
    if (!options.silent) {
      setLoading(true);
      setLoadingText(`正在加载${getRoleDefinition(role).title}`);
    }
    setError(null);
    try {
      const payload = await renderDashboard(role);
      setMessages(createHomeMessages(role, payload));
      const bootstrapForCache = options.bootstrapForCache ?? bootstrap;
      if (bootstrapForCache) {
        writeAuraStartupCache({ bootstrap: bootstrapForCache, currentRole: role, homePayload: payload });
      }
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      if (!options.preserveMessagesOnError) {
        setMessages([
          createMessage("error", { text: "门店数据加载失败", source: "core" }),
        ]);
      }
      return null;
    } finally {
      if (!options.silent) {
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
      setCurrentRole(cachedStartup.currentRole);
      setMessages(createHomeMessages(cachedStartup.currentRole, cachedStartup.homePayload));
      setLoading(false);
    }

    (async () => {
      try {
        if (!cachedStartup) {
          setLoading(true);
          setLoadingText("正在接入 Ami_Core");
        }
        const nextBootstrap = await loadAuraBootstrap();
        const nextSession = createSessionFromBootstrap(nextBootstrap);
        if (!mounted) return;
        setSession(nextSession);
        setBootstrap(nextBootstrap);
        setCurrentRole(nextBootstrap.currentRole);
        await loadRoleHome(nextBootstrap.currentRole, {
          bootstrapForCache: nextBootstrap,
          silent: Boolean(cachedStartup),
          preserveMessagesOnError: Boolean(cachedStartup),
        });
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

  const handleRoleChange = async (role: Role) => {
    if (availableRoles.length > 0 && !availableRoles.includes(role)) return;
    setCurrentRole(role);
    let nextBootstrap = bootstrap;
    if (bootstrap) {
      nextBootstrap = {
        ...bootstrap,
        currentRole: role,
        roleDefinition: getRoleDefinition(role),
        availableActions: getRoleDefinition(role).availableActions,
        quickActions: getRoleDefinition(role).quickActions,
        permissions: [...AURA_ROLE_PERMISSIONS[role]],
        dataScopes: { ...AURA_ROLE_DATA_SCOPES[role] },
      };
      setBootstrap(nextBootstrap);
    }
    await loadRoleHome(role, { bootstrapForCache: nextBootstrap });
  };

  const handleStoreChange = async (storeId: number) => {
    const activeStoreId = bootstrap?.currentStore?.id ?? session?.store?.id ?? null;
    if (loading || switchingStore || activeStoreId === storeId) return;

    setSwitchingStore(true);
    setLoading(true);
    setLoadingText("正在切换门店");
    setError(null);

    try {
      const nextBootstrap = await switchAuraStore(storeId);
      const nextRole = nextBootstrap.availableRoles.includes(currentRole) ? currentRole : nextBootstrap.currentRole;
      const nextRoleDefinition = getRoleDefinition(nextRole);
      const normalizedBootstrap =
        nextRole === nextBootstrap.currentRole
          ? nextBootstrap
          : {
              ...nextBootstrap,
              currentRole: nextRole,
              roleDefinition: nextRoleDefinition,
              availableActions: nextRoleDefinition.availableActions,
              quickActions: nextRoleDefinition.quickActions,
              permissions: [...AURA_ROLE_PERMISSIONS[nextRole]],
              dataScopes: { ...AURA_ROLE_DATA_SCOPES[nextRole] },
            };

      setSession({
        user: normalizedBootstrap.currentUser,
        store: normalizedBootstrap.currentStore,
      });
      setBootstrap(normalizedBootstrap);
      setCurrentRole(nextRole);
      await loadRoleHome(nextRole, { bootstrapForCache: normalizedBootstrap });
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

    if (source === "text") {
      appendMessage(createMessage("query", { text: command }, "用户指令"));
      setLoading(true);
      setLoadingText("正在基于 Ami_Core 生成回答");
      setError(null);

      try {
        appendMessage(createMessage("loading", undefined, "正在基于 Ami_Core 生成回答"));
        const data = await getTerminalBusinessAnswer({ role: currentRole, command });
        setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
        appendMessage(createMessage("ai", { kind: "ai", data }));
      } catch (err) {
        setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
        appendMessage(createMessage("error", { text: err instanceof Error ? err.message : "请求失败", source: "core" }));
      } finally {
        setLoading(false);
      }
      return;
    }

    const intent = await resolveCommandIntent({ command, role: currentRole, definition: roleDefinition, source });
    if (shouldDisplayUserCommand(intent)) {
      appendMessage(createMessage("query", { text: command }, "用户指令"));
    }
    setLoading(true);
    setLoadingText(intent.loadingLabel);
    setError(null);

    const appendAiHint = async (businessSummary: string, aiCommand = command) => {
      try {
        const data = await getTerminalBusinessAnswer({ role: currentRole, command: aiCommand });
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
      if (source === "quick_action") {
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
      if (!loadingMessageShown && source === "quick_action") {
        setLoadingText("");
      }
      result.messages.forEach((message) => {
        appendMessage(createMessage(message.type, message.payload, message.title));
      });
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

  const handleRechargeConfirm = async (input: RechargeConfirmInput) => {
    const data = await confirmRecharge(input);
    appendMessage(createMessage("operation", { kind: "operation", data }));
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#F7F5F2] font-sans">
      {isLocked ? <LockScreenOverlay storeName={storeName} onUnlock={() => setIsLocked(false)} /> : null}

      <TopStatusBar
        storeName={storeName}
        currentStoreId={session?.store?.id ?? bootstrap?.currentStore?.id ?? null}
        availableStores={availableStores}
        employeeName={employeeName}
        currentRole={currentRole}
        availableRoles={availableRoles}
        switchingStore={switchingStore}
        onStoreChange={handleStoreChange}
        onRoleChange={handleRoleChange}
        onLock={() => setIsLocked(true)}
        onFingerprint={() => loadRoleHome(currentRole, { bootstrapForCache: bootstrap })}
      />

      <MessagePanel messages={messages}>
        <div className="flex w-full flex-col gap-4 pb-36">
          {loading && !hasInlineLoading ? <LoadingCard text={loadingText} /> : null}
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
              if (payload.kind === "manager") return <ManagerDashboardCard key={key} data={payload.data} />;
              if (payload.kind === "reception") {
                return (
                  <ReceptionDashboardCard
                    key={key}
                    data={payload.data}
                    onQuickAction={(action) => handleCommand(action, "quick_action")}
                    onOperationResult={(data) => appendMessage(createMessage("operation", { kind: "operation", data }))}
                  />
                );
              }
              if (payload.kind === "beautician") return <BeauticianDashboardCard key={key} data={payload.data} />;
              if (payload.kind === "staff") return <StaffPerformanceCard key={key} items={payload.data} />;
              if (payload.kind === "growth") return <CustomerGrowthCard key={key} customers={payload.data} />;
              if (payload.kind === "inventory") return <InventoryAlertsCard key={key} data={payload.data} />;
              if (payload.kind === "customer") return <CustomerProfileCard key={key} data={payload.data} />;
            }

            if (message.type === "cardVerification") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "cardVerification") {
                return (
                  <CardVerificationFlowCard
                    key={key}
                    data={payload.data}
                    onLoadCustomerCards={getCardVerificationCards}
                    onConfirm={handleCardVerificationConfirm}
                  />
                );
              }
            }

            if (message.type === "cashier") {
              const payload = message.payload as Payload | undefined;
              if (payload?.kind === "cashier") {
                return <CashierFlowCard key={key} data={payload.data} onConfirm={handleCashierConfirm} />;
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
