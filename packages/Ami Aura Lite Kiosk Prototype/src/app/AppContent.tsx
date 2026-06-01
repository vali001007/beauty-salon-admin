import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { MessagePanel } from "./components/MessagePanel";
import { TopStatusBar } from "./components/TopStatusBar";
import { SmartCommandBar } from "./components/SmartCommandBar";
import { LockScreenOverlay } from "./components/LockScreenOverlay";
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
  SummaryBadge,
} from "./components/RoleDashboards";
import {
  confirmCardVerification,
  confirmCardOpening,
  confirmCashierPayment,
  confirmRecharge,
  confirmRegistration,
  getAppointments,
  getBeauticianDashboard,
  getCardVerificationCards,
  getAiSuggestion,
  getManagerDashboard,
  getRoleDefinition,
  loadAuraBootstrap,
  switchAuraStore,
} from "./services/auraCoreService";
import { resolveCommandIntent, shouldDisplayUserCommand } from "./intent/intentRouter";
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

function AiSuggestionCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[#2D1B69]/10 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#2D1B69]">
        <Sparkles className="h-4 w-4" />
        {title}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-[#1F1B2D]">{text}</p>
      <div className="mt-3 text-xs text-[#6F6678]">建议由 Ami AI 生成，业务事实以 Ami_Core 卡片数据为准</div>
    </div>
  );
}

async function renderDashboard(role: Role) {
  if (role === "manager") {
    return { kind: "manager", data: await getManagerDashboard() } as Payload;
  }
  if (role === "beautician") {
    return { kind: "beautician", data: await getBeauticianDashboard() } as Payload;
  }
  return { kind: "reception", data: await getAppointments() } as Payload;
}

export default function AppContent() {
  const [isLocked, setIsLocked] = useState(false);
  const [session, setSession] = useState<SessionContext | null>(null);
  const [bootstrap, setBootstrap] = useState<AuraBootstrap | null>(null);
  const [currentRole, setCurrentRole] = useState<Role>("reception");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
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

  const loadRoleHome = async (role: Role) => {
    setLoading(true);
    setLoadingText(`正在加载${getRoleDefinition(role).title}`);
    setError(null);
    try {
      const payload = await renderDashboard(role);
      setMessages([
        createMessage("system", undefined, "Ami Aura Lite 已接入 Ami_Core"),
        createMessage("dashboard", payload, `${getRoleDefinition(role).title} 首页`),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setMessages([
        createMessage("system", undefined, "Ami Aura Lite 已接入 Ami_Core"),
        createMessage("error", { text: "门店数据加载失败", source: "core" }),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const nextBootstrap = await loadAuraBootstrap();
        const nextSession = {
          user: nextBootstrap.currentUser,
          store: nextBootstrap.currentStore,
        };
        if (!mounted) return;
        setSession(nextSession);
        setBootstrap(nextBootstrap);
        setCurrentRole(nextBootstrap.currentRole);
        await loadRoleHome(nextBootstrap.currentRole);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "初始化失败");
        setMessages([
          createMessage("system", undefined, "Ami Aura Lite"),
          createMessage("error", { text: "Ami_Core 会话初始化失败", source: "core" }),
        ]);
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
    if (bootstrap) {
      setBootstrap({
        ...bootstrap,
        currentRole: role,
        roleDefinition: getRoleDefinition(role),
        availableActions: getRoleDefinition(role).availableActions,
        quickActions: getRoleDefinition(role).quickActions,
        permissions: [...AURA_ROLE_PERMISSIONS[role]],
        dataScopes: { ...AURA_ROLE_DATA_SCOPES[role] },
      });
    }
    await loadRoleHome(role);
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
      await loadRoleHome(nextRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : "门店切换失败");
      appendMessage(createMessage("error", { text: "门店切换失败，请稍后重试", source: "core" }));
    } finally {
      setSwitchingStore(false);
      setLoading(false);
    }
  };

  const handleCommand = async (command: string) => {
    const intent = await resolveCommandIntent({ command, role: currentRole, definition: roleDefinition });
    if (shouldDisplayUserCommand(intent)) {
      appendMessage(createMessage("query", { text: command }, "用户指令"));
    }
    setLoading(true);
    setLoadingText(intent.loadingLabel);
    setError(null);

    const appendAiHint = async (businessSummary: string, aiCommand = command) => {
      try {
        const data = await getAiSuggestion({ role: currentRole, command: aiCommand, businessSummary });
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

    try {
      appendMessage(createMessage("loading", undefined, intent.loadingLabel));
      const result = await runMicroAppIntent(intent, command);
      setMessages((prev) => prev.filter((msg) => msg.type !== "loading"));
      result.messages.forEach((message) => {
        appendMessage(createMessage(message.type, message.payload, message.title));
      });
      if (result.aiSummary) {
        await appendAiHint(result.aiSummary, result.aiCommand);
      }
    } catch (err) {
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
        onFingerprint={() => loadRoleHome(currentRole)}
      />

      <MessagePanel messages={messages}>
        <div className="flex w-full flex-col gap-4 pb-36">
          <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-[#6F6678]">当前角色</div>
                <div className="mt-1 text-2xl font-semibold text-[#1F1B2D]">{roleDefinition.title}</div>
                <div className="mt-1 text-sm text-[#6F6678]">{roleDefinition.subtitle}</div>
              </div>
              <SummaryBadge text="数据来源 Ami_Core" />
            </div>
          </div>

          {loading && !hasInlineLoading ? <LoadingCard text={loadingText} /> : null}
          {error ? <SystemNotice title="Ami_Core 请求异常" subtitle={error} /> : null}

          {messages.map((message) => {
            const key = message.id;

            if (message.type === "system") {
              return (
                <div key={key} className="flex justify-center">
                  <SystemNotice
                    title={message.title ?? "系统消息"}
                    subtitle="Ami Aura Lite 已连接 Ami_Core 数据层"
                  />
                </div>
              );
            }

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
              if (payload?.kind === "ai") return <AiSuggestionCard key={key} title={payload.data.title} text={payload.data.text} />;
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
                    onQuickAction={handleCommand}
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

      <SmartCommandBar currentRole={currentRole} definition={roleDefinition} onCommand={handleCommand} disabled={loading} />
    </div>
  );
}
