import type {
  AuthUser,
  Beautician,
  Card,
  Customer,
  ExpiringProduct,
  ProductOrder,
  ReplenishmentSuggestion,
  Reservation,
  ScheduleSlot,
  StockItem,
  Store,
} from "../../../../src/types";
import type { AuraAction, AuraQuickAction, AuraRole, AuraRoleDefinition } from "../../../../src/types/aura";
import type { NextBestActionStructured, TerminalServiceAdviceStructured } from "../../../../src/types/ai";
import type { TerminalSkinMetric } from "../../../../src/types/terminal";

export type Role = AuraRole;

export type MessageType =
  | "dashboard"
  | "query"
  | "operation"
  | "ai"
  | "automation"
  | "cardVerification"
  | "cashier"
  | "cardOpening"
  | "registration"
  | "recharge"
  | "loading"
  | "success"
  | "error"
  | "system";

export interface Message {
  id: string;
  type: MessageType;
  title?: string;
  content?: string;
  payload?: unknown;
  timestamp: Date;
}

export interface KpiItem {
  label: string;
  value: string;
  hint?: string;
}

export interface DashboardInsightItem {
  title: string;
  severity?: "high" | "medium" | "low" | string;
  reason: string;
  action: string;
  relatedType?: string;
  relatedId?: number | string;
}

export interface DashboardCardData {
  title: string;
  subtitle: string;
  summary: string;
  kpis: KpiItem[];
  risks: Array<string | DashboardInsightItem>;
  highlights: Array<string | DashboardInsightItem>;
}

export interface CustomerCardData {
  customer: Customer;
  summary: string;
  reasons: string[];
  recentVisits: string[];
}

export interface AppointmentViewItem {
  id: number;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  memberLevel: string;
  tags: string[];
  profileLabel: string;
  lastVisitDate: string;
  projectId?: number;
  projectName: string;
  beauticianId?: number;
  beauticianName: string;
  appointmentTime: string;
  displayTime: string;
  duration: number;
  status: string;
  statusText: string;
  remark?: string;
}

export interface AppointmentCardData {
  title: string;
  subtitle: string;
  items: AppointmentViewItem[];
  summary: string;
}

export interface StaffScheduleCardData {
  title: string;
  subtitle: string;
  beautician: Beautician;
  todaySlots: ScheduleSlot[];
  weekSlots?: ScheduleSlot[][];
  weekStart?: string;
  utilization: string;
  summary: string;
}

export interface InventoryAlertCardData {
  title: string;
  subtitle: string;
  lowStock: StockItem[];
  expiring: ExpiringProduct[];
  replenishment: ReplenishmentSuggestion[];
  summary: string;
}

export interface CardVerificationCustomer {
  id: number;
  name: string;
  phone: string;
  avatarUrl?: string;
  memberLevel: string;
  tags: string[];
  profileLabel: string;
  lastVisitDate: string;
  isAppointedToday: boolean;
  appointmentTime?: string;
  appointmentProjectName?: string;
}

export interface CardVerificationProjectOption {
  id: number;
  name: string;
  times: number;
  remainingAfterUse: number;
}

export interface CardVerificationCardOption {
  customerCardId: number;
  cardName: string;
  totalTimes: number;
  remainingTimes: number;
  expiryDate: string;
  status: string;
  projects: CardVerificationProjectOption[];
}

export interface CardVerificationFlowData {
  title: string;
  subtitle: string;
  source: string;
  generatedAt: string;
  customers: CardVerificationCustomer[];
}

export interface CardVerificationConfirmInput {
  customerId: number;
  customerCardId: number;
  projectId: number;
  projectName: string;
  times: number;
}

export interface CashierCustomer {
  id: number;
  name: string;
  phone: string;
  memberLevel: string;
  tags: string[];
  isAppointedToday: boolean;
  appointmentTime?: string;
  memberCardDeductEnabled?: boolean;
  memberCardDeductBalance?: number;
  memberCardDeductLabel?: string;
}

