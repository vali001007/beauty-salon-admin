import { format, startOfWeek } from 'date-fns';
import { formatBusinessDateTime } from '../utils/businessTime';
import {
  getBeauticians,
  getCards,
  getSaleCards,
  getCustomers,
  getCustomersPaginated,
  getProjects,
  getProducts,
  getCardOrdersPaginated,
  getProductOrders,
  getProductOrdersPaginated,
  getProjectOrdersPaginated,
  getReservationsPaginated,
  getWeeklySchedules,
  getStockItemsPaginated,
  getCurrentTerminalBeauticianDashboard,
  getTerminalBootstrap,
  getTerminalBeauticianCommission,
  closeTerminalCashierShift,
  getTerminalCatalogSync,
  getTerminalCurrentCashierShift,
  getTerminalInventoryAlertsDashboard,
  getTerminalInventoryAlerts,
  getTerminalInventoryStock,
  getTerminalBom,
  getTerminalManagerDashboard,
  getTerminalCustomerGrowthDashboard,
  getTerminalCustomerGrowthCandidates,
  getTerminalCustomerSelectContext,
  getTerminalFollowUpTasks,
  getTerminalCashierContext,
  getTerminalCardVerificationContext,
  getCurrentTerminalBeauticianCustomers,
  getCurrentTerminalBeauticianTasks,
  getTerminalRoleDashboard,
  getTerminalStaffSchedulesDashboard,
  getTerminalTodayReservationsDashboard,
  getTerminalReservations,
  getUserInfo,
  analyzeSkinPhoto,
  cancelTerminalReservation,
  confirmTerminalReservation,
  login,
  openTerminalCashierShift,
  checkInTerminalReservation,
  completeTerminalPayment,
  createTerminalCardOrder,
  createTerminalCashierOrder,
  createTerminalPrintJob,
  createTerminalRechargeOrder,
  getTerminalPrintableDocumentsToday,
  voidCardOrder,
  getProductOrderRefundPreview,
  refundProductOrder,
  createTerminalReservation,
  createTerminalServiceRecord,
  createTerminalSkinTest,
  createTerminalAutomationStrategy,
  enableTerminalAutomationStrategy,
  getTerminalAutomationExecutionDetail,
  getTerminalAutomationTemplates,
  getTerminalAutomationTodaySummary,
  previewTerminalAutomationStrategy,
  getTerminalCustomerCards,
  getTerminalCustomerSummary,
  getTerminalServiceTasks,
  markTerminalAutomationTouchFollowedUp,
  pauseTerminalAutomationStrategy,
  quickCreateTerminalCustomer,
  generateTerminalServiceAdvice,
  rescheduleTerminalReservation,
  runDueTerminalAutomations,
  runTerminalAutomationOnce,
  updateTerminalReservation,
  verifyTerminalCardUsage,
} from '@/api';
import { AURA_ROLE_LABELS, getAuraRoleDefinition, resolveAuraAvailableRoles, resolveAuraRole } from '@/config/aura';
import { useAuthStore } from '@/stores/authStore';
import { useStoreStore } from '@/stores/storeStore';
import {
  getActiveTerminalOperatorParams,
  resolveTerminalBootstrapParams,
  setActiveTerminalOperatorContext,
} from './terminalOperatorContext';
import type { AuraBootstrap, AuraRole, AuraTerminalUser } from '@/types/aura';
import type { Project } from '@/types/project';
import type { Beautician } from '@/types/beautician';
import type {
  TerminalCardUsageRecord,
  TerminalCustomerCard,
  TerminalContextCustomer,
  TerminalReservationCreateRequest,
  TerminalReservationUpdateRequest,
  TerminalBootstrapParams,
  TerminalFollowUpTask,
  TerminalRoleDashboard,
  TerminalAutomationStrategy,
  TerminalAutomationTodaySummary,
} from '@/types/terminal';
import type {
  AppointmentCardData,
  AppointmentViewItem,
  AiSuggestionData,
  BeauticianScheduleFlowData,
  AutomationDraftData,
  AutomationExecutionDetailData,
  AutomationPreviewData,
  AutomationTemplateData,
  AutomationTodaySummaryData,
  CardVerificationCardOption,
  CardVerificationConfirmInput,
  CardVerificationCustomer,
  CardVerificationFlowData,
  CardOpeningConfirmInput,
  CardOpeningFlowData,
  CoreDataStatus,
  CashierConfirmInput,
  CashierFlowData,
  CoreSnapshot,
  BeauticianCustomerGroupKey,
  BeauticianCustomerListData,
  BeauticianCustomerListGroup,
  BeauticianCustomerListItem,
  CustomerCardData,
  DashboardCardData,
  DashboardInsightItem,
  FollowUpTasksCardData,
  InventoryAlertCardData,
  OperationReceiptData,
  OperationResultData,
  PrintDocumentsData,
  RechargeConfirmInput,
  RechargeFlowData,
  RefundConfirmInput,
  RefundFlowData,
  RefundOrderOption,
  RegistrationConfirmInput,
  RegistrationFlowData,
  RegistrationSkinAnalysisData,
  Role,
  RoleDefinition,
  ServiceRecordConfirmInput,
  ServiceRecordFlowData,
  SessionContext,
  StaffScheduleCardData,
} from '../types';
import type { TerminalSkinMetric } from '@/types/terminal';
import {
  clearTerminalQueryCache,
  TERMINAL_QUERY_TTL,
  invalidateTerminalQueryPrefixes,
  terminalPrefetch,
  terminalQuery,
} from './terminalQueryClient';

function getTodayRange() {
  const now = new Date();
  return {
    today: format(now, 'yyyy-MM-dd'),
    weekStart: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  };
}

function sum<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((total, item) => total + pick(item), 0);
}

function toMoney(value: unknown): number {
  return Number(Number(value || 0).toFixed(2));
}

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== 'object') return [];

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
  if (record.items && typeof record.items === 'object') return asList<T>(record.items);
  if (record.data && typeof record.data === 'object') return asList<T>(record.data);
  return [];
}

