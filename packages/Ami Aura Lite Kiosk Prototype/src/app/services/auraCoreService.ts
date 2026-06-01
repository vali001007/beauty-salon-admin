import { format, startOfWeek } from "date-fns";
import {
  getBeauticians,
  getCards,
  getCustomers,
  getCustomersPaginated,
  getProjects,
  getProducts,
  getProductOrders,
  getProductOrdersPaginated,
  getReservationsPaginated,
  getSchedule,
  getStockItemsPaginated,
  getTerminalBootstrap,
  getTerminalCatalogSync,
  getTerminalInventoryAlerts,
  getTerminalInventoryStock,
  getTerminalRoleDashboard,
  getTerminalReservations,
  getUserInfo,
  analyzeSkinPhoto,
  cancelTerminalReservation,
  confirmTerminalReservation,
  login,
  checkInTerminalReservation,
  completeTerminalPayment,
  completeTerminalServiceTask,
  createTerminalCardOrder,
  createTerminalCashierOrder,
  createTerminalPrintJob,
  createTerminalRechargeOrder,
  createTerminalReservation,
  createTerminalSkinTest,
  getTerminalCustomerCards,
  getTerminalServiceTasks,
  quickCreateTerminalCustomer,
  sendAiChatMessage,
  updateTerminalReservation,
  verifyTerminalCardUsage,
} from "@/api";
import { getAuraRoleDefinition } from "@/config/aura";
import { useAuthStore } from "@/stores/authStore";
import { useStoreStore } from "@/stores/storeStore";
import type { AuraBootstrap, AuraRole } from "@/types/aura";
import type { Project } from "@/types/project";
import type { Beautician } from "@/types/beautician";
import type {
  TerminalCustomerCard,
  TerminalReservationCreateRequest,
  TerminalReservationUpdateRequest,
  TerminalRoleDashboard,
} from "@/types/terminal";
import type {
  AppointmentCardData,
  AppointmentViewItem,
  AiSuggestionData,
  CardVerificationConfirmInput,
  CardVerificationFlowData,
  CardOpeningConfirmInput,
  CardOpeningFlowData,
  CashierConfirmInput,
  CashierFlowData,
  CoreSnapshot,
  CustomerCardData,
  DashboardCardData,
  InventoryAlertCardData,
  OperationResultData,
  RechargeConfirmInput,
  RechargeFlowData,
  RegistrationConfirmInput,
  RegistrationFlowData,
  RegistrationSkinAnalysisData,
  Role,
  RoleDefinition,
  SessionContext,
  StaffScheduleCardData,
} from "../types";
import type { TerminalSkinMetric } from "@/types/terminal";

function getTodayRange() {
  const now = new Date();
  return {
    today: format(now, "yyyy-MM-dd"),
    weekStart: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  };
}

function sum<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((total, item) => total + pick(item), 0);
}

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];

  const record = value as {
    items?: unknown;
    data?: unknown;
    list?: unknown;
    records?: unknown;
    rows?: unknown;
    results?: unknown;
  };

  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record.data)) return record.data as T[];
  if (Array.isArray(record.list)) return record.list as T[];
  if (Array.isArray(record.records)) return record.records as T[];
  if (Array.isArray(record.rows)) return record.rows as T[];
  if (Array.isArray(record.results)) return record.results as T[];
  if (record.items && typeof record.items === "object") return asList<T>(record.items);
  if (record.data && typeof record.data === "object") return asList<T>(record.data);
  return [];
}

function getTotal(value: { total?: number } | null | undefined, fallbackCount = 0) {
  return typeof value?.total === "number" ? value.total : fallbackCount;
}

async function optionalCoreCall<T>(label: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch (err) {
    console.warn(`Ami Aura Lite ${label} 加载失败，已降级为空数据`, err);
    return fallback;
  }
}

function shouldPreferDemoStore(bootstrap: AuraBootstrap) {
  const roles = bootstrap.currentUser?.roles ?? [];
  const permissions = bootstrap.currentUser?.permissions ?? [];
  return roles.includes("super_admin") || permissions.includes("*");
}

let bootstrapCache: { value: AuraBootstrap; storeId: number | null; createdAt: number } | null = null;
let bootstrapPromise: Promise<AuraBootstrap> | null = null;
let roleDashboardCache: { value: TerminalRoleDashboard; storeId: number | null; createdAt: number } | null = null;
let roleDashboardPromise: Promise<TerminalRoleDashboard> | null = null;
const BOOTSTRAP_CACHE_MS = 30_000;
const ROLE_DASHBOARD_CACHE_MS = 15_000;
const AURA_ROLES: AuraRole[] = ["manager", "reception", "beautician"];
const AURA_STORE_STORAGE_KEY = "ami:aura-lite:current-store-id";

function clearRoleDashboardCache() {
  roleDashboardCache = null;
  roleDashboardPromise = null;
}

function clearBootstrapCache() {
  bootstrapCache = null;
  bootstrapPromise = null;
  clearRoleDashboardCache();
}

