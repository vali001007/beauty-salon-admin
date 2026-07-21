import type { Beautician } from '@/types/beautician';
import type { BOMItem } from '@/types/bom';
import type { Card } from '@/types/card';
import type { Customer } from '@/types/customer';
import type { ExpiringProduct, ReplenishmentSuggestion, StockItem } from '@/types/inventory';
import type { Product } from '@/types/product';
import type { Project } from '@/types/project';
import type { Store } from '@/types/store';
import type { AuraBootstrap, AuraRole } from './aura';

export type TerminalDeviceStatus = 'online' | 'offline' | 'disabled' | 'pending_unbind' | 'unactivated';
export type TerminalServiceTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type TerminalRecommendationEventType = 'shown' | 'accepted' | 'skipped' | 'converted';
export type TerminalConversationRole = 'manager' | 'reception' | 'beautician';

export interface TerminalConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type?: string;
  title?: string;
}

export interface TerminalConversationRecord {
  id: number;
  deviceId: string;
  storeId: number;
  role: TerminalConversationRole;
  operatorId?: number | null;
  date: string;
  messages: TerminalConversationMessage[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface SaveTerminalConversationRequest {
  role: TerminalConversationRole;
  operatorId?: number | null;
  date?: string;
  messages: TerminalConversationMessage[];
  messageCount?: number;
}

export interface TerminalConversationHistoryParams {
  page?: number;
  pageSize?: number;
  days?: number;
  startDate?: string;
  endDate?: string;
  role?: TerminalConversationRole;
  operatorId?: number | null;
}

export interface TerminalBootstrapParams {
  operatorId?: number | null;
  role?: AuraRole;
}

export interface TerminalDevice {
  id: number;
  deviceCode: string;
  name: string;
  model: 'Ami Aura Lite';
  storeId: number;
  storeName: string;
  status: TerminalDeviceStatus;
  appVersion: string;
  firmwareVersion: string;
  batteryLevel: number;
  networkStatus: 'online' | 'offline' | 'unstable';
  printerStatus?: string;
  scannerStatus?: string;
  cameraStatus?: string;
  lastOnlineAt: string;
  boundAt: string;
}

export interface TerminalDevicePeripheralStatus {
  status: string;
  label: string;
  checkedAt?: string;
  pendingCount?: number;
  failedCount?: number;
  latestJobId?: number;
}

export interface TerminalDeviceStatusOverview {
  device: TerminalDevice;
  peripherals: {
    network: TerminalDevicePeripheralStatus;
    printer: TerminalDevicePeripheralStatus;
    scanner: TerminalDevicePeripheralStatus;
    camera: TerminalDevicePeripheralStatus;
  };
  serverTime: string;
}

export interface TerminalDeviceLoginRequest {
  deviceCode: string;
  activationCode: string;
  appVersion?: string;
  firmwareVersion?: string;
}

export interface TerminalDeviceLoginResponse {
  token: string;
  device: TerminalDevice;
  store: Store;
  permissions: string[];
}

export interface TerminalDeviceHeartbeatRequest {
  batteryLevel: number;
  appVersion: string;
  firmwareVersion?: string;
  networkStatus: 'online' | 'offline' | 'unstable';
  printerStatus?: string;
  scannerStatus?: string;
  cameraStatus?: string;
}

export interface TerminalDeviceProvisionRequest {
  storeId?: number;
  deviceCode?: string;
  activationCode?: string;
  name?: string;
  model?: string;
  appVersion?: string;
  firmwareVersion?: string;
}

export interface TerminalDeviceProvisionResponse extends TerminalDevice {
  activationCode: string;
}

export interface TerminalConfig {
  version: string;
  featureFlags: {
    skinTest: boolean;
    cardVerification: boolean;
    serviceConsumption: boolean;
    recommendationFeedback: boolean;
    automation?: boolean;
  };
  uploadLimits: {
    maxImageCount: number;
    maxImageSizeMb: number;
  };
  skinMetricKeys: string[];
  displayCopy: {
    welcomeTitle: string;
    serviceCompleteTitle: string;
  };
}

export interface TerminalBootstrap extends AuraBootstrap {
  store: Store;
  stores: Store[];
  beauticians: Beautician[];
  projects: Project[];
  cards: Card[];
  products: Product[];
  config: TerminalConfig;
  catalogVersion: string;
}

export interface TerminalCatalogSync {
  since?: string;
  catalogVersion: string;
  projects: Project[];
  cards: Card[];
  products: Product[];
  beauticians: Beautician[];
  config: TerminalConfig;
}

export interface TerminalAutomationStrategy {
  id: number;
  name: string;
  title: string;
  summary: string;
  status: 'draft' | 'enabled' | 'paused' | 'archived';
  executionType: string;
  schedule: Record<string, unknown>;
  trigger: string;
  audience: string;
  action: string;
  frequencyCap: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
}

export interface TerminalAutomationCreateRequest {
  draftId: string;
  title: string;
  summary: string;
  sourceText: string;
  trigger: string;
  audience: string;
  action: string;
  frequencyCap: string;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  missingFields?: string[];
}

export interface TerminalAutomationTemplate {
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

export interface TerminalAutomationPreview {
  targetCount: number;
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  trigger: string;
  audience: string;
  action: string;
  frequencyCap: string;
  message: string;
}

export interface TerminalAutomationExecutionSummary {
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

export interface TerminalAutomationExecutionTouch {
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

export interface TerminalAutomationExecutionDetail extends TerminalAutomationExecutionSummary {
  touches: TerminalAutomationExecutionTouch[];
}

export interface TerminalAutomationTodaySummary {
  date: string;
  strategyCount: number;
  enabledCount: number;
  waitingApprovalCount: number;
  executedCount: number;
  successCount: number;
  failedCount: number;
  latestStrategies: TerminalAutomationStrategy[];
  latestExecutions: TerminalAutomationExecutionSummary[];
}

export interface TerminalAutomationDueRunSummary {
  scannedCount: number;
  dueCount?: number;
  executedCount: number;
  skipped?: boolean;
  reason?: string;
  scannedAt?: string;
  executions?: TerminalAutomationExecutionSummary[];
}

export interface TerminalDashboardKpi {
  label: string;
  value: string;
  hint?: string;
}

export interface TerminalDashboardInsight {
  title: string;
  severity?: 'high' | 'medium' | 'low' | string;
  reason: string;
  action: string;
  relatedType?: string;
  relatedId?: number | string;
}

export interface TerminalManagerDashboard {
  title: string;
  subtitle: string;
  summary: string;
  kpis: TerminalDashboardKpi[];
  risks: Array<string | TerminalDashboardInsight>;
  highlights: Array<string | TerminalDashboardInsight>;
}

export interface TerminalStaffScheduleItem {
  title: string;
  subtitle: string;
  beautician: Beautician;
  todaySlots: Array<{ time: string; period: '上午' | '下午'; available: boolean }>;
  utilization: string;
  summary: string;
}

export interface TerminalReceptionDashboard {
  title: string;
  subtitle: string;
  items: TerminalReservation[];
  summary: string;
}

export interface TerminalRoleDashboard {
  manager: TerminalManagerDashboard;
  staff: TerminalStaffScheduleItem[];
  reception: TerminalReceptionDashboard;
}

export interface TerminalBeauticianCommissionRecord {
  id: number;
  type: string;
  amount: number;
  sourceAmount: number;
  status: string;
  orderNo?: string;
  ruleName?: string;
  orderItem?: { id: number; name?: string };
  createdAt?: string;
}

export interface TerminalBeauticianCommissionBreakdownItem {
  type: string;
  label: string;
  amount: number;
  sourceAmount: number;
  pendingAmount: number;
  confirmedAmount: number;
  count: number;
}

export interface TerminalBeauticianCommissionSummary {
  todayAmount: number;
  monthAmount: number;
  monthPendingAmount: number;
  monthConfirmedAmount: number;
  todayCount: number;
  monthCount: number;
  breakdown?: TerminalBeauticianCommissionBreakdownItem[];
  recentRecords: TerminalBeauticianCommissionRecord[];
  monthRecords?: TerminalBeauticianCommissionRecord[];
}

export interface TerminalBeauticianQualitySummary {
  completedCount: number;
  activeTaskCount: number;
  recordedCount: number;
  completionRate: number;
  recordRate: number;
  averageServiceDurationMinutes: number;
  repeatCustomerCount: number;
  repurchaseOpportunityCount: number;
  revenueContributionAmount: number;
  highlights: string[];
  suggestions: string[];
}

export interface TerminalBeauticianMe extends Beautician {
  beauticianId?: number;
  roleMode?: 'self' | 'manager_delegate';
}

export interface TerminalBeauticianDashboard {
  beautician: TerminalBeauticianMe;
  date: string;
  schedule: {
    todaySlots: Array<{ time: string; period?: '上午' | '下午' | string; available?: boolean; status?: string }>;
    weekSlots?: Array<Array<{ time: string; period?: '上午' | '下午' | string; available?: boolean; status?: string }>>;
    weekStart?: string;
    utilization: string;
  };
  tasks: {
    pending: TerminalServiceTask[];
    inProgress: TerminalServiceTask[];
    needRecord: TerminalServiceTask[];
    completedToday: TerminalServiceTask[];
    nextTask?: TerminalServiceTask;
  };
  commission: TerminalBeauticianCommissionSummary;
  quality: TerminalBeauticianQualitySummary;
  alerts: Array<{
    type: 'next_task' | 'record_missing' | 'customer_advice' | 'commission_pending' | string;
    title: string;
    description: string;
    relatedId?: number;
  }>;
  summary: string;
}

export interface TerminalCashierShift {
  id: number;
  storeId: number;
  storeName?: string;
  deviceId?: number;
  deviceName?: string;
  operatorType: string;
  startedAt: string;
  endedAt?: string;
  status: 'open' | 'closed' | 'reconciled';
  openingCash: number;
  closingCash?: number;
  systemCash?: number;
  cashDiff?: number;
  summary?: Record<string, number>;
  alertLevel?: 'normal' | 'warning';
}

export interface TerminalCustomerGrowthDashboard {
  title: string;
  subtitle: string;
  items: Array<string | TerminalDashboardInsight>;
  summary: string;
}

export interface TerminalContextCustomer {
  id: number;
  name: string;
  phone: string;
  gender?: string;
  memberLevel: string;
  totalSpent?: number;
  visitCount?: number;
  lastVisitDate?: string;
  tags: string[];
  source?: string;
  storeName?: string;
  skinCondition?: string;
  cashBalance?: number;
  giftBalance?: number;
  totalBalance?: number;
  activeCustomerCardsCount?: number;
  isAppointedToday?: boolean;
  appointmentTime?: string;
  appointmentProjectName?: string;
}

export type TerminalCustomerSelectScene =
  | 'appointment'
  | 'cashier'
  | 'card_opening'
  | 'recharge'
  | 'verification'
  | 'follow_up'
  | 'service_record';

export interface TerminalCustomerSelectQuery {
  scene?: TerminalCustomerSelectScene;
  keyword?: string;
  limit?: number;
  customerIds?: string;
  operatorId?: number;
  onlyMyCustomers?: boolean;
  includeInactive?: boolean;
}

export interface TerminalCustomerSelectItem extends TerminalContextCustomer {
  maskedPhone?: string;
  priorityLabel?: string;
  sceneBadges: string[];
  disabled?: boolean;
  disabledReason?: string;
  metadata?: {
    appointmentTime?: string;
    activeCardCount?: number;
    followUpTaskCount?: number;
    assignedStaffName?: string;
  };
}

export interface TerminalCustomerSelectResponse {
  scene: TerminalCustomerSelectScene;
  keyword: string;
  generatedAt: string;
  fromCache: boolean;
  items: TerminalCustomerSelectItem[];
  total?: number;
  hasMore: boolean;
}

export interface TerminalCashierContext extends TerminalCatalogSync {
  customers: TerminalContextCustomer[];
  storeName: string;
  shiftRequired?: boolean;
  generatedAt: string;
}

export interface TerminalCardVerificationContext {
  customers: TerminalContextCustomer[];
  beauticians?: Beautician[];
  storeName: string;
  generatedAt: string;
}

export interface TerminalQuickCreateCustomerRequest {
  name: string;
  phone: string;
  gender?: string;
  storeName?: string;
  source?: string;
  birthday?: string;
  memberLevel?: string;
  skinCondition?: string;
  tags?: string[];
  remark?: string;
}

export interface TerminalCustomerSummary {
  customer: Customer;
  availableCardCount: number;
  lastVisitDate: string;
  behaviorProfile?: TerminalBehaviorProfile;
  healthProfile?: TerminalHealthProfile;
}

export interface TerminalHealthProfile {
  id: number;
  customerId: number;
  photo?: string;
  name: string;
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  allergyHistory?: string;
  goals?: string;
  recommendedCare?: string;
  instrument?: string;
  lastCheck: string;
}

export interface TerminalConsumptionRecord {
  id: number;
  customerId: number;
  userName: string;
  consumeType: string;
  consumeContent: string;
  payMethod: string;
  amount: string;
  campaign: string;
  consumeTime: string;
}

export interface TerminalBehaviorProfile {
  customerId: number;
  name: string;
  segment: string;
  skinType: string;
  visitFrequency: string;
  avgSpend: string;
  preferredService: string;
  promotionSensitivity: string;
  repurchaseRate: string;
  loyalty: string;
  seasonalTrend: string;
}

export interface TerminalConsumptionItem {
  productId?: number;
  productName: string;
  sku: string;
  standardQty: number;
  actualQty: number;
  unit: string;
}

export interface TerminalServiceTask {
  id: number;
  taskNo: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  projectId: number;
  projectName: string;
  beauticianId: number;
  beauticianName: string;
  storeId: number;
  storeName: string;
  appointmentTime: string;
  duration: number;
  status: TerminalServiceTaskStatus;
  startedAt?: string;
  completedAt?: string;
  remark?: string;
  consumptionItems: TerminalConsumptionItem[];
  images: string[];
}

export interface TerminalCompleteServiceTaskRequest {
  beauticianId: number;
  result: string;
  customerFeedback?: string;
  nextSuggestion?: string;
  remark?: string;
  images?: string[];
  consumptionItems?: TerminalConsumptionItem[];
  transferToCashier?: boolean;
  nextReservationSuggestion?: string;
}

export interface TerminalCustomerCard {
  id: number;
  customerId: number;
  cardId: number;
  cardName: string;
  totalTimes: number;
  remainingTimes: number;
  expiryDate: string;
  applicableProjects: string[];
  status: 'active' | 'expired' | 'used_up';
}

export interface TerminalCardUsagePreviewRequest {
  customerCardId: number;
  projectId: number;
  times: number;
}

export interface TerminalCardUsagePreview {
  valid: boolean;
  message: string;
  customerCard?: TerminalCustomerCard;
  project?: Project;
  remainingAfterUse?: number;
}

export interface TerminalCardUsageVerifyRequest extends TerminalCardUsagePreviewRequest {
  taskId?: number;
  beauticianId?: number;
  operatorId?: number;
  deviceId?: number;
}

export interface TerminalCardUsageRecord {
  id: number;
  customerId: number;
  customerName: string;
  cardName: string;
  projectName: string;
  times: number;
  remainingTimes: number;
  operatorId?: number;
  operatorName?: string;
  beauticianId?: number;
  deviceId?: number;
  verifiedAt: string;
}

export interface TerminalReservationCreateRequest {
  idempotencyKey?: string;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  projectId?: number;
  projectName: string;
  beauticianId?: number;
  beauticianName: string;
  appointmentTime: string;
  duration: number;
  remark?: string;
}

export interface TerminalReservationUpdateRequest {
  appointmentTime?: string;
  projectId?: number;
  projectName?: string;
  beauticianId?: number;
  beauticianName?: string;
  duration?: number;
  status?: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  remark?: string;
}

export interface TerminalReservationRescheduleRequest {
  appointmentTime: string;
  duration?: number;
  beauticianId?: number;
  reason?: string;
}

export interface TerminalReservationAvailabilityParams {
  date?: string;
  projectId?: number;
  beauticianId?: number;
  duration?: number;
}

export interface TerminalReservationAvailability {
  storeId: number;
  date: string;
  projectId?: number;
  projectName?: string;
  duration: number;
  items: Array<{
    beauticianId: number;
    beauticianName: string;
    slots: Array<{ time: string; available: boolean; reason?: string }>;
  }>;
}

export interface TerminalReservation {
  id: number;
  reservationNo: string;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  projectId?: number;
  projectName: string;
  beauticianId?: number;
  beauticianName: string;
  storeId: number;
  storeName: string;
  appointmentTime: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  remark?: string;
  createdAt: string;
  checkedInAt?: string;
  serviceTask?: TerminalServiceTask;
}

export interface TerminalCashierOrderItem {
  itemType: 'project' | 'product' | 'card' | 'recharge';
  itemId?: number;
  name: string;
  quantity: number;
  unitPrice: number;
  listAmount?: number;
  subtotal: number;
  discount?: number;
  itemDiscountAmount?: number;
  orderAllocatedDiscountAmount?: number;
  totalDiscountAmount?: number;
  netAmount?: number;
  discountSource?: string;
  allocationMethod?: string;
  discountPayload?: unknown;
  isGift?: boolean;
  eligibleForOrderDiscount?: boolean;
  beauticianId?: number;
  beauticianName?: string;
}

export interface TerminalCashierOrderCreateRequest {
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  items: TerminalCashierOrderItem[];
  discountAmount?: number;
  discountMode?: 'none' | 'amount' | 'rate' | 'package_price' | 'manual';
  discountRate?: number;
  packagePrice?: number;
  allocationMethod?: 'price_ratio' | 'manual';
  discountSource?: 'order' | 'package' | 'promotion' | 'coupon' | 'manual';
  promotionId?: number;
  couponId?: number;
  paymentMethod?: '\u73b0\u91d1' | '\u5fae\u4fe1' | '\u652f\u4ed8\u5b9d' | '\u94f6\u884c\u5361' | '\u6b21\u5361\u62b5\u6263' | '\u4f1a\u5458\u4f59\u989d' | 'cash' | 'wechat' | 'alipay' | 'card' | 'customer_card' | 'member_balance';
  payments?: Array<{
    paymentMethod: TerminalCashierOrderCreateRequest['paymentMethod'];
    amount: number;
    transactionNo?: string;
  }>;
  remark?: string;
}

export interface TerminalCashierOrder {
  id: number;
  orderNo: string;
  checkoutGroupNo?: string;
  orderKind?: 'product' | 'project' | 'mixed' | string;
  splitOrderIds?: number[];
  splitOrderNos?: string[];
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  storeId: number;
  storeName: string;
  items: TerminalCashierOrderItem[];
  totalAmount: number;
  listAmount?: number;
  itemDiscountAmount?: number;
  orderDiscountAmount?: number;
  totalDiscountAmount?: number;
  netAmount?: number;
  discountSource?: string;
  allocationMethod?: string;
  status: 'pending_payment' | 'paid' | 'completed' | 'cancelled' | 'refunded';
  paymentMethod?: string;
  memberBalanceDeduction?: {
    transactionId?: number;
    transactionNo?: string;
    totalAmount: number;
    cashAmount: number;
    giftAmount: number;
    cashBalanceBefore: number;
    cashBalanceAfter: number;
    giftBalanceBefore: number;
    giftBalanceAfter: number;
  };
  createdAt: string;
  paidAt?: string;
  completedAt?: string;
  remark?: string;
}

export interface TerminalPaymentCompleteRequest {
  paymentMethod: '\u73b0\u91d1' | '\u5fae\u4fe1' | '\u652f\u4ed8\u5b9d' | '\u94f6\u884c\u5361' | '\u6b21\u5361\u62b5\u6263' | '\u4f1a\u5458\u4f59\u989d' | 'cash' | 'wechat' | 'alipay' | 'card' | 'customer_card' | 'member_balance';
  paidAmount?: number;
  transactionNo?: string;
}

export interface TerminalCardOrderCreateRequest {
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  cardId: number;
  cardName: string;
  operatorId?: number;
  amount: number;
  totalTimes: number;
  discountAmount?: number;
  giftProjects?: string[];
  paymentMethod?: '\u73b0\u91d1' | '\u5fae\u4fe1' | '\u652f\u4ed8\u5b9d' | '\u94f6\u884c\u5361' | '\u4f1a\u5458\u4f59\u989d' | 'cash' | 'wechat' | 'alipay' | 'card' | 'member_balance';
  transactionNo?: string;
  remark?: string;
}

export interface TerminalCardOrder {
  id: number;
  orderNo: string;
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  cardId: number;
  cardName: string;
  operatorId?: number;
  operatorName?: string;
  storeId: number;
  storeName: string;
  amount: number;
  discountAmount?: number;
  giftProjects?: string[];
  totalTimes: number;
  remainingTimes: number;
  status: 'active' | 'expired' | 'voided';
  purchaseTime: string;
  expireTime: string;
  paymentMethod?: string;
}

export interface TerminalRechargeOrderCreateRequest {
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  amount: number;
  giftAmount?: number;
  discountAmount?: number;
  giftProjects?: string[];
  paymentMethod?: '\u73b0\u91d1' | '\u5fae\u4fe1' | '\u652f\u4ed8\u5b9d' | '\u94f6\u884c\u5361' | 'cash' | 'wechat' | 'alipay' | 'card';
  transactionNo?: string;
  remark?: string;
}

export interface TerminalRechargeOrder {
  id: number;
  orderNo: string;
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  storeId: number;
  storeName: string;
  amount: number;
  giftAmount: number;
  giftProjects?: string[];
  cashBalance?: number;
  giftBalance?: number;
  balanceTransactionId?: number;
  status: 'paid' | 'cancelled' | 'refunded';
  paymentMethod?: string;
  createdAt: string;
  remark?: string;
}

export interface TerminalPrintJobCreateRequest {
  sourceType: 'cashier_order' | 'card_order' | 'recharge_order' | 'card_usage' | 'refund_order' | 'reservation' | 'custom';
  sourceId?: number;
  title: string;
  content: string;
  copies?: number;
}

export interface TerminalPrintJob {
  id: number;
  jobNo: string;
  sourceType: TerminalPrintJobCreateRequest['sourceType'];
  sourceId?: number;
  title: string;
  content: string;
  copies: number;
  storeId: number;
  storeName: string;
  status: 'queued' | 'pending' | 'printing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface TerminalPrintJobStatusUpdateRequest {
  status: 'queued' | 'pending' | 'printing' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface TerminalPrintableReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  listAmount?: number;
  discountAmount?: number;
  subtotal: number;
}

export interface TerminalPrintableReceipt {
  sourceType: TerminalPrintJobCreateRequest['sourceType'];
  sourceId?: number;
  receiptNo: string;
  businessTitle?: string;
  detailLabel?: string;
  storeName: string;
  customerName: string;
  customerPhone?: string;
  cashierName?: string;
  paymentMethod?: string;
  items: TerminalPrintableReceiptItem[];
  subtotalAmount: number;
  discountAmount: number;
  paidAmount: number;
  createdAt: string;
}

export interface TerminalPrintableDocument {
  id: string;
  sourceType: 'cashier_order' | 'card_order' | 'card_usage';
  sourceId: number;
  receiptNo: string;
  typeLabel: string;
  title: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  status: string;
  time: string;
  description: string;
  receipt: TerminalPrintableReceipt;
}

export interface TerminalPrintableDocumentsResponse {
  title: string;
  subtitle: string;
  summary: string;
  date: string;
  generatedAt: string;
  total: number;
  counts: {
    cashier: number;
    cardUsage: number;
    cardOrder: number;
  };
  items: TerminalPrintableDocument[];
}

export interface TerminalSkinMetric {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  score?: number;
}

export interface TerminalCreateSkinTestRequest {
  customerId?: number;
  taskId?: number;
  deviceId?: number;
  images?: string[];
  metrics: TerminalSkinMetric[];
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  recommendationText?: string;
  isFallback?: boolean;
}

export interface TerminalSkinTest {
  id: number;
  customerId?: number;
  taskId?: number;
  deviceId: number;
  images: string[];
  metrics: TerminalSkinMetric[];
  skinType: string;
  skinStatus: string;
  mainProblems: string;
  recommendationText: string;
  isFallback?: boolean;
  createdAt: string;
}

export interface TerminalRecommendation {
  id: number;
  customerId: number;
  type: 'project' | 'card' | 'product' | 'script';
  title: string;
  reason: string;
  matchFactors?: string[];
  targetId?: number;
  confidence: number;
  payload?: Record<string, unknown>;
}

export interface TerminalGrowthCandidate {
  customerId: number;
  name: string;
  phone?: string;
  lastVisitDate?: string | null;
  totalSpent: number;
  memberLevel?: string;
  visitCount?: number;
  tags?: string[];
  source?: string;
  churnScore: number;
  churnLevel: string;
  repurchase30dScore: number;
  marketingResponseScore?: number;
  ltvTier?: string;
  reason: string;
  recommendedActions?: unknown;
  featureJson?: Record<string, unknown>;
}

export interface TerminalNextBestAction {
  id: string;
  type: 'recommend_project' | 'create_follow_up' | 'service_care' | string;
  title: string;
  reason: string;
  priority: 'high' | 'medium' | 'low' | string;
  actionLabel: string;
  payload?: Record<string, unknown>;
}

export interface TerminalNextBestActionsResponse {
  customerId: number;
  customerName: string;
  generatedAt: string;
  actions: TerminalNextBestAction[];
  prediction?: {
    churnScore: number;
    churnLevel: string;
    repurchase30dScore: number;
    marketingResponseScore: number;
    ltvTier: string;
  } | null;
}

export interface TerminalRecommendationEventRequest {
  recommendationId: number;
  customerId: number;
  eventType: TerminalRecommendationEventType;
  taskId?: number;
  orderId?: number;
  note?: string;
}

export interface TerminalFollowUpTaskCreateRequest {
  idempotencyKey?: string;
  customerId: number;
  customerIds?: number[];
  assignments?: TerminalFollowUpTaskAssignment[];
  recommendationId?: number;
  recommendationInstanceId?: string;
  adoptionId?: number;
  sourceRecommendationKey?: string;
  source?: string;
  triggerType?: string;
  promotionId?: number;
  promotionName?: string;
  offerJson?: Record<string, unknown>;
  attribution?: Record<string, unknown>;
  title?: string;
  priority?: 'urgent' | 'recommended' | 'opportunity' | string;
  assigneeRole?: 'manager' | 'consultant' | 'reception' | string;
  assigneeUserId?: number;
  assigneeBeauticianId?: number;
  taskId?: number;
  orderId?: number;
  reservationId?: number;
  channel?: 'phone' | 'wechat' | 'sms' | 'offline' | string;
  script?: string;
  note?: string;
  remark?: string;
  dueAt?: string;
}

export interface TerminalFollowUpTaskAssignment {
  customerId: number;
  assigneeRole?: 'manager' | 'consultant' | 'reception' | string;
  assigneeUserId: number;
  assigneeBeauticianId?: number;
}

export interface TerminalFollowUpTask {
  id: number;
  customerId: number;
  customerName?: string;
  customerPhone?: string;
  customerMemberLevel?: string;
  recommendationId?: number;
  recommendationInstanceId?: string;
  adoptionId?: number;
  sourceRecommendationKey?: string;
  source?: string;
  triggerType?: string;
  title?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | string;
  priority?: 'urgent' | 'recommended' | 'opportunity' | string;
  assigneeRole?: 'manager' | 'consultant' | 'reception' | string;
  assigneeUserId?: number;
  assigneeUserName?: string;
  assigneeBeauticianId?: number;
  assigneeBeauticianName?: string;
  assignmentReason?: string;
  channel?: string;
  script?: string;
  note?: string;
  dueAt?: string;
  resultType?: 'contacted' | 'booked' | 'not_reached' | 'refused' | 'converted' | string;
  result?: string;
  resultNote?: string;
  reservationId?: number;
  orderId?: number;
  serviceTaskId?: number;
  completionEventId?: number;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  duplicated?: boolean;
}

export interface TerminalFollowUpTaskCompleteRequest {
  resultType?: 'contacted' | 'booked' | 'not_reached' | 'refused' | 'converted' | string;
  result?: string;
  note?: string;
  orderId?: number;
  reservationId?: number;
}

export interface TerminalFollowUpTaskQuery {
  page?: number;
  pageSize?: number;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'expired' | string;
  assigneeRole?: 'manager' | 'consultant' | 'reception' | string;
  assigneeUserId?: number;
  operatorId?: number;
  customerId?: number;
  recommendationId?: number;
  recommendationInstanceId?: string;
  keyword?: string;
}

export interface TerminalFollowUpTaskSummary {
  pending: number;
  in_progress?: number;
  inProgress?: number;
  completed: number;
  cancelled?: number;
  expired: number;
  overdue: number;
  booked?: number;
  converted?: number;
  revenue?: number;
  assigneeStats?: TerminalFollowUpAssigneeStat[];
}

export interface TerminalFollowUpAssigneeStat {
  assigneeKey: string;
  assigneeRole: 'manager' | 'consultant' | 'reception' | string;
  assigneeRoleLabel: string;
  assigneeUserId?: number;
  assigneeBeauticianId?: number;
  assigneeName: string;
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  booked: number;
  converted: number;
  revenue: number;
  completionRate: number;
  conversionRate: number;
}

export interface TerminalFollowUpTaskListResponse {
  items: TerminalFollowUpTask[];
  total: number;
  page: number;
  pageSize: number;
  summary?: TerminalFollowUpTaskSummary;
}

export interface TerminalFollowUpTaskBatchCreateResponse {
  items: TerminalFollowUpTask[];
  total: number;
  createdCount: number;
  duplicatedCount: number;
  failedCount: number;
  failures: Array<{ customerId: number; message: string }>;
}

export interface TerminalPromotion {
  id: number;
  name: string;
  description: string;
  discountText: string;
  validUntil: string;
  applicableProjectIds: number[];
}

export interface TerminalConsumptionRecordCreateRequest {
  taskId?: number;
  customerId: number;
  projectId: number;
  beauticianId: number;
  items: TerminalConsumptionItem[];
  deviceId?: number;
  remark?: string;
}

export interface TerminalServiceRecordCreateRequest {
  taskId?: number;
  customerId: number;
  projectId?: number;
  beauticianId?: number;
  result?: string;
  customerFeedback?: string;
  nextSuggestion?: string;
  remark?: string;
  images?: string[];
  consumptionItems?: TerminalConsumptionItem[];
  transferToCashier?: boolean;
  nextReservationSuggestion?: string;
}

export interface TerminalServiceRecordResponse {
  task: TerminalServiceTask;
  serviceRecord?: {
    id: number;
    customerId?: number;
    consumeContent?: string;
    note?: string;
    createdAt: string;
  };
  nextActions?: string[];
}

export interface TerminalBalanceAccount {
  customerId: number;
  customerName: string;
  customerPhone: string;
  storeId: number;
  cashBalance: number;
  giftBalance: number;
  totalBalance: number;
  status: string;
  updatedAt: string;
  lastTransaction?: {
    id: number;
    transactionNo: string;
    type: 'consume' | 'refund' | 'adjust' | 'recharge' | string;
    amount: number;
    giftAmount: number;
    cashBalanceAfter: number;
    giftBalanceAfter: number;
    createdAt: string;
  };
}

export interface TerminalBalanceConsumeRequest {
  customerId: number;
  amount: number;
  giftAmount?: number;
  orderId?: number;
  paymentMethod?: string;
  remark?: string;
}

export interface TerminalBalanceRefundRequest {
  customerId: number;
  amount: number;
  giftAmount?: number;
  orderId?: number;
  remark?: string;
}

export interface TerminalBalanceAdjustRequest {
  customerId: number;
  cashDelta?: number;
  giftDelta?: number;
  remark?: string;
}

export interface TerminalBomResponse {
  projectId: number;
  projectName: string;
  items: BOMItem[];
}

export interface TerminalInventoryStockParams {
  productIds?: number[];
  storeId?: number;
}

export type TerminalInventoryStockResponse = StockItem[];

export interface TerminalInventoryAlertsResponse {
  lowStock: StockItem[];
  expiring: ExpiringProduct[];
  replenishment: ReplenishmentSuggestion[];
  summary: string;
  generatedAt: string;
  storeName: string;
}