function pickCustomerAvatarUrl(customer: unknown) {
  if (!customer || typeof customer !== 'object') return undefined;

  const record = customer as Record<string, unknown>;
  const value =
    record.avatarUrl ?? record.avatar ?? record.photo ?? record.imageUrl ?? record.profileImage ?? record.headImageUrl;

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getTotal(value: { total?: number } | null | undefined, fallbackCount = 0) {
  return typeof value?.total === 'number' ? value.total : fallbackCount;
}

type CoreCallResult<T> = CoreDataStatus & {
  data: T;
  source: 'api' | 'fallback';
  label: string;
};

function formatCoreError(err: unknown) {
  return err instanceof Error ? err.message : String(err || '接口请求失败');
}

function parseTime(value?: string) {
  if (!value) return null;
  const time = new Date(value.replace(' ', 'T')).getTime();
  return Number.isNaN(time) ? null : time;
}

function getDaysSince(value?: string) {
  const time = parseTime(value);
  if (time === null) return 999;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function getChurnRiskLevel(score: number) {
  if (score >= 8) return '高风险';
  if (score >= 5) return '中风险';
  return '需关注';
}

function formatCustomerRiskLine(item: CustomerCardData, index: number) {
  const customer = item.customer;
  return `${index + 1}. ${customer.name}（${customer.memberLevel}）：${item.summary}；${item.reasons.join('；')}`;
}

async function optionalCoreCall<T>(label: string, task: () => Promise<T>, fallback: T): Promise<CoreCallResult<T>> {
  try {
    return { data: await task(), source: 'api', label };
  } catch (err) {
    console.warn(`Ami Aura Lite ${label} 加载失败，已降级为空数据`, err);
    return { data: fallback, source: 'fallback', label, error: formatCoreError(err) };
  }
}

function getFallbackStatus(
  results: Array<CoreCallResult<unknown> | undefined>,
  fallbackLabel = 'Ami_Core 数据',
): CoreDataStatus | undefined {
  const failed = results.filter((item): item is CoreCallResult<unknown> => item?.source === 'fallback');
  if (!failed.length) return undefined;

  return {
    source: 'fallback',
    label: failed.length === 1 ? failed[0].label : fallbackLabel,
    error: failed.map((item) => item.error || `${item.label} 加载失败`).join('；'),
  };
}

function shouldPreferDemoStore(bootstrap: AuraBootstrap) {
  const roles = bootstrap.currentUser?.roles ?? [];
  const permissions = bootstrap.currentUser?.permissions ?? [];
  return roles.includes('super_admin') || permissions.includes('*');
}

let bootstrapCache: {
  value: AuraBootstrap;
  storeId: number | null;
  operatorId: number | null;
  role: AuraRole | null;
  createdAt: number;
} | null = null;
let bootstrapPromise: { key: string; promise: Promise<AuraBootstrap> } | null = null;
let auraDemoLoginPromise: Promise<void> | null = null;
let roleDashboardCache: { value: TerminalRoleDashboard; storeId: number | null; createdAt: number } | null = null;
let roleDashboardPromise: Promise<TerminalRoleDashboard> | null = null;
let coreSnapshotCache: { value: CoreSnapshot; storeId: number | null; createdAt: number } | null = null;
let coreSnapshotPromise: Promise<CoreSnapshot> | null = null;
let coreSnapshotBackgroundRefresh: Promise<CoreSnapshot> | null = null;
const businessFlowCache = new Map<string, { value: unknown; storeId: number | null; createdAt: number }>();
const businessFlowBackgroundRefresh = new Map<string, Promise<unknown>>();
const BOOTSTRAP_CACHE_MS = TERMINAL_QUERY_TTL.bootstrap;
const ROLE_DASHBOARD_CACHE_MS = 15_000;
const CORE_SNAPSHOT_CACHE_MS = 60_000;
const BUSINESS_FLOW_CACHE_MS = 90_000;
const AURA_STORE_STORAGE_KEY = 'ami:aura-lite:current-store-id';
const AURA_STARTUP_CACHE_KEY = 'ami:aura-lite:startup-cache:v1';
const AURA_STARTUP_CACHE_VERSION = 1;
const MAX_CONTEXT_TURNS = 6;
const CONVERSATION_CONTEXT_TTL_MS = 10 * 60 * 1000;

interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const DEFAULT_CONVERSATION_SCOPE = 'anonymous';
let activeConversationScope = DEFAULT_CONVERSATION_SCOPE;
const conversationHistories = new Map<string, ConversationEntry[]>([[DEFAULT_CONVERSATION_SCOPE, []]]);

function normalizeConversationScope(scope?: string | number | null) {
  const value = String(scope ?? DEFAULT_CONVERSATION_SCOPE).trim();
  return value || DEFAULT_CONVERSATION_SCOPE;
}

function getScopedConversationHistory() {
  const scope = normalizeConversationScope(activeConversationScope);
  if (!conversationHistories.has(scope)) conversationHistories.set(scope, []);
  return conversationHistories.get(scope) ?? [];
}

function setScopedConversationHistory(history: ConversationEntry[]) {
  conversationHistories.set(normalizeConversationScope(activeConversationScope), history);
}

export function getConversationScopeForOperator(operatorId?: number | null, role?: AuraRole | null) {
  return operatorId ? `operator:${operatorId}:${role ?? 'default'}` : `role:${role ?? 'anonymous'}`;
}

export function setConversationScope(scope?: string | number | null) {
  activeConversationScope = normalizeConversationScope(scope);
  getScopedConversationHistory();
}

export function setActiveTerminalOperator(operatorId?: number | null, role?: AuraRole | null) {
  setActiveTerminalOperatorContext(operatorId, role);
}

export function appendToConversation(role: 'user' | 'assistant', content: string) {
  const normalized = content.trim();
  if (!normalized) return;
  let conversationHistory = [...getScopedConversationHistory(), { role, content: normalized, timestamp: Date.now() }];
  if (conversationHistory.length > MAX_CONTEXT_TURNS * 2) {
    conversationHistory = conversationHistory.slice(-MAX_CONTEXT_TURNS * 2);
  }
  setScopedConversationHistory(conversationHistory);
}

export function clearConversation() {
  setScopedConversationHistory([]);
}

export function getConversationMessages() {
  const cutoff = Date.now() - CONVERSATION_CONTEXT_TTL_MS;
  let conversationHistory = getScopedConversationHistory();
  conversationHistory = conversationHistory.filter((entry) => entry.timestamp > cutoff);
  setScopedConversationHistory(conversationHistory);
  return [...conversationHistory];
}

export type AuraHomePayload =
  | { kind: 'manager'; data: DashboardCardData }
  | { kind: 'reception'; data: AppointmentCardData }
  | { kind: 'beautician'; data: StaffScheduleCardData };

export interface AuraStartupCacheV1 {
  version: 1;
  cachedAt: number;
  dateKey: string;
  bootstrap: AuraBootstrap;
  currentRole: Role;
  homePayload: AuraHomePayload;
}

function clearRoleDashboardCache() {
  roleDashboardCache = null;
  roleDashboardPromise = null;
}

function clearCoreSnapshotCache() {
  coreSnapshotCache = null;
  coreSnapshotPromise = null;
  coreSnapshotBackgroundRefresh = null;
  businessFlowBackgroundRefresh.clear();
}

function clearBusinessDataCache() {
  clearRoleDashboardCache();
  clearCoreSnapshotCache();
  businessFlowCache.clear();
  clearTerminalQueryCache();
}

function invalidateBusinessFlowCache(keys: string[]) {
  keys.forEach((key) => {
    businessFlowCache.delete(key);
    businessFlowBackgroundRefresh.delete(key);
  });
}

function invalidateTerminalBusinessCache(prefixes: string[]) {
  clearCoreSnapshotCache();
  if (
    prefixes.some((prefix) =>
      ['manager-dashboard', 'today-reservations', 'staff-schedules', 'customer-growth'].includes(prefix),
    )
  ) {
    clearRoleDashboardCache();
  }
  invalidateTerminalQueryPrefixes(prefixes);
}

function invalidateReservationCaches(includeStaff = false) {
  invalidateTerminalBusinessCache([
    'today-reservations',
    'manager-dashboard',
    ...(includeStaff ? ['staff-schedules', 'beautician-dashboard'] : []),
  ]);
}

function invalidateCashierCaches() {
  invalidateBusinessFlowCache(['operation.cashier']);
  invalidateTerminalBusinessCache(['manager-dashboard', 'customer-growth', 'cashier-context']);
}

function invalidateCardVerificationCaches() {
  invalidateBusinessFlowCache(['operation.verify']);
  invalidateTerminalBusinessCache(['manager-dashboard', 'customer-growth', 'card-verification-context']);
}

function invalidateCustomerCaches() {
  invalidateBusinessFlowCache(['operation.cashier', 'operation.verify', 'operation.register']);
  invalidateTerminalBusinessCache([
    'manager-dashboard',
    'customer-growth',
    'cashier-context',
    'card-verification-context',
    'customer-search',
  ]);
}

export function invalidateTerminalScheduleCaches() {
  invalidateTerminalBusinessCache(['staff-schedules', 'beautician-dashboard', 'manager-dashboard']);
}

export function invalidateTerminalInventoryCaches() {
  invalidateTerminalBusinessCache(['inventory-alerts', 'manager-dashboard']);
}

function getCurrentStoreFromState(bootstrap: AuraBootstrap | null = bootstrapCache?.value ?? null) {
  const storeState = useStoreStore.getState();
  const currentStoreId = storeState.currentStoreId ?? bootstrap?.currentStore?.id ?? null;
  return (
    (currentStoreId
      ? (bootstrap?.availableStores.find((store) => store.id === currentStoreId) ??
        storeState.stores.find((store) => store.id === currentStoreId))
      : null) ??
    bootstrap?.currentStore ??
    storeState.stores[0] ??
    null
  );
}

export function isShiftRequired(): boolean {
  return getCurrentStoreFromState()?.shiftRequired !== false;
}

export async function refreshShiftRequired(): Promise<boolean> {
  try {
    const normalized = normalizeAuraBootstrap(await getTerminalBootstrap(resolveBootstrapParams()));
    bootstrapCache = {
      value: normalized,
      storeId: useStoreStore.getState().currentStoreId,
      operatorId: null,
      role: null,
      createdAt: Date.now(),
    };
    return getCurrentStoreFromState(normalized)?.shiftRequired !== false;
  } catch (err) {
    console.warn('Ami Aura Lite 收银班次配置刷新失败，继续使用本地缓存', err);
    return isShiftRequired();
  }
}

function refreshBusinessFlowInBackground<T>(key: string, storeId: number | null, loader: () => Promise<T>) {
  if (businessFlowBackgroundRefresh.has(key)) return;
  const task = loader()
    .then((value) => {
      businessFlowCache.set(key, { value, storeId, createdAt: Date.now() });
      return value;
    })
    .catch((err) => {
      console.warn(`Ami Aura Lite ${key} 后台刷新失败，继续使用缓存`, err);
      throw err;
    })
    .finally(() => {
      businessFlowBackgroundRefresh.delete(key);
    });
  businessFlowBackgroundRefresh.set(key, task);
}

async function loadCachedBusinessFlow<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const storeId = useStoreStore.getState().currentStoreId;
  const cached = businessFlowCache.get(key);
  const now = Date.now();
  if (cached && cached.storeId === storeId && now - cached.createdAt < BUSINESS_FLOW_CACHE_MS) {
    refreshBusinessFlowInBackground(key, storeId, loader);
    return cached.value as T;
  }
  const value = await loader();
  businessFlowCache.set(key, { value, storeId: useStoreStore.getState().currentStoreId, createdAt: Date.now() });
  return value;
}

function clearBootstrapCache() {
  bootstrapCache = null;
  bootstrapPromise = null;
  clearBusinessDataCache();
}

export function clearAuraStartupCache() {
  clearBootstrapCache();
  try {
    window.localStorage.removeItem(AURA_STARTUP_CACHE_KEY);
  } catch {
    // localStorage may be blocked; runtime caches have already been cleared.
  }
}

function readStoredAuraStoreId() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(AURA_STORE_STORAGE_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function writeStoredAuraStoreId(storeId: number | null) {
  if (typeof window === 'undefined') return;
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

  const businessStore = bootstrap.availableStores.find((store) => !store.name.startsWith('Ami 上海'));
  return businessStore?.id ?? bootstrap.currentStore?.id ?? bootstrap.availableStores[0]?.id ?? null;
}

function isAuraRole(value: unknown): value is AuraRole {
  return value === 'manager' || value === 'reception' || value === 'beautician';
}

function getAuraDateKey(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isAuraHomePayload(value: unknown): value is AuraHomePayload {
  if (!isRecord(value)) return false;
  return (
    (value.kind === 'manager' || value.kind === 'reception' || value.kind === 'beautician') && isRecord(value.data)
  );
}

function isAuraBootstrap(value: unknown): value is AuraBootstrap {
  if (!isRecord(value)) return false;
  return (
    isRecord(value.currentUser) ||
    isRecord(value.currentStore) ||
    Array.isArray(value.availableStores) ||
    Array.isArray(value.availableRoles)
  );
}

export function readAuraStartupCache(): AuraStartupCacheV1 | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(AURA_STARTUP_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AuraStartupCacheV1>;
    if (parsed.version !== AURA_STARTUP_CACHE_VERSION) return null;
    if (parsed.dateKey !== getAuraDateKey()) return null;
    if (!Number.isFinite(parsed.cachedAt)) return null;
    if (!isAuraRole(parsed.currentRole)) return null;
    if (!isAuraBootstrap(parsed.bootstrap)) return null;
    if (!isAuraHomePayload(parsed.homePayload)) return null;
    if (parsed.homePayload.kind !== parsed.currentRole) return null;

    return parsed as AuraStartupCacheV1;
  } catch {
    return null;
  }
}

export function writeAuraStartupCache(input: {
  bootstrap: AuraBootstrap;
  currentRole: Role;
  homePayload: AuraHomePayload;
}) {
  if (typeof window === 'undefined') return;
  if (input.homePayload.kind !== input.currentRole) return;

  const cache: AuraStartupCacheV1 = {
    version: AURA_STARTUP_CACHE_VERSION,
    cachedAt: Date.now(),
    dateKey: getAuraDateKey(),
    bootstrap: input.bootstrap,
    currentRole: input.currentRole,
    homePayload: input.homePayload,
  };

  try {
    window.localStorage.setItem(AURA_STARTUP_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage may be full or blocked; startup should keep working without cache.
  }
}

function inferAuraRole(user: unknown): AuraRole {
  const record = user && typeof user === 'object' ? (user as Record<string, unknown>) : {};
  const primaryRole = String(record.primaryRole ?? record.role ?? '');
  const roles = asList<string>(record.roles);
  const roleText = [primaryRole, ...roles].join(',');

  if (roleText.includes('beautician')) return 'beautician';
  if (roleText.includes('cashier') || roleText.includes('reception')) return 'reception';
  return 'manager';
}

function getAuraAvailableRolesForUser(user: AuraBootstrap['currentUser']): AuraRole[] {
  if (!user) return ['reception'];
  return resolveAuraAvailableRoles(user);
}

function normalizeBeauticianProfile(value: unknown): Beautician | null {
  const record = value && typeof value === 'object' ? (value as Partial<Beautician> & Record<string, unknown>) : null;
  if (!record) return null;
  const id = Number(record.id);
  if (!Number.isFinite(id)) return null;

  const rawStatus = String(record.status ?? '在职');
  const status: Beautician['status'] =
    rawStatus === 'active' || rawStatus === '在职'
      ? '在职'
      : rawStatus === 'disabled' || rawStatus === '离职'
        ? '离职'
        : '休假';

  return {
    id,
    userId: Number.isFinite(Number(record.userId)) ? Number(record.userId) : undefined,
    name: String(record.name ?? '未命名美容师'),
    phone: String(record.phone ?? ''),
    level: String(record.level ?? '美容师'),
    specialties: asList<string>(record.specialties),
    status,
    storeName: String(record.storeName ?? ''),
    joinDate: String(record.joinDate ?? ''),
    createdAt: String(record.createdAt ?? ''),
  };
}

function normalizeTerminalUser(value: unknown): AuraTerminalUser | null {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!record) return null;
  const id = Number(record.id);
  if (!Number.isFinite(id)) return null;
  const currentBeautician = normalizeBeauticianProfile(record.currentBeautician);
  const boundBeauticianId = Number(record.boundBeauticianId ?? currentBeautician?.id);

  const user = {
    id,
    username: String(record.username ?? ''),
    name: String(record.name ?? record.username ?? '未命名账号'),
    phone: String(record.phone ?? ''),
    email: record.email ? String(record.email) : undefined,
    roles: asList<string>(record.roles),
    permissions: asList<string>(record.permissions),
    deniedPermissions: asList<string>(record.deniedPermissions),
    storeIds: asList<number>(record.storeIds).map(Number).filter(Number.isFinite),
    platformScopes: record.platformScopes as AuraTerminalUser['platformScopes'],
    dataScopes: record.dataScopes as AuraTerminalUser['dataScopes'],
    fieldScopes: record.fieldScopes as AuraTerminalUser['fieldScopes'],
    approvalScopes: record.approvalScopes as AuraTerminalUser['approvalScopes'],
  };
  const hasExplicitAvailableRoles = Object.prototype.hasOwnProperty.call(record, 'availableRoles');
  const rawRoles = asList<AuraRole>(record.availableRoles).filter(isAuraRole);
  const availableRoles = hasExplicitAvailableRoles ? rawRoles : getAuraAvailableRolesForUser(user);
  const defaultRole =
    isAuraRole(record.defaultRole) && availableRoles.includes(record.defaultRole)
      ? record.defaultRole
      : resolveAuraRole(user);
  const terminalAccess =
    record.terminalAccess === false
      ? false
      : record.terminalAccess === true
        ? true
        : availableRoles.length > 0;
  const disabled = record.disabled === true || !terminalAccess || availableRoles.length === 0;
  const disabledReason = record.disabledReason
    ? String(record.disabledReason)
    : disabled
      ? '未配置智能终端权限'
      : undefined;

  return {
    ...user,
    availableRoles,
    defaultRole: availableRoles.includes(defaultRole) ? defaultRole : (availableRoles[0] ?? 'reception'),
    roleLabel: String(
      record.roleLabel ?? (terminalAccess ? AURA_ROLE_LABELS[availableRoles[0] ?? defaultRole] : '未配置终端权限'),
    ),
    terminalAccess,
    disabled,
    disabledReason,
    status: record.status ? String(record.status) : undefined,
    boundBeauticianId: Number.isFinite(boundBeauticianId) ? boundBeauticianId : undefined,
    boundBeauticianName: record.boundBeauticianName ? String(record.boundBeauticianName) : currentBeautician?.name,
    currentBeautician,
  };
}

function normalizeAuraBootstrap(value: unknown): AuraBootstrap {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const authState = useAuthStore.getState();
  const storeState = useStoreStore.getState();
  const currentUser = (raw.currentUser ?? raw.user ?? authState.user ?? null) as AuraBootstrap['currentUser'];
  const rawAvailableStores = asList<AuraBootstrap['availableStores'][number]>(raw.availableStores ?? raw.stores);
  const availableStores = rawAvailableStores.length ? rawAvailableStores : storeState.stores;
  const rawCurrentStore = (raw.currentStore ??
    raw.store ??
    availableStores[0] ??
    null) as AuraBootstrap['currentStore'];
  const currentStore =
    (storeState.currentStoreId ? availableStores.find((store) => store.id === storeState.currentStoreId) : null) ??
    rawCurrentStore;
  const currentRole = isAuraRole(raw.currentRole) ? raw.currentRole : inferAuraRole(currentUser);
  const roleDefinition = getAuraRoleDefinition(currentRole);
  const availableRoles = asList<AuraRole>(raw.availableRoles).filter(isAuraRole);
  const terminalUsers = asList<AuraTerminalUser>(raw.terminalUsers)
    .map(normalizeTerminalUser)
    .filter((item): item is AuraTerminalUser => Boolean(item));
  const fallbackTerminalUser = normalizeTerminalUser(currentUser);
  const currentBeautician =
    normalizeBeauticianProfile(raw.currentBeautician) ??
    terminalUsers.find((item) => item.id === currentUser?.id)?.currentBeautician ??
    fallbackTerminalUser?.currentBeautician ??
    null;
  const permissions =
    asList<string>(raw.permissions).length > 0
      ? asList<string>(raw.permissions)
      : asList<string>((currentUser as Record<string, unknown> | null)?.permissions);

  return {
    currentUser,
    currentStore,
    availableStores,
    terminalUsers: terminalUsers.length ? terminalUsers : fallbackTerminalUser ? [fallbackTerminalUser] : [],
    currentRole,
    availableRoles: availableRoles.length ? availableRoles : getAuraAvailableRolesForUser(currentUser),
    availableActions: asList<AuraBootstrap['availableActions'][number]>(raw.availableActions).length
      ? asList<AuraBootstrap['availableActions'][number]>(raw.availableActions)
      : roleDefinition.availableActions,
    quickActions: asList<AuraBootstrap['quickActions'][number]>(raw.quickActions).length
      ? asList<AuraBootstrap['quickActions'][number]>(raw.quickActions)
      : roleDefinition.quickActions,
    permissions,
    dataScopes: (raw.dataScopes && typeof raw.dataScopes === 'object'
      ? raw.dataScopes
      : {}) as AuraBootstrap['dataScopes'],
    roleDefinition: (raw.roleDefinition && typeof raw.roleDefinition === 'object'
      ? raw.roleDefinition
      : roleDefinition) as AuraBootstrap['roleDefinition'],
    currentBeautician,
  };
}

function getBootstrapCacheOperatorId(params?: TerminalBootstrapParams) {
  if (params && Object.prototype.hasOwnProperty.call(params, 'operatorId')) {
    return params.operatorId ?? null;
  }
  return null;
}

function resolveBootstrapParams(params?: TerminalBootstrapParams) {
  return resolveTerminalBootstrapParams(params);
}

function getActiveOperatorParams() {
  return getActiveTerminalOperatorParams();
}

async function fetchCachedBootstrap(params?: TerminalBootstrapParams) {
  const resolvedParams = resolveBootstrapParams(params);
  const storeId = useStoreStore.getState().currentStoreId;
  const operatorId = getBootstrapCacheOperatorId(resolvedParams);
  const role = resolvedParams?.role ?? null;
  const cacheKey = `${storeId ?? 'all'}:${operatorId ?? 'default'}:${role ?? 'default'}`;
  const now = Date.now();
  if (
    bootstrapCache &&
    bootstrapCache.storeId === storeId &&
    bootstrapCache.operatorId === operatorId &&
    bootstrapCache.role === role &&
    now - bootstrapCache.createdAt < BOOTSTRAP_CACHE_MS
  ) {
    return bootstrapCache.value;
  }

  if (!bootstrapPromise || bootstrapPromise.key !== cacheKey) {
    const loadBootstrap = async () => {
      try {
        return await getTerminalBootstrap(resolvedParams);
      } catch (err) {
        if (!isAuraAuthError(err)) throw err;
        await repairAuraAuthSession({ forceLogin: true });
        return getTerminalBootstrap(resolvedParams);
      }
    };
    const promise = loadBootstrap()
      .then((value) => {
        const normalized = normalizeAuraBootstrap(value);
        bootstrapCache = {
          value: normalized,
          storeId: useStoreStore.getState().currentStoreId,
          operatorId,
          role,
          createdAt: Date.now(),
        };
        return normalized;
      })
      .finally(() => {
        if (bootstrapPromise?.key === cacheKey) bootstrapPromise = null;
      });
    bootstrapPromise = { key: cacheKey, promise };
  }

  return bootstrapPromise.promise;
}

async function fetchCachedRoleDashboard() {
  const storeId = useStoreStore.getState().currentStoreId;
  const now = Date.now();
  if (
    roleDashboardCache &&
    roleDashboardCache.storeId === storeId &&
    now - roleDashboardCache.createdAt < ROLE_DASHBOARD_CACHE_MS
  ) {
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

function isSelectableBeautician(beautician: Beautician) {
  const status = String(beautician.status ?? '').trim();
  const normalizedStatus = status.toLowerCase();
  return (
    !['离职', '绂昏亴', '停用'].includes(status) &&
    !['inactive', 'disabled'].includes(normalizedStatus)
  );
}

async function loadActiveProjectNames(): Promise<string[]> {
  const { storeName } = await getAuraBootstrapSession();
  const [projectsResult, catalogResult] = await Promise.all([
    optionalCoreCall('项目数据', () => getProjects(), []),
    optionalCoreCall<unknown>('终端目录', () => getTerminalCatalogSync(), null),
  ]);
  const catalog =
    catalogResult.data && typeof catalogResult.data === 'object' ? (catalogResult.data as Record<string, unknown>) : {};
  const apiProjects = asList<Project>(projectsResult.data);
  const terminalProjects = asList<Project>(catalog.projects);
  const sourceProjects = apiProjects.length ? apiProjects : terminalProjects;

  return Array.from(
    new Set(
      filterByStoreName(sourceProjects, storeName)
        .filter((project) => project.status !== false)
        .map((project) => project.name?.trim())
        .filter((projectName): projectName is string => Boolean(projectName)),
    ),
  );
}

function getReservationTime(reservation: { date?: string; appointmentTime?: string; time?: string }) {
  return reservation.date ?? reservation.appointmentTime ?? reservation.time ?? '';
}

function isReservationOnDate(reservation: { date?: string; appointmentTime?: string; time?: string }, date: string) {
  return getReservationTime(reservation).startsWith(date);
}

function normalizeReservationStatus(status?: string) {
  const value = status ?? 'pending';
  if (value === 'confirmed' || value.includes('已确认')) return 'confirmed';
  if (value === 'checked_in' || value.includes('到店')) return 'checked_in';
  if (value === 'completed' || value.includes('完成')) return 'completed';
  if (value === 'cancelled' || value.includes('取消')) return 'cancelled';
  if (value === 'no_show') return 'no_show';
  return 'pending';
}

function getReservationStatusText(status?: string) {
  const normalized = normalizeReservationStatus(status);
  const statusMap: Record<string, string> = {
    pending: '待确认',
    confirmed: '已确认',
    checked_in: '已到店',
    completed: '已完成',
    cancelled: '已取消',
    no_show: '未到店',
  };
  return statusMap[normalized] ?? '待确认';
}

function isArrivedReservation(reservation: Record<string, any>) {
  return (
    Boolean(reservation.checkedInAt) ||
    ['checked_in', 'completed'].includes(normalizeReservationStatus(reservation.status))
  );
}

function formatAppointmentTime(value?: string) {
  if (!value) return '时间待定';
  const normalized = value.replace('T', ' ');
  const [, month, day, hour, minute] = normalized.match(/^\d{4}-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/) ?? [];
  if (!month) return normalized;
  return `${month}-${day} ${hour}:${minute}`;
}

function formatTimeOnly(value?: string) {
  const display = formatAppointmentTime(value);
  const matched = display.match(/(\d{2}:\d{2})$/);
  return matched?.[1] ?? display;
}

function addMinutesToAppointment(value: string | undefined, minutes: number) {
  const base = value ? new Date(value.replace(' ', 'T')) : new Date();
  const time = Number.isNaN(base.getTime()) ? new Date() : base;
  time.setMinutes(time.getMinutes() + minutes);
  return format(time, 'yyyy-MM-dd HH:mm:ss');
}

function findCustomerForReservation(snapshot: CoreSnapshot, reservation: Record<string, any>) {
  const customerName = reservation.customerName ?? reservation.userName ?? '';
  const customerPhone = reservation.customerPhone ?? '';
  return (
    snapshot.customers.find((customer) => customerPhone && customer.phone === customerPhone) ??
    snapshot.customers.find((customer) => customer.name === customerName) ??
    snapshot.customers.find(
      (customer) => customerName && (customer.name.includes(customerName) || customerName.includes(customer.name)),
    )
  );
}

function toAppointmentViewItem(snapshot: CoreSnapshot, reservation: Record<string, any>): AppointmentViewItem {
  const customer = findCustomerForReservation(snapshot, reservation);
  const customerName = reservation.customerName ?? reservation.userName ?? customer?.name ?? '散客';
  const customerPhone = reservation.customerPhone || customer?.phone || '未留手机号';
  const appointmentTime = reservation.appointmentTime ?? getReservationTime(reservation);
  const tags = customer?.tags?.length ? customer.tags.slice(0, 3) : ['到店接待', '待完善画像'];
  const profileLabel = customer?.skinCondition || customer?.source || '画像待补充';

  return {
    id: Number(reservation.id),
    customerId: customer?.id ?? reservation.customerId,
    customerName,
    customerPhone,
    memberLevel: customer?.memberLevel ?? '普通客户',
    tags,
    profileLabel,
    lastVisitDate: customer?.lastVisitDate ?? '暂无到店记录',
    projectId: reservation.projectId,
    projectName: reservation.projectName ?? '未选择项目',
    beauticianId: reservation.beauticianId,
    beauticianName: reservation.beauticianName ?? '待分配美容师',
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
  const customerName = reservation.customerName ?? reservation.userName ?? '散客';
  return {
    id: Number(reservation.id),
    customerId: reservation.customerId,
    customerName,
    customerPhone: reservation.customerPhone || '未留手机号',
    memberLevel: reservation.memberLevel ?? '会员信息待完善',
    tags:
      Array.isArray(reservation.tags) && reservation.tags.length
        ? reservation.tags.slice(0, 3)
        : ['今日预约', '待接待'],
    profileLabel: reservation.profileLabel ?? '画像待补充',
    lastVisitDate: reservation.lastVisitDate ?? '暂无到店记录',
    projectId: reservation.projectId,
    projectName: reservation.projectName ?? '未选择项目',
    beauticianId: reservation.beauticianId,
    beauticianName: reservation.beauticianName ?? '待分配美容师',
    appointmentTime,
    displayTime: formatAppointmentTime(appointmentTime),
    duration: reservation.duration ?? 60,
    status: normalizeReservationStatus(reservation.status),
    statusText: getReservationStatusText(reservation.status),
    remark: reservation.remark,
  };
}

function buildEmptyBeauticianDashboard(storeName?: string, apiStatus?: CoreDataStatus): StaffScheduleCardData {
  return {
    title: '我的今日服务',
    subtitle: storeName ?? '当前门店',
    beautician: {
      id: 0,
      name: '暂无排班美容师',
      phone: '',
      level: '美容师',
      specialties: [],
      status: '在职',
      storeName: storeName ?? '当前门店',
      joinDate: '',
      createdAt: '',
    },
    todaySlots: [],
    utilization: '0%',
    summary: '当前门店暂无美容师排班数据，请在 Ami_Core 排班模块维护后刷新。',
    apiStatus,
  };
}

function buildCurrentBeauticianEmptyDashboard(
  beautician: Beautician,
  storeName?: string,
  apiStatus?: CoreDataStatus,
): StaffScheduleCardData {
  return {
    title: '我的今日服务',
    subtitle: storeName ?? beautician.storeName ?? '当前门店',
    beautician: {
      ...beautician,
      storeName: beautician.storeName || storeName || '当前门店',
    },
    todaySlots: [],
    weekSlots: [],
    weekStart: getTodayRange().weekStart,
    utilization: '0%',
    summary: `${beautician.name} 今日暂无排班或服务任务。`,
    apiStatus,
  };
}

function getTodayIndex() {
  return (new Date().getDay() + 6) % 7;
}

function calculateScheduleUtilization(slots: Array<{ available?: boolean; status?: string }>) {
  const activeSlots = slots.filter((slot) => slot.status && slot.status !== 'expired');
  const scopedSlots = activeSlots.length ? activeSlots : slots;
  const busyCount = scopedSlots.filter(
    (slot) => !slot.available || ['booked', 'busy', 'leave'].includes(String(slot.status)),
  ).length;
  return scopedSlots.length ? `${Math.round((busyCount / scopedSlots.length) * 100)}%` : '0%';
}

function buildStaffScheduleFromWeek(
  beautician: CoreSnapshot['beauticians'][number],
  weekSlots: StaffScheduleCardData['weekSlots'],
  weekStart: string,
  storeName?: string,
  title = '员工本周排班',
  apiStatus?: CoreDataStatus,
): StaffScheduleCardData {
  const todaySlots = weekSlots?.[getTodayIndex()] ?? [];
  const utilization = calculateScheduleUtilization(todaySlots);
  return {
    title,
    subtitle: storeName ?? beautician.storeName,
    beautician,
    todaySlots,
    weekSlots,
    weekStart,
    utilization,
    summary: `${beautician.name} 今日共有 ${todaySlots.length} 个排班时段，占用率 ${utilization}。`,
    apiStatus,
  };
}

async function enrichStaffScheduleCommission(item: StaffScheduleCardData): Promise<StaffScheduleCardData> {
  if (!item.beautician?.id) return item;
  try {
    const commission = await getTerminalBeauticianCommission(item.beautician.id, 'month');
    return { ...item, commission };
  } catch (err) {
    console.warn('Ami Aura Lite 美容师提成加载失败，已降级为排班数据', err);
    return item;
  }
}

async function loadWeeklyStaffSchedules(): Promise<StaffScheduleCardData[]> {
  const { storeName } = await getAuraBootstrapSession();
  let primaryError: string | undefined;
  try {
    const items = await getTerminalStaffSchedulesDashboard();
    const normalized = asList<StaffScheduleCardData>(items).map((item) => normalizeStaffSchedule(item, storeName));
    if (normalized.length) return Promise.all(normalized.map(enrichStaffScheduleCommission));
  } catch (err) {
    console.warn('Ami Aura Lite 轻量员工排班加载失败，降级到轻量排班查询', err);
    primaryError = formatCoreError(err);
  }

  const beauticiansResult = await optionalCoreCall('美容师轻量数据', () => getBeauticians({ storeName }), []);
  const beauticians = filterByStoreName(beauticiansResult.data, storeName).slice(0, 8);
  if (!beauticians.length) {
    return [
      buildEmptyBeauticianDashboard(
        storeName,
        getFallbackStatus([beauticiansResult]) ??
          (primaryError ? { source: 'fallback', label: '员工排班', error: primaryError } : undefined),
      ),
    ];
  }

  const { weekStart } = getTodayRange();
  const scheduleByBeauticianResult = await optionalCoreCall(
    '员工周排班',
    () =>
      getWeeklySchedules({
        beauticianIds: beauticians.map((beautician) => beautician.id),
        weekStart,
      }),
    {} as Record<number, StaffScheduleCardData['weekSlots']>,
  );
  const scheduleByBeautician = scheduleByBeauticianResult.data;
  const apiStatus =
    getFallbackStatus([beauticiansResult, scheduleByBeauticianResult], '美容师排班数据') ??
    (primaryError ? { source: 'fallback', label: '员工排班', error: primaryError } : undefined);

  const schedules = beauticians.map((beautician) =>
    buildStaffScheduleFromWeek(
      beautician,
      scheduleByBeautician[beautician.id] ?? [],
      weekStart,
      storeName ?? beautician.storeName,
      '员工本周排班',
      apiStatus,
    ),
  );
  return Promise.all(schedules.map(enrichStaffScheduleCommission));
}

function normalizeManagerDashboard(value: unknown, storeName?: string): DashboardCardData {
  const data = value && typeof value === 'object' ? (value as Partial<DashboardCardData>) : {};
  return {
    title: data.title ?? '店长经营驾驶舱',
    subtitle: data.subtitle ?? storeName ?? '当前门店',
    summary: data.summary ?? '当前门店经营数据已从 Ami_Core 接入，请优先关注经营、风险和员工协同。',
    kpis: asList<DashboardCardData['kpis'][number]>((data as { kpis?: unknown }).kpis),
    risks: asList<DashboardCardData['risks'][number]>((data as { risks?: unknown }).risks),
    highlights: asList<DashboardCardData['highlights'][number]>((data as { highlights?: unknown }).highlights),
  };
}

function normalizeStaffSchedule(value: unknown, storeName?: string): StaffScheduleCardData {
  const fallback = buildEmptyBeauticianDashboard(storeName);
  const data = value && typeof value === 'object' ? (value as Partial<StaffScheduleCardData>) : {};
  const beautician = data.beautician ?? fallback.beautician;
  return {
    title: data.title ?? fallback.title,
    subtitle: data.subtitle ?? beautician.storeName ?? fallback.subtitle,
    beautician,
    todaySlots: asList<StaffScheduleCardData['todaySlots'][number]>((data as { todaySlots?: unknown }).todaySlots),
    weekSlots: asList<StaffScheduleCardData['weekSlots']>(data.weekSlots).length
      ? (data.weekSlots as StaffScheduleCardData['weekSlots'])
      : fallback.weekSlots,
    weekStart: data.weekStart ?? fallback.weekStart,
    utilization: data.utilization ?? fallback.utilization,
    summary: data.summary ?? fallback.summary,
    commission: data.commission ?? fallback.commission,
    quality: data.quality ?? fallback.quality,
  };
}

function mapBeauticianDashboardToStaffSchedule(value: unknown, storeName?: string): StaffScheduleCardData | null {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  if (!data) return null;
  const beautician = normalizeBeauticianProfile(data.beautician);
  if (!beautician) return null;
  const schedule = data.schedule && typeof data.schedule === 'object' ? (data.schedule as Record<string, unknown>) : {};
  const todaySlots = asList<StaffScheduleCardData['todaySlots'][number]>(schedule.todaySlots);
  const weekSlots = asList<StaffScheduleCardData['weekSlots']>(schedule.weekSlots).length
    ? (schedule.weekSlots as StaffScheduleCardData['weekSlots'])
    : [];
  return {
    title: '我的今日服务',
    subtitle: storeName ?? beautician.storeName,
    beautician,
    todaySlots,
    weekSlots,
    weekStart: typeof schedule.weekStart === 'string' ? schedule.weekStart : undefined,
    utilization:
      typeof schedule.utilization === 'string' ? schedule.utilization : calculateScheduleUtilization(todaySlots),
    summary:
      typeof data.summary === 'string' ? data.summary : `${beautician.name} 今日共有 ${todaySlots.length} 个排班时段。`,
    commission: data.commission as StaffScheduleCardData['commission'],
    quality: data.quality as StaffScheduleCardData['quality'],
  };
}

function normalizeReceptionDashboard(value: unknown, storeName?: string): AppointmentCardData {
  const data = value && typeof value === 'object' ? (value as Partial<AppointmentCardData>) : {};
  const rawItems = asList<Record<string, any>>(
    (data as { items?: unknown; data?: unknown }).items ?? (data as { data?: unknown }).data ?? value,
  );
  return {
    title: data.title ?? '今日接待工作台',
    subtitle: data.subtitle ?? storeName ?? '接待中心',
    items: rawItems.map((item) => toAppointmentViewItemFromTerminal(item)),
    summary: data.summary ?? `当前共有 ${rawItems.length} 条预约待处理，核心动作是到店确认、核销、收银和打印。`,
  };
}

function readAuthToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('token');
}

function isAuraAuthError(err: unknown) {
  const payload =
    err && typeof err === 'object' ? (err as { payload?: { status?: unknown; message?: unknown } }).payload : undefined;
  const status = typeof payload?.status === 'number' ? payload.status : undefined;
  const message =
    typeof payload?.message === 'string' ? payload.message : err instanceof Error ? err.message : String(err ?? '');

  return status === 401 || /unauthorized|token/i.test(message) || message.includes('认证令牌');
}

async function loginDemoUser() {
  if (!auraDemoLoginPromise) {
    auraDemoLoginPromise = useAuthStore
      .getState()
      .login({
        username: import.meta.env.VITE_DEMO_USERNAME || 'admin',
        password: import.meta.env.VITE_DEMO_PASSWORD || '11111111',
      })
      .finally(() => {
        auraDemoLoginPromise = null;
      });
  }

  await auraDemoLoginPromise;
  clearBootstrapCache();
}

async function repairAuraAuthSession(options: { forceLogin?: boolean } = {}) {
  const authState = useAuthStore.getState();
  const storedToken = readAuthToken();

  if (!options.forceLogin && storedToken) {
    if (authState.token === storedToken && authState.user) return;

    try {
      const user = await getUserInfo();
      useAuthStore.getState().setAuth(storedToken, user);
      clearBootstrapCache();
      return;
    } catch (err) {
      if (!isAuraAuthError(err)) throw err;
      useAuthStore.getState().logout();
    }
  } else if (authState.token || authState.user || authState.isAuthenticated) {
    authState.logout();
  }

  await loginDemoUser();
}

async function loadStoresWithAuthRepair() {
  try {
    await useStoreStore.getState().loadStores();
  } catch (err) {
    if (!isAuraAuthError(err)) throw err;
    await repairAuraAuthSession({ forceLogin: true });
    await useStoreStore.getState().loadStores();
  }
}

async function ensureLoggedIn() {
  await repairAuraAuthSession();

  if (useStoreStore.getState().stores.length === 0) {
    await loadStoresWithAuthRepair();
  }
}

export async function runWithAuraAuthRepair<T>(operation: () => Promise<T>): Promise<T> {
  await ensureLoggedIn();
  try {
    return await operation();
  } catch (err) {
    if (!isAuraAuthError(err)) throw err;
    await repairAuraAuthSession({ forceLogin: true });
    return operation();
  }
}

export async function ensureAuraSession(params?: TerminalBootstrapParams): Promise<SessionContext> {
  await ensureLoggedIn();

  const authState = useAuthStore.getState();
  const storeState = useStoreStore.getState();
  const resolvedParams = resolveBootstrapParams(params);
  let bootstrap = await fetchCachedBootstrap(resolvedParams);

  const preferredStoreId = getPreferredAuraStoreId(bootstrap, storeState.currentStoreId);
  if (preferredStoreId && storeState.currentStoreId !== preferredStoreId) {
    storeState.setCurrentStore(preferredStoreId);
    writeStoredAuraStoreId(preferredStoreId);
    clearBootstrapCache();
    bootstrap = await fetchCachedBootstrap(resolvedParams);
  }

  if (storeState.stores.length === 0 && bootstrap.availableStores.length > 0) {
    storeState.loadStores().catch(() => undefined);
  }

  return {
    user: bootstrap.currentUser ?? authState.user ?? (await getUserInfo()),
    store: bootstrap.currentStore ?? storeState.stores.find((item) => item.id === storeState.currentStoreId) ?? null,
  };
}

export async function loadAuraBootstrap(params?: TerminalBootstrapParams): Promise<AuraBootstrap> {
  await ensureLoggedIn();
  const storeState = useStoreStore.getState();
  const resolvedParams = resolveBootstrapParams(params);
  let bootstrap = await fetchCachedBootstrap(resolvedParams);

  if (storeState.stores.length === 0) {
    await storeState.loadStores();
  }
  const preferredStoreId = getPreferredAuraStoreId(bootstrap, storeState.currentStoreId);
  if (preferredStoreId && storeState.currentStoreId !== preferredStoreId) {
    storeState.setCurrentStore(preferredStoreId);
    writeStoredAuraStoreId(preferredStoreId);
    clearBootstrapCache();
    bootstrap = await fetchCachedBootstrap(resolvedParams);
  } else if (preferredStoreId) {
    storeState.setCurrentStore(preferredStoreId);
    writeStoredAuraStoreId(preferredStoreId);
  }

  return bootstrap;
}

export async function prefetchAuraBootstrap() {
  await terminalPrefetch({
    key: ['bootstrap'],
    ttlMs: TERMINAL_QUERY_TTL.bootstrap,
    loader: loadAuraBootstrap,
    source: 'prefetch',
  });
}

export async function switchAuraStore(storeId: number, params?: TerminalBootstrapParams): Promise<AuraBootstrap> {
  await ensureLoggedIn();
  const storeState = useStoreStore.getState();
  const resolvedParams = resolveBootstrapParams(params);

  if (storeState.stores.length === 0) {
    await storeState.loadStores();
  }

  storeState.setCurrentStore(storeId);
  writeStoredAuraStoreId(storeId);
  clearBootstrapCache();
  return fetchCachedBootstrap(resolvedParams);
}

async function getAuraBootstrapSession() {
  const bootstrap = await loadAuraBootstrap();
  return {
    bootstrap,
    storeName: bootstrap.currentStore?.name ?? bootstrap.availableStores[0]?.name ?? '',
    storeId: bootstrap.currentStore?.id,
  };
}

const SALES_USER_ROLE_LABELS: Record<string, string> = {
  super_admin: '系统管理员',
  store_manager: '店长',
  manager: '店长',
  reception: '前台',
  cashier: '收银',
  consultant: '顾问',
  beautician: '美容师',
};

function toSalesUserRoleLabel(user: AuraTerminalUser) {
  const labels = asList<string>(user.roles)
    .map((role) => SALES_USER_ROLE_LABELS[role] ?? role)
    .filter(Boolean);
  return Array.from(new Set(labels)).join(' / ');
}

function toSalesUserOptions(users: AuraTerminalUser[] = []) {
  return users
    .filter((user) => user.status !== 'disabled' && !user.disabledReason?.includes('禁用'))
    .map((user) => ({
      id: user.id,
      name: user.name || user.username || `员工 ${user.id}`,
      username: user.username,
      roleLabel: toSalesUserRoleLabel(user),
    }));
}

async function fetchCoreSnapshot(): Promise<CoreSnapshot> {
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
  ] = await Promise.all([
    optionalCoreCall('客户数据', () => getCustomers({ storeName }), []),
    optionalCoreCall('预约分页数据', () => getReservationsPaginated({ page: 1, pageSize: 80, storeName }), {
      items: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 80,
    }),
    optionalCoreCall('终端今日预约', () => getTerminalReservations({ storeName }), []),
    optionalCoreCall<unknown>('终端目录', () => getTerminalCatalogSync(), null),
    optionalCoreCall('美容师数据', () => getBeauticians({ storeName }), []),
    optionalCoreCall('终端库存数据', () => getTerminalInventoryStock({ storeId }), []),
    optionalCoreCall<unknown>('终端库存预警', () => getTerminalInventoryAlerts(), null),
    optionalCoreCall('卡项数据', () => getCards(), []),
    optionalCoreCall('商品订单', () => getProductOrders(), []),
  ]);

  const customers = asList<CoreSnapshot['customers'][number]>(customersResult.data);
  const reservations = asList<CoreSnapshot['reservations'][number]>(reservationsResult.data);
  const terminalReservations = asList<CoreSnapshot['reservations'][number]>(
    terminalReservationsResult.data as unknown as CoreSnapshot['reservations'],
  );
  const catalog =
    terminalCatalogResult.data && typeof terminalCatalogResult.data === 'object'
      ? (terminalCatalogResult.data as Record<string, unknown>)
      : {};
  const alerts =
    inventoryAlertsResult.data && typeof inventoryAlertsResult.data === 'object'
      ? (inventoryAlertsResult.data as Record<string, unknown>)
      : {};
  const catalogBeauticians = asList<CoreSnapshot['beauticians'][number]>(catalog.beauticians);
  const adminBeauticians = asList<CoreSnapshot['beauticians'][number]>(beauticiansResult.data);
  const beauticians = adminBeauticians.length ? adminBeauticians : catalogBeauticians;
  const stockItems = asList<CoreSnapshot['stockItems'][number]>(stockItemsResult.data);
  const expiringProducts = asList<CoreSnapshot['expiringProducts'][number]>(alerts.expiring);
  const replenishment = asList<CoreSnapshot['replenishment'][number]>(alerts.replenishment);
  const catalogCards = asList<CoreSnapshot['cards'][number]>(catalog.cards);
  const cards = catalogCards.length ? catalogCards : asList<CoreSnapshot['cards'][number]>(cardsResult.data);
  const orders = asList<CoreSnapshot['orders'][number]>(ordersResult.data);

  return {
    customers,
    reservations: (terminalReservations.length ? terminalReservations : reservations) as CoreSnapshot['reservations'],
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

function refreshCoreSnapshotInBackground(storeId: number | null) {
  if (coreSnapshotBackgroundRefresh) return;
  coreSnapshotBackgroundRefresh = fetchCoreSnapshot()
    .then((snapshot) => {
      coreSnapshotCache = { value: snapshot, storeId, createdAt: Date.now() };
      return snapshot;
    })
    .catch((err) => {
      console.warn('Ami Aura Lite 业务快照后台刷新失败，继续使用缓存', err);
      throw err;
    })
    .finally(() => {
      coreSnapshotBackgroundRefresh = null;
    });
}

export async function loadCoreSnapshot(): Promise<CoreSnapshot> {
  const storeId = useStoreStore.getState().currentStoreId;
  const now = Date.now();
  if (
    coreSnapshotCache &&
    coreSnapshotCache.storeId === storeId &&
    now - coreSnapshotCache.createdAt < CORE_SNAPSHOT_CACHE_MS
  ) {
    refreshCoreSnapshotInBackground(storeId);
    return coreSnapshotCache.value;
  }

  if (!coreSnapshotPromise) {
    coreSnapshotPromise = fetchCoreSnapshot()
      .then((snapshot) => {
        coreSnapshotCache = {
          value: snapshot,
          storeId: useStoreStore.getState().currentStoreId,
          createdAt: Date.now(),
        };
        return snapshot;
      })
      .finally(() => {
        coreSnapshotPromise = null;
      });
  }
  return coreSnapshotPromise;
}

async function loadCardVerificationSnapshot() {
  const [snapshot, catalogResult, projectsResult] = await Promise.all([
    loadCoreSnapshot(),
    optionalCoreCall<unknown>('终端目录', () => getTerminalCatalogSync(), null),
    optionalCoreCall('项目数据', () => getProjects(), []),
  ]);
  const catalog =
    catalogResult.data && typeof catalogResult.data === 'object' ? (catalogResult.data as Record<string, unknown>) : {};
  const terminalProjects = asList<Project>(catalog.projects);
  return { snapshot, projects: terminalProjects.length ? terminalProjects : asList<Project>(projectsResult.data) };
}

export function getRoleDefinition(role: Role): RoleDefinition {
  return getAuraRoleDefinition(role);
}

function createAutomationId() {
  return `automation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeAutomationText(command: string) {
  return command.trim().replace(/\s+/g, ' ');
}

function parseChineseHour(text: string) {
  const normalized = text.replace(/两/g, '二');
  const map: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (normalized === '十') return 10;
  if (normalized.startsWith('十')) return 10 + (map[normalized.slice(1)] ?? 0);
  if (normalized.endsWith('十')) return (map[normalized.slice(0, 1)] ?? 0) * 10;
  if (normalized.includes('十')) {
    const [tens, ones] = normalized.split('十');
    return (map[tens] ?? 1) * 10 + (map[ones] ?? 0);
  }
  return map[normalized] ?? null;
}

function extractAutomationTime(command: string) {
  const exactTime = command.match(
    /(?:每天|每日)?\s*(上午|下午|晚上|晚间|早上|中午)?\s*([0-9一二三四五六七八九十两]{1,3})[:：点](半|\d{0,2})/,
  );
  if (exactTime) {
    const [, period, hourText, minuteText] = exactTime;
    let hour = parseChineseHour(hourText) ?? Number(hourText);
    if ((period === '下午' || period === '晚上' || period === '晚间') && hour < 12) hour += 12;
    if (period === '中午' && hour < 11) hour += 12;
    const minute = minuteText === '半' ? 30 : minuteText ? Number(minuteText) : 0;
    return `每天 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  if (/闭店前|下班前|收工前/.test(command)) return '每天闭店前';
  if (/早上|上午/.test(command)) return '每天 09:00';
  if (/中午/.test(command)) return '每天 12:00';
  if (/晚上|晚间/.test(command)) return '每天 21:00';
  return '';
}

function extractNumberBeforeUnit(command: string, unitPattern: string) {
  const match = command.match(new RegExp(`(\\d+)\\s*(?:${unitPattern})`));
  return match ? Number(match[1]) : null;
}

function buildAutomationDraft(params: {
  command: string;
  title: string;
  summary: string;
  trigger: string;
  audience: string;
  action: string;
  riskLevel?: AutomationDraftData['riskLevel'];
  requiresApproval?: boolean;
  frequencyCap?: string;
}): AutomationDraftData {
  return {
    id: createAutomationId(),
    title: params.title,
    status: 'draft_ready',
    summary: params.summary,
    sourceText: params.command,
    trigger: params.trigger,
    audience: params.audience,
    action: params.action,
    frequencyCap: params.frequencyCap ?? '同一顾客同一策略 7 天内最多触达 1 次',
    riskLevel: params.riskLevel ?? 'low',
    requiresApproval: params.requiresApproval ?? false,
    missingFields: [],
    suggestions: [],
  };
}

function buildAutomationQuestion(params: {
  command: string;
  title: string;
  summary: string;
  question: string;
  missingField: string;
  suggestions: string[];
}): AutomationDraftData {
  return {
    id: createAutomationId(),
    title: params.title,
    status: 'needs_info',
    summary: params.summary,
    sourceText: params.command,
    trigger: '待补充',
    audience: '待补充',
    action: '待补充',
    frequencyCap: '补齐信息后自动应用门店默认频控',
    riskLevel: 'low',
    requiresApproval: false,
    missingFields: [params.missingField],
    question: params.question,
    suggestions: params.suggestions,
  };
}

export async function createAutomationDraft(params: {
  role: Role;
  command: string;
  pendingDraft?: AutomationDraftData | null;
}): Promise<AutomationDraftData> {
  const rawCommand = normalizeAutomationText(params.command);
  const command = normalizeAutomationText([params.pendingDraft?.sourceText, rawCommand].filter(Boolean).join(' '));

  if (!command) {
    return buildAutomationQuestion({
      command,
      title: '新建自动提醒',
      summary: '你可以直接说一句门店业务，比如“每天闭店前提醒我看未收款订单”。',
      question: '你想让 Ami 自动提醒什么？',
      missingField: 'intent',
      suggestions: ['每天 21:30 看收工报告', '顾客护理后 25 天回访', '次卡剩 1 次提醒前台'],
    });
  }

  const timeText = extractAutomationTime(command);

  if (/迟到|超时未到|未到店/.test(command)) {
    const minutes = extractNumberBeforeUnit(command, '分钟') ?? 10;
    return buildAutomationDraft({
      command,
      title: '预约迟到提醒',
      summary: `当顾客超过预约时间 ${minutes} 分钟仍未到店，提醒前台及时处理。`,
      trigger: `超过预约时间 ${minutes} 分钟未到店`,
      audience: '今日有预约且未到店顾客',
      action: '提醒前台电话确认，并在今日预约卡片标记“需跟进”',
      frequencyCap: '同一预约最多提醒 1 次',
    });
  }

  if (/预约.*提醒|预约前|来店前|到店前/.test(command)) {
    const hours = extractNumberBeforeUnit(command, '小时') ?? 2;
    return buildAutomationDraft({
      command,
      title: '预约前提醒',
      summary: `顾客预约前 ${hours} 小时自动生成提醒，减少忘约和迟到。`,
      trigger: `预约开始前 ${hours} 小时`,
      audience: '今日及未来有预约的顾客',
      action: '生成顾客提醒草稿，并同步给前台查看',
      riskLevel: 'medium',
      requiresApproval: true,
      frequencyCap: '同一预约最多提醒 2 次',
    });
  }

  if (/护理|服务后|做完|补水|敏感肌|回访/.test(command)) {
    const hasClearProject = /补水|清洁|抗衰|面部|身体|肩颈|敏感肌|水光|祛痘/.test(command);
    if (!hasClearProject && /护理|服务后|做完/.test(command)) {
      return buildAutomationQuestion({
        command,
        title: '护理周期回访',
        summary: 'Ami 已理解为服务后回访自动化，还需要确认适用项目范围。',
        question: '要针对哪些护理项目？例如“补水类项目”“所有面部护理”或指定项目。',
        missingField: 'audience',
        suggestions: ['补水类项目', '所有面部护理', '敏感肌护理'],
      });
    }

    const days = extractNumberBeforeUnit(command, '天') ?? 25;
    const projectLabel = /敏感肌/.test(command)
      ? '敏感肌护理顾客'
      : /补水/.test(command)
        ? '补水类项目顾客'
        : '指定护理项目顾客';
    return buildAutomationDraft({
      command,
      title: '护理周期回访',
      summary: `顾客完成护理后第 ${days} 天，如果还没有下次预约，就提醒员工回访。`,
      trigger: `服务完成后第 ${days} 天上午 10:00`,
      audience: projectLabel,
      action: /自动发送|发给顾客|短信|微信/.test(command)
        ? '生成顾客提醒消息草稿，确认后发送'
        : '给负责美容师生成回访任务',
      riskLevel: /自动发送|短信|微信/.test(command) ? 'medium' : 'low',
      requiresApproval: /自动发送|短信|微信/.test(command),
      frequencyCap: '同一顾客 30 天内最多提醒 1 次',
    });
  }

  if (/次卡|卡项|到期|剩\s*\d*\s*次|续卡/.test(command)) {
    const remaining = extractNumberBeforeUnit(command, '次') ?? 1;
    const days = extractNumberBeforeUnit(command, '天') ?? 30;
    return buildAutomationDraft({
      command,
      title: '次卡剩余/到期提醒',
      summary: `当顾客次卡剩 ${remaining} 次或 ${days} 天内到期，生成前台跟进任务。`,
      trigger: `次卡剩余 ${remaining} 次，或 ${days} 天内到期`,
      audience: '持有有效次卡的顾客',
      action: '生成前台跟进任务，并推荐续卡/使用提醒话术',
      riskLevel: 'medium',
      requiresApproval: true,
      frequencyCap: '同一卡项 14 天内最多提醒 1 次',
    });
  }

  if (/库存|补货|低于|少于/.test(command)) {
    const threshold = extractNumberBeforeUnit(command, '瓶|件|个|盒') ?? null;
    return buildAutomationDraft({
      command,
      title: '低库存提醒',
      summary: threshold ? `当库存低于 ${threshold} 件时提醒店长补货。` : '当库存低于安全库存时提醒店长补货。',
      trigger: threshold ? `库存数量低于 ${threshold}` : '库存低于系统安全库存',
      audience: '门店库存商品',
      action: '给店长生成补货提醒，并展示当前库存和建议补货量',
      frequencyCap: '同一商品每天最多提醒 1 次',
    });
  }

  if (/收工|闭店|下班|未收款|未付款|未完成服务|经营报告|日报/.test(command)) {
    if (!timeText) {
      return buildAutomationQuestion({
        command,
        title: '每日收工检查',
        summary: 'Ami 已理解为店长每日经营提醒，还需要确认提醒时间。',
        question: '你希望什么时候提醒？可以选“每天 21:00”“每天闭店前”或直接输入时间。',
        missingField: 'trigger',
        suggestions: ['每天 21:00', '每天 21:30', '每天闭店前'],
      });
    }

    return buildAutomationDraft({
      command,
      title: '每日收工检查',
      summary: '每天自动汇总未收款、未完成服务和库存风险，帮助店长闭店前检查。',
      trigger: timeText,
      audience: '当前门店今日经营数据',
      action: '生成店长提醒卡片，汇总未支付订单、未完成服务任务和低库存商品',
      frequencyCap: '每天执行 1 次',
    });
  }

  if (/生日/.test(command)) {
    return buildAutomationDraft({
      command,
      title: '顾客生日关怀',
      summary: '在顾客生日到来前生成关怀提醒和祝福话术。',
      trigger: '顾客生日提前 7 天上午 09:00',
      audience: '当前门店有生日信息的会员顾客',
      action: '生成生日关怀消息草稿，确认后发送',
      riskLevel: 'medium',
      requiresApproval: true,
      frequencyCap: '同一顾客每年最多触达 1 次',
    });
  }

  return buildAutomationQuestion({
    command,
    title: '新建自动提醒',
    summary: 'Ami 需要再确认触发时间，避免把门店业务提醒设置错。',
    question: '这条自动化希望什么时候触发？例如“每天 21:30”“预约前 2 小时”或“服务完成后第 25 天”。',
    missingField: 'trigger',
    suggestions: ['每天 21:30', '预约前 2 小时', '服务完成后第 25 天'],
  });
}

export async function enableAutomationDraft(draft: AutomationDraftData): Promise<AutomationDraftData> {
  if (draft.status !== 'draft_ready' || draft.missingFields.length) {
    throw new Error('自动化草稿信息还不完整，请先补齐追问信息');
  }

  const strategy: TerminalAutomationStrategy = await createTerminalAutomationStrategy(
    buildTerminalAutomationRequestFromDraft(draft),
  );

  return {
    ...draft,
    persistedStrategyId: strategy.id,
    persistedStatus: strategy.status,
  };
}

function buildTerminalAutomationRequestFromDraft(draft: AutomationDraftData) {
  return {
    draftId: draft.id,
    title: draft.title,
    summary: draft.summary,
    sourceText: draft.sourceText,
    trigger: draft.trigger,
    audience: draft.audience,
    action: draft.action,
    frequencyCap: draft.frequencyCap,
    riskLevel: draft.riskLevel,
    requiresApproval: draft.requiresApproval,
    missingFields: draft.missingFields,
  };
}

export async function previewAutomationDraft(draft: AutomationDraftData): Promise<AutomationPreviewData> {
  if (draft.status !== 'draft_ready' || draft.missingFields.length) {
    throw new Error('自动化草稿信息还不完整，请先补齐追问信息');
  }

  return previewTerminalAutomationStrategy(buildTerminalAutomationRequestFromDraft(draft));
}

function mapAutomationExecutionSummary(item: TerminalAutomationTodaySummary['latestExecutions'][number]) {
  return {
    id: item.id,
    strategyId: item.strategyId,
    strategyName: item.strategyName,
    status: item.status,
    triggeredCount: item.triggeredCount,
    reachedCount: item.reachedCount,
    channel: item.channel,
    executedAt: item.executedAt,
    message: item.message,
    reason: item.reason,
    nextActions: item.nextActions,
    primaryActionLabel: item.primaryActionLabel,
    detailLines: item.detailLines,
  };
}

function mapAutomationTodaySummary(summary: TerminalAutomationTodaySummary): AutomationTodaySummaryData {
  return {
    date: summary.date,
    strategyCount: summary.strategyCount,
    enabledCount: summary.enabledCount,
    waitingApprovalCount: summary.waitingApprovalCount,
    executedCount: summary.executedCount,
    successCount: summary.successCount,
    failedCount: summary.failedCount,
    latestStrategies: summary.latestStrategies.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      trigger: item.trigger,
      action: item.action,
      riskLevel: item.riskLevel,
      requiresApproval: item.requiresApproval,
      lastExecutedAt: item.lastExecutedAt,
    })),
    latestExecutions: summary.latestExecutions.map(mapAutomationExecutionSummary),
  };
}

function mapAutomationTemplates(
  items: Awaited<ReturnType<typeof getTerminalAutomationTemplates>>,
): AutomationTemplateData[] {
  return items.map((item) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    description: item.description,
    command: item.command,
    defaultTrigger: item.defaultTrigger,
    defaultAudience: item.defaultAudience,
    defaultAction: item.defaultAction,
    riskLevel: item.riskLevel,
  }));
}