function readStoredAuraStoreId() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AURA_STORE_STORAGE_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function writeStoredAuraStoreId(storeId: number | null) {
  if (typeof window === "undefined") return;
  if (storeId === null) {
    window.localStorage.removeItem(AURA_STORE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AURA_STORE_STORAGE_KEY, String(storeId));
}

function getPreferredAuraStoreId(bootstrap: AuraBootstrap, currentStoreId: number | null) {
  if (currentStoreId) return currentStoreId;

  const storedStoreId = readStoredAuraStoreId();
  if (storedStoreId && bootstrap.availableStores.some((store) => store.id === storedStoreId)) {
    return storedStoreId;
  }

  if (!shouldPreferDemoStore(bootstrap)) return bootstrap.currentStore?.id ?? bootstrap.availableStores[0]?.id ?? null;

  const businessStore = bootstrap.availableStores.find((store) => !store.name.startsWith("Ami 上海"));
  return businessStore?.id ?? bootstrap.currentStore?.id ?? bootstrap.availableStores[0]?.id ?? null;
}

function isAuraRole(value: unknown): value is AuraRole {
  return value === "manager" || value === "reception" || value === "beautician";
}

function inferAuraRole(user: unknown): AuraRole {
  const record = user && typeof user === "object" ? (user as Record<string, unknown>) : {};
  const primaryRole = String(record.primaryRole ?? record.role ?? "");
  const roles = asList<string>(record.roles);
  const roleText = [primaryRole, ...roles].join(",");

  if (roleText.includes("beautician")) return "beautician";
  if (roleText.includes("cashier") || roleText.includes("reception")) return "reception";
  return "manager";
}

function normalizeAuraBootstrap(value: unknown): AuraBootstrap {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const authState = useAuthStore.getState();
  const storeState = useStoreStore.getState();
  const currentUser = (raw.currentUser ?? raw.user ?? authState.user ?? null) as AuraBootstrap["currentUser"];
  const rawAvailableStores = asList<AuraBootstrap["availableStores"][number]>(raw.availableStores ?? raw.stores);
  const availableStores = rawAvailableStores.length ? rawAvailableStores : storeState.stores;
  const rawCurrentStore = (raw.currentStore ?? raw.store ?? availableStores[0] ?? null) as AuraBootstrap["currentStore"];
  const currentStore =
    (storeState.currentStoreId ? availableStores.find((store) => store.id === storeState.currentStoreId) : null) ??
    rawCurrentStore;
  const currentRole = isAuraRole(raw.currentRole) ? raw.currentRole : inferAuraRole(currentUser);
  const roleDefinition = getAuraRoleDefinition(currentRole);
  const availableRoles = asList<AuraRole>(raw.availableRoles).filter(isAuraRole);
  const permissions =
    asList<string>(raw.permissions).length > 0
      ? asList<string>(raw.permissions)
      : asList<string>((currentUser as Record<string, unknown> | null)?.permissions);

  return {
    currentUser,
    currentStore,
    availableStores,
    currentRole,
    availableRoles: availableRoles.length ? availableRoles : AURA_ROLES,
    availableActions: asList<AuraBootstrap["availableActions"][number]>(raw.availableActions).length
      ? asList<AuraBootstrap["availableActions"][number]>(raw.availableActions)
      : roleDefinition.availableActions,
    quickActions: asList<AuraBootstrap["quickActions"][number]>(raw.quickActions).length
      ? asList<AuraBootstrap["quickActions"][number]>(raw.quickActions)
      : roleDefinition.quickActions,
    permissions,
    dataScopes: (raw.dataScopes && typeof raw.dataScopes === "object" ? raw.dataScopes : {}) as AuraBootstrap["dataScopes"],
    roleDefinition: (raw.roleDefinition && typeof raw.roleDefinition === "object" ? raw.roleDefinition : roleDefinition) as AuraBootstrap["roleDefinition"],
  };
}

async function fetchCachedBootstrap() {
  const storeId = useStoreStore.getState().currentStoreId;
  const now = Date.now();
  if (bootstrapCache && bootstrapCache.storeId === storeId && now - bootstrapCache.createdAt < BOOTSTRAP_CACHE_MS) {
    return bootstrapCache.value;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = getTerminalBootstrap()
      .then((value) => {
        const normalized = normalizeAuraBootstrap(value);
        bootstrapCache = { value: normalized, storeId: useStoreStore.getState().currentStoreId, createdAt: Date.now() };
        return normalized;
      })
      .finally(() => {
        bootstrapPromise = null;
      });
  }

  return bootstrapPromise;
}

async function fetchCachedRoleDashboard() {
  const storeId = useStoreStore.getState().currentStoreId;
  const now = Date.now();
  if (roleDashboardCache && roleDashboardCache.storeId === storeId && now - roleDashboardCache.createdAt < ROLE_DASHBOARD_CACHE_MS) {
    return roleDashboardCache.value;
  }

  if (!roleDashboardPromise) {
    roleDashboardPromise = getTerminalRoleDashboard()
      .then((value) => {
        roleDashboardCache = { value, storeId: useStoreStore.getState().currentStoreId, createdAt: Date.now() };
        return value;
      })
      .finally(() => {
        roleDashboardPromise = null;
      });
  }

  return roleDashboardPromise;
}

function filterByStoreName<T extends { storeName?: string }>(items: T[], storeName?: string | null) {
  if (!storeName) return items;
  const normalized = storeName.trim();
  return items.filter((item) => !item.storeName || item.storeName === normalized);
}

function getReservationTime(reservation: { date?: string; appointmentTime?: string; time?: string }) {
  return reservation.date ?? reservation.appointmentTime ?? reservation.time ?? "";
}

function isReservationOnDate(reservation: { date?: string; appointmentTime?: string; time?: string }, date: string) {
  return getReservationTime(reservation).startsWith(date);
}

function normalizeReservationStatus(status?: string) {
  const value = status ?? "pending";
  if (value === "confirmed" || value.includes("已确认")) return "confirmed";
  if (value === "checked_in" || value.includes("到店")) return "checked_in";
  if (value === "completed" || value.includes("完成")) return "completed";
  if (value === "cancelled" || value.includes("取消")) return "cancelled";
  if (value === "no_show") return "no_show";
  return "pending";
}

function getReservationStatusText(status?: string) {
  const normalized = normalizeReservationStatus(status);
  const statusMap: Record<string, string> = {
    pending: "待确认",
    confirmed: "已确认",
    checked_in: "已到店",
    completed: "已完成",
    cancelled: "已取消",
    no_show: "未到店",
  };
  return statusMap[normalized] ?? "待确认";
}

function formatAppointmentTime(value?: string) {
  if (!value) return "时间待定";
  const normalized = value.replace("T", " ");
  const [, month, day, hour, minute] =
    normalized.match(/^\d{4}-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/) ?? [];
  if (!month) return normalized;
  return `${month}-${day} ${hour}:${minute}`;
}

function formatTimeOnly(value?: string) {
  const display = formatAppointmentTime(value);
  const matched = display.match(/(\d{2}:\d{2})$/);
  return matched?.[1] ?? display;
}

function addMinutesToAppointment(value: string | undefined, minutes: number) {
  const base = value ? new Date(value.replace(" ", "T")) : new Date();
  const time = Number.isNaN(base.getTime()) ? new Date() : base;
  time.setMinutes(time.getMinutes() + minutes);
  return format(time, "yyyy-MM-dd HH:mm:ss");
}

function findCustomerForReservation(snapshot: CoreSnapshot, reservation: Record<string, any>) {
  const customerName = reservation.customerName ?? reservation.userName ?? "";
  const customerPhone = reservation.customerPhone ?? "";
  return (
    snapshot.customers.find((customer) => customerPhone && customer.phone === customerPhone) ??
    snapshot.customers.find((customer) => customer.name === customerName) ??
    snapshot.customers.find((customer) => customerName && (customer.name.includes(customerName) || customerName.includes(customer.name)))
  );
}

function toAppointmentViewItem(snapshot: CoreSnapshot, reservation: Record<string, any>): AppointmentViewItem {
  const customer = findCustomerForReservation(snapshot, reservation);
  const customerName = reservation.customerName ?? reservation.userName ?? customer?.name ?? "散客";
  const customerPhone = reservation.customerPhone || customer?.phone || "未留手机号";
  const appointmentTime = reservation.appointmentTime ?? getReservationTime(reservation);
  const tags = customer?.tags?.length ? customer.tags.slice(0, 3) : ["到店接待", "待完善画像"];
  const profileLabel = customer?.skinCondition || customer?.source || "画像待补充";

  return {
    id: Number(reservation.id),
    customerId: customer?.id ?? reservation.customerId,
    customerName,
    customerPhone,
    memberLevel: customer?.memberLevel ?? "普通客户",
    tags,
    profileLabel,
    lastVisitDate: customer?.lastVisitDate ?? "暂无到店记录",
    projectId: reservation.projectId,
    projectName: reservation.projectName ?? "未选择项目",
    beauticianId: reservation.beauticianId,
    beauticianName: reservation.beauticianName ?? "待分配美容师",
    appointmentTime,
    displayTime: formatAppointmentTime(appointmentTime),
    duration: reservation.duration ?? 60,
    status: normalizeReservationStatus(reservation.status),
    statusText: getReservationStatusText(reservation.status),
    remark: reservation.remark,
  };
}

function toAppointmentViewItemFromTerminal(reservation: Record<string, any>): AppointmentViewItem {
  const appointmentTime = reservation.appointmentTime ?? getReservationTime(reservation);
  const customerName = reservation.customerName ?? reservation.userName ?? "散客";
  return {
    id: Number(reservation.id),
    customerId: reservation.customerId,
    customerName,
    customerPhone: reservation.customerPhone || "未留手机号",
    memberLevel: reservation.memberLevel ?? "会员信息待完善",
    tags: Array.isArray(reservation.tags) && reservation.tags.length ? reservation.tags.slice(0, 3) : ["今日预约", "待接待"],
    profileLabel: reservation.profileLabel ?? "画像待补充",
    lastVisitDate: reservation.lastVisitDate ?? "暂无到店记录",
    projectId: reservation.projectId,
    projectName: reservation.projectName ?? "未选择项目",
    beauticianId: reservation.beauticianId,
    beauticianName: reservation.beauticianName ?? "待分配美容师",
    appointmentTime,
    displayTime: formatAppointmentTime(appointmentTime),
    duration: reservation.duration ?? 60,
    status: normalizeReservationStatus(reservation.status),
    statusText: getReservationStatusText(reservation.status),
    remark: reservation.remark,
  };
}

function buildEmptyBeauticianDashboard(storeName?: string): StaffScheduleCardData {
  return {
    title: "我的今日服务",
    subtitle: storeName ?? "当前门店",
    beautician: {
      id: 0,
      name: "暂无排班美容师",
      phone: "",
      level: "美容师",
      specialties: [],
      status: "在职",
      storeName: storeName ?? "当前门店",
      joinDate: "",
      createdAt: "",
    },
    todaySlots: [],
    utilization: "0%",
    summary: "当前门店暂无美容师排班数据，请在 Ami_Core 排班模块维护后刷新。",
  };
}

function normalizeManagerDashboard(value: unknown, storeName?: string): DashboardCardData {
  const data = value && typeof value === "object" ? (value as Partial<DashboardCardData>) : {};
  return {
    title: data.title ?? "店长经营驾驶舱",
    subtitle: data.subtitle ?? storeName ?? "当前门店",
    summary: data.summary ?? "当前门店经营数据已从 Ami_Core 接入，请优先关注经营、风险和员工协同。",
    kpis: asList<DashboardCardData["kpis"][number]>((data as { kpis?: unknown }).kpis),
    risks: asList<string>((data as { risks?: unknown }).risks),
    highlights: asList<string>((data as { highlights?: unknown }).highlights),
  };
}

function normalizeStaffSchedule(value: unknown, storeName?: string): StaffScheduleCardData {
  const fallback = buildEmptyBeauticianDashboard(storeName);
  const data = value && typeof value === "object" ? (value as Partial<StaffScheduleCardData>) : {};
  const beautician = data.beautician ?? fallback.beautician;
  return {
    title: data.title ?? fallback.title,
    subtitle: data.subtitle ?? beautician.storeName ?? fallback.subtitle,
    beautician,
    todaySlots: asList<StaffScheduleCardData["todaySlots"][number]>((data as { todaySlots?: unknown }).todaySlots),
    utilization: data.utilization ?? fallback.utilization,
    summary: data.summary ?? fallback.summary,
  };
}

function normalizeReceptionDashboard(value: unknown, storeName?: string): AppointmentCardData {
  const data = value && typeof value === "object" ? (value as Partial<AppointmentCardData>) : {};
  const rawItems = asList<Record<string, any>>((data as { items?: unknown; data?: unknown }).items ?? (data as { data?: unknown }).data ?? value);
  return {
    title: data.title ?? "今日接待工作台",
    subtitle: data.subtitle ?? storeName ?? "接待中心",
    items: rawItems.map((item) => toAppointmentViewItemFromTerminal(item)),
    summary: data.summary ?? `当前共有 ${rawItems.length} 条预约待处理，核心动作是到店确认、核销、收银和打印。`,
  };
}

async function ensureLoggedIn() {
  const authState = useAuthStore.getState();
  const storeState = useStoreStore.getState();

  if (!authState.token) {
    await authState.login({
      username: import.meta.env.VITE_DEMO_USERNAME || "admin",
      password: import.meta.env.VITE_DEMO_PASSWORD || "11111111",
    });
  } else if (!authState.user) {
    await authState.loadUserInfo();
  }

  if (storeState.stores.length === 0) {
    await storeState.loadStores();
  }
}

export async function ensureAuraSession(): Promise<SessionContext> {
  await ensureLoggedIn();

  const authState = useAuthStore.getState();
  const storeState = useStoreStore.getState();
  let bootstrap = await fetchCachedBootstrap();

  const preferredStoreId = getPreferredAuraStoreId(bootstrap, storeState.currentStoreId);
  if (preferredStoreId && storeState.currentStoreId !== preferredStoreId) {
    storeState.setCurrentStore(preferredStoreId);
    writeStoredAuraStoreId(preferredStoreId);
    clearBootstrapCache();
    bootstrap = await fetchCachedBootstrap();
  }

  if (storeState.stores.length === 0 && bootstrap.availableStores.length > 0) {
    storeState.loadStores().catch(() => undefined);
  }

  return {
    user: bootstrap.currentUser ?? authState.user ?? (await getUserInfo()),
    store: bootstrap.currentStore ?? storeState.stores.find((item) => item.id === storeState.currentStoreId) ?? null,
  };
}

export async function loadAuraBootstrap(): Promise<AuraBootstrap> {
  await ensureLoggedIn();
  const storeState = useStoreStore.getState();
  let bootstrap = await fetchCachedBootstrap();

  if (storeState.stores.length === 0) {
    await storeState.loadStores();
  }
  const preferredStoreId = getPreferredAuraStoreId(bootstrap, storeState.currentStoreId);
  if (preferredStoreId && storeState.currentStoreId !== preferredStoreId) {
    storeState.setCurrentStore(preferredStoreId);
    writeStoredAuraStoreId(preferredStoreId);
    clearBootstrapCache();
    bootstrap = await fetchCachedBootstrap();
  } else if (preferredStoreId) {
    storeState.setCurrentStore(preferredStoreId);
    writeStoredAuraStoreId(preferredStoreId);
  }

  return bootstrap;
}

export async function switchAuraStore(storeId: number): Promise<AuraBootstrap> {
  await ensureLoggedIn();
  const storeState = useStoreStore.getState();

  if (storeState.stores.length === 0) {
    await storeState.loadStores();
  }

  storeState.setCurrentStore(storeId);
  writeStoredAuraStoreId(storeId);
  clearBootstrapCache();
  return fetchCachedBootstrap();
}

async function getAuraBootstrapSession() {
  const bootstrap = await loadAuraBootstrap();
  return {
    bootstrap,
    storeName: bootstrap.currentStore?.name ?? bootstrap.availableStores[0]?.name ?? "",
    storeId: bootstrap.currentStore?.id,
  };
}

export async function loadCoreSnapshot(): Promise<CoreSnapshot> {
  const { bootstrap, storeName, storeId } = await getAuraBootstrapSession();

  const [
    customersResult,
    reservationsResult,
    terminalReservationsResult,
    terminalCatalogResult,
    beauticiansResult,
    stockItemsResult,
    inventoryAlertsResult,
    cardsResult,
    ordersResult,
  ] =
    await Promise.all([
      optionalCoreCall("客户数据", () => getCustomers({ storeName }), []),
      optionalCoreCall("预约分页数据", () => getReservationsPaginated({ page: 1, pageSize: 80, storeName }), { items: [], data: [], total: 0, page: 1, pageSize: 80 }),
      optionalCoreCall("终端今日预约", () => getTerminalReservations({ storeName }), []),
      optionalCoreCall<unknown>("终端目录", () => getTerminalCatalogSync(), null),
      optionalCoreCall("美容师数据", () => getBeauticians({ storeName }), []),
      optionalCoreCall("终端库存数据", () => getTerminalInventoryStock({ storeId }), []),
      optionalCoreCall<unknown>("终端库存预警", () => getTerminalInventoryAlerts(), null),
      optionalCoreCall("卡项数据", () => getCards(), []),
      optionalCoreCall("商品订单", () => getProductOrders(), []),
    ]);

  const customers = asList<CoreSnapshot["customers"][number]>(customersResult);
  const reservations = asList<CoreSnapshot["reservations"][number]>(reservationsResult);
  const terminalReservations = asList<CoreSnapshot["reservations"][number]>(terminalReservationsResult as unknown as CoreSnapshot["reservations"]);
  const catalog = terminalCatalogResult && typeof terminalCatalogResult === "object" ? (terminalCatalogResult as Record<string, unknown>) : {};
  const alerts = inventoryAlertsResult && typeof inventoryAlertsResult === "object" ? (inventoryAlertsResult as Record<string, unknown>) : {};
  const catalogBeauticians = asList<CoreSnapshot["beauticians"][number]>(catalog.beauticians);
  const beauticians = catalogBeauticians.length ? catalogBeauticians : asList<CoreSnapshot["beauticians"][number]>(beauticiansResult);
  const stockItems = asList<CoreSnapshot["stockItems"][number]>(stockItemsResult);
  const expiringProducts = asList<CoreSnapshot["expiringProducts"][number]>(alerts.expiring);
  const replenishment = asList<CoreSnapshot["replenishment"][number]>(alerts.replenishment);
  const catalogCards = asList<CoreSnapshot["cards"][number]>(catalog.cards);
  const cards = catalogCards.length ? catalogCards : asList<CoreSnapshot["cards"][number]>(cardsResult);
  const orders = asList<CoreSnapshot["orders"][number]>(ordersResult);

  return {
    customers,
    reservations: (terminalReservations.length ? terminalReservations : reservations) as CoreSnapshot["reservations"],
    beauticians,
    stockItems,
    expiringProducts: filterByStoreName(expiringProducts, storeName),
    replenishment,
    cards,
    orders: filterByStoreName(orders, storeName),
    user: bootstrap.currentUser,
    store: bootstrap.currentStore,
  };
}

async function loadCardVerificationSnapshot() {
  const [snapshot, catalogResult, projectsResult] = await Promise.all([
    loadCoreSnapshot(),
    optionalCoreCall<unknown>("终端目录", () => getTerminalCatalogSync(), null),
    optionalCoreCall("项目数据", () => getProjects(), []),
  ]);
  const catalog = catalogResult && typeof catalogResult === "object" ? (catalogResult as Record<string, unknown>) : {};
  const terminalProjects = asList<Project>(catalog.projects);
  return { snapshot, projects: terminalProjects.length ? terminalProjects : asList<Project>(projectsResult) };
}

export function getRoleDefinition(role: Role): RoleDefinition {
  return getAuraRoleDefinition(role);
}

export async function getAiSuggestion(params: {
  role: Role;
  command: string;
  businessSummary: string;
}): Promise<AiSuggestionData> {
  const roleMap = {
    manager: "manager",
    reception: "receptionist",
    beautician: "beautician",
  } as const;
  const result = await sendAiChatMessage({
    role: roleMap[params.role],
    messages: [
      {
        role: "system",
        content:
          "你是 Ami Aura Lite 智能终端助手。只能基于已提供的 Ami_Core 业务数据做简短解释、风险提示和下一步建议，不要编造客户、订单、库存、排班等事实。",
      },
      {
        role: "user",
        content: `用户指令：${params.command}\nAmi_Core 数据摘要：${params.businessSummary}\n请用 3 条以内给出门店一线人员能直接执行的建议。`,
      },
    ],
    context: {
      source: "Ami_Core",
      businessSummary: params.businessSummary,
    },
  });

  return {
    title: "Ami 建议",
    text: result.text,
    source: "Ami AI",
  };
}

function isLowStock(item: { status?: string; currentStock?: number; safetyStock?: number }) {
  return item.status === "低库存" || item.status === "缺货" || item.status === "浣庡簱瀛?" || item.status === "缂鸿揣" || ((item.currentStock ?? 0) <= (item.safetyStock ?? 0));
}

function lowStockCount(items: Array<{ status?: string; currentStock?: number; safetyStock?: number }>) {
  return items.filter(isLowStock).length;
}

export async function getManagerDashboard(): Promise<DashboardCardData> {
  const session = await getAuraBootstrapSession();
  const storeName = session.storeName;
  try {
    return normalizeManagerDashboard((await fetchCachedRoleDashboard()).manager, storeName);
  } catch (err) {
    console.warn("Ami Aura Lite 聚合经营数据加载失败，降级到轻量 Core 查询", err);
  }

  const { bootstrap, storeId } = await getAuraBootstrapSession();
  const today = getTodayRange().today;
  const [customersPage, reservationsPage, terminalReservationsResult, stockPage, cardsResult, ordersPage, beauticiansResult] =
    await Promise.all([
      optionalCoreCall("客户分页数据", () => getCustomersPaginated({ page: 1, pageSize: 1, storeName }), { items: [], data: [], total: 0, page: 1, pageSize: 1 }),
      optionalCoreCall("预约分页数据", () => getReservationsPaginated({ page: 1, pageSize: 8, storeName }), { items: [], data: [], total: 0, page: 1, pageSize: 8 }),
      optionalCoreCall("终端今日预约", () => getTerminalReservations({ date: today, storeName }), []),
      optionalCoreCall("库存分页数据", () => getStockItemsPaginated({ page: 1, pageSize: 8, storeId }), { items: [], data: [], total: 0, page: 1, pageSize: 8 }),
      optionalCoreCall("卡项数据", () => getCards(), []),
      optionalCoreCall("商品订单分页数据", () => getProductOrdersPaginated({ page: 1, pageSize: 8 }), { items: [], data: [], total: 0, page: 1, pageSize: 8 }),
      optionalCoreCall("美容师数据", () => getBeauticians({ storeName }), []),
    ]);

  const terminalReservations = asList<CoreSnapshot["reservations"][number]>(terminalReservationsResult as unknown as CoreSnapshot["reservations"]);
  const reservations = terminalReservations.length
    ? terminalReservations
    : asList<CoreSnapshot["reservations"][number]>(reservationsPage);
  const todayReservations = reservations.filter((item) => isReservationOnDate(item, today));
  const selectedReservations = todayReservations.length ? todayReservations : reservations.slice(0, 5);
  const stockItems = asList<CoreSnapshot["stockItems"][number]>(stockPage);
  const lowStock = stockItems.filter(isLowStock);
  const orders = filterByStoreName(asList<CoreSnapshot["orders"][number]>(ordersPage), storeName);
  const totalRevenue = sum(orders, (order) => order.totalAmount);
  const cards = asList<CoreSnapshot["cards"][number]>(cardsResult);
  const beauticians = asList<CoreSnapshot["beauticians"][number]>(beauticiansResult);
  const topBeautician = beauticians[0];
  const customers = asList<CoreSnapshot["customers"][number]>(customersPage);
  const customerTotal = getTotal(customersPage, customers.length);
  const orderTotal = getTotal(ordersPage, orders.length);
  const lowStockTotal = getTotal(stockPage, lowStock.length);

  return {
    title: "店长经营驾驶舱",
    subtitle: bootstrap.currentStore?.name ?? "当前门店",
    summary: `当前门店 ${bootstrap.currentStore?.name ?? "未选择门店"} 已接入 Ami_Core 数据，优先关注经营、风险和员工协同。`,
    kpis: [
      { label: "客户总数", value: String(customerTotal) },
      { label: "预约待处理", value: String(selectedReservations.length) },
      { label: "门店订单", value: String(orderTotal) },
      { label: "低库存", value: String(lowStockTotal) },
      { label: "上架卡项", value: String(cards.length) },
      { label: "总营业额", value: `￥${totalRevenue.toLocaleString()}` },
    ],
    risks: [
      `${lowStockTotal || lowStockCount(lowStock)} 项库存需要优先补货`,
      `${selectedReservations.length} 个预约需要优先处理`,
      topBeautician ? `重点关注 ${topBeautician.name} 的排班与服务负载` : "当前暂无员工排班数据",
    ],
    highlights: [
      `客户总数 ${customerTotal}，已接入当前门店数据`,
      `订单合计 ${orderTotal} 笔，近期订单金额约 ￥${totalRevenue.toLocaleString()}`,
      `近期预约 ${selectedReservations.length} 条，门店经营节奏正常`,
      `当前上架卡项 ${cards.length} 个，可直接给前台和店长查看`,
    ],
  };
}

export async function getReceptionDashboard(): Promise<AppointmentCardData> {
  const { storeName } = await getAuraBootstrapSession();
  try {
    const reception = (await fetchCachedRoleDashboard()).reception;
    return normalizeReceptionDashboard(reception, storeName);
  } catch (err) {
    console.warn("Ami Aura Lite 聚合接待数据加载失败，降级到旧预约查询", err);
  }

  const snapshot = await loadCoreSnapshot();
  const today = getTodayRange().today;
  const items = snapshot.reservations.filter((item) => isReservationOnDate(item, today)).slice(0, 10);
  const selected = items.length ? items : snapshot.reservations.slice(0, 10);

  return {
    title: "今日接待工作台",
    subtitle: snapshot.store?.name ?? "接待中心",
    items: selected.map((item) => toAppointmentViewItem(snapshot, item as Record<string, any>)),
    summary: `当前共有 ${selected.length} 条预约待处理，核心动作是到店确认、核销、收银和打印。`,
  };
}

export interface AppointmentEditOptions {
  projects: Project[];
  beauticians: Beautician[];
}

export interface AppointmentCreateOptions extends AppointmentEditOptions {
  customers: CoreSnapshot["customers"];
}

export interface AppointmentCreateInput {
  customerId: number;
  appointmentTime: string;
  projectId: number;
  beauticianId: number;
  duration?: number;
  remark?: string;
}

export interface AppointmentUpdateInput {
  appointmentTime: string;
  projectId?: number;
  projectName?: string;
  beauticianId?: number;
  beauticianName?: string;
  duration?: number;
  remark?: string;
}

export async function getAppointmentEditOptions(): Promise<AppointmentEditOptions> {
  const { storeName } = await getAuraBootstrapSession();
  const [catalogResult, projects, beauticians] = await Promise.all([
    optionalCoreCall<unknown>("终端目录", () => getTerminalCatalogSync(), null),
    optionalCoreCall("项目数据", () => getProjects(), []),
    optionalCoreCall("美容师数据", () => getBeauticians(), []),
  ]);
  const catalog = catalogResult && typeof catalogResult === "object" ? (catalogResult as Record<string, unknown>) : {};
  const terminalProjects = asList<Project>(catalog.projects);
  const terminalBeauticians = asList<Beautician>(catalog.beauticians);
  const projectItems = terminalProjects.length ? terminalProjects : asList<Project>(projects);
  const beauticianItems = terminalBeauticians.length ? terminalBeauticians : asList<Beautician>(beauticians);

  return {
    projects: filterByStoreName(projectItems, storeName).filter((project) => project.status !== false),
    beauticians: filterByStoreName(beauticianItems, storeName).filter(
      (beautician) => !["离职", "绂昏亴", "inactive", "disabled"].includes(String(beautician.status)),
    ),
  };
}

export async function getAppointmentCreateOptions(): Promise<AppointmentCreateOptions> {
  const [snapshot, options] = await Promise.all([loadCoreSnapshot(), getAppointmentEditOptions()]);
  const today = getTodayRange().today;
  const customers = [...snapshot.customers].sort((left, right) => {
    const leftReservation = getCustomerReservation(snapshot, left.id, left.name);
    const rightReservation = getCustomerReservation(snapshot, right.id, right.name);
    const leftToday = leftReservation && isReservationOnDate(leftReservation, today) ? 1 : 0;
    const rightToday = rightReservation && isReservationOnDate(rightReservation, today) ? 1 : 0;
    return rightToday - leftToday;
  });

  return {
    customers,
    projects: options.projects,
    beauticians: options.beauticians,
  };
}

export async function createAppointmentFromTerminal(input: AppointmentCreateInput): Promise<OperationResultData> {
  const options = await getAppointmentCreateOptions();
  const customer = options.customers.find((item) => item.id === input.customerId);
  const project = options.projects.find((item) => item.id === input.projectId);
  const beautician = options.beauticians.find((item) => item.id === input.beauticianId);

  if (!customer) {
    throw new Error("请选择有效客户");
  }
  if (!project) {
    throw new Error("请选择有效项目");
  }
  if (!beautician) {
    throw new Error("请选择有效美容师");
  }

  const payload: TerminalReservationCreateRequest = {
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone || "",
    projectId: project.id,
    projectName: project.name,
    beauticianId: beautician.id,
    beauticianName: beautician.name,
    appointmentTime: input.appointmentTime,
    duration: input.duration || project.duration || 60,
    remark: input.remark,
  };
  const created = await createTerminalReservation(payload);
  clearRoleDashboardCache();

  return {
    title: "预约已创建",
    subtitle: created.storeName,
    status: "success",
    description: `${created.customerName} 的 ${created.projectName} 已预约到 ${formatAppointmentTime(created.appointmentTime)}，服务人员：${created.beauticianName}。`,
    nextSteps: [],
  };
}

export async function updateAppointmentFromTerminal(
  reservationId: number,
  input: AppointmentUpdateInput,
): Promise<OperationResultData> {
  const payload: TerminalReservationUpdateRequest = {
    appointmentTime: input.appointmentTime,
    projectId: input.projectId,
    projectName: input.projectName,
    beauticianId: input.beauticianId,
    beauticianName: input.beauticianName,
    duration: input.duration,
    remark: input.remark,
  };
  const updated = await updateTerminalReservation(reservationId, payload);
  clearRoleDashboardCache();

  return {
    title: "预约已修改",
    subtitle: updated.storeName,
    status: "success",
    description: `${updated.customerName} 的预约已改到 ${formatAppointmentTime(updated.appointmentTime)}，项目：${updated.projectName}，服务人员：${updated.beauticianName}。`,
    nextSteps: [],
  };
}

export async function confirmAppointmentFromTerminal(reservationId: number): Promise<OperationResultData> {
  const updated = await confirmTerminalReservation(reservationId);
  clearRoleDashboardCache();
  return {
    title: "预约已确认",
    subtitle: updated.storeName,
    status: "success",
    description: `${updated.customerName} 的 ${updated.projectName} 已确认，预约时间：${formatAppointmentTime(updated.appointmentTime)}。`,
    nextSteps: [],
  };
}

export async function checkInAppointmentFromTerminal(reservationId: number): Promise<OperationResultData> {
  const updated = await checkInTerminalReservation(reservationId);
  clearRoleDashboardCache();
  return {
    title: "客户已到店",
    subtitle: updated.storeName,
    status: "success",
    description: `${updated.customerName} 已确认到店，可继续核销、开单或通知美容师接待。`,
    nextSteps: [],
  };
}

export async function cancelAppointmentFromTerminal(
  reservationId: number,
  reason?: string,
): Promise<OperationResultData> {
  const updated = await cancelTerminalReservation(reservationId, reason);
  clearRoleDashboardCache();
  return {
    title: "预约已取消",
    subtitle: updated.storeName,
    status: "warning",
    description: `${updated.customerName} 的 ${updated.projectName} 已取消${reason ? `，原因：${reason}` : ""}。`,
    nextSteps: [],
  };
}

export async function getBeauticianDashboard(): Promise<StaffScheduleCardData> {
  const { bootstrap } = await getAuraBootstrapSession();
  try {
    const staff = asList<StaffScheduleCardData>((await fetchCachedRoleDashboard()).staff).map((item) =>
      normalizeStaffSchedule(item, bootstrap.currentStore?.name),
    );
    return staff[0] ?? buildEmptyBeauticianDashboard(bootstrap.currentStore?.name);
  } catch (err) {
    console.warn("Ami Aura Lite 聚合美容师数据加载失败，降级到旧排班查询", err);
  }

  const snapshot = await loadCoreSnapshot();
  const beautician = snapshot.beauticians[0];
  if (!beautician) return buildEmptyBeauticianDashboard(snapshot.store?.name);
  const { weekStart } = getTodayRange();
  const weekSlots = await getSchedule({ beauticianId: beautician.id, weekStart });
  const todaySlots = weekSlots[(new Date().getDay() + 6) % 7] ?? [];
  const busyCount = todaySlots.filter((slot) => !slot.available).length;
  const utilization = todaySlots.length ? `${Math.round((busyCount / todaySlots.length) * 100)}%` : "0%";

  return {
    title: "我的今日服务",
    subtitle: beautician.storeName,
    beautician,
    todaySlots,
    utilization,
    summary: `今日排班已从 Ami_Core 调入，共 ${todaySlots.length} 个时段，当前占用率 ${utilization}。`,
  };
}

export async function getStaffSchedules(): Promise<StaffScheduleCardData[]> {
  const { bootstrap } = await getAuraBootstrapSession();
  try {
    const staff = asList<StaffScheduleCardData>((await fetchCachedRoleDashboard()).staff).map((item) =>
      normalizeStaffSchedule(item, bootstrap.currentStore?.name),
    );
    return staff.length ? staff : [buildEmptyBeauticianDashboard(bootstrap.currentStore?.name)];
  } catch (err) {
    console.warn("Ami Aura Lite 聚合员工排班加载失败，降级到旧排班查询", err);
  }

  const snapshot = await loadCoreSnapshot();
  const { weekStart } = getTodayRange();
  const todayIndex = (new Date().getDay() + 6) % 7;

  if (!snapshot.beauticians.length) {
    return [buildEmptyBeauticianDashboard(snapshot.store?.name)];
  }

  return Promise.all(
    snapshot.beauticians.slice(0, 6).map(async (beautician) => {
      const weekSlots = await getSchedule({ beauticianId: beautician.id, weekStart });
      const todaySlots = weekSlots[todayIndex] ?? [];
      const busyCount = todaySlots.filter((slot) => !slot.available).length;
      const utilization = todaySlots.length ? `${Math.round((busyCount / todaySlots.length) * 100)}%` : "0%";
      return {
        title: "员工当天排班",
        subtitle: beautician.storeName,
        beautician,
        todaySlots,
        utilization,
        summary: `${beautician.name} 今日共有 ${todaySlots.length} 个排班时段，占用率 ${utilization}。`,
      };
    }),
  );
}

export async function getCustomerGrowthCandidates(): Promise<CustomerCardData[]> {
  const snapshot = await loadCoreSnapshot();
  const candidates = [...snapshot.customers]
    .sort((a, b) => b.totalSpent - a.totalSpent || new Date(a.lastVisitDate).getTime() - new Date(b.lastVisitDate).getTime())
    .slice(0, 6);

  return candidates.map((customer) => ({
    customer,
    summary: `${customer.name} 属于 ${customer.memberLevel}，建议结合最近到店与消费节奏安排跟进。`,
    reasons: [
      `累计消费 ￥${customer.totalSpent.toLocaleString()}`,
      `到店 ${customer.visitCount} 次`,
      customer.tags?.length ? `标签：${customer.tags.join("、")}` : "暂无标签",
    ],
    recentVisits: [customer.lastVisitDate],
  }));
}

export async function getAppointments(): Promise<AppointmentCardData> {
  return getReceptionDashboard();
}

function getCustomerReservation(snapshot: CoreSnapshot, customerId: number, customerName: string) {
  const today = getTodayRange().today;
  const related = snapshot.reservations.filter((reservation) => {
    const item = reservation as Record<string, any>;
    const reservationCustomer = findCustomerForReservation(snapshot, item);
    const reservationName = item.customerName ?? item.userName ?? "";
    const sameCustomer = reservationCustomer?.id === customerId || reservationName === customerName || reservationName.includes(customerName);
    return sameCustomer;
  }) as Array<Record<string, any>>;

  return related.find((reservation) => isReservationOnDate(reservation, today)) ?? related[0];
}

function findProjectForCardProject(projects: Project[], projectName: string, index: number) {
  return (
    projects.find((project) => project.name === projectName) ??
    projects.find((project) => projectName.includes(project.name) || project.name.includes(projectName)) ??
    projects[index % Math.max(projects.length, 1)]
  );
}

function buildCustomerSelectItems(snapshot: CoreSnapshot) {
  const customerMap = new Map<number, { customer: CoreSnapshot["customers"][number]; reservation?: Record<string, any> }>();
  asList<CoreSnapshot["reservations"][number]>(snapshot.reservations).forEach((reservation) => {
    const item = reservation as Record<string, any>;
    const customer = findCustomerForReservation(snapshot, item);
    if (customer && !customerMap.has(customer.id)) {
      customerMap.set(customer.id, { customer, reservation: item });
    }
  });
  asList<CoreSnapshot["customers"][number]>(snapshot.customers).slice(0, 30).forEach((customer) => {
    if (!customerMap.has(customer.id)) {
      customerMap.set(customer.id, { customer });
    }
  });

  return Array.from(customerMap.values()).map(({ customer, reservation }) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    memberLevel: customer.memberLevel,
    tags: customer.tags?.slice(0, 3) ?? [],
    isAppointedToday: Boolean(reservation),
    appointmentTime: reservation ? formatTimeOnly(reservation.appointmentTime ?? getReservationTime(reservation)) : undefined,
  }));
}

