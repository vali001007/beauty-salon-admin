import type { Beautician } from '@/types/beautician';
import type { BOMItem } from '@/types/bom';
import type { Card } from '@/types/card';
import type { Customer } from '@/types/customer';
import type { ExpiringProduct, ReplenishmentSuggestion, StockItem } from '@/types/inventory';
import type { Product } from '@/types/product';
import type { Project } from '@/types/project';
import type { Store } from '@/types/store';
import type { AuraBootstrap } from './aura';

export type TerminalDeviceStatus = 'online' | 'offline' | 'disabled' | 'pending_unbind';
export type TerminalServiceTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type TerminalRecommendationEventType = 'shown' | 'accepted' | 'skipped' | 'converted';

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
  lastOnlineAt: string;
  boundAt: string;
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
}

export interface TerminalConfig {
  version: string;
  featureFlags: {
    skinTest: boolean;
    cardVerification: boolean;
    serviceConsumption: boolean;
    recommendationFeedback: boolean;
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

export interface TerminalDashboardKpi {
  label: string;
  value: string;
  hint?: string;
}

export interface TerminalManagerDashboard {
  title: string;
  subtitle: string;
  summary: string;
  kpis: TerminalDashboardKpi[];
  risks: string[];
  highlights: string[];
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
  remark?: string;
  images?: string[];
  consumptionItems?: TerminalConsumptionItem[];
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
  beauticianId: number;
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
  beauticianId: number;
  deviceId: number;
  verifiedAt: string;
}

export interface TerminalReservationCreateRequest {
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
}

export interface TerminalCashierOrderItem {
  itemType: 'project' | 'product' | 'card' | 'recharge';
  itemId?: number;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface TerminalCashierOrderCreateRequest {
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  items: TerminalCashierOrderItem[];
  discountAmount?: number;
  paymentMethod?: '\u73b0\u91d1' | '\u5fae\u4fe1' | '\u652f\u4ed8\u5b9d' | '\u94f6\u884c\u5361' | '\u6b21\u5361\u62b5\u6263' | 'cash' | 'wechat' | 'alipay' | 'card' | 'customer_card';
  remark?: string;
}

export interface TerminalCashierOrder {
  id: number;
  orderNo: string;
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  storeId: number;
  storeName: string;
  items: TerminalCashierOrderItem[];
  totalAmount: number;
  status: 'pending_payment' | 'paid' | 'completed' | 'cancelled' | 'refunded';
  paymentMethod?: string;
  createdAt: string;
  paidAt?: string;
  completedAt?: string;
  remark?: string;
}

export interface TerminalPaymentCompleteRequest {
  paymentMethod: '\u73b0\u91d1' | '\u5fae\u4fe1' | '\u652f\u4ed8\u5b9d' | '\u94f6\u884c\u5361' | '\u6b21\u5361\u62b5\u6263' | 'cash' | 'wechat' | 'alipay' | 'card' | 'customer_card';
  paidAmount?: number;
  transactionNo?: string;
}

export interface TerminalCardOrderCreateRequest {
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  cardId: number;
  cardName: string;
  amount: number;
  totalTimes: number;
  discountAmount?: number;
  giftProjects?: string[];
  paymentMethod?: '\u73b0\u91d1' | '\u5fae\u4fe1' | '\u652f\u4ed8\u5b9d' | '\u94f6\u884c\u5361' | 'cash' | 'wechat' | 'alipay' | 'card';
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
  sourceType: 'cashier_order' | 'card_order' | 'recharge_order' | 'card_usage' | 'reservation' | 'custom';
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
  status: 'queued' | 'printing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
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
  createdAt: string;
}

export interface TerminalRecommendation {
  id: number;
  customerId: number;
  type: 'project' | 'card' | 'product' | 'script';
  title: string;
  reason: string;
  targetId?: number;
  confidence: number;
  payload?: Record<string, unknown>;
}

export interface TerminalRecommendationEventRequest {
  recommendationId: number;
  customerId: number;
  eventType: TerminalRecommendationEventType;
  taskId?: number;
  orderId?: number;
  note?: string;
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