function mapAutomationExecutionDetail(
  item: Awaited<ReturnType<typeof getTerminalAutomationExecutionDetail>>,
): AutomationExecutionDetailData {
  return {
    id: item.id,
    strategyId: item.strategyId,
    strategyName: item.strategyName,
    status: item.status,
    triggeredCount: item.triggeredCount,
    reachedCount: item.reachedCount,
    channel: item.channel,
    executedAt: item.executedAt,
    message: item.message,
    reason: item.reason,
    nextActions: item.nextActions,
    primaryActionLabel: item.primaryActionLabel,
    detailLines: item.detailLines,
    touches: item.touches.map((touch) => ({
      id: touch.id,
      customerId: touch.customerId,
      customerName: touch.customerName,
      customerPhone: touch.customerPhone,
      status: touch.status,
      channel: touch.channel,
      touchedAt: touch.touchedAt,
      convertedAt: touch.convertedAt,
      conversionType: touch.conversionType,
      predictedConversionScore: touch.predictedConversionScore,
      predictedRevenue: touch.predictedRevenue,
      attributionWindowDays: touch.attributionWindowDays,
    })),
  };
}

export async function getAutomationTodaySummary(): Promise<AutomationTodaySummaryData> {
  try {
    await runDueTerminalAutomations();
  } catch (err) {
    console.warn('Ami Aura Lite 自动化到期扫描失败，继续读取今日摘要', err);
  }
  const [summary, templates] = await Promise.all([
    getTerminalAutomationTodaySummary(),
    getTerminalAutomationTemplates().catch((err) => {
      console.warn('Ami Aura Lite 自动化模板加载失败，继续展示今日摘要', err);
      return [];
    }),
  ]);
  return {
    ...mapAutomationTodaySummary(summary),
    templates: mapAutomationTemplates(templates),
  };
}