export async function getCardVerificationFlow(): Promise<CardVerificationFlowData> {
  const { snapshot } = await loadCardVerificationSnapshot();
  const appointmentCustomers = asList<CoreSnapshot["reservations"][number]>(snapshot.reservations)
    .map((reservation) => {
      const item = reservation as Record<string, any>;
      const customer = findCustomerForReservation(snapshot, item);
      if (!customer) return null;
      return { customer, reservation: item };
    })
    .filter(Boolean) as Array<{ customer: CoreSnapshot["customers"][number]; reservation: Record<string, any> }>;

  const customerMap = new Map<number, { customer: CoreSnapshot["customers"][number]; reservation?: Record<string, any> }>();
  appointmentCustomers.forEach((item) => customerMap.set(item.customer.id, item));
  asList<CoreSnapshot["customers"][number]>(snapshot.customers).slice(0, 30).forEach((customer) => {
    if (!customerMap.has(customer.id)) {
      customerMap.set(customer.id, { customer });
    }
  });

  const customers = Array.from(customerMap.values()).map(({ customer, reservation }) => {
    const matchedReservation = reservation ?? getCustomerReservation(snapshot, customer.id, customer.name);
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      memberLevel: customer.memberLevel,
      tags: customer.tags?.slice(0, 3) ?? [],
      profileLabel: customer.skinCondition || customer.source || "画像待补充",
      lastVisitDate: customer.lastVisitDate || "暂无到店记录",
      isAppointedToday: Boolean(matchedReservation),
      appointmentTime: matchedReservation ? formatTimeOnly(matchedReservation.appointmentTime ?? getReservationTime(matchedReservation)) : undefined,
      appointmentProjectName: matchedReservation?.projectName,
    };
  });

  return {
    title: "次卡核销",
    subtitle: snapshot.store?.name ?? "当前门店",
    source: "Ami_Core 预约、客户、卡项数据",
    generatedAt: format(new Date(), "yyyy-MM-dd HH:mm"),
    customers: customers.sort((a, b) => Number(b.isAppointedToday) - Number(a.isAppointedToday)),
  };
}