export interface CashierCatalogItem {
  id: string;
  itemType: "project" | "product";
  itemId: number;
  name: string;
  category: string;
  price: number;
}

export interface CashierFlowData {
  title: string;
  subtitle: string;
  source: string;
  generatedAt: string;
  customers: CashierCustomer[];
  catalog: CashierCatalogItem[];
}

export interface CashierOrderItemInput {
  itemType: "project" | "product";
  itemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CashierConfirmInput {
  customerId: number;
  items: CashierOrderItemInput[];
  discountAmount: number;
  paymentMethod: "现金" | "微信" | "支付宝" | "银行卡" | "次卡抵扣" | "会员余额";
}

export interface CustomerSelectItem {
  id: number;
  name: string;
  phone: string;
  memberLevel: string;
  tags: string[];
  isAppointedToday: boolean;
  appointmentTime?: string;
}

export interface CardOpenOption {
  id: number;
  name: string;
  type: string;
  totalTimes: number;
  price: number;
  validDays: number;
  projects: string[];
}

export interface CardOpeningFlowData {
  title: string;
  subtitle: string;
  source: string;
  generatedAt: string;
  customers: CustomerSelectItem[];
  cards: CardOpenOption[];
}

export interface CardOpeningConfirmInput {
  customerId: number;
  cardId: number;
  discountAmount: number;
  giftProjects: string[];
  paymentMethod: "现金" | "微信" | "支付宝" | "银行卡";
}

export interface RegistrationFlowData {
  title: string;
  subtitle: string;
  source: string;
  generatedAt: string;
}

export interface RegistrationSkinAnalysisData {
  analyzeId: string;
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  recommendationText: string;
  metrics: TerminalSkinMetric[];
  imageUrl?: string;
  instrument: string;
  isFallback?: boolean;
  confidence: number;
  capturedAt: string;
  explanation: string;
}

export interface RegistrationConfirmInput {
  name: string;
  phone: string;
  gender: "男" | "女";
  birthday?: string;
  source: string;
  remark?: string;
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  recommendationText: string;
  cameraCaptured: boolean;
  skinMetrics?: TerminalSkinMetric[];
  skinImageUrl?: string;
  skinInstrument?: string;
  skinIsFallback?: boolean;
  skinConfidence?: number;
  skinCapturedAt?: string;
  skinAnalyzeId?: string;
}

export interface RechargeFlowData {
  title: string;
  subtitle: string;
  source: string;
  generatedAt: string;
  customers: CustomerSelectItem[];
  giftProjects: string[];
}

export interface RechargeConfirmInput {
  customerId: number;
  amount: number;
  giftAmount: number;
  giftProjects: string[];
  paymentMethod: "现金" | "微信" | "支付宝" | "银行卡";
}

export interface OperationResultData {
  title: string;
  subtitle: string;
  status: "success" | "warning" | "error";
  description: string;
  nextSteps: string[];
  receipt?: OperationReceiptData;
}

export interface OperationReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OperationReceiptData {
  sourceType: "cashier_order" | "card_order" | "recharge_order" | "card_usage" | "reservation" | "custom";
  sourceId?: number;
  receiptNo: string;
  businessTitle?: string;
  detailLabel?: string;
  storeName: string;
  customerName: string;
  customerPhone?: string;
  cashierName?: string;
  paymentMethod?: string;
  items: OperationReceiptItem[];
  subtotalAmount: number;
  discountAmount: number;
  paidAmount: number;
  createdAt: string;
}

export interface AiSuggestionData {
  title: string;
  text: string;
  source: "Ami AI";
  structured?: TerminalServiceAdviceStructured | NextBestActionStructured;
}

export interface AutomationDraftData {
  id: string;
  persistedStrategyId?: number;
  persistedStatus?: "draft" | "enabled" | "paused" | "archived";
  title: string;
  status: "needs_info" | "draft_ready";
  summary: string;
  sourceText: string;
  trigger: string;
  audience: string;
  action: string;
  frequencyCap: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  missingFields: string[];
  question?: string;
  suggestions: string[];
}

export interface AutomationPreviewData {
  targetCount: number;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  trigger: string;
  audience: string;
  action: string;
  frequencyCap: string;
  message: string;
}

export interface AutomationTemplateData {
  id: string;
  category: string;
  title: string;
  description: string;
  command: string;
  defaultTrigger: string;
  defaultAudience: string;
  defaultAction: string;
  riskLevel: "low" | "medium" | "high";
}

export interface AutomationExecutionSummaryData {
  id: number;
  strategyId: number;
  strategyName: string;
  status: string;
  triggeredCount: number;
  reachedCount: number;
  channel?: string;
  executedAt: string;
  message?: string;
  reason?: string;
  nextActions?: string[];
  primaryActionLabel?: string;
  detailLines?: string[];
}

export interface AutomationExecutionTouchData {
  id: number;
  customerId: number;
  customerName: string;
  customerPhone?: string;
  status: string;
  channel?: string;
  touchedAt: string;
  convertedAt?: string;
  conversionType?: string;
  predictedConversionScore?: number;
  predictedRevenue?: number;
  attributionWindowDays?: number;
}

export interface AutomationExecutionDetailData extends AutomationExecutionSummaryData {
  touches: AutomationExecutionTouchData[];
}

export interface AutomationTodaySummaryData {
  date: string;
  strategyCount: number;
  enabledCount: number;
  waitingApprovalCount: number;
  executedCount: number;
  successCount: number;
  failedCount: number;
  latestStrategies: Array<{
    id: number;
    title: string;
    status: "draft" | "enabled" | "paused" | "archived";
    trigger: string;
    action: string;
    riskLevel: "low" | "medium" | "high";
    requiresApproval: boolean;
    lastExecutedAt?: string;
  }>;
  templates?: AutomationTemplateData[];
  latestExecutions: AutomationExecutionSummaryData[];
}

export interface SessionContext {
  user: AuthUser | null;
  store: Store | null;
}

export interface RoleDefinition extends AuraRoleDefinition {
  quickActions: AuraQuickAction[];
  availableActions: AuraAction[];
}

export interface CoreSnapshot {
  customers: Customer[];
  reservations: Reservation[];
  beauticians: Beautician[];
  stockItems: StockItem[];
  expiringProducts: ExpiringProduct[];
  replenishment: ReplenishmentSuggestion[];
  cards: Card[];
  orders: ProductOrder[];
  user: AuthUser | null;
  store: Store | null;
}

interface LegacyAppointment {
  id: string;
  customerName: string;
  project: string;
  time: string;
  beautician: string;
  status: string;
}

export const mockData: {
  storeName: string;
  employeeName: string;
  appointments: LegacyAppointment[];
  customer: {
    name: string;
    level: string;
    phone: string;
    lastVisit: string;
    availableItems: number;
  };
  overview: {
    todayRevenue: number;
    appointments: number;
    pendingArrivals: number;
    arrivals: number;
  };
} = {
  storeName: "凤仪阁美容养生会所",
  employeeName: "Ami 前台",
  customer: {
    name: "张三",
    level: "金卡会员",
    phone: "138****5678",
    lastVisit: "2026-05-20",
    availableItems: 2,
  },
  overview: {
    todayRevenue: 12800,
    appointments: 12,
    pendingArrivals: 5,
    arrivals: 7,
  },
  appointments: [
    {
      id: "legacy-1",
      customerName: "张三",
      project: "面部护理",
      time: "10:00",
      beautician: "李芳",
      status: "pending",
    },
    {
      id: "legacy-2",
      customerName: "李四",
      project: "肩颈护理",
      time: "14:30",
      beautician: "王磊",
      status: "confirmed",
    },
  ],
};

export const LEGACY_FIGMA_COMPAT_DATA = mockData as Record<string, unknown>;