export async function getAutomationExecutionDetail(executionId: number): Promise<AutomationExecutionDetailData> {
  return mapAutomationExecutionDetail(await getTerminalAutomationExecutionDetail(executionId));
}

export async function markAutomationTouchFollowedUp(touchId: number) {
  const touch = await markTerminalAutomationTouchFollowedUp(touchId);
  return {
    id: touch.id,
    customerId: touch.customerId,
    customerName: touch.customerName,
    customerPhone: touch.customerPhone,
    status: touch.status,
    channel: touch.channel,
    touchedAt: touch.touchedAt,
    convertedAt: touch.convertedAt,
    conversionType: touch.conversionType,
    predictedConversionScore: touch.predictedConversionScore,
    predictedRevenue: touch.predictedRevenue,
    attributionWindowDays: touch.attributionWindowDays,
  };
}

export async function enableAutomationStrategyFromSummary(strategyId: number): Promise<AutomationTodaySummaryData> {
  await enableTerminalAutomationStrategy(strategyId);
  return getAutomationTodaySummary();
}

export async function pauseAutomationStrategyFromSummary(strategyId: number): Promise<AutomationTodaySummaryData> {
  await pauseTerminalAutomationStrategy(strategyId);
  return getAutomationTodaySummary();
}

export async function runAutomationStrategyOnceFromSummary(strategyId: number) {
  return mapAutomationExecutionSummary(await runTerminalAutomationOnce(strategyId));
}

function normalizeAutomationCommandKeyword(text: string) {
  return text.replace(/\s+/g, '').toLowerCase();
}

function isAutomationOperationCommand(command: string) {
  return (
    /自动化|自动管家|提醒|定时|执行一次|立即执行|启用|确认启用|暂停/.test(command) &&
    /执行一次|立即执行|启用|确认启用|暂停/.test(command)
  );
}

function matchAutomationStrategy(command: string, strategies: AutomationTodaySummaryData['latestStrategies']) {
  const normalizedCommand = normalizeAutomationCommandKeyword(command);
  const aliases: Array<[RegExp, string[]]> = [
    [/营业结束|每日营业|收工|闭店|未收款|经营报告|日报/, ['每日收工', '收工', '闭店', '未收款', '经营']],
    [/预约前|来店前|到店前/, ['预约前', '预约开始前']],
    [/迟到|未到店/, ['迟到', '未到店', '预约']],
    [/护理|回访|服务完成/, ['护理', '回访', '服务完成']],
    [/次卡|卡项|到期|续卡/, ['次卡', '卡项', '到期', '续卡']],
    [/库存|补货|低库存/, ['库存', '补货', '低库存']],
  ];

  return (
    strategies.find((strategy) => {
      const haystack = normalizeAutomationCommandKeyword(`${strategy.title}${strategy.trigger}${strategy.action}`);
      const title = normalizeAutomationCommandKeyword(strategy.title);
      return Boolean(haystack) && (normalizedCommand.includes(title) || haystack.includes(normalizedCommand));
    }) ??
    aliases
      .find(([pattern]) => pattern.test(command))?.[1]
      .map((keyword) => normalizeAutomationCommandKeyword(keyword))
      .map((keyword) =>
        strategies.find((strategy) =>
          normalizeAutomationCommandKeyword(`${strategy.title}${strategy.trigger}${strategy.action}`).includes(keyword),
        ),
      )
      .find(Boolean)
  );
}

export async function tryHandleAutomationTextOperation(command: string): Promise<AutomationTodaySummaryData | null> {
  if (!isAutomationOperationCommand(command)) return null;

  const summary = await getAutomationTodaySummary();
  const strategy = matchAutomationStrategy(command, summary.latestStrategies);
  if (!strategy) {
    throw new Error('还没有找到匹配的自动化策略，请先用发送按钮右侧的定时图标创建自动化草稿。');
  }

  if (/暂停/.test(command)) {
    await pauseTerminalAutomationStrategy(strategy.id);
    return getAutomationTodaySummary();
  }

  if (/启用|确认启用/.test(command)) {
    await enableTerminalAutomationStrategy(strategy.id);
    return getAutomationTodaySummary();
  }

  if (/执行一次|立即执行/.test(command)) {
    if (strategy.status !== 'enabled') {
      throw new Error(
        `“${strategy.title}”当前是${strategy.status === 'draft' ? '待确认' : '未启用'}状态，请先确认启用后再执行一次。`,
      );
    }
    await runTerminalAutomationOnce(strategy.id);
    return getAutomationTodaySummary();
  }

  return summary;
}

function isLowStock(item: { status?: string; currentStock?: number; safetyStock?: number }) {
  return item.status === '低库存' || item.status === '缺货' || item.status === '浣庡簱瀛?' || item.status === '缂鸿揣';
}

function lowStockCount(items: Array<{ status?: string; currentStock?: number; safetyStock?: number }>) {
  return items.filter(isLowStock).length;
}

export async function getManagerDashboard(): Promise<DashboardCardData> {
  const session = await getAuraBootstrapSession();
  const storeName = session.storeName;
  const fallbackReasons: string[] = [];
  try {
    return normalizeManagerDashboard(await getTerminalManagerDashboard(), storeName);
  } catch (err) {
    console.warn('Ami Aura Lite 轻量经营看板加载失败，降级到角色聚合', err);
    fallbackReasons.push(formatCoreError(err));
  }

  try {
    return normalizeManagerDashboard((await fetchCachedRoleDashboard()).manager, storeName);
  } catch (err) {
    console.warn('Ami Aura Lite 聚合经营数据加载失败，降级到轻量 Core 查询', err);
    fallbackReasons.push(formatCoreError(err));
  }

  const { bootstrap, storeId } = await getAuraBootstrapSession();
  const today = getTodayRange().today;
  const [
    customersPage,
    reservationsPage,
    terminalReservationsResult,
    stockPage,
    cardsResult,
    ordersPage,
    beauticiansResult,
  ] = await Promise.all([
    optionalCoreCall('客户分页数据', () => getCustomersPaginated({ page: 1, pageSize: 1, storeName }), {
      items: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 1,
    }),
    optionalCoreCall('预约分页数据', () => getReservationsPaginated({ page: 1, pageSize: 8, storeName }), {
      items: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 8,
    }),
    optionalCoreCall('终端今日预约', () => getTerminalReservations({ date: today, storeName }), []),
    optionalCoreCall('库存分页数据', () => getStockItemsPaginated({ page: 1, pageSize: 8, storeId }), {
      items: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 8,
    }),
    optionalCoreCall('卡项数据', () => getCards(), []),
    optionalCoreCall('商品订单分页数据', () => getProductOrdersPaginated({ page: 1, pageSize: 8 }), {
      items: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 8,
    }),
    optionalCoreCall('美容师数据', () => getBeauticians({ storeName }), []),
  ]);

  const terminalReservations = asList<CoreSnapshot['reservations'][number]>(
    terminalReservationsResult.data as unknown as CoreSnapshot['reservations'],
  );
  const reservations = terminalReservations.length
    ? terminalReservations
    : asList<CoreSnapshot['reservations'][number]>(reservationsPage.data);
  const todayReservations = reservations.filter((item) => isReservationOnDate(item, today));
  const arrivedReservations = todayReservations.filter((item) => isArrivedReservation(item as Record<string, any>));
  const selectedReservations = todayReservations.length ? todayReservations : reservations.slice(0, 5);
  const stockItems = asList<CoreSnapshot['stockItems'][number]>(stockPage.data);
  const lowStock = stockItems.filter(isLowStock);
  const orders = filterByStoreName(asList<CoreSnapshot['orders'][number]>(ordersPage.data), storeName);
  const totalRevenue = sum(orders, (order) => order.totalAmount);
  const orderCount = getTotal(ordersPage.data, orders.length);
  const cashIncome = totalRevenue;
  const grossProfit = totalRevenue;
  const grossMargin = totalRevenue > 0 ? 100 : 0;
  const beauticians = asList<CoreSnapshot['beauticians'][number]>(beauticiansResult.data);
  const topBeautician = beauticians[0];
  const customers = asList<CoreSnapshot['customers'][number]>(customersPage.data);
  const customerTotal = getTotal(customersPage.data, customers.length);
  const activeCustomerTotal = customers.length
    ? customers.filter((customer) => Number((customer as Record<string, any>).visitCount ?? 0) > 0).length
    : customerTotal;
  const lowStockTotal = getTotal(stockPage.data, lowStock.length);
  const stockRiskCount = lowStockTotal || lowStockCount(lowStock);
  const managerRisks: DashboardInsightItem[] = [
    {
      title: '库存补货优先',
      severity: stockRiskCount > 0 ? 'high' : 'low',
      reason:
        stockRiskCount > 0
          ? `${stockRiskCount} 项库存低于安全库存或需要补货。`
          : '当前未发现低库存商品，日结前继续复核耗材消耗。',
      action:
        stockRiskCount > 0
          ? '打开库存预警，先确认影响今日预约项目的耗材，低于安全库存的商品创建补货单。'
          : '保持日结前盘点，发现低库存后再创建补货单。',
      relatedType: 'inventory',
    },
    {
      title: '预约处理优先',
      severity: selectedReservations.length >= 3 ? 'high' : selectedReservations.length > 0 ? 'medium' : 'low',
      reason:
        selectedReservations.length > 0
          ? `${selectedReservations.length} 个预约需要优先确认到店、服务状态或后续收银。`
          : '当前暂无需要优先处理的今日预约。',
      action:
        selectedReservations.length > 0
          ? '进入预约工作台，按预约时间从近到远完成到店确认；超时未到店的先电话提醒。'
          : '继续关注新增预约，临近到店前由前台确认客户状态。',
      relatedType: 'reservation',
    },
    topBeautician
      ? {
          title: '员工负载关注',
          severity: 'medium',
          reason: `重点关注 ${topBeautician.name} 的排班与服务负载。`,
          action: `打开员工排班，检查 ${topBeautician.name} 今日忙碌和预约时段，必要时把新增预约分流给空闲美容师。`,
          relatedType: 'staff',
          relatedId: topBeautician.id,
        }
      : {
          title: '员工排班待补齐',
          severity: 'low',
          reason: '当前暂无员工排班数据。',
          action: '先同步或维护今日美容师排班，再分配预约、服务和收银协作。',
          relatedType: 'staff',
        },
  ];
  const apiStatus =
    getFallbackStatus(
      [
        customersPage,
        reservationsPage,
        terminalReservationsResult,
        stockPage,
        cardsResult,
        ordersPage,
        beauticiansResult,
      ],
      '经营看板数据',
    ) ??
    (fallbackReasons.length ? { source: 'fallback', label: '经营看板', error: fallbackReasons.join('；') } : undefined);

  return {
    title: '店长经营驾驶舱',
    subtitle: bootstrap.currentStore?.name ?? '当前门店',
    summary: `当前门店 ${bootstrap.currentStore?.name ?? '未选择门店'} 已接入 Ami_Core 数据，优先关注经营、风险和员工协同。`,
    kpis: [
      { label: '营业收入', value: `￥${totalRevenue.toLocaleString()}` },
      { label: '现金收入', value: `￥${cashIncome.toLocaleString()}` },
      { label: '毛利/毛利率', value: `￥${grossProfit.toLocaleString()} / ${grossMargin.toFixed(2)}%` },
      { label: '预约客户', value: String(todayReservations.length) },
      { label: '到店客户', value: String(arrivedReservations.length) },
      { label: '订单', value: String(orderCount) },
    ],
    risks: managerRisks,
    highlights: [
      `营业收入约 ￥${totalRevenue.toLocaleString()}`,
      `现金收入约 ￥${cashIncome.toLocaleString()}`,
      `今日预约客户 ${todayReservations.length} 位，到店 ${arrivedReservations.length} 位`,
    ],
    apiStatus,
  };
}

export async function getReceptionDashboard(): Promise<AppointmentCardData> {
  const { storeName } = await getAuraBootstrapSession();
  const fallbackReasons: string[] = [];
  try {
    return normalizeReceptionDashboard(await getTerminalTodayReservationsDashboard(), storeName);
  } catch (err) {
    console.warn('Ami Aura Lite 轻量今日预约加载失败，降级到角色聚合', err);
    fallbackReasons.push(formatCoreError(err));
  }

  try {
    const reception = (await fetchCachedRoleDashboard()).reception;
    return normalizeReceptionDashboard(reception, storeName);
  } catch (err) {
    console.warn('Ami Aura Lite 聚合接待数据加载失败，降级到轻量预约查询', err);
    fallbackReasons.push(formatCoreError(err));
  }

  const today = getTodayRange().today;
  const terminalReservationsResult = await optionalCoreCall(
    '终端今日预约',
    () => getTerminalReservations({ date: today, storeName }),
    [],
  );
  const terminalReservations = terminalReservationsResult.data;
  let legacyReservationsResult: CoreCallResult<unknown> | undefined;
  const legacyReservations = terminalReservations.length
    ? []
    : (legacyReservationsResult = await optionalCoreCall(
        '预约分页数据',
        () => getReservationsPaginated({ page: 1, pageSize: 10, storeName }),
        {
          items: [],
          data: [],
          total: 0,
          page: 1,
          pageSize: 10,
        },
      )).data;
  const selected = terminalReservations.length
    ? terminalReservations
    : asList<Record<string, any>>(legacyReservations)
        .filter((item) => isReservationOnDate(item, today))
        .slice(0, 10);
  const apiStatus =
    getFallbackStatus([terminalReservationsResult, legacyReservationsResult], '预约看板数据') ??
    (fallbackReasons.length ? { source: 'fallback', label: '预约看板', error: fallbackReasons.join('；') } : undefined);

  return {
    title: '今日接待工作台',
    subtitle: storeName ?? '接待中心',
    items: selected.map((item) => toAppointmentViewItemFromTerminal(item as Record<string, any>)),
    summary: `当前共有 ${selected.length} 条预约待处理，核心动作是到店确认、核销、收银和打印。`,
    apiStatus,
  };
}

export async function getCashierShiftStatus() {
  try {
    return await getTerminalCurrentCashierShift();
  } catch (err) {
    console.warn('Ami Aura Lite 收银班次加载失败', err);
    return null;
  }
}

export async function openCashierShift(openingCash: number) {
  return openTerminalCashierShift(openingCash);
}

export async function closeCashierShift(shiftId: number | undefined, closingCash: number) {
  return closeTerminalCashierShift(shiftId, closingCash);
}

export interface AppointmentEditOptions {
  projects: Project[];
  beauticians: Beautician[];
}

export interface AppointmentCreateOptions extends AppointmentEditOptions {
  customers: CoreSnapshot['customers'];
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
    optionalCoreCall<unknown>('终端目录', () => getTerminalCatalogSync(), null),
    optionalCoreCall('项目数据', () => getProjects(), []),
    optionalCoreCall('美容师数据', () => getBeauticians({ storeName }), []),
  ]);
  const catalog =
    catalogResult.data && typeof catalogResult.data === 'object' ? (catalogResult.data as Record<string, unknown>) : {};
  const terminalProjects = asList<Project>(catalog.projects);
  const terminalBeauticians = asList<Beautician>(catalog.beauticians);
  const adminBeauticians = asList<Beautician>(beauticians.data);
  const projectItems = terminalProjects.length ? terminalProjects : asList<Project>(projects.data);
  const beauticianItems = adminBeauticians.length ? adminBeauticians : terminalBeauticians;

  return {
    projects: filterByStoreName(projectItems, storeName).filter((project) => project.status !== false),
    beauticians: filterByStoreName(beauticianItems, storeName).filter(isSelectableBeautician),
  };
}