export async function getCardVerificationCards(customerId: number) {
  const { snapshot, projects } = await loadCardVerificationSnapshot();
  const customer = snapshot.customers.find((item) => item.id === customerId);
  if (!customer) throw new Error("未找到客户，无法查询可核销次卡");

  const reservation = getCustomerReservation(snapshot, customer.id, customer.name);
  const customerCards = asList<TerminalCustomerCard>(await getTerminalCustomerCards(customer.id));
  const activeCards = customerCards.filter((card) => card.status === "active" && card.remainingTimes > 0);

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    memberLevel: customer.memberLevel,
    tags: customer.tags?.slice(0, 3) ?? [],
    profileLabel: customer.skinCondition || customer.source || "画像待补充",
    lastVisitDate: customer.lastVisitDate || "暂无到店记录",
    isAppointedToday: Boolean(reservation),
    appointmentTime: reservation ? formatTimeOnly(reservation.appointmentTime ?? getReservationTime(reservation)) : undefined,
    appointmentProjectName: reservation?.projectName,
    cards: activeCards.map((card: TerminalCustomerCard) => ({
      customerCardId: card.id,
      cardName: card.cardName,
      totalTimes: card.totalTimes,
      remainingTimes: card.remainingTimes,
      expiryDate: card.expiryDate,
      status: card.status,
      projects: asList<string>(card.applicableProjects).map((projectName, index) => {
        const project = findProjectForCardProject(projects, projectName, index);
        return {
          id: project?.id ?? 101,
          name: project?.name ?? projectName,
          times: 1,
          remainingAfterUse: Math.max(0, card.remainingTimes - 1),
        };
      }),
    })),
  };
}

