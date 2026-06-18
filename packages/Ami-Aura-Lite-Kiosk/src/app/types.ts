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
} from '../../../../src/types';
import type { AuraAction, AuraQuickAction, AuraRole, AuraRoleDefinition } from '../../../../src/types/aura';
import type { NextBestActionStructured, TerminalServiceAdviceStructured } from '../../../../src/types/ai';
import type {
  TerminalBeauticianCommissionSummary,
  TerminalBeauticianQualitySummary,
  TerminalFollowUpTask,
  TerminalSkinMetric,
} from '../../../../src/types/terminal';

export type Role = AuraRole;

export type MessageType =
  | 'dashboard'
  | 'query'
  | 'operation'
  | 'ai'
  | 'automation'
  | 'cardVerification'
  | 'cashier'
  | 'cardOpening'
  | 'registration'
  | 'recharge'
  | 'serviceRecord'
  | 'beauticianSchedule'
  | 'loading'
  | 'success'
  | 'error'
  | 'system';

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

export interface CoreDataStatus {
  source: 'api' | 'fallback';
  label?: string;
  error?: string;
}

export interface DashboardInsightItem {
  title: string;
  severity?: 'high' | 'medium' | 'low' | string;
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
  apiStatus?: CoreDataStatus;
}

export interface CustomerCardData {
  customer: Customer;
  summary: string;
  reasons: string[];
  recentVisits: string[];
  followUpTask?: TerminalFollowUpTask;
}

export type BeauticianCustomerGroupKey = 'stable' | 'recent30' | 'recent60' | 'recent90';

export interface BeauticianCustomerListItem {
  customer: Customer;
  group: BeauticianCustomerGroupKey;
  groupLabel: string;
  daysSinceVisit?: number;
  basicInfo: string;
  memberSummary: string;
  tags: string[];
  serviceAdvice: string;
  detailAction: string;
}

export interface BeauticianCustomerListGroup {
  key: BeauticianCustomerGroupKey;
  title: string;
  description: string;
  items: BeauticianCustomerListItem[];
}

export interface BeauticianCustomerListData {
  title: string;
  subtitle: string;
  summary: string;
  items: BeauticianCustomerListItem[];
  groups: BeauticianCustomerListGroup[];
  total: number;
  generatedAt: string;
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
  apiStatus?: CoreDataStatus;
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
  commission?: TerminalBeauticianCommissionSummary;
  quality?: TerminalBeauticianQualitySummary;
  apiStatus?: CoreDataStatus;
}

export interface InventoryAlertCardData {
  title: string;
  subtitle: string;
  lowStock: StockItem[];
  expiring: ExpiringProduct[];
  replenishment: ReplenishmentSuggestion[];
  summary: string;
  apiStatus?: CoreDataStatus;
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
  itemType: 'project' | 'product';
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
  shiftRequired?: boolean;
  customers: CashierCustomer[];
  catalog: CashierCatalogItem[];
}

export interface CashierOrderItemInput {
  itemType: 'project' | 'product';
  itemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export type TerminalPaymentMethod =
  | '现金'
  | '微信'
  | '支付宝'
  | '银行卡'
  | '次卡抵扣'
  | '会员余额'
  | 'cash'
  | 'wechat'
  | 'alipay'
  | 'card'
  | 'customer_card'
  | 'member_balance';

export type TerminalOrderPaymentMethod = Exclude<
  TerminalPaymentMethod,
  '次卡抵扣' | '会员余额' | 'customer_card' | 'member_balance'
>;

export interface CashierConfirmInput {
  customerId: number;
  customerName?: string;
  customerPhone?: string;
  items: CashierOrderItemInput[];
  discountAmount: number;
  paymentMethod: TerminalPaymentMethod;
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
  giftProjects: string[];
}

export interface CardOpeningConfirmInput {
  customerId: number;
  cardId: number;
  discountAmount: number;
  giftProjects: string[];
  paymentMethod: TerminalOrderPaymentMethod;
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
  gender: '男' | '女';
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
  paymentMethod: TerminalOrderPaymentMethod;
}

export interface OperationResultData {
  title: string;
  subtitle: string;
  status: 'success' | 'warning' | 'error';
  description: string;
  nextSteps: string[];
  receipt?: OperationReceiptData;
}

export interface ServiceRecordTaskOption {
  id: number;
  taskNo: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  projectId: number;
  projectName: string;
  beauticianId: number;
  beauticianName: string;
  storeName: string;
  appointmentTime: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  consumptionItems: Array<{
    productId?: number;
    productName: string;
    sku: string;
    standardQty: number;
    actualQty: number;
    unit: string;
  }>;
}

export interface ServiceRecordFlowData {
  title: string;
  subtitle: string;
  source: string;
  generatedAt: string;
  beauticianId: number;
  beauticianName: string;
  tasks: ServiceRecordTaskOption[];
}

export interface BeauticianScheduleFlowData {
  title: string;
  subtitle: string;
  generatedAt: string;
  beauticianName: string;
  tasks: ServiceRecordTaskOption[];
  summary: string;
}

export interface ServiceRecordConfirmInput {
  taskId?: number;
  customerId: number;
  projectId?: number;
  beauticianId: number;
  result: string;
  customerFeedback?: string;
  customerInfoUpdate?: string;
  attentionItems?: string;
  nextSuggestion?: string;
  remark?: string;
  images?: string[];
  beforeImages?: string[];
  afterImages?: string[];
  customerSignature?: string;
  consumptionItems?: ServiceRecordTaskOption['consumptionItems'];
  transferToCashier?: boolean;
}

export interface OperationReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OperationReceiptData {
  sourceType: 'cashier_order' | 'card_order' | 'recharge_order' | 'card_usage' | 'reservation' | 'custom';
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
  source: 'Ami AI';
  structured?: TerminalServiceAdviceStructured | NextBestActionStructured;
}

export interface AutomationDraftData {
  id: string;
  persistedStrategyId?: number;
  persistedStatus?: 'draft' | 'enabled' | 'paused' | 'archived';
  title: string;
  status: 'needs_info' | 'draft_ready';
  summary: string;
  sourceText: string;
  trigger: string;
  audience: string;
  action: string;
  frequencyCap: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  missingFields: string[];
  question?: string;
  suggestions: string[];
}

export interface AutomationPreviewData {
  targetCount: number;
  riskLevel: 'low' | 'medium' | 'high';
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
  riskLevel: 'low' | 'medium' | 'high';
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
    status: 'draft' | 'enabled' | 'paused' | 'archived';
    trigger: string;
    action: string;
    riskLevel: 'low' | 'medium' | 'high';
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