export async function getAppointmentCreateOptions(): Promise<AppointmentCreateOptions> {
  const options = await getAppointmentEditOptions();
  return {
    customers: [],
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
    throw new Error('请选择有效客户');
  }
  if (!project) {
    throw new Error('请选择有效项目');
  }
  if (!beautician) {
    throw new Error('请选择有效美容师');
  }

  const payload: TerminalReservationCreateRequest = {
    idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `aura-reservation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone || '',
    projectId: project.id,
    projectName: project.name,
    beauticianId: beautician.id,
    beauticianName: beautician.name,
    appointmentTime: input.appointmentTime,
    duration: input.duration || project.duration || 60,
    remark: input.remark,
  };
  const created = await createTerminalReservation(payload);
  invalidateReservationCaches(true);

  return {
    title: '预约已创建',
    subtitle: created.storeName,
    status: 'success',
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
  invalidateReservationCaches(true);

  return {
    title: '预约已修改',
    subtitle: updated.storeName,
    status: 'success',
    description: `${updated.customerName} 的预约已改到 ${formatAppointmentTime(updated.appointmentTime)}，项目：${updated.projectName}，服务人员：${updated.beauticianName}。`,
    nextSteps: [],
  };
}

export async function confirmAppointmentFromTerminal(reservationId: number): Promise<OperationResultData> {
  const updated = await confirmTerminalReservation(reservationId);
  invalidateReservationCaches();
  return {
    title: '预约已确认',
    subtitle: updated.storeName,
    status: 'success',
    description: `${updated.customerName} 的 ${updated.projectName} 已确认，预约时间：${formatAppointmentTime(updated.appointmentTime)}。`,
    nextSteps: [],
  };
}

export async function checkInAppointmentFromTerminal(reservationId: number): Promise<OperationResultData> {
  const updated = await checkInTerminalReservation(reservationId);
  invalidateReservationCaches();
  const serviceTaskText = updated.serviceTask ? `，服务任务 ${updated.serviceTask.taskNo} 已同步生成` : '';
  return {
    title: '客户已到店',
    subtitle: updated.storeName,
    status: 'success',
    description: `${updated.customerName} 已确认到店${serviceTaskText}，可继续核销、开单或通知美容师接待。`,
    nextSteps: [],
  };
}

export async function cancelAppointmentFromTerminal(
  reservationId: number,
  reason?: string,
): Promise<OperationResultData> {
  const updated = await cancelTerminalReservation(reservationId, reason);
  invalidateReservationCaches(true);
  return {
    title: '预约已取消',
    subtitle: updated.storeName,
    status: 'warning',
    description: `${updated.customerName} 的 ${updated.projectName} 已取消${reason ? `，原因：${reason}` : ''}。`,
    nextSteps: [],
  };
}

export async function getBeauticianDashboard(): Promise<StaffScheduleCardData> {
  const { bootstrap, storeName } = await getAuraBootstrapSession();
  const currentBeautician = bootstrap.currentBeautician ?? null;

  if (!currentBeautician?.id) {
    return buildEmptyBeauticianDashboard(storeName, {
      source: 'fallback',
      label: '美容师账号绑定',
      error: '当前终端账号未绑定美容师档案，请在管理端用户管理/美容师管理完成绑定后刷新。',
    });
  }

  try {
    const dashboard = await getCurrentTerminalBeauticianDashboard({
      date: getTodayRange().today,
      ...getActiveOperatorParams(),
    });
    const mapped = mapBeauticianDashboardToStaffSchedule(dashboard, storeName);
    if (mapped) return mapped;
  } catch (err) {
    console.warn('Ami Aura Lite 美容师本人工作台加载失败，降级到排班摘要', err);
  }

  try {
    const staff = await loadWeeklyStaffSchedules();
    const matched = staff.find((item) => item.beautician?.id === currentBeautician.id);
    return (
      matched ??
      buildCurrentBeauticianEmptyDashboard(currentBeautician, storeName, {
        source: 'api',
        label: '本人排班',
      })
    );
  } catch (err) {
    console.warn('Ami Aura Lite 管理端排班数据加载失败，返回排班空态', err);
  }

  return buildCurrentBeauticianEmptyDashboard(currentBeautician, storeName, {
    source: 'fallback',
    label: '本人排班',
    error: '本人排班数据加载失败，请稍后重试。',
  });
}

export async function getStaffSchedules(): Promise<StaffScheduleCardData[]> {
  try {
    return await loadWeeklyStaffSchedules();
  } catch (err) {
    console.warn('Ami Aura Lite 管理端排班数据加载失败，返回排班空态', err);
  }

  const { storeName } = await getAuraBootstrapSession();
  return [buildEmptyBeauticianDashboard(storeName)];
}

function buildCustomerGrowthCandidates(snapshot: CoreSnapshot): CustomerCardData[] {
  const scored = [...snapshot.customers].map((customer) => {
    const daysSinceVisit = getDaysSince(customer.lastVisitDate);
    const todayReservation = getCustomerReservation(snapshot, customer.id, customer.name);
    const hasTodayReservation = Boolean(
      todayReservation && isReservationOnDate(todayReservation, getTodayRange().today),
    );
    const totalSpent = customer.totalSpent ?? 0;
    const visitCount = customer.visitCount ?? 0;
    const score =
      (daysSinceVisit >= 120 ? 5 : daysSinceVisit >= 90 ? 4 : daysSinceVisit >= 60 ? 3 : daysSinceVisit >= 30 ? 1 : 0) +
      (totalSpent >= 10_000 ? 3 : totalSpent >= 5_000 ? 2 : totalSpent >= 1_000 ? 1 : 0) +
      (visitCount >= 5 ? 2 : visitCount >= 2 ? 1 : 0) -
      (hasTodayReservation ? 3 : 0);

    return { customer, daysSinceVisit, hasTodayReservation, score };
  });

  const candidates = scored
    .filter((item) => item.score >= 3)
    .sort(
      (a, b) =>
        b.score - a.score || b.customer.totalSpent - a.customer.totalSpent || b.daysSinceVisit - a.daysSinceVisit,
    )
    .slice(0, 6);

  const selected = candidates.length
    ? candidates
    : scored
        .sort(
          (a, b) =>
            b.score - a.score || b.customer.totalSpent - a.customer.totalSpent || b.daysSinceVisit - a.daysSinceVisit,
        )
        .slice(0, 6);

  return selected.map(({ customer, daysSinceVisit, hasTodayReservation, score }) => {
    const recentOrders = snapshot.orders
      .filter((order) => order.customerName.includes(customer.name))
      .slice(0, 2)
      .map((order) => `${order.createdAt} · ￥${order.totalAmount.toLocaleString()}`);

    return {
      customer,
      summary: `${getChurnRiskLevel(score)}：最近 ${daysSinceVisit >= 999 ? '暂无有效到店记录' : `${daysSinceVisit} 天未到店`}，建议优先做回访和预约唤醒。`,
      reasons: [
        `最近到店：${customer.lastVisitDate || '暂无'}`,
        `累计消费 ￥${customer.totalSpent.toLocaleString()}`,
        `到店 ${customer.visitCount} 次`,
        hasTodayReservation ? '今日已有预约，跟进优先级降低' : '今日无预约，建议主动触达',
        customer.tags?.length ? `标签：${customer.tags.slice(0, 3).join('、')}` : '暂无标签',
      ],
      recentVisits: [customer.lastVisitDate, ...recentOrders].filter(Boolean),
    };
  });
}

function formatFollowUpTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getTerminalFollowUpRole(role: AuraRole) {
  if (role === 'manager') return 'manager';
  if (role === 'reception') return 'reception';
  return 'consultant';
}

function getFollowUpTaskStatusRank(status?: string) {
  if (status === 'expired') return 0;
  if (status === 'in_progress') return 1;
  if (status === 'pending') return 2;
  return 3;
}

function getFollowUpTaskPriorityRank(priority?: string) {
  if (priority === 'urgent') return 0;
  if (priority === 'recommended') return 1;
  if (priority === 'opportunity') return 2;
  return 3;
}

function sortFollowUpTasks(items: TerminalFollowUpTask[]) {
  return [...items].sort((left, right) => {
    const statusDiff = getFollowUpTaskStatusRank(left.status) - getFollowUpTaskStatusRank(right.status);
    if (statusDiff) return statusDiff;
    const priorityDiff = getFollowUpTaskPriorityRank(left.priority) - getFollowUpTaskPriorityRank(right.priority);
    if (priorityDiff) return priorityDiff;
    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return leftDue - rightDue;
  });
}

export async function getFollowUpTasksView(): Promise<FollowUpTasksCardData> {
  const { bootstrap, storeName } = await getAuraBootstrapSession();
  const assigneeRole = getTerminalFollowUpRole(bootstrap.currentRole);
  const operatorId = getActiveOperatorParams()?.operatorId ?? bootstrap.currentUser?.id ?? undefined;
  const queryBase = {
    page: 1,
    pageSize: 20,
    assigneeRole,
    ...(operatorId ? { operatorId } : {}),
  };
  const responses = await Promise.all([
    getTerminalFollowUpTasks({ ...queryBase, status: 'expired' }),
    getTerminalFollowUpTasks({ ...queryBase, status: 'in_progress' }),
    getTerminalFollowUpTasks({ ...queryBase, status: 'pending' }),
  ]);
  const unique = new Map<number, TerminalFollowUpTask>();
  responses.flatMap((response) => response.items).forEach((task) => unique.set(task.id, task));
  const items = sortFollowUpTasks([...unique.values()]).slice(0, 20);
  const firstSummary = responses.find((response) => response.summary)?.summary;
  const pending = items.filter((task) => task.status === 'pending').length;
  const inProgress = items.filter((task) => task.status === 'in_progress').length;
  const expired = items.filter((task) => task.status === 'expired').length;

  return {
    title: '客户跟进',
    subtitle: `${AURA_ROLE_LABELS[bootstrap.currentRole]} · ${storeName || '当前门店'}`,
    summary: items.length
      ? `共 ${items.length} 条管理端下发任务，待处理 ${pending} 条，跟进中 ${inProgress} 条，已逾期 ${expired} 条。`
      : '暂无管理端下发给当前账号的客户跟进任务。',
    items,
    stats: firstSummary
      ? {
          ...firstSummary,
          pending: firstSummary.pending ?? pending,
          in_progress: firstSummary.in_progress ?? firstSummary.inProgress ?? inProgress,
          inProgress: firstSummary.inProgress ?? firstSummary.in_progress ?? inProgress,
          expired: firstSummary.expired ?? expired,
          completed: firstSummary.completed ?? 0,
          overdue: firstSummary.overdue ?? expired,
        }
      : {
          pending,
          in_progress: inProgress,
          inProgress,
          completed: 0,
          expired,
          overdue: expired,
        },
    generatedAt: new Date().toISOString(),
  };
}

export async function getCustomerGrowthCandidates(): Promise<CustomerCardData[]> {
  const { bootstrap, storeName } = await getAuraBootstrapSession();
  const followUpRole =
    bootstrap.currentRole === 'manager' ? 'manager' : bootstrap.currentRole === 'reception' ? 'reception' : 'consultant';
  try {
    const followUpItems =
      bootstrap.currentRole === 'manager'
        ? (
            await Promise.all([
              getTerminalFollowUpTasks({ page: 1, pageSize: 10, status: 'pending' }),
              getTerminalFollowUpTasks({ page: 1, pageSize: 10, status: 'expired' }),
            ])
          ).flatMap((result) => result.items)
        : (await getTerminalFollowUpTasks({ page: 1, pageSize: 10, status: 'pending', assigneeRole: followUpRole })).items;
    if (followUpItems.length) {
      return followUpItems.slice(0, 6).map((task) => ({
        customer: {
          id: task.customerId,
          name: task.customerName || `客户${task.customerId}`,
          phone: task.customerPhone ?? '',
          gender: '女',
          memberLevel: task.customerMemberLevel || task.priority || '待跟进',
          totalSpent: 0,
          visitCount: 0,
          lastVisitDate: task.dueAt ? `截止 ${formatFollowUpTime(task.dueAt)}` : '',
          tags: ['管理端下发', task.assigneeRole === 'manager' ? '店长跟进' : task.assigneeRole === 'reception' ? '前台跟进' : '顾问跟进'],
          source: '管理端下发任务',
          storeName,
          createdAt: task.createdAt ?? '',
        },
        summary: task.title || task.note || '管理端下发的客户跟进任务',
        reasons: [
          task.assignmentReason || '按智能推荐分派',
          task.script ? `话术：${task.script}` : '',
          task.dueAt ? `截止：${formatFollowUpTime(task.dueAt)}` : '',
        ].filter(Boolean),
        recentVisits: [task.createdAt ?? ''].filter(Boolean),
        followUpTask: task,
      }));
    }
  } catch (err) {
    console.warn('Ami Aura Lite follow-up tasks unavailable, fallback to prediction candidates', err);
  }

  try {
    const predictionCandidates = await getTerminalCustomerGrowthCandidates(10);
    if (predictionCandidates.length) {
      return predictionCandidates.slice(0, 6).map((item) => ({
        customer: {
          id: item.customerId,
          name: item.name,
          phone: item.phone ?? '',
          gender: '女',
          memberLevel: item.memberLevel ?? item.churnLevel,
          totalSpent: Number(item.totalSpent ?? 0),
          visitCount: Number(item.visitCount ?? 0),
          lastVisitDate: item.lastVisitDate ?? '',
          tags: item.tags?.length ? item.tags : ([item.churnLevel, item.ltvTier].filter(Boolean) as string[]),
          source: item.source ?? 'PredictionSnapshot',
          storeName,
          createdAt: '',
        },
        summary: item.reason,
        reasons: [
          `流失分：${item.churnScore}`,
          `复购分：${item.repurchase30dScore}`,
          item.marketingResponseScore == null ? '' : `营销响应：${item.marketingResponseScore}`,
          item.ltvTier ? `LTV：${item.ltvTier}` : '',
        ].filter(Boolean),
        recentVisits: [item.lastVisitDate ?? ''].filter(Boolean),
      }));
    }
  } catch (err) {
    console.warn('Ami Aura Lite prediction growth candidates unavailable, fallback to dashboard/local ranking', err);
  }

  try {
    const dashboard = await getTerminalCustomerGrowthDashboard();
    const items = asList<Record<string, any>>(dashboard.items);
    if (items.length) {
      return items.map((item, index) => {
        const relatedId = Number(item.relatedId ?? index + 1);
        const title = String(item.title ?? '客户增长机会');
        const reason = String(item.reason ?? dashboard.summary ?? '需要跟进的客户机会');
        const action = String(item.action ?? '安排顾问跟进');
        const customerName = String(
          (reason.match(/^([^ ，,。]+)\s/)?.[1] ?? title.replace(/客户|沉默|增长|流失|邀约/g, '').trim()) ||
            `客户${index + 1}`,
        );
        return {
          customer: {
            id: Number.isFinite(relatedId) && relatedId > 0 ? relatedId : index + 1,
            name: customerName,
            phone: '',
            gender: '女',
            memberLevel: String(item.severity ?? '需关注'),
            totalSpent: 0,
            visitCount: 0,
            lastVisitDate: '轻量看板',
            tags: [title],
            source: 'Ami_Core 轻量看板',
            storeName: dashboard.subtitle,
            createdAt: '',
          },
          summary: reason,
          reasons: [action, `来源：${dashboard.title}`],
          recentVisits: [],
        } satisfies CustomerCardData;
      });
    }
  } catch (err) {
    console.warn('Ami Aura Lite 轻量客户增长数据加载失败，降级到客户分页轻量查询', err);
  }

  const customersPage = await optionalCoreCall(
    '客户分页数据',
    () => getCustomersPaginated({ page: 1, pageSize: 10, storeName }),
    {
      items: [],
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
    },
  );
  const customers = asList<CoreSnapshot['customers'][number]>(customersPage.data).slice(0, 6);
  return customers.map((customer) => {
    const daysSinceVisit = getDaysSince(customer.lastVisitDate);
    const riskLabel = daysSinceVisit >= 90 ? '高风险' : daysSinceVisit >= 45 ? '中风险' : '需关注';
    return {
      customer,
      summary: `${riskLabel}：最近 ${daysSinceVisit >= 999 ? '暂无有效到店记录' : `${daysSinceVisit} 天未到店`}，建议优先做轻量回访。`,
      reasons: [
        `最近到店：${customer.lastVisitDate || '暂无'}`,
        `累计消费 ￥${Number(customer.totalSpent ?? 0).toLocaleString()}`,
        `到店 ${customer.visitCount ?? 0} 次`,
        customer.tags?.length ? `标签：${customer.tags.slice(0, 3).join('、')}` : '暂无标签',
      ],
      recentVisits: [customer.lastVisitDate].filter(Boolean),
    };
  });
}

export async function getAppointments(): Promise<AppointmentCardData> {
  return getReceptionDashboard();
}

function getCustomerReservation(snapshot: CoreSnapshot, customerId: number, customerName: string) {
  const today = getTodayRange().today;
  const related = snapshot.reservations.filter((reservation) => {
    const item = reservation as Record<string, any>;
    const reservationCustomer = findCustomerForReservation(snapshot, item);
    const reservationName = item.customerName ?? item.userName ?? '';
    const sameCustomer =
      reservationCustomer?.id === customerId ||
      reservationName === customerName ||
      reservationName.includes(customerName);
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

async function loadCardVerificationProjectsOnly() {
  const [catalogResult, projectsResult] = await Promise.all([
    optionalCoreCall<unknown>('终端目录', () => getTerminalCatalogSync(), null),
    optionalCoreCall('项目数据', () => getProjects(), []),
  ]);
  const catalog =
    catalogResult.data && typeof catalogResult.data === 'object' ? (catalogResult.data as Record<string, unknown>) : {};
  const terminalProjects = asList<Project>(catalog.projects);
  return terminalProjects.length ? terminalProjects : asList<Project>(projectsResult.data);
}

function toCardVerificationCardOptions(
  customerCards: TerminalCustomerCard[],
  projects: Project[],
): CardVerificationCardOption[] {
  return customerCards
    .filter((card) => card.status === 'active' && card.remainingTimes > 0)
    .map((card) => ({
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
    }));
}

function readNumericValue(...values: unknown[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
  }
  return 0;
}

function getCustomerMemberCardDeductMeta(customer: CoreSnapshot['customers'][number]) {
  const record = customer as Record<string, any>;
  const balanceAccount = Array.isArray(record.balanceAccounts) ? record.balanceAccounts[0] : undefined;
  const cashBalance = readNumericValue(record.cashBalance, balanceAccount?.cashBalance);
  const giftBalance = readNumericValue(record.giftBalance, balanceAccount?.giftBalance);
  const totalBalance = readNumericValue(
    record.totalBalance,
    record.memberBalance,
    record.balance,
    cashBalance + giftBalance,
  );
  return {
    enabled: totalBalance > 0,
    balance: totalBalance,
    label: totalBalance > 0 ? `储值余额 ￥${totalBalance.toLocaleString()}` : '无储值',
  };
}

function getActiveCustomerCardCount(customer: CoreSnapshot['customers'][number]) {
  const record = customer as Record<string, any>;
  return readNumericValue(
    record.activeCustomerCardsCount,
    record.customerCardsCount,
    Array.isArray(record.activeCards) ? record.activeCards.length : 0,
    Array.isArray(record.customerCards)
      ? record.customerCards.filter((card) => card?.status !== 'inactive' && Number(card?.remainingTimes ?? 0) > 0)
          .length
      : 0,
  );
}

function getContextCustomerDeductMeta(customer: TerminalContextCustomer) {
  const totalBalance = readNumericValue(customer.totalBalance, customer.cashBalance, customer.giftBalance);
  return {
    enabled: totalBalance > 0,
    balance: totalBalance,
    label: totalBalance > 0 ? `储值余额 ￥${totalBalance.toLocaleString()}` : '无储值',
  };
}

function toCashierCustomerFromContext(customer: TerminalContextCustomer) {
  const deductMeta = getContextCustomerDeductMeta(customer);
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    memberLevel: customer.memberLevel,
    tags: customer.tags?.slice(0, 3) ?? [],
    isAppointedToday: Boolean(customer.isAppointedToday),
    appointmentTime: customer.appointmentTime ? formatTimeOnly(customer.appointmentTime) : undefined,
    memberCardDeductEnabled: deductMeta.enabled,
    memberCardDeductBalance: deductMeta.balance,
    memberCardDeductLabel: deductMeta.label,
  };
}

function toCardVerificationCustomerFromContext(customer: TerminalContextCustomer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    avatarUrl: pickCustomerAvatarUrl(customer),
    memberLevel: customer.memberLevel,
    tags: customer.tags?.slice(0, 3) ?? [],
    profileLabel: customer.skinCondition || customer.source || '画像待补充',
    lastVisitDate: customer.lastVisitDate || '暂无到店记录',
    isAppointedToday: Boolean(customer.isAppointedToday),
    appointmentTime: customer.appointmentTime ? formatTimeOnly(customer.appointmentTime) : undefined,
    appointmentProjectName: customer.appointmentProjectName,
  };
}

function toCardVerificationCustomerFromSummary(
  customer: Awaited<ReturnType<typeof getTerminalCustomerSummary>>['customer'],
  contextCustomer?: TerminalContextCustomer | null,
): CardVerificationCustomer {
  const context = contextCustomer ? toCardVerificationCustomerFromContext(contextCustomer) : null;
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    avatarUrl: context?.avatarUrl ?? pickCustomerAvatarUrl(customer),
    memberLevel: customer.memberLevel,
    tags: customer.tags?.slice(0, 3) ?? [],
    profileLabel: customer.skinCondition || customer.source || context?.profileLabel || '画像待补充',
    lastVisitDate: customer.lastVisitDate || context?.lastVisitDate || '暂无到店记录',
    isAppointedToday: Boolean(context?.isAppointedToday),
    appointmentTime: context?.appointmentTime,
    appointmentProjectName: context?.appointmentProjectName,
  };
}

function toCustomerCardFromContext(customer: TerminalContextCustomer): CustomerCardData {
  const daysSinceVisit = getDaysSince(customer.lastVisitDate);
  const totalSpent = Number(customer.totalSpent ?? 0);
  const visitCount = Number(customer.visitCount ?? 0);
  const activeCardsCount = Number(customer.activeCustomerCardsCount ?? 0);
  const balance = Number(customer.totalBalance ?? 0);
  const gender = customer.gender === '男' ? '男' : '女';
  const summary =
    `${customer.name} 的档案来自 Ami_Core 轻量客户上下文，当前会员等级 ${customer.memberLevel || '普通客户'}，` +
    `${customer.isAppointedToday ? '今日已有预约' : '今日暂无预约'}。`;

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      gender,
      memberLevel: customer.memberLevel || '普通客户',
      totalSpent,
      visitCount,
      lastVisitDate: customer.lastVisitDate || '暂无',
      tags: customer.tags ?? [],
      source: customer.source ?? 'Ami_Core 轻量客户上下文',
      storeName: customer.storeName ?? '当前门店',
      skinCondition: customer.skinCondition,
      createdAt: '',
    },
    summary,
    reasons: [
      `累计消费 ￥${totalSpent.toLocaleString()}`,
      `到店 ${visitCount} 次`,
      `可用会员卡 ${activeCardsCount} 张`,
      balance > 0 ? `储值余额 ￥${balance.toLocaleString()}` : '暂无储值余额',
      customer.isAppointedToday
        ? `今日预约：${formatTimeOnly(customer.appointmentTime)} ${customer.appointmentProjectName ?? ''}`.trim()
        : '今日无预约',
      daysSinceVisit >= 999 ? '暂无有效到店记录' : `最近 ${daysSinceVisit} 天未到店`,
    ],
    recentVisits: [customer.lastVisitDate, customer.appointmentTime].filter((item): item is string => Boolean(item)),
  };
}

const BEAUTICIAN_CUSTOMER_GROUPS: Array<Omit<BeauticianCustomerListGroup, 'items'>> = [
  {
    key: 'stable',
    title: '稳定客户',
    description: '复购基础较好或暂无最近到店日期，需要保持服务节奏。',
  },
  {
    key: 'recent30',
    title: '最近 30 天',
    description: '近期刚服务过，适合安排效果回访和下次护理提醒。',
  },
  {
    key: 'recent60',
    title: '最近 60 天',
    description: '处于正常复购观察期，可结合项目周期做轻触达。',
  },
  {
    key: 'recent90',
    title: '最近 90 天',
    description: '接近沉默边界，建议优先确认护理需求变化。',
  },
];

function resolveBeauticianCustomerGroup(customer: TerminalContextCustomer): BeauticianCustomerGroupKey {
  const days = getDaysSince(customer.lastVisitDate);
  if (days <= 30) return 'recent30';
  if (days <= 60) return 'recent60';
  if (days <= 90) return 'recent90';
  return 'stable';
}

function buildBeauticianServiceAdvice(customer: TerminalContextCustomer, group: BeauticianCustomerGroupKey) {
  const skin = customer.skinCondition?.trim();
  const appointment = customer.isAppointedToday
    ? `今日已约 ${formatTimeOnly(customer.appointmentTime)} ${customer.appointmentProjectName ?? ''}`.trim()
    : '';
  if (appointment) return `${appointment}，服务前先复核上次反馈和本次重点诉求。`;
  if (group === 'recent30') return '服务后 3-7 天内做效果回访，确认皮肤反应并预约下次护理周期。';
  if (group === 'recent60') return '结合上次项目做复购提醒，可推荐同系列护理或轻量加项。';
  if (group === 'recent90') return '优先做需求唤醒，询问近期皮肤变化，并给出一次专属护理建议。';
  if (skin) return `围绕「${skin}」维护长期方案，服务前确认是否有新的禁忌或敏感反应。`;
  return '维护稳定关系，服务前补充肤况和偏好标签，方便后续精细化跟进。';
}

function toBeauticianCustomerListItem(customer: TerminalContextCustomer): BeauticianCustomerListItem {
  const group = resolveBeauticianCustomerGroup(customer);
  const daysSinceVisit = getDaysSince(customer.lastVisitDate);
  const tags = [
    ...(customer.memberLevel ? [customer.memberLevel] : []),
    ...(customer.skinCondition ? [customer.skinCondition] : []),
    ...asList<string>(customer.tags),
  ].filter(Boolean);
  const totalSpent = Number(customer.totalSpent ?? 0);
  const visitCount = Number(customer.visitCount ?? 0);
  const balance = Number(customer.totalBalance ?? 0);
  const activeCardsCount = Number(customer.activeCustomerCardsCount ?? 0);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      gender: customer.gender === '男' ? '男' : '女',
      memberLevel: customer.memberLevel || '普通客户',
      totalSpent,
      visitCount,
      lastVisitDate: customer.lastVisitDate || '暂无',
      tags: asList<string>(customer.tags),
      source: customer.source ?? 'Ami_Core 美容师客户',
      storeName: customer.storeName ?? '当前门店',
      skinCondition: customer.skinCondition,
      cashBalance: customer.cashBalance,
      giftBalance: customer.giftBalance,
      totalBalance: customer.totalBalance,
      activeCustomerCardsCount: customer.activeCustomerCardsCount,
      createdAt: '',
    },
    group,
    groupLabel: BEAUTICIAN_CUSTOMER_GROUPS.find((item) => item.key === group)?.title ?? '我的客户',
    daysSinceVisit: daysSinceVisit >= 999 ? undefined : daysSinceVisit,
    basicInfo: [
      customer.phone || '未留手机号',
      customer.gender || '性别未填',
      customer.lastVisitDate ? `最近到店 ${customer.lastVisitDate}` : '暂无到店记录',
    ].join(' · '),
    memberSummary: [
      `${customer.memberLevel || '普通客户'}`,
      `到店 ${visitCount} 次`,
      totalSpent > 0 ? `消费 ¥${totalSpent.toLocaleString()}` : '暂无消费',
      activeCardsCount > 0 ? `可用卡 ${activeCardsCount} 张` : '',
      balance > 0 ? `余额 ¥${balance.toLocaleString()}` : '',
    ].filter(Boolean).join(' · '),
    tags: Array.from(new Set(tags)).slice(0, 6),
    serviceAdvice: buildBeauticianServiceAdvice(customer, group),
    detailAction: `customer:${customer.name}`,
  };
}

function uniqueBeauticianCustomers(customers: TerminalContextCustomer[]) {
  const customerMap = new Map<number, TerminalContextCustomer>();
  customers.forEach((customer) => {
    const customerId = Number(customer.id);
    if (!Number.isFinite(customerId)) return;
    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, customer);
    }
  });
  return Array.from(customerMap.values());
}

export async function getBeauticianCustomerList(): Promise<BeauticianCustomerListData> {
  const { bootstrap } = await getAuraBootstrapSession();
  const currentBeautician = bootstrap.currentBeautician ?? null;
  const customers = currentBeautician?.id
    ? await terminalQuery({
        key: ['beautician-customers', 'mine', currentBeautician.id, getActiveOperatorParams()?.operatorId ?? 'default'],
        ttlMs: TERMINAL_QUERY_TTL.customerSearch,
        loader: () => getCurrentTerminalBeauticianCustomers(getActiveOperatorParams()),
      })
    : null;

  const items = uniqueBeauticianCustomers(asList<TerminalContextCustomer>(customers?.data)).map(toBeauticianCustomerListItem);
  const groups = BEAUTICIAN_CUSTOMER_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => item.group === group.key),
  }));

  return {
    title: '我的客户',
    subtitle: bootstrap.currentStore?.name ?? '当前门店',
    summary: `共 ${items.length} 位当前美容师服务客户，已合并为单一列表并用标签标识客户状态。`,
    items,
    groups,
    total: items.length,
    generatedAt: new Date().toISOString(),
  };
}

async function buildCardVerificationFlow(): Promise<CardVerificationFlowData> {
  let context: Awaited<ReturnType<typeof getTerminalCardVerificationContext>> | null = null;
  try {
    context = await getTerminalCardVerificationContext();
  } catch (err) {
    console.warn('Ami Aura Lite 轻量核销上下文加载失败，降级到本地快照', err);
  }
  const contextBeauticians = filterByStoreName(asList<Beautician>(context?.beauticians), context?.storeName).filter(
    isSelectableBeautician,
  );
  try {
    const customerContext = await getTerminalCustomerSelectContext({ scene: 'verification', limit: 50 });
    const contextCustomers = asList<TerminalContextCustomer>(customerContext.items).map(toCardVerificationCustomerFromContext);
    if (contextCustomers.length) {
      return {
        title: '次卡核销',
        subtitle: context?.storeName ?? '当前门店',
        source: 'Ami_Core 统一客户选择、核销轻量上下文',
        generatedAt: customerContext.generatedAt
          ? format(new Date(customerContext.generatedAt), 'yyyy-MM-dd HH:mm')
          : format(new Date(), 'yyyy-MM-dd HH:mm'),
        customers: contextCustomers.sort((a, b) => Number(b.isAppointedToday) - Number(a.isAppointedToday)),
        beauticians: contextBeauticians,
      };
    }
  } catch (err) {
    console.warn('Ami Aura Lite 统一核销客户选择加载失败，继续使用核销上下文', err);
  }

  let snapshot: CoreSnapshot;
  try {
    const loaded = await loadCardVerificationSnapshot();
    snapshot = loaded.snapshot;
  } catch (err) {
    const contextCustomers = asList<TerminalContextCustomer>(context?.customers).map(toCardVerificationCustomerFromContext);
    if (contextCustomers.length) {
      return {
        title: '次卡核销',
        subtitle: context?.storeName ?? '当前门店',
        source: 'Ami_Core 核销轻量上下文',
        generatedAt: context?.generatedAt
          ? format(new Date(context.generatedAt), 'yyyy-MM-dd HH:mm')
          : format(new Date(), 'yyyy-MM-dd HH:mm'),
        customers: contextCustomers.sort((a, b) => Number(b.isAppointedToday) - Number(a.isAppointedToday)),
        beauticians: contextBeauticians,
      };
    }
    throw err;
  }
  const contextById = new Map(asList<TerminalContextCustomer>(context?.customers).map((customer) => [customer.id, customer]));
  const appointmentCustomers = asList<CoreSnapshot['reservations'][number]>(snapshot.reservations)
    .map((reservation) => {
      const item = reservation as Record<string, any>;
      const customer = findCustomerForReservation(snapshot, item);
      if (!customer) return null;
      return { customer, reservation: item };
    })
    .filter((item): item is { customer: CoreSnapshot['customers'][number]; reservation: Record<string, any> } => {
      if (!item) return false;
      return getActiveCustomerCardCount(item.customer) > 0;
    });

  const customerMap = new Map<
    number,
    { customer: CoreSnapshot['customers'][number]; reservation?: Record<string, any> }
  >();
  appointmentCustomers.forEach((item) => customerMap.set(item.customer.id, item));
  asList<CoreSnapshot['customers'][number]>(snapshot.customers)
    .filter((customer) => getActiveCustomerCardCount(customer) > 0)
    .forEach((customer) => {
      if (!customerMap.has(customer.id)) {
        customerMap.set(customer.id, { customer });
      }
    });

  const customers = Array.from(customerMap.values()).map(({ customer, reservation }) => {
    const matchedReservation = reservation ?? getCustomerReservation(snapshot, customer.id, customer.name);
    const contextCustomer = contextById.get(customer.id);
    const contextItem = contextCustomer ? toCardVerificationCustomerFromContext(contextCustomer) : null;
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      avatarUrl: contextItem?.avatarUrl ?? pickCustomerAvatarUrl(customer),
      memberLevel: customer.memberLevel || contextItem?.memberLevel || '普通客户',
      tags: (customer.tags?.length ? customer.tags : contextItem?.tags)?.slice(0, 3) ?? [],
      profileLabel: customer.skinCondition || customer.source || contextItem?.profileLabel || '画像待补充',
      lastVisitDate: customer.lastVisitDate || contextItem?.lastVisitDate || '暂无到店记录',
      isAppointedToday: Boolean(matchedReservation || contextItem?.isAppointedToday),
      appointmentTime: matchedReservation
        ? formatTimeOnly(matchedReservation.appointmentTime ?? getReservationTime(matchedReservation))
        : contextItem?.appointmentTime,
      appointmentProjectName: matchedReservation?.projectName ?? contextItem?.appointmentProjectName,
    };
  });

  return {
    title: '次卡核销',
    subtitle: snapshot.store?.name ?? '当前门店',
    source: context ? 'Ami_Core 管理端客户、核销轻量上下文' : 'Ami_Core 预约、客户、卡项数据',
    generatedAt: context?.generatedAt
      ? format(new Date(context.generatedAt), 'yyyy-MM-dd HH:mm')
      : format(new Date(), 'yyyy-MM-dd HH:mm'),
    customers: customers.sort((a, b) => Number(b.isAppointedToday) - Number(a.isAppointedToday)),
    beauticians: filterByStoreName(snapshot.beauticians, snapshot.store?.name).filter(isSelectableBeautician),
  };
}

function toCustomerSelectItemFromContext(customer: TerminalContextCustomer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    memberLevel: customer.memberLevel,
    tags: customer.tags?.slice(0, 3) ?? [],
    isAppointedToday: Boolean(customer.isAppointedToday),
    appointmentTime: customer.appointmentTime ? formatTimeOnly(customer.appointmentTime) : undefined,
  };
}

export async function getCardVerificationFlow(): Promise<CardVerificationFlowData> {
  return loadCachedBusinessFlow('operation.verify', buildCardVerificationFlow);
}

export async function getCardVerificationCards(customerId: number) {
  try {
    const [context, summary, customerCards, projects] = await Promise.all([
      getTerminalCardVerificationContext().catch(() => null),
      getTerminalCustomerSummary(customerId).catch(() => null),
      getTerminalCustomerCards(customerId),
      loadCardVerificationProjectsOnly(),
    ]);
    const contextCustomer = asList<TerminalContextCustomer>(context?.customers).find(
      (customer) => customer.id === customerId,
    );
    const baseCustomer = summary?.customer
      ? toCardVerificationCustomerFromSummary(summary.customer, contextCustomer)
      : contextCustomer
        ? toCardVerificationCustomerFromContext(contextCustomer)
        : null;

    if (!baseCustomer) {
      throw new Error('未找到客户，无法查询可核销次卡');
    }

    return {
      ...baseCustomer,
      cards: toCardVerificationCardOptions(asList<TerminalCustomerCard>(customerCards), projects),
    };
  } catch (err) {
    console.warn('Ami Aura Lite 轻量核销卡项加载失败，降级到本地快照', err);
  }

  const { snapshot, projects } = await loadCardVerificationSnapshot();
  const customer = snapshot.customers.find((item) => item.id === customerId);
  if (!customer) throw new Error('未找到客户，无法查询可核销次卡');

  const reservation = getCustomerReservation(snapshot, customer.id, customer.name);
  const customerCards = asList<TerminalCustomerCard>(await getTerminalCustomerCards(customer.id));
  const activeCards = customerCards.filter((card) => card.status === 'active' && card.remainingTimes > 0);

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    avatarUrl: pickCustomerAvatarUrl(customer),
    memberLevel: customer.memberLevel,
    tags: customer.tags?.slice(0, 3) ?? [],
    profileLabel: customer.skinCondition || customer.source || '画像待补充',
    lastVisitDate: customer.lastVisitDate || '暂无到店记录',
    isAppointedToday: Boolean(reservation),
    appointmentTime: reservation
      ? formatTimeOnly(reservation.appointmentTime ?? getReservationTime(reservation))
      : undefined,
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

function buildCardUsageReceipt(
  record: TerminalCardUsageRecord,
  snapshot: CoreSnapshot,
  fallbackProjectName?: string,
): OperationReceiptData {
  const customer = snapshot.customers.find((item) => item.id === record.customerId);
  return {
    sourceType: 'card_usage',
    sourceId: record.id,
    receiptNo: `CU${String(record.id).padStart(6, '0')}`,
    businessTitle: '核销凭证',
    detailLabel: '核销明细',
    storeName: snapshot.store?.name ?? '当前门店',
    customerName: record.customerName,
    customerPhone: customer?.phone,
    cashierName: snapshot.user?.name ?? snapshot.user?.username,
    paymentMethod: '次卡核销',
    items: [
      {
        name: `${record.projectName || fallbackProjectName || '服务项目'} · ${record.cardName}，剩余 ${record.remainingTimes} 次`,
        quantity: record.times,
        unitPrice: 0,
        subtotal: 0,
      },
    ],
    subtotalAmount: 0,
    discountAmount: 0,
    paidAmount: 0,
    createdAt: record.verifiedAt ?? new Date().toISOString(),
  };
}

function resolveCardVerificationBeauticianId(
  snapshot: CoreSnapshot,
  input: { customerId?: number; customerName?: string },
  bootstrap?: AuraBootstrap,
) {
  const currentBeauticianId = readNumericValue(bootstrap?.currentBeautician?.id);
  if (currentBeauticianId) return currentBeauticianId;

  const customer = input.customerId ? snapshot.customers.find((item) => item.id === input.customerId) : undefined;
  const customerId = input.customerId ?? customer?.id;
  const customerName = input.customerName ?? customer?.name ?? '';
  if (!customerId || !customerName) return undefined;

  const reservation = getCustomerReservation(snapshot, customerId, customerName) as Record<string, unknown> | undefined;
  const reservationBeautician = reservation?.beautician as Record<string, unknown> | undefined;
  const reservationBeauticianId = readNumericValue(reservation?.beauticianId, reservationBeautician?.id);
  return reservationBeauticianId || undefined;
}

export async function confirmCardVerification(input: CardVerificationConfirmInput): Promise<OperationResultData> {
  const [{ bootstrap }, snapshot] = await Promise.all([getAuraBootstrapSession(), loadCoreSnapshot()]);
  const beauticianId = input.beauticianId ?? resolveCardVerificationBeauticianId(snapshot, { customerId: input.customerId }, bootstrap);
  const record = await verifyTerminalCardUsage({
    customerCardId: input.customerCardId,
    projectId: input.projectId,
    times: input.times,
    operatorId: getActiveOperatorParams()?.operatorId ?? undefined,
    ...(beauticianId ? { beauticianId } : {}),
  });
  invalidateCardVerificationCaches();

  return {
    title: '核销成功',
    subtitle: snapshot.store?.name ?? '当前门店',
    status: 'success',
    description: `${record.customerName} 的次卡核销已完成。`,
    nextSteps: ['提交服务记录', '打印核销凭证', '预约下次护理'],
    receipt: buildCardUsageReceipt(record, snapshot, input.projectName),
  };
}

async function buildCashierFlow(): Promise<CashierFlowData> {
  try {
    const context = await getTerminalCashierContext();
    const projects = asList<Project>(context.projects);
    const products = asList<Awaited<ReturnType<typeof getProducts>>[number]>(context.products);
    const customers = asList<TerminalContextCustomer>(context.customers).map(toCashierCustomerFromContext);
    const beauticians = asList<Beautician>(context.beauticians);
    if (customers.length || projects.length || products.length) {
      return {
        title: '收银开单',
        subtitle: context.storeName ?? '当前门店',
        source: 'Ami_Core 收银轻量上下文',
        generatedAt: context.generatedAt
          ? format(new Date(context.generatedAt), 'yyyy-MM-dd HH:mm')
          : format(new Date(), 'yyyy-MM-dd HH:mm'),
        shiftRequired: context.shiftRequired !== false,
        customers,
        beauticians,
        catalog: [
          ...projects
            .filter((project) => project.status)
            .slice(0, 8)
            .map((project) => ({
              id: `project-${project.id}`,
              itemType: 'project' as const,
              itemId: project.id,
              name: project.name,
              category: project.type,
              price: project.price,
            })),
          ...products
            .filter((product) => product.status === '在售')
            .slice(0, 8)
            .map((product) => ({
              id: `product-${product.id}`,
              itemType: 'product' as const,
              itemId: product.id,
              name: product.name,
              category: product.categoryName,
              price: product.retailPrice,
            })),
        ],
      };
    }
  } catch (err) {
    console.warn('Ami Aura Lite 轻量收银上下文加载失败，降级到本地快照', err);
  }

  const [{ storeName }, catalogResult, projectsResult, productsResult, beauticiansResult] = await Promise.all([
    getAuraBootstrapSession(),
    optionalCoreCall<unknown>('终端目录', () => getTerminalCatalogSync(), null),
    optionalCoreCall('项目数据', () => getProjects(), []),
    optionalCoreCall('商品数据', () => getProducts({ status: '在售' }), []),
    optionalCoreCall('美容师数据', () => getBeauticians(), []),
  ]);
  const catalog =
    catalogResult.data && typeof catalogResult.data === 'object' ? (catalogResult.data as Record<string, unknown>) : {};
  const terminalProjects = asList<Project>(catalog.projects);
  const terminalProducts = asList<Awaited<ReturnType<typeof getProducts>>[number]>(catalog.products);
  const projects = terminalProjects.length ? terminalProjects : asList<Project>(projectsResult.data);
  const products = terminalProducts.length
    ? terminalProducts
    : asList<Awaited<ReturnType<typeof getProducts>>[number]>(productsResult.data);

  return {
    title: '收银开单',
    subtitle: storeName || '当前门店',
    source: 'Ami_Core 项目、商品数据；客户请通过统一客户选择搜索',
    generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
    shiftRequired: true,
    customers: [],
    beauticians: asList<Beautician>(catalog.beauticians).length
      ? asList<Beautician>(catalog.beauticians)
      : asList<Beautician>(beauticiansResult.data),
    catalog: [
      ...projects
        .filter((project) => project.status)
        .slice(0, 8)
        .map((project) => ({
          id: `project-${project.id}`,
          itemType: 'project' as const,
          itemId: project.id,
          name: project.name,
          category: project.type,
          price: project.price,
        })),
      ...products
        .filter((product) => product.status === '在售')
        .slice(0, 8)
        .map((product) => ({
          id: `product-${product.id}`,
          itemType: 'product' as const,
          itemId: product.id,
          name: product.name,
          category: product.categoryName,
          price: product.retailPrice,
        })),
    ],
  };
}

export async function getCashierFlow(): Promise<CashierFlowData> {
  return loadCachedBusinessFlow('operation.cashier', buildCashierFlow);
}

function getRefundOrderKindLabel(order: CoreSnapshot['orders'][number]) {
  const kind = String(order.orderKind ?? '').toLowerCase();
  if (kind === 'project') return '项目订单';
  if (kind === 'mixed') return '综合订单';
  return '商品订单';
}

function getRefundOrderItemSummary(order: CoreSnapshot['orders'][number]) {
  const items = asList<any>(order.items).length ? asList<any>(order.items) : asList<any>(order.orderItems);
  if (!items.length) return '未记录明细';
  return items
    .slice(0, 3)
    .map((item) => {
      const name = item.productName ?? item.name ?? '未命名明细';
      const quantity = Number(item.quantity ?? 1);
      const amount = toMoney(item.netAmount ?? item.subtotal ?? quantity * Number(item.unitPrice ?? 0));
      return `${name} x${quantity} ￥${amount.toLocaleString()}`;
    })
    .join('；');
}

function toRefundOrderOption(order: CoreSnapshot['orders'][number]): RefundOrderOption | null {
  if (['已取消', '已退款', 'cancelled', 'canceled', 'refunded'].includes(String(order.status))) return null;
  const successfulRefunds = asList<any>((order as any).refundRecords).filter((record) => ['success', 'completed', 'refunded'].includes(String(record.status)));
  const refundedAmount = successfulRefunds.reduce((sum, record) => sum + toMoney(record.amount), 0);
  const refundableAmount = Math.max(0, toMoney(order.netAmount ?? order.totalAmount) - refundedAmount);
  if (refundableAmount <= 0) return null;
  const rawItems = asList<any>(order.orderItems).length ? asList<any>(order.orderItems) : asList<any>(order.items);
  const items = rawItems.map((item) => {
    const refundItems = successfulRefunds.flatMap((record) => asList<any>(record.items)).filter((refundItem) => Number(refundItem.orderItemId) === Number(item.id));
    const soldQuantity = Number(item.quantity ?? 1);
    const itemNetAmount = toMoney(item.netAmount ?? item.subtotal ?? soldQuantity * Number(item.unitPrice ?? 0));
    const refundedQuantity = refundItems.reduce((sum, refundItem) => sum + Number(refundItem.quantity ?? 0), 0);
    const itemRefundedAmount = refundItems.reduce((sum, refundItem) => sum + toMoney(refundItem.refundAmount), 0);
    return {
      orderItemId: Number(item.id),
      name: item.productName ?? item.name ?? '未命名明细',
      itemType: String(item.itemType ?? 'product'),
      remainingRefundableQuantity: Math.max(0, soldQuantity - refundedQuantity),
      remainingRefundableAmount: Math.max(0, itemNetAmount - itemRefundedAmount),
    };
  }).filter((item) => item.orderItemId > 0 && item.remainingRefundableAmount > 0);
  return {
    id: order.id,
    orderNo: order.checkoutGroupNo ?? order.orderNo,
    orderKind: order.orderKind ?? 'product',
    kindLabel: getRefundOrderKindLabel(order),
    customerName: order.customerName || '散客',
    customerPhone: order.customerPhone,
    storeName: order.storeName,
    itemSummary: getRefundOrderItemSummary(order),
    paymentMethod: order.paymentMethod ?? order.payMethod ?? '',
    refundableAmount,
    createdAt: order.completedAt ?? order.createdAt,
    allowedModes: ['refund_only', 'return_and_refund'],
    items,
  };
}

function toRefundCardOrderOption(order: any): RefundOrderOption | null {
  if (['voided', 'refunded', '已作废', '已退款'].includes(String(order.status))) return null;
  const refundableAmount = toMoney(
    Number(order.refundAmount) > 0
      ? 0
      : order.actualPrice ?? order.amount ?? order.totalAmount ?? order.price,
  );
  if (refundableAmount <= 0) return null;
  const projectSummary = asList<any>(order.cardProjects ?? order.projects)
    .slice(0, 3)
    .map((project) => {
      const name = project.projectName ?? project.name ?? '次卡项目';
      const remainCount = Number(project.remainCount ?? project.remainingTimes ?? project.totalCount ?? 0);
      return remainCount > 0 ? `${name} 剩余${remainCount}次` : name;
    })
    .join('；');
  return {
    id: order.id,
    orderNo: order.sourceOrderNo ?? order.orderNo ?? `CARD-${order.id}`,
    orderKind: 'card',
    kindLabel: '次卡开卡',
    customerName: order.userName ?? order.customerName ?? '散客',
    customerPhone: order.customerPhone,
    storeName: order.storeName,
    itemSummary: projectSummary || `${order.cardName ?? '次卡'} ${Number(order.totalTimes ?? 0)}次`,
    paymentMethod: order.paymentMethod ?? '',
    refundableAmount,
    createdAt: order.purchaseTime ?? order.createdAt,
  };
}

async function loadRefundPaginatedOrders<T>(
  label: string,
  loader: (page: number, pageSize: number) => Promise<unknown>,
): Promise<T[]> {
  const pageSize = 500;
  const fallback = { items: [], data: [], total: 0, page: 1, pageSize };
  const firstResult = await optionalCoreCall(label, () => loader(1, pageSize), fallback);
  const firstData = firstResult.data as any;
  const firstItems = asList<T>(firstData.items ?? firstData.data);
  const total = Number(firstData.total ?? firstItems.length);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return firstItems;

  const restResults = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => {
      const page = index + 2;
      return optionalCoreCall(`${label} 第${page}页`, () => loader(page, pageSize), fallback);
    }),
  );
  return [
    ...firstItems,
    ...restResults.flatMap((result) => {
      const data = result.data as any;
      return asList<T>(data.items ?? data.data);
    }),
  ];
}

async function buildRefundFlow(): Promise<RefundFlowData> {
  const { storeName } = await getAuraBootstrapSession();
  const [productOrders, projectOrders, cardOrders] = await Promise.all([
    loadRefundPaginatedOrders<CoreSnapshot['orders'][number]>('商品订单分页数据', (page, pageSize) =>
      getProductOrdersPaginated({ page, pageSize }),
    ),
    loadRefundPaginatedOrders<CoreSnapshot['orders'][number]>('项目订单分页数据', (page, pageSize) =>
      getProjectOrdersPaginated({ page, pageSize }),
    ),
    loadRefundPaginatedOrders<any>('次卡订单分页数据', (page, pageSize) => getCardOrdersPaginated({ page, pageSize })),
  ]);
  const orders = [
    ...productOrders,
    ...projectOrders,
    ...cardOrders,
  ]
    .map((order) => (String((order as any).status) === 'active' && ((order as any).cardName || (order as any).sourceOrderNo)
      ? toRefundCardOrderOption(order)
      : toRefundOrderOption(order as CoreSnapshot['orders'][number])))
    .filter((item): item is RefundOrderOption => Boolean(item))
    .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''));

  return {
    title: '订单退款',
    subtitle: storeName || '当前门店',
    source: 'Ami_Core 商品/项目历史订单',
    generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
    orders,
  };
}

export async function getRefundFlow(): Promise<RefundFlowData> {
  return loadCachedBusinessFlow('operation.refund', buildRefundFlow);
}

function getLatestRefundRecord(refunded: any) {
  const records = [
    ...asList<any>(refunded?.refundRecords),
    refunded?.refundRecord,
  ].filter((record) => record && typeof record === 'object');
  return records.sort((left, right) => {
    const leftTime = new Date(left.refundedAt ?? left.createdAt ?? 0).getTime();
    const rightTime = new Date(right.refundedAt ?? right.createdAt ?? 0).getTime();
    return rightTime - leftTime;
  })[0];
}

function getRefundPaymentMethod(refunded: any) {
  const paymentRecords = asList<any>(refunded?.paymentRecords);
  return refunded?.paymentMethod ?? refunded?.payMethod ?? paymentRecords[0]?.method;
}

function getRefundReceiptNo(refunded: any, latestRefundRecord: any, fallbackOrderId: string | number) {
  return (
    latestRefundRecord?.refundNo ??
    refunded?.refundNo ??
    refunded?.checkoutGroupNo ??
    refunded?.orderNo ??
    refunded?.sourceOrderNo ??
    String(fallbackOrderId)
  );
}

export async function confirmRefund(input: RefundConfirmInput): Promise<OperationResultData> {
  if (!input.orderId) throw new Error('请选择要退款的历史订单');
  if (input.amount <= 0) throw new Error('退款金额必须大于 0');
  const isCardOrder = String(input.orderKind) === 'card';
  let refunded;
  if (isCardOrder) {
    refunded = await runWithAuraAuthRepair(() => voidCardOrder(input.orderId, { reason: input.reason || 'Ami Aura Lite 次卡退款' }));
  } else {
    const preview = await runWithAuraAuthRepair(() => getProductOrderRefundPreview(Number(input.orderId)));
    const items = input.items?.length
      ? input.items
      : preview.items
          .filter((item) => item.remainingRefundableQuantity > 0 && item.remainingRefundableAmount > 0)
          .map((item) => ({ orderItemId: item.orderItemId, quantity: item.remainingRefundableQuantity, refundAmount: item.remainingRefundableAmount }));
    refunded = await runWithAuraAuthRepair(() =>
      refundProductOrder(Number(input.orderId), {
        requestId: input.requestId ?? globalThis.crypto?.randomUUID?.() ?? `kiosk-refund-${Date.now()}`,
        refundMode: input.refundMode ?? 'refund_only',
        reason: input.reason || 'Ami Aura Lite 退款',
        items,
      }),
    );
  }
  invalidateCashierCaches();
  invalidateBusinessFlowCache(['operation.refund']);
  const latestRefundRecord = getLatestRefundRecord(refunded);
  const actualRefundAmount = toMoney(latestRefundRecord?.amount ?? refunded.refundAmount ?? input.amount);
  const refundReceiptNo = getRefundReceiptNo(refunded, latestRefundRecord, input.orderId);

  return {
    title: '退款完成',
    subtitle: refunded.storeName,
    status: 'success',
    description: `${refunded.customerName || refunded.userName || '客户'} 的订单已退款 ${actualRefundAmount.toLocaleString()} 元。`,
    nextSteps: ['刷新收银对账', '核对退款流水', '必要时打印退款凭证'],
    receipt: {
      sourceType: 'refund_order',
      sourceId: Number(refunded.id ?? input.orderId) || undefined,
      receiptNo: refundReceiptNo,
      businessTitle: '退款凭证',
      detailLabel: '退款明细',
      storeName: refunded.storeName,
      customerName: refunded.customerName || refunded.userName || '散客',
      customerPhone: refunded.customerPhone,
      paymentMethod: getRefundPaymentMethod(refunded),
      items: [
        {
          name: input.reason || '订单退款',
          quantity: 1,
          unitPrice: actualRefundAmount,
          subtotal: actualRefundAmount,
        },
      ],
      subtotalAmount: actualRefundAmount,
      discountAmount: 0,
      paidAmount: actualRefundAmount,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function confirmCashierPayment(input: CashierConfirmInput): Promise<OperationResultData> {
  const customerName = input.customerName?.trim() || '';
  if (!customerName) throw new Error('未找到客户，无法收银');
  const customer = { id: input.customerId, name: customerName, phone: input.customerPhone ?? '' };
  const snapshot = { user: undefined as { name?: string; username?: string } | undefined };

  const items = asList<CashierConfirmInput['items'][number]>(input.items).map((item) => ({
    itemType: item.itemType,
    itemId: item.itemId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    listAmount: item.listAmount ?? item.quantity * item.unitPrice,
    subtotal: item.subtotal ?? item.quantity * item.unitPrice,
    beauticianId: item.beauticianId,
    beauticianName: item.beauticianName,
  }));
  const subtotal = toMoney(sum(items, (item) => item.subtotal));
  const discountAmount = Math.min(subtotal, Math.max(0, input.discountAmount || 0));
  const paidAmount = toMoney(Math.max(0, subtotal - discountAmount));
  const order = await runWithAuraAuthRepair(() =>
    createTerminalCashierOrder({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      items,
      discountAmount,
      discountMode: input.discountMode,
      discountRate: input.discountRate,
      packagePrice: input.packagePrice,
      allocationMethod: input.allocationMethod,
      discountSource: input.discountSource,
      paymentMethod: input.paymentMethod,
      payments: input.payments,
      remark:
        discountAmount > 0 ? `Ami Aura Lite 收银优惠 ￥${discountAmount.toLocaleString()}` : 'Ami Aura Lite 收银开单',
    }),
  );
  const paid =
    order.status === 'completed' || order.status === 'paid'
      ? order
      : await runWithAuraAuthRepair(() =>
          completeTerminalPayment(order.id, {
            paymentMethod: input.paymentMethod,
            paidAmount,
        }),
      );
  invalidateCashierCaches();
  const paymentSummaryText = asList<NonNullable<CashierConfirmInput['payments']>[number]>(input.payments).length
    ? asList<NonNullable<CashierConfirmInput['payments']>[number]>(input.payments)
        .map((payment) => `${payment.paymentMethod} ￥${toMoney(payment.amount).toLocaleString()}`)
        .join(' + ')
    : input.paymentMethod;

  return {
    title: '收银完成',
    subtitle: paid.storeName,
    status: 'success',
    description: `${customer.name} 的收银已完成，收银流水号和收费明细如下。`,
    nextSteps: [],
    receipt: {
      sourceType: 'cashier_order',
      sourceId: paid.id,
      receiptNo: paid.checkoutGroupNo ?? paid.orderNo,
      storeName: paid.storeName,
      customerName: customer.name,
      customerPhone: customer.phone,
      cashierName: snapshot.user?.name ?? snapshot.user?.username,
      paymentMethod: paymentSummaryText,
      memberBalanceDeduction: paid.memberBalanceDeduction,
      items: asList<typeof paid.items[number]>(paid.items).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        listAmount: toMoney(item.listAmount ?? item.quantity * item.unitPrice),
        discountAmount: toMoney(item.totalDiscountAmount ?? item.discount ?? 0),
        subtotal: toMoney(item.netAmount ?? item.subtotal),
      })),
      subtotalAmount: toMoney(paid.listAmount ?? subtotal),
      discountAmount: toMoney(paid.totalDiscountAmount ?? discountAmount),
      paidAmount: toMoney(paid.netAmount ?? paid.totalAmount ?? paidAmount),
      createdAt: paid.paidAt ?? paid.completedAt ?? paid.createdAt ?? new Date().toISOString(),
    },
  };
}

async function buildCardOpeningFlow(): Promise<CardOpeningFlowData> {
  const { bootstrap, storeName, storeId } = await getAuraBootstrapSession();
  const [catalogResult, cardsResult, customerContext, giftProjects] = await Promise.all([
    optionalCoreCall<unknown>('终端目录', () => getTerminalCatalogSync(), null),
    optionalCoreCall('可售次卡数据', () => getSaleCards({ storeId: storeId ?? undefined }), []),
    getTerminalCustomerSelectContext({ scene: 'card_opening', limit: 50 }).catch(() => null),
    loadActiveProjectNames(),
  ]);
  const catalog =
    catalogResult.data && typeof catalogResult.data === 'object' ? (catalogResult.data as Record<string, unknown>) : {};
  const cards = asList<CoreSnapshot['cards'][number]>(catalog.cards).length
    ? asList<CoreSnapshot['cards'][number]>(catalog.cards)
    : asList<CoreSnapshot['cards'][number]>(cardsResult.data);
  return {
    title: '办卡开单',
    subtitle: storeName || '当前门店',
    source: 'Ami_Core 客户选择、次卡、项目数据',
    generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
    customers: asList<TerminalContextCustomer>(customerContext?.items).map(toCustomerSelectItemFromContext),
    cards: cards
      .filter((card) => card.status === '上架')
      .map((card) => ({
        id: card.id,
        name: card.name,
        type: card.type,
        totalTimes: card.totalTimes,
        price: card.price,
        validDays: card.validDays,
        projects: asList<{ projectName: string }>(card.projects).map((project) => project.projectName),
      })),
    giftProjects,
    salesUsers: toSalesUserOptions(bootstrap.terminalUsers),
  };
}

export async function getCardOpeningFlow(): Promise<CardOpeningFlowData> {
  return loadCachedBusinessFlow('operation.card', buildCardOpeningFlow);
}

export async function confirmCardOpening(input: CardOpeningConfirmInput): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const customer = snapshot.customers.find((item) => item.id === input.customerId);
  const card = snapshot.cards.find((item) => item.id === input.cardId);
  if (!customer) throw new Error('未找到客户，无法办卡');
  if (!card) throw new Error('未找到次卡，无法办卡');

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
    operatorId: input.operatorId,
    remark: asList<string>(input.giftProjects).length
      ? `赠送项目：${asList<string>(input.giftProjects).join('、')}`
      : 'Ami Aura Lite 办卡',
  });
  invalidateCardVerificationCaches();
  invalidateCashierCaches();

  return {
    title: '开卡完成',
    subtitle: order.storeName,
    status: 'success',
    description: `${customer.name} 已办理 ${card.name}，应收 ￥${card.price.toLocaleString()}，优惠 ￥${discountAmount.toLocaleString()}，实收 ￥${amount.toLocaleString()}，剩余 ${order.remainingTimes} 次${asList<string>(input.giftProjects).length ? `，赠送：${asList<string>(input.giftProjects).join('、')}` : ''}。`,
    nextSteps: [],
    receipt: {
      sourceType: 'card_order',
      sourceId: order.id,
      receiptNo: order.orderNo,
      businessTitle: '开卡小票',
      detailLabel: '开卡明细',
      storeName: order.storeName,
      customerName: customer.name,
      customerPhone: customer.phone,
      cashierName: snapshot.user?.name ?? snapshot.user?.username,
      paymentMethod: input.paymentMethod,
      items: [
        {
          name: `${card.name} · ${card.totalTimes} 次`,
          quantity: 1,
          unitPrice: card.price,
          subtotal: card.price,
        },
        ...asList<string>(input.giftProjects).map((projectName) => ({
          name: `赠送项目：${projectName}`,
          quantity: 1,
          unitPrice: 0,
          subtotal: 0,
        })),
      ],
      subtotalAmount: card.price,
      discountAmount,
      paidAmount: amount,
      createdAt: order.purchaseTime ?? new Date().toISOString(),
    },
  };
}

async function buildRegistrationFlow(): Promise<RegistrationFlowData> {
  const snapshot = await loadCoreSnapshot();
  return {
    title: '客户登记',
    subtitle: snapshot.store?.name ?? '当前门店',
    source: 'Ami_Core 客户档案、面部检测数据',
    generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
  };
}

export async function getRegistrationFlow(): Promise<RegistrationFlowData> {
  return loadCachedBusinessFlow('operation.register', buildRegistrationFlow);
}

function skinMetricsToTerminalMetrics(metrics: Record<string, number>): TerminalSkinMetric[] {
  const meta: Record<string, { label: string; unit?: string }> = {
    moisture: { label: '水分', unit: '%' },
    oil: { label: '油脂', unit: '%' },
    elasticity: { label: '弹性', unit: '分' },
    sensitivity: { label: '敏感', unit: '分' },
    pore: { label: '毛孔', unit: '分' },
    pigmentation: { label: '色沉', unit: '分' },
  };

  return Object.entries(metrics).map(([key, value]) => ({
    key,
    label: meta[key]?.label ?? key,
    value,
    unit: meta[key]?.unit,
    score: typeof value === 'number' ? value : undefined,
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
    storeName: snapshot.store?.name ?? '当前门店',
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
    isFallback: result.isFallback,
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
    storeName: snapshot.store?.name ?? '当前门店',
    source: input.source,
    birthday: input.birthday,
    skinCondition: `${input.skinType}，${input.skinStatus}`,
    tags: [input.skinType, input.source].filter(Boolean),
    remark: input.remark,
  });

  const shouldCreateSkinTest =
    input.cameraCaptured || Boolean(input.skinAnalyzeId || input.skinMetrics?.length || input.skinImageUrl);
  const skinTest = shouldCreateSkinTest
    ? await createTerminalSkinTest({
        customerId: customer.id,
        images: input.skinImageUrl
          ? [input.skinImageUrl]
          : input.cameraCaptured
            ? ['camera://aura-lite-face-scan']
            : [],
        metrics:
          input.skinMetrics?.length && !input.skinIsFallback
            ? input.skinMetrics
            : input.skinIsFallback
              ? []
              : [
                  { key: 'moisture', label: '水分', value: 62, unit: '%', score: 76 },
                  { key: 'oil', label: '油脂', value: 34, unit: '%', score: 72 },
                ],
        skinType: input.skinType,
        skinStatus: input.skinStatus,
        mainProblems: input.mainProblems,
        recommendationText: input.skinAnalyzeId
          ? input.skinIsFallback
            ? `${input.recommendationText}\n检测来源：${input.skinInstrument ?? 'Ami AI 初筛'}，仅供顾问参考，检测ID ${input.skinAnalyzeId}`
            : `${input.recommendationText}\n检测来源：${input.skinInstrument ?? 'Ami AI 面部检测'}，置信度 ${Math.round((input.skinConfidence ?? 0) * 100)}%，检测ID ${input.skinAnalyzeId}`
          : input.recommendationText,
      })
    : null;
  invalidateCustomerCaches();

  return {
    title: '登记完成',
    subtitle: customer.storeName,
    status: 'success',
    description: skinTest
      ? `${customer.name} 已写入 Ami_Core 客户档案，手机号 ${customer.phone}，面部检测记录 ${skinTest.id} 已生成，肤质：${skinTest.skinType}，重点问题：${skinTest.mainProblems}。`
      : `${customer.name} 已写入 Ami_Core 客户档案，手机号 ${customer.phone}。本次已跳过面部检测，可后续在客户档案中补检。`,
    nextSteps: [],
  };
}

async function buildRechargeFlow(): Promise<RechargeFlowData> {
  const [{ storeName }, customerContext, giftProjects] = await Promise.all([
    getAuraBootstrapSession(),
    getTerminalCustomerSelectContext({ scene: 'recharge', limit: 50 }).catch(() => null),
    loadActiveProjectNames(),
  ]);
  return {
    title: '会员充值',
    subtitle: storeName || '当前门店',
    source: 'Ami_Core 客户选择、充值订单、项目数据',
    generatedAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
    customers: asList<TerminalContextCustomer>(customerContext?.items).map(toCustomerSelectItemFromContext),
    giftProjects,
  };
}

export async function getRechargeFlow(): Promise<RechargeFlowData> {
  return loadCachedBusinessFlow('operation.recharge', buildRechargeFlow);
}

export async function confirmRecharge(input: RechargeConfirmInput): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const customer = snapshot.customers.find((item) => item.id === input.customerId);
  if (!customer) throw new Error('未找到客户，无法充值');

  const order = await createTerminalRechargeOrder({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    amount: input.amount,
    giftAmount: input.giftAmount,
    giftProjects: input.giftProjects,
    paymentMethod: input.paymentMethod,
    remark: asList<string>(input.giftProjects).length
      ? `赠送项目：${asList<string>(input.giftProjects).join('、')}`
      : 'Ami Aura Lite 充值',
  });
  invalidateCashierCaches();

  return {
    title: '充值完成',
    subtitle: order.storeName,
    status: 'success',
    description: `${customer.name} 已充值 ￥${order.amount.toLocaleString()}，优惠/赠送金额 ￥${order.giftAmount.toLocaleString()}${asList<string>(input.giftProjects).length ? `，赠送项目：${asList<string>(input.giftProjects).join('、')}` : ''}${typeof order.cashBalance === 'number' ? `，当前储值余额 ￥${order.cashBalance.toLocaleString()}，赠送余额 ￥${(order.giftBalance ?? 0).toLocaleString()}` : ''}。`,
    nextSteps: [],
    receipt: {
      sourceType: 'recharge_order',
      sourceId: order.id,
      receiptNo: order.orderNo,
      businessTitle: '充值小票',
      detailLabel: '充值明细',
      storeName: order.storeName,
      customerName: customer.name,
      customerPhone: customer.phone,
      cashierName: snapshot.user?.name ?? snapshot.user?.username,
      paymentMethod: input.paymentMethod,
      items: [
        {
          name: '会员储值充值',
          quantity: 1,
          unitPrice: order.amount,
          subtotal: order.amount,
        },
        ...(order.giftAmount > 0
          ? [
              {
                name: '赠送金额',
                quantity: 1,
                unitPrice: order.giftAmount,
                subtotal: order.giftAmount,
              },
            ]
          : []),
        ...asList<string>(input.giftProjects).map((projectName) => ({
          name: `赠送项目：${projectName}`,
          quantity: 1,
          unitPrice: 0,
          subtotal: 0,
        })),
      ],
      subtotalAmount: order.amount,
      discountAmount: 0,
      paidAmount: order.amount,
      createdAt: order.createdAt ?? new Date().toISOString(),
    },
  };
}

export async function updateAppointmentAction(action: string): Promise<OperationResultData> {
  const [, operation, idText] = action.split(':');
  const reservationId = Number(idText);
  if (!reservationId || Number.isNaN(reservationId)) {
    throw new Error('缺少预约编号，无法执行预约操作');
  }

  const snapshot = await loadCoreSnapshot();
  const reservation = snapshot.reservations.find((item) => Number((item as any).id) === reservationId) as
    | Record<string, any>
    | undefined;
  const appointmentTime = reservation?.appointmentTime ?? (reservation ? getReservationTime(reservation) : undefined);
  const customerName = reservation?.customerName ?? reservation?.userName ?? '客户';
  const projectName = reservation?.projectName ?? '预约项目';
  const storeName = snapshot.store?.name ?? reservation?.storeName ?? '当前门店';

  if (operation === 'confirm') {
    const updated = await confirmTerminalReservation(reservationId);
    invalidateReservationCaches();
    return {
      title: '预约已确认',
      subtitle: updated.storeName ?? storeName,
      status: 'success',
      description: `${updated.customerName ?? customerName} 的 ${updated.projectName ?? projectName} 已确认，预约时间：${formatAppointmentTime(updated.appointmentTime ?? appointmentTime)}。`,
      nextSteps: ['提醒客户准时到店', '到店后确认', '需要时调整时间'],
    };
  }

  if (operation === 'reschedule') {
    const nextTime = addMinutesToAppointment(appointmentTime, 30);
    const updated = await rescheduleTerminalReservation(reservationId, {
      appointmentTime: nextTime,
      reason: 'Ami Aura Lite 前台快捷改期',
    });
    invalidateReservationCaches(true);
    return {
      title: '预约时间已修改',
      subtitle: updated.storeName ?? storeName,
      status: 'success',
      description: `${updated.customerName ?? customerName} 的预约已改到 ${formatAppointmentTime(updated.appointmentTime ?? nextTime)}，请同步告知客户。`,
      nextSteps: ['通知客户新时间', '确认美容师排班', '刷新今日预约'],
    };
  }

  if (operation === 'cancel') {
    const updated = await cancelTerminalReservation(reservationId, 'Ami Aura Lite 前台取消预约');
    invalidateReservationCaches(true);
    return {
      title: '预约已取消',
      subtitle: updated.storeName ?? storeName,
      status: 'warning',
      description: `${updated.customerName ?? customerName} 的 ${updated.projectName ?? projectName} 已取消。`,
      nextSteps: ['记录取消原因', '释放美容师时段', '必要时重新预约'],
    };
  }

  if (operation === 'checkin') {
    const updated = await checkInTerminalReservation(reservationId);
    invalidateReservationCaches();
    const serviceTaskText = updated.serviceTask ? `，服务任务 ${updated.serviceTask.taskNo} 已同步生成` : '';
    return {
      title: '客户已到店',
      subtitle: updated.storeName ?? storeName,
      status: 'success',
      description: `${updated.customerName ?? customerName} 已确认到店${serviceTaskText}，可继续核销、开单或通知美容师接待。`,
      nextSteps: ['开始核销', '通知美容师', '需要时前台收银'],
    };
  }

  throw new Error('未知的预约操作');
}

export async function getCustomerCard(keyword?: string): Promise<CustomerCardData | null> {
  const normalized = keyword?.trim() ?? '';
  const { bootstrap } = await getAuraBootstrapSession();
  if (bootstrap.currentRole === 'beautician' && bootstrap.currentBeautician?.id) {
    try {
      const beauticianCustomers = await terminalQuery({
        key: ['beautician-customers', normalized || 'default'],
        ttlMs: TERMINAL_QUERY_TTL.customerSearch,
        loader: () =>
          getCurrentTerminalBeauticianCustomers({
            ...(normalized ? { keyword: normalized } : {}),
            ...getActiveOperatorParams(),
          }),
      });
      const contextCustomers = asList<TerminalContextCustomer>(beauticianCustomers.data);
      const contextCustomer =
        contextCustomers.find(
          (item) => normalized && (item.name.includes(normalized) || item.phone.includes(normalized)),
        ) ?? contextCustomers[0];
      if (contextCustomer) {
        return toCustomerCardFromContext(contextCustomer);
      }
    } catch (err) {
      console.warn('Ami Aura Lite 美容师客户范围加载失败，降级到门店客户上下文', err);
    }
  }

  const customerSearch = await terminalQuery({
    key: ['customer-search', normalized || 'default'],
    ttlMs: TERMINAL_QUERY_TTL.customerSearch,
    loader: () => getTerminalCardVerificationContext(normalized ? { keyword: normalized } : undefined),
  });
  const contextCustomers = asList<TerminalContextCustomer>(customerSearch.data?.customers);
  const contextCustomer =
    contextCustomers.find(
      (item) => normalized && (item.name.includes(normalized) || item.phone.includes(normalized)),
    ) ?? contextCustomers[0];
  if (contextCustomer) {
    return toCustomerCardFromContext(contextCustomer);
  }

  const snapshot = await loadCoreSnapshot();
  const customer =
    snapshot.customers.find((item) => item.name.includes(normalized ?? '')) ??
    snapshot.customers.find((item) => item.phone.includes(normalized ?? '')) ??
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

export async function getBeauticianCareAdvice(keyword?: string): Promise<AiSuggestionData | null> {
  const customerCard = await getCustomerCard(keyword);
  if (!customerCard) return null;

  try {
    const result = await generateTerminalServiceAdvice({
      customerId: customerCard.customer.id,
    });
    return {
      title: `${customerCard.customer.name} 护理建议`,
      text: result.text,
      source: 'Ami AI',
      structured: result.structured,
    };
  } catch (err) {
    console.warn('Ami Aura Lite 护理建议生成失败，返回规则建议', err);
  }

  const skinCondition = customerCard.customer.skinCondition ?? '当前肤况';
  const recentVisit = customerCard.recentVisits[0] ?? '暂无近期服务记录';
  const fallbackStructured: NonNullable<AiSuggestionData['structured']> = {
    preChecks: [`确认肤况：${skinCondition}`, '复核过敏史、近期医美/刷酸/暴晒情况', `查看最近服务记录：${recentVisit}`],
    keySteps: ['先做温和清洁与肤感确认', '根据屏障状态选择补水修护或舒缓护理', '服务中观察泛红、刺痛和干痒反馈'],
    materialUsage: ['优先使用低刺激清洁与保湿修护耗材', '避免叠加高浓度酸类或强刺激活性产品'],
    followUpAdvice: '服务后 24 小时内提醒客户减少暴晒、高温桑拿和刺激护肤，3-7 天内回访肤感变化。',
    nextBookingHint: '建议按 14-28 天护理周期邀约下次到店，并结合本次反馈调整项目强度。',
  };
  return {
    title: `${customerCard.customer.name} 护理建议`,
    source: 'Ami AI',
    text: [
      `判断依据：客户肤况为「${skinCondition}」，参考最近记录「${recentVisit}」。`,
      '护理方向：先确认耐受度，再做温和清洁、补水修护和屏障稳定，避免强刺激叠加。',
      '转化动作：服务后 3-7 天回访肤感，按 14-28 天护理周期邀约下一次到店。',
    ].join('\n'),
    structured: fallbackStructured,
  };
}

export async function getServiceRecordPreparation(): Promise<OperationResultData> {
  const { bootstrap, storeName } = await getAuraBootstrapSession();
  const currentBeautician = bootstrap.currentBeautician ?? null;
  if (!currentBeautician?.id) {
    return {
      title: '未绑定美容师档案',
      subtitle: storeName,
      status: 'error',
      description: '当前账号还没有绑定美容师档案，不能创建本人服务记录。',
      nextSteps: ['到管理端绑定系统账号与美容师档案', '刷新终端账号', '由店长确认权限'],
    };
  }

  const tasks = await getCurrentTerminalBeauticianTasks({ date: getTodayRange().today, ...getActiveOperatorParams() });
  const inProgress = tasks.filter((task) => task.status === 'in_progress');
  const pending = tasks.filter((task) => task.status === 'pending');
  const targetTask = inProgress[0] ?? pending[0];

  if (!targetTask) {
    return {
      title: '暂无可记录服务',
      subtitle: storeName,
      status: 'warning',
      description: `${currentBeautician.name} 今日暂无待提交的服务记录。`,
      nextSteps: ['查看我的预约', '确认客户到店后自动生成服务记录', '必要时从客户档案新建记录'],
    };
  }

  return {
    title: '服务记录待提交',
    subtitle: targetTask.storeName,
    status: 'warning',
    description: `${targetTask.customerName} 的 ${targetTask.projectName} 等待记录，请补充服务结果、客户反馈、关注事项和下次护理建议；提交后系统会自动完成服务任务。`,
    nextSteps: ['填写服务结果', '记录客户反馈与关注事项', '提交服务记录'],
  };
}

export async function getServiceRecordFlow(): Promise<ServiceRecordFlowData> {
  const { bootstrap, storeName } = await getAuraBootstrapSession();
  const currentBeautician = bootstrap.currentBeautician ?? null;
  if (!currentBeautician?.id) {
    throw new Error('当前账号还没有绑定美容师档案，不能创建本人服务记录。');
  }

  const tasks = await getCurrentTerminalBeauticianTasks({ date: getTodayRange().today, ...getActiveOperatorParams() });
  const writableTasks = tasks.filter((task) => ['pending', 'in_progress'].includes(task.status));
  const tasksWithMaterials = await Promise.all(
    writableTasks.map(async (task) => {
      if (task.consumptionItems?.length) return task;
      try {
        const bom = await getTerminalBom(task.projectId);
        const consumptionItems = asList<{
          productId?: number;
          productName: string;
          sku: string;
          standardQty: number;
          unit: string;
        }>(bom.items).map((item) => ({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          standardQty: Number(item.standardQty ?? 0),
          actualQty: Number(item.standardQty ?? 0),
          unit: item.unit,
        }));
        return { ...task, consumptionItems };
      } catch {
        return task;
      }
    }),
  );

  return {
    title: '服务记录',
    subtitle: storeName,
    source: 'Ami_Core 美容师任务',
    generatedAt: new Date().toISOString(),
    beauticianId: currentBeautician.id,
    beauticianName: currentBeautician.name,
    tasks: tasksWithMaterials.map((task) => ({
      id: task.id,
      taskNo: task.taskNo,
      customerId: task.customerId,
      customerName: task.customerName,
      customerPhone: task.customerPhone,
      projectId: task.projectId,
      projectName: task.projectName,
      beauticianId: currentBeautician.id,
      beauticianName: currentBeautician.name,
      storeName: task.storeName,
      appointmentTime: task.appointmentTime,
      status: task.status,
      consumptionItems: task.consumptionItems,
    })),
  };
}

export async function getBeauticianScheduleFlow(): Promise<BeauticianScheduleFlowData> {
  const { bootstrap, storeName } = await getAuraBootstrapSession();
  const currentBeautician = bootstrap.currentBeautician ?? null;
  if (!currentBeautician?.id) {
    throw new Error('当前账号还没有绑定美容师档案，不能查看本人预约。');
  }
  const tasks = await getCurrentTerminalBeauticianTasks({ date: getTodayRange().today, ...getActiveOperatorParams() });
  const mappedTasks = tasks.map((task) => ({
    id: task.id,
    taskNo: task.taskNo,
    customerId: task.customerId,
    customerName: task.customerName,
    customerPhone: task.customerPhone,
    projectId: task.projectId,
    projectName: task.projectName,
    beauticianId: currentBeautician.id,
    beauticianName: currentBeautician.name,
    storeName: task.storeName,
    appointmentTime: task.appointmentTime,
    status: task.status,
    consumptionItems: task.consumptionItems,
  }));
  const pending = mappedTasks.filter((task) => task.status === 'pending').length;
  const inProgress = mappedTasks.filter((task) => task.status === 'in_progress').length;
  const completed = mappedTasks.filter((task) => task.status === 'completed').length;
  const needRecord = pending + inProgress;
  return {
    title: '我的预约',
    subtitle: storeName,
    generatedAt: new Date().toISOString(),
    beauticianName: currentBeautician.name,
    tasks: mappedTasks,
    summary: `${currentBeautician.name} 今日 ${needRecord} 个待提交记录、${completed} 个已记录服务。`,
  };
}

export async function submitServiceRecord(input: ServiceRecordConfirmInput): Promise<OperationResultData> {
  const result = await createTerminalServiceRecord({
    taskId: input.taskId,
    customerId: input.customerId,
    projectId: input.projectId,
    beauticianId: input.beauticianId,
    result: input.result,
    customerFeedback: input.customerFeedback,
    nextSuggestion: input.nextSuggestion,
    remark:
      [
        input.customerInfoUpdate ? `客户信息更新：${input.customerInfoUpdate}` : '',
        input.attentionItems ? `关注事项：${input.attentionItems}` : '',
        input.remark,
        input.customerSignature ? `客户签字确认：${input.customerSignature}` : '',
      ]
        .filter(Boolean)
        .join('\n') || undefined,
    images: [...(input.beforeImages ?? []), ...(input.afterImages ?? []), ...(input.images ?? [])],
    consumptionItems: input.consumptionItems,
    transferToCashier: input.transferToCashier,
  });
  invalidateReservationCaches();
  invalidateTerminalInventoryCaches();
  invalidateCustomerCaches();
  const task = result.task;
  return {
    title: '服务记录已提交',
    subtitle: task.storeName,
    status: 'success',
    description: `${task.customerName} 的 ${task.projectName} 服务记录已写入 Ami_Core，服务任务已自动完成，服务人员：${task.beauticianName}。`,
    nextSteps: result.nextActions?.length
      ? result.nextActions.map((action) => (action === 'transfer_cashier' ? '转前台收银' : '预约下次服务'))
      : ['查看客户档案', '生成护理建议', '必要时转前台收银'],
  };
}

export async function getInventoryAlerts(): Promise<InventoryAlertCardData> {
  const session = await getAuraBootstrapSession();
  try {
    const data = await getTerminalInventoryAlertsDashboard();
    return {
      title: '库存预警',
      subtitle: data.storeName ?? session.storeName ?? '库存中心',
      lowStock: asList<InventoryAlertCardData['lowStock'][number]>(data.lowStock),
      expiring: asList<InventoryAlertCardData['expiring'][number]>(data.expiring),
      replenishment: asList<InventoryAlertCardData['replenishment'][number]>(data.replenishment),
      summary: data.summary,
    };
  } catch (err) {
    console.warn('Ami Aura Lite 轻量库存预警加载失败，降级到轻量库存查询', err);
  }

  const [stockItems, alerts] = await Promise.all([
    optionalCoreCall('终端库存数据', () => getTerminalInventoryStock({ storeId: session.storeId }), []),
    optionalCoreCall<unknown>('终端库存预警', () => getTerminalInventoryAlerts(), null),
  ]);
  const alertRecord = alerts.data && typeof alerts.data === 'object' ? (alerts.data as Record<string, unknown>) : {};
  const lowStock = asList<InventoryAlertCardData['lowStock'][number]>(stockItems.data).filter(isLowStock);
  const expiring = asList<InventoryAlertCardData['expiring'][number]>(alertRecord.expiring);
  const replenishment = asList<InventoryAlertCardData['replenishment'][number]>(alertRecord.replenishment);

  return {
    title: '库存预警',
    subtitle: session.storeName ?? '库存中心',
    lowStock,
    expiring,
    replenishment,
    summary: `当前有 ${lowStock.length} 项库存预警，${expiring.length} 项临期预警。`,
    apiStatus: getFallbackStatus([stockItems, alerts], '库存预警数据'),
  };
}

export async function getTodayPrintDocuments(): Promise<PrintDocumentsData> {
  const data = await getTerminalPrintableDocumentsToday();
  return {
    ...data,
    generatedAt: data.generatedAt || new Date().toISOString(),
    items: Array.isArray(data.items) ? data.items : [],
  };
}

export async function getOperationResult(action: string): Promise<OperationResultData> {
  const snapshot = await loadCoreSnapshot();
  const customer = snapshot.customers[0];
  const beautician = snapshot.beauticians[0];
  const card = snapshot.cards[0];
  const projectName = snapshot.reservations[0]?.projectName ?? card?.projects?.[0]?.projectName ?? '基础护理';
  const storeName = snapshot.store?.name ?? '当前门店';

  if (!customer && action !== 'operation.print') {
    return {
      title: '暂无可操作客户',
      subtitle: storeName,
      status: 'error',
      description: 'Ami_Core 当前门店没有返回客户数据，暂时不能执行提交类操作。',
      nextSteps: ['检查当前门店', '确认客户数据权限', '刷新后重试'],
    };
  }

  switch (action) {
    case 'reception.appointments': {
      const reservation = await createTerminalReservation({
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `aura-quick-reservation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        customerId: customer?.id,
        customerName: customer?.name ?? '到店客户',
        customerPhone: customer?.phone ?? '',
        projectName,
        beauticianId: beautician?.id,
        beauticianName: beautician?.name ?? '待分配',
        appointmentTime: `${getTodayRange().today} 15:00:00`,
        duration: 60,
        remark: 'Ami Aura Lite 快捷预约',
      });
      invalidateReservationCaches(true);
      return {
        title: '预约已创建',
        subtitle: reservation.storeName,
        status: 'success',
        description: `${reservation.customerName} 的 ${reservation.projectName} 已预约到 ${reservation.appointmentTime}，服务人员：${reservation.beauticianName}。`,
        nextSteps: ['提醒客户到店', '到店后确认', '必要时调整美容师'],
      };
    }
    case 'operation.register': {
      const created = await quickCreateTerminalCustomer({
        name: `Aura客户${String(Date.now()).slice(-4)}`,
        phone: `139${String(Date.now()).slice(-8)}`,
        gender: '女',
        storeName,
        source: 'Ami Aura Lite',
      });
      invalidateCustomerCaches();
      return {
        title: '客户登记成功',
        subtitle: created.storeName,
        status: 'success',
        description: `${created.name} 已通过 Ami_Core 终端快速登记接口写入，可继续补充标签、生日和护理偏好。`,
        nextSteps: ['补充客户资料', '创建预约', '推荐适合卡项'],
      };
    }
    case 'operation.card': {
      if (!card) throw new Error('当前门店暂无可售卡项');
      const order = await createTerminalCardOrder({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        cardId: card.id,
        cardName: card.name,
        amount: card.price,
        totalTimes: card.totalTimes,
        paymentMethod: '微信',
      });
      invalidateCardVerificationCaches();
      invalidateCashierCaches();
      return {
        title: '办卡成功',
        subtitle: order.storeName,
        status: 'success',
        description: `${order.customerName} 已办理 ${order.cardName}，金额 ￥${order.amount.toLocaleString()}，剩余 ${order.remainingTimes} 次。`,
        nextSteps: ['打印办卡凭证', '提醒有效期', '预约首次服务'],
      };
    }
    case 'operation.recharge': {
      const order = await createTerminalRechargeOrder({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        amount: 1000,
        giftAmount: 100,
        paymentMethod: '微信',
        remark: 'Ami Aura Lite 快捷充值',
      });
      invalidateCashierCaches();
      return {
        title: '充值成功',
        subtitle: order.storeName,
        status: 'success',
        description: `${order.customerName} 已充值 ￥${order.amount.toLocaleString()}，赠送 ￥${order.giftAmount.toLocaleString()}。`,
        nextSteps: ['打印充值小票', '同步会员余额', '提醒客户可用权益'],
      };
    }
    case 'operation.verify': {
      const cards = await getTerminalCustomerCards(customer.id);
      const customerCard = cards[0];
      if (!customerCard) {
        return {
          title: '暂无可核销卡项',
          subtitle: storeName,
          status: 'error',
          description: `${customer.name} 当前没有可核销的有效卡项，不能执行核销。`,
          nextSteps: ['查询其他客户', '办理新卡', '改用收银'],
        };
      }
      const beauticianId = resolveCardVerificationBeauticianId(snapshot, {
        customerId: customer.id,
        customerName: customer.name,
      });
      const record = await verifyTerminalCardUsage({
        customerCardId: customerCard.id,
        projectId: 101,
        times: 1,
        operatorId: getActiveOperatorParams()?.operatorId ?? undefined,
        ...(beauticianId ? { beauticianId } : {}),
      });
      invalidateCardVerificationCaches();
      return {
        title: '核销成功',
        subtitle: storeName,
        status: 'success',
        description: `${record.customerName} 的次卡核销已完成。`,
        nextSteps: ['提交服务记录', '打印核销凭证', '预约下次护理'],
        receipt: buildCardUsageReceipt(record, snapshot, record.projectName),
      };
    }
    case 'operation.cashier': {
      const order = await createTerminalCashierOrder({
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        items: [
          {
            itemType: 'project',
            itemId: 101,
            name: projectName,
            quantity: 1,
            unitPrice: 199,
            subtotal: 199,
          },
        ],
        paymentMethod: '微信',
        remark: 'Ami Aura Lite 快捷收银',
      });
      const paid = await completeTerminalPayment(order.id, { paymentMethod: '微信', paidAmount: order.totalAmount });
      invalidateCashierCaches();
      return {
        title: '收银完成',
        subtitle: paid.storeName,
        status: 'success',
        description: `${paid.customerName} 的收银已完成，收银流水号和收费明细如下。`,
        nextSteps: ['打印小票', '刷新经营数据', '提醒客户护理注意事项'],
        receipt: {
          sourceType: 'cashier_order',
          sourceId: paid.id,
          receiptNo: paid.orderNo,
          storeName: paid.storeName,
          customerName: paid.customerName,
          paymentMethod: paid.paymentMethod ?? '微信',
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
    case 'operation.service-complete': {
      return getServiceRecordPreparation();
    }
    case 'operation.print': {
      const job = await createTerminalPrintJob({
        sourceType: 'custom',
        title: 'Ami Aura Lite 小票',
        content: `${storeName}\n打印时间：${formatBusinessDateTime(new Date(), { seconds: true })}`,
        copies: 1,
      });
      return {
        title: '打印任务已完成',
        subtitle: job.storeName,
        status: 'success',
        description: `打印任务 ${job.jobNo} 已提交并完成，共 ${job.copies} 份。`,
        nextSteps: ['查看小票', '需要时补打', '返回接待工作台'],
      };
    }
    default:
      return {
        title: '操作说明',
        subtitle: storeName,
        status: 'success',
        description: '当前终端已切到 Ami_Core 数据层，具体业务动作会按权限调用 Core 终端接口。',
        nextSteps: ['查看查询结果', '确认业务动作', '继续接入 Core 接口'],
      };
  }
}