export async function confirmCardVerification(input: CardVerificationConfirmInput): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const beautician = snapshot.beauticians[0];
  const record = await verifyTerminalCardUsage({
    customerCardId: input.customerCardId,
    projectId: input.projectId,
    times: input.times,
    beauticianId: beautician?.id ?? 0,
  });

  return {
    title: "核销成功",
    subtitle: snapshot.store?.name ?? "当前门店",
    status: "success",
    description: `${record.customerName} 已核销 ${record.cardName}，项目：${record.projectName || input.projectName}，扣减 ${record.times} 次，剩余 ${record.remainingTimes} 次。`,
    nextSteps: ["完成服务记录", "打印核销凭证", "预约下次护理"],
  };
}

export async function getCashierFlow(): Promise<CashierFlowData> {
  const [snapshot, catalogResult, projectsResult, productsResult] = await Promise.all([
    loadCoreSnapshot(),
    optionalCoreCall<unknown>("终端目录", () => getTerminalCatalogSync(), null),
    optionalCoreCall("项目数据", () => getProjects(), []),
    optionalCoreCall("商品数据", () => getProducts({ status: "在售" }), []),
  ]);
  const catalog = catalogResult && typeof catalogResult === "object" ? (catalogResult as Record<string, unknown>) : {};
  const terminalProjects = asList<Project>(catalog.projects);
  const terminalProducts = asList<Awaited<ReturnType<typeof getProducts>>[number]>(catalog.products);
  const projects = terminalProjects.length ? terminalProjects : asList<Project>(projectsResult);
  const products = terminalProducts.length ? terminalProducts : asList<Awaited<ReturnType<typeof getProducts>>[number]>(productsResult);

  return {
    title: "收银开单",
    subtitle: snapshot.store?.name ?? "当前门店",
    source: "Ami_Core 客户、项目、商品数据",
    generatedAt: format(new Date(), "yyyy-MM-dd HH:mm"),
    customers: buildCustomerSelectItems(snapshot),
    catalog: [
      ...projects
        .filter((project) => project.status)
        .slice(0, 8)
        .map((project) => ({
          id: `project-${project.id}`,
          itemType: "project" as const,
          itemId: project.id,
          name: project.name,
          category: project.type,
          price: project.price,
        })),
      ...products
        .filter((product) => product.status === "在售")
        .slice(0, 8)
        .map((product) => ({
          id: `product-${product.id}`,
          itemType: "product" as const,
          itemId: product.id,
          name: product.name,
          category: product.categoryName,
          price: product.retailPrice,
        })),
    ],
  };
}

export async function confirmCashierPayment(input: CashierConfirmInput): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const customer = snapshot.customers.find((item) => item.id === input.customerId);
  if (!customer) throw new Error("未找到客户，无法收银");

  const items = asList<CashierConfirmInput["items"][number]>(input.items).map((item) => ({
    itemType: item.itemType,
    itemId: item.itemId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    subtotal: item.quantity * item.unitPrice,
  }));
  const subtotal = sum(items, (item) => item.subtotal);
  const discountAmount = Math.min(subtotal, Math.max(0, input.discountAmount || 0));
  const paidAmount = Math.max(0, subtotal - discountAmount);
  const order = await createTerminalCashierOrder({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    items,
    discountAmount,
    paymentMethod: input.paymentMethod,
    remark: discountAmount > 0 ? `Ami Aura Lite 收银优惠 ￥${discountAmount.toLocaleString()}` : "Ami Aura Lite 收银开单",
  });
  const paid =
    order.status === "completed" || order.status === "paid"
      ? order
      : await completeTerminalPayment(order.id, {
          paymentMethod: input.paymentMethod,
          paidAmount,
        });

  return {
    title: "收银完成",
    subtitle: paid.storeName,
    status: "success",
    description: `${customer.name} 的收银单 ${paid.orderNo} 已完成，${items.length} 个项目/商品，应收 ￥${subtotal.toLocaleString()}，优惠 ￥${discountAmount.toLocaleString()}，实收 ￥${paidAmount.toLocaleString()}。`,
    nextSteps: [],
    receipt: {
      sourceType: "cashier_order",
      sourceId: paid.id,
      receiptNo: paid.orderNo,
      storeName: paid.storeName,
      customerName: customer.name,
      customerPhone: customer.phone,
      cashierName: snapshot.user?.name ?? snapshot.user?.username,
      paymentMethod: input.paymentMethod,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      subtotalAmount: subtotal,
      discountAmount,
      paidAmount,
      createdAt: paid.paidAt ?? paid.completedAt ?? paid.createdAt ?? new Date().toISOString(),
    },
  };
}

export async function getCardOpeningFlow(): Promise<CardOpeningFlowData> {
  const snapshot = await loadCoreSnapshot();
  const cards = asList<CoreSnapshot["cards"][number]>(snapshot.cards);
  return {
    title: "办卡开单",
    subtitle: snapshot.store?.name ?? "当前门店",
    source: "Ami_Core 客户、次卡数据",
    generatedAt: format(new Date(), "yyyy-MM-dd HH:mm"),
    customers: buildCustomerSelectItems(snapshot),
    cards: cards
      .filter((card) => card.status === "上架")
      .map((card) => ({
        id: card.id,
        name: card.name,
        type: card.type,
        totalTimes: card.totalTimes,
        price: card.price,
        validDays: card.validDays,
        projects: asList<{ projectName: string }>(card.projects).map((project) => project.projectName),
      })),
  };
}

export async function confirmCardOpening(input: CardOpeningConfirmInput): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const customer = snapshot.customers.find((item) => item.id === input.customerId);
  const card = snapshot.cards.find((item) => item.id === input.cardId);
  if (!customer) throw new Error("未找到客户，无法办卡");
  if (!card) throw new Error("未找到次卡，无法办卡");

  const discountAmount = Math.min(card.price, Math.max(0, input.discountAmount || 0));
  const amount = Math.max(0, card.price - discountAmount);
  const order = await createTerminalCardOrder({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    cardId: card.id,
    cardName: card.name,
    amount,
    totalTimes: card.totalTimes,
    discountAmount,
    giftProjects: input.giftProjects,
    paymentMethod: input.paymentMethod,
    remark: asList<string>(input.giftProjects).length ? `赠送项目：${asList<string>(input.giftProjects).join("、")}` : "Ami Aura Lite 办卡",
  });

  return {
    title: "开卡完成",
    subtitle: order.storeName,
    status: "success",
    description: `${customer.name} 已办理 ${card.name}，应收 ￥${card.price.toLocaleString()}，优惠 ￥${discountAmount.toLocaleString()}，实收 ￥${amount.toLocaleString()}，剩余 ${order.remainingTimes} 次${asList<string>(input.giftProjects).length ? `，赠送：${asList<string>(input.giftProjects).join("、")}` : ""}。`,
    nextSteps: [],
  };
}

export async function getRegistrationFlow(): Promise<RegistrationFlowData> {
  const snapshot = await loadCoreSnapshot();
  return {
    title: "客户登记",
    subtitle: snapshot.store?.name ?? "当前门店",
    source: "Ami_Core 客户档案、面部检测数据",
    generatedAt: format(new Date(), "yyyy-MM-dd HH:mm"),
  };
}

function skinMetricsToTerminalMetrics(metrics: Record<string, number>): TerminalSkinMetric[] {
  const meta: Record<string, { label: string; unit?: string }> = {
    moisture: { label: "水分", unit: "%" },
    oil: { label: "油脂", unit: "%" },
    elasticity: { label: "弹性", unit: "分" },
    sensitivity: { label: "敏感", unit: "分" },
    pore: { label: "毛孔", unit: "分" },
    pigmentation: { label: "色沉", unit: "分" },
  };

  return Object.entries(metrics).map(([key, value]) => ({
    key,
    label: meta[key]?.label ?? key,
    value,
    unit: meta[key]?.unit,
    score: typeof value === "number" ? value : undefined,
  }));
}

export async function analyzeRegistrationSkinPhoto(input: {
  imageDataUrl: string;
  customerName?: string;
}): Promise<RegistrationSkinAnalysisData> {
  const snapshot = await loadCoreSnapshot();
  const result = await analyzeSkinPhoto({
    imageDataUrl: input.imageDataUrl,
    customerName: input.customerName,
    storeName: snapshot.store?.name ?? "当前门店",
    capturedAt: new Date().toISOString(),
  });

  return {
    analyzeId: result.id,
    skinType: result.skinType,
    skinStatus: result.skinStatus,
    mainProblems: result.mainProblems,
    recommendationText: result.recommendedCare || result.explanation,
    metrics: skinMetricsToTerminalMetrics(result.metrics),
    imageUrl: result.imageUrl,
    instrument: result.instrument,
    confidence: result.confidence,
    capturedAt: result.capturedAt,
    explanation: result.explanation,
  };
}

export async function confirmRegistration(input: RegistrationConfirmInput): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const customer = await quickCreateTerminalCustomer({
    name: input.name,
    phone: input.phone,
    gender: input.gender,
    storeName: snapshot.store?.name ?? "当前门店",
    source: input.source,
    birthday: input.birthday,
    skinCondition: `${input.skinType}，${input.skinStatus}`,
    tags: [input.skinType, input.source].filter(Boolean),
    remark: input.remark,
  });

  const skinTest = await createTerminalSkinTest({
    customerId: customer.id,
    images: input.skinImageUrl ? [input.skinImageUrl] : input.cameraCaptured ? ["camera://aura-lite-face-scan"] : [],
    metrics: input.skinMetrics?.length
      ? input.skinMetrics
      : [
          { key: "moisture", label: "水分", value: 62, unit: "%", score: 76 },
          { key: "oil", label: "油脂", value: 34, unit: "%", score: 72 },
        ],
    skinType: input.skinType,
    skinStatus: input.skinStatus,
    mainProblems: input.mainProblems,
    recommendationText: input.skinAnalyzeId
      ? `${input.recommendationText}\n检测来源：${input.skinInstrument ?? "Ami AI 面部检测"}，置信度 ${Math.round((input.skinConfidence ?? 0) * 100)}%，检测ID ${input.skinAnalyzeId}`
      : input.recommendationText,
  });

  return {
    title: "登记完成",
    subtitle: customer.storeName,
    status: "success",
    description: `${customer.name} 已写入 Ami_Core 客户档案，手机号 ${customer.phone}，面部检测记录 ${skinTest.id} 已生成，肤质：${skinTest.skinType}，重点问题：${skinTest.mainProblems}。`,
    nextSteps: [],
  };
}

export async function getRechargeFlow(): Promise<RechargeFlowData> {
  const snapshot = await loadCoreSnapshot();
  const cards = asList<CoreSnapshot["cards"][number]>(snapshot.cards);
  return {
    title: "会员充值",
    subtitle: snapshot.store?.name ?? "当前门店",
    source: "Ami_Core 客户、充值订单数据",
    generatedAt: format(new Date(), "yyyy-MM-dd HH:mm"),
    customers: buildCustomerSelectItems(snapshot),
    giftProjects: cards.flatMap((card) => asList<{ projectName: string }>(card.projects).map((project) => project.projectName)).slice(0, 8),
  };
}

export async function confirmRecharge(input: RechargeConfirmInput): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const customer = snapshot.customers.find((item) => item.id === input.customerId);
  if (!customer) throw new Error("未找到客户，无法充值");

  const order = await createTerminalRechargeOrder({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    amount: input.amount,
    giftAmount: input.giftAmount,
    giftProjects: input.giftProjects,
    paymentMethod: input.paymentMethod,
    remark: asList<string>(input.giftProjects).length ? `赠送项目：${asList<string>(input.giftProjects).join("、")}` : "Ami Aura Lite 充值",
  });

  return {
    title: "充值完成",
    subtitle: order.storeName,
    status: "success",
    description: `${customer.name} 已充值 ￥${order.amount.toLocaleString()}，优惠/赠送金额 ￥${order.giftAmount.toLocaleString()}${asList<string>(input.giftProjects).length ? `，赠送项目：${asList<string>(input.giftProjects).join("、")}` : ""}${typeof order.cashBalance === "number" ? `，当前储值余额 ￥${order.cashBalance.toLocaleString()}，赠送余额 ￥${(order.giftBalance ?? 0).toLocaleString()}` : ""}。`,
    nextSteps: [],
  };
}

export async function updateAppointmentAction(action: string): Promise<OperationResultData> {
  const [, operation, idText] = action.split(":");
  const reservationId = Number(idText);
  if (!reservationId || Number.isNaN(reservationId)) {
    throw new Error("缺少预约编号，无法执行预约操作");
  }

  const snapshot = await loadCoreSnapshot();
  const reservation = snapshot.reservations.find((item) => Number((item as any).id) === reservationId) as Record<string, any> | undefined;
  const appointmentTime = reservation?.appointmentTime ?? (reservation ? getReservationTime(reservation) : undefined);
  const customerName = reservation?.customerName ?? reservation?.userName ?? "客户";
  const projectName = reservation?.projectName ?? "预约项目";
  const storeName = snapshot.store?.name ?? reservation?.storeName ?? "当前门店";

  if (operation === "confirm") {
    const updated = await updateTerminalReservation(reservationId, { status: "confirmed" });
    return {
      title: "预约已确认",
      subtitle: updated.storeName ?? storeName,
      status: "success",
      description: `${updated.customerName ?? customerName} 的 ${updated.projectName ?? projectName} 已确认，预约时间：${formatAppointmentTime(updated.appointmentTime ?? appointmentTime)}。`,
      nextSteps: ["提醒客户准时到店", "到店后确认", "需要时调整时间"],
    };
  }

  if (operation === "reschedule") {
    const nextTime = addMinutesToAppointment(appointmentTime, 30);
    const updated = await updateTerminalReservation(reservationId, {
      appointmentTime: nextTime,
      remark: "Ami Aura Lite 前台快捷改期",
    });
    return {
      title: "预约时间已修改",
      subtitle: updated.storeName ?? storeName,
      status: "success",
      description: `${updated.customerName ?? customerName} 的预约已改到 ${formatAppointmentTime(updated.appointmentTime ?? nextTime)}，请同步告知客户。`,
      nextSteps: ["通知客户新时间", "确认美容师排班", "刷新今日预约"],
    };
  }

  if (operation === "cancel") {
    const updated = await updateTerminalReservation(reservationId, {
      status: "cancelled",
      remark: "Ami Aura Lite 前台取消预约",
    });
    return {
      title: "预约已取消",
      subtitle: updated.storeName ?? storeName,
      status: "warning",
      description: `${updated.customerName ?? customerName} 的 ${updated.projectName ?? projectName} 已取消。`,
      nextSteps: ["记录取消原因", "释放美容师时段", "必要时重新预约"],
    };
  }

  if (operation === "checkin") {
    const updated = await checkInTerminalReservation(reservationId);
    return {
      title: "客户已到店",
      subtitle: updated.storeName ?? storeName,
      status: "success",
      description: `${updated.customerName ?? customerName} 已确认到店，可继续核销、开单或通知美容师接待。`,
      nextSteps: ["开始核销", "通知美容师", "需要时前台收银"],
    };
  }

  throw new Error("未知的预约操作");
}

export async function getCustomerCard(keyword?: string): Promise<CustomerCardData | null> {
  const snapshot = await loadCoreSnapshot();
  const normalized = keyword?.trim();
  const customer =
    snapshot.customers.find((item) => item.name.includes(normalized ?? "")) ??
    snapshot.customers.find((item) => item.phone.includes(normalized ?? "")) ??
    snapshot.customers[0];

  if (!customer) return null;

  const recentVisits = [
    customer.lastVisitDate,
    ...snapshot.orders
      .filter((order) => order.customerName.includes(customer.name))
      .slice(0, 2)
      .map((order) => `${order.createdAt} · ￥${order.totalAmount}`),
  ];

  return {
    customer,
    summary: `${customer.name} 的档案来自 Ami_Core，当前会员等级 ${customer.memberLevel}，可用于接待和服务跟进。`,
    reasons: [
      `累计消费 ￥${customer.totalSpent.toLocaleString()}`,
      `到店 ${customer.visitCount} 次`,
      `最近到店 ${customer.lastVisitDate}`,
    ],
    recentVisits,
  };
}

export async function getInventoryAlerts(): Promise<InventoryAlertCardData> {
  const snapshot = await loadCoreSnapshot();
  const lowStock = snapshot.stockItems.filter(isLowStock);

  return {
    title: "库存预警",
    subtitle: snapshot.store?.name ?? "库存中心",
    lowStock,
    expiring: snapshot.expiringProducts,
    replenishment: snapshot.replenishment,
    summary: `当前有 ${lowStock.length} 项库存预警，${snapshot.expiringProducts.length} 项临期预警。`,
  };
}
export async function getOperationResult(action: string): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const customer = snapshot.customers[0];
  const beautician = snapshot.beauticians[0];
  const card = snapshot.cards[0];
  const projectName = snapshot.reservations[0]?.projectName ?? card?.projects?.[0]?.projectName ?? "基础护理";
  const storeName = snapshot.store?.name ?? "当前门店";

  if (!customer && action !== "operation.print") {
    return {
      title: "暂无可操作客户",
      subtitle: storeName,
      status: "error",
      description: "Ami_Core 当前门店没有返回客户数据，暂时不能执行提交类操作。",
      nextSteps: ["检查当前门店", "确认客户数据权限", "刷新后重试"],
    };
  }

  switch (action) {
    case "reception.appointments": {
      const reservation = await createTerminalReservation({
        customerId: customer?.id,
        customerName: customer?.name ?? "到店客户",
        customerPhone: customer?.phone ?? "",
        projectName,
        beauticianId: beautician?.id,
        beauticianName: beautician?.name ?? "待分配",
        appointmentTime: `${getTodayRange().today} 15:00:00`,
        duration: 60,
        remark: "Ami Aura Lite 快捷预约",
      });
      return {
        title: "预约已创建",
        subtitle: reservation.storeName,
        status: "success",
        description: `${reservation.customerName} 的 ${reservation.projectName} 已预约到 ${reservation.appointmentTime}，服务人员：${reservation.beauticianName}。`,
        nextSteps: ["提醒客户到店", "到店后确认", "必要时调整美容师"],
      };
    }
    case "operation.register": {
      const created = await quickCreateTerminalCustomer({
        name: `Aura客户${String(Date.now()).slice(-4)}`,
        phone: `139${String(Date.now()).slice(-8)}`,
        gender: "女",
        storeName,
        source: "Ami Aura Lite",
      });
      return {
        title: "客户登记成功",
        subtitle: created.storeName,
        status: "success",
        description: `${created.name} 已通过 Ami_Core 终端快速登记接口写入，可继续补充标签、生日和护理偏好。`,
        nextSteps: ["补充客户资料", "创建预约", "推荐适合卡项"],
      };
    }
    case "operation.card": {
      if (!card) throw new Error("当前门店暂无可售卡项");
      const order = await createTerminalCardOrder({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        cardId: card.id,
        cardName: card.name,
        amount: card.price,
        totalTimes: card.totalTimes,
        paymentMethod: "微信",
      });
      return {
        title: "办卡成功",
        subtitle: order.storeName,
        status: "success",
        description: `${order.customerName} 已办理 ${order.cardName}，金额 ￥${order.amount.toLocaleString()}，剩余 ${order.remainingTimes} 次。`,
        nextSteps: ["打印办卡凭证", "提醒有效期", "预约首次服务"],
      };
    }
    case "operation.recharge": {
      const order = await createTerminalRechargeOrder({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        amount: 1000,
        giftAmount: 100,
        paymentMethod: "微信",
        remark: "Ami Aura Lite 快捷充值",
      });
      return {
        title: "充值成功",
        subtitle: order.storeName,
        status: "success",
        description: `${order.customerName} 已充值 ￥${order.amount.toLocaleString()}，赠送 ￥${order.giftAmount.toLocaleString()}。`,
        nextSteps: ["打印充值小票", "同步会员余额", "提醒客户可用权益"],
      };
    }
    case "operation.verify": {
      const cards = await getTerminalCustomerCards(customer.id);
      const customerCard = cards[0];
      if (!customerCard) {
        return {
          title: "暂无可核销卡项",
          subtitle: storeName,
          status: "error",
          description: `${customer.name} 当前没有可核销的有效卡项，不能执行核销。`,
          nextSteps: ["查询其他客户", "办理新卡", "改用收银"],
        };
      }
      const record = await verifyTerminalCardUsage({
        customerCardId: customerCard.id,
        projectId: 101,
        times: 1,
        beauticianId: beautician?.id ?? 0,
      });
      return {
        title: "核销成功",
        subtitle: storeName,
        status: "success",
        description: `${record.customerName} 已核销 ${record.cardName}，项目：${record.projectName}，剩余 ${record.remainingTimes} 次。`,
        nextSteps: ["完成服务记录", "打印核销凭证", "预约下次护理"],
      };
    }
    case "operation.cashier": {
      const order = await createTerminalCashierOrder({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        items: [
          {
            itemType: "project",
            itemId: 101,
            name: projectName,
            quantity: 1,
            unitPrice: 199,
            subtotal: 199,
          },
        ],
        paymentMethod: "微信",
        remark: "Ami Aura Lite 快捷收银",
      });
      const paid = await completeTerminalPayment(order.id, { paymentMethod: "微信", paidAmount: order.totalAmount });
      return {
        title: "收银完成",
        subtitle: paid.storeName,
        status: "success",
        description: `${paid.customerName} 的收银单 ${paid.orderNo} 已完成，实收 ￥${paid.totalAmount.toLocaleString()}。`,
        nextSteps: ["打印小票", "刷新经营数据", "提醒客户护理注意事项"],
        receipt: {
          sourceType: "cashier_order",
          sourceId: paid.id,
          receiptNo: paid.orderNo,
          storeName: paid.storeName,
          customerName: paid.customerName,
          paymentMethod: paid.paymentMethod ?? "微信",
          items: order.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })),
          subtotalAmount: order.totalAmount,
          discountAmount: 0,
          paidAmount: paid.totalAmount,
          createdAt: paid.paidAt ?? paid.completedAt ?? paid.createdAt ?? new Date().toISOString(),
        },
      };
    }
    case "operation.service-complete": {
      const tasks = await getTerminalServiceTasks({ date: getTodayRange().today });
      const targetTask = tasks[0];
      if (!targetTask) {
        return {
          title: "暂无服务任务",
          subtitle: storeName,
          status: "error",
          description: "Ami_Core 当前没有返回可完成的服务任务。",
          nextSteps: ["查看我的预约", "确认客户到店", "联系前台创建任务"],
        };
      }
      const completed = await completeTerminalServiceTask(targetTask.id, {
        beauticianId: targetTask.beauticianId,
        result: "服务已完成",
        remark: "Ami Aura Lite 快捷完成服务",
        consumptionItems: targetTask.consumptionItems,
      });
      return {
        title: "服务已完成",
        subtitle: completed.storeName,
        status: "success",
        description: `${completed.customerName} 的 ${completed.projectName} 已标记完成，服务人员：${completed.beauticianName}。`,
        nextSteps: ["补充护理备注", "转前台收银", "预约下次服务"],
      };
    }
    case "operation.print": {
      const job = await createTerminalPrintJob({
        sourceType: "custom",
        title: "Ami Aura Lite 小票",
        content: `${storeName}\n打印时间：${new Date().toLocaleString()}`,
        copies: 1,
      });
      return {
        title: "打印任务已完成",
        subtitle: job.storeName,
        status: "success",
        description: `打印任务 ${job.jobNo} 已提交并完成，共 ${job.copies} 份。`,
        nextSteps: ["查看小票", "需要时补打", "返回接待工作台"],
      };
    }
    default:
      return {
        title: "操作说明",
        subtitle: storeName,
        status: "success",
        description: "当前终端已切到 Ami_Core 数据层，具体业务动作会按权限调用 Core 终端接口。",
        nextSteps: ["查看查询结果", "确认业务动作", "继续接入 Core 接口"],
      };
  }
}


