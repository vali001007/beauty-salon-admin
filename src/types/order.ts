export type ProductOrderStatus = '待付款' | '已付款' | '已完成' | '部分退款' | '已取消' | '已退款';
export type ProductOrderPaymentMethod = '现金' | '微信' | '支付宝' | '银行卡' | '会员卡划扣';

export interface MemberBalanceDeduction {
  transactionId?: number;
  transactionNo?: string;
  totalAmount: number;
  cashAmount: number;
  giftAmount: number;
  cashBalanceBefore: number;
  cashBalanceAfter: number;
  giftBalanceBefore: number;
  giftBalanceAfter: number;
}

export interface ProductOrder {
  id: number;
  orderNo: string;
  checkoutGroupNo?: string;
  orderKind?: 'product' | 'project' | 'mixed' | string;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  storeId?: number;
  storeName: string;
  items: ProductOrderItem[];
  totalAmount: number;
  listAmount?: number;
  itemDiscountAmount?: number;
  orderDiscountAmount?: number;
  totalDiscountAmount?: number;
  netAmount?: number;
  discountSource?: string;
  allocationMethod?: string;
  promotionId?: number;
  couponId?: number;
  packageId?: number;
  discountPayload?: unknown;
  status: ProductOrderStatus;
  paymentMethod: ProductOrderPaymentMethod;
  payMethod?: string;
  remark?: string;
  source?: 'admin' | 'terminal' | string;
  createdAt: string;
  completedAt?: string;
  orderItems?: OrderItem[];
  paymentRecords?: PaymentRecord[];
  refundRecords?: RefundRecord[];
  marketingAttributions?: MarketingAttribution[];
  memberBalanceDeduction?: MemberBalanceDeduction;
}

export interface ProductOrderItem {
  id: number;
  itemId?: number;
  itemType?: 'product' | 'project' | 'card' | 'recharge' | string;
  productName: string;
  sku: string;
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
  payload?: unknown;
}

export interface ProductOrderCreateItem extends Omit<ProductOrderItem, 'id'> {
  id?: number;
  productId?: number;
  name?: string;
}

export interface ProductOrderCreatePayload {
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  storeId?: number;
  storeName?: string;
  items: ProductOrderCreateItem[];
  totalAmount: number;
  discountMode?: 'none' | 'amount' | 'rate' | 'package_price' | 'manual';
  discountAmount?: number;
  discountRate?: number;
  packagePrice?: number;
  allocationMethod?: 'price_ratio' | 'manual';
  discountSource?: 'order' | 'package' | 'promotion' | 'coupon' | 'manual';
  promotionId?: number;
  couponId?: number;
  status: ProductOrderStatus;
  paymentMethod: ProductOrderPaymentMethod;
  payMethod?: string;
  paidAmount?: number;
  transactionNo?: string;
  remark?: string;
  source?: 'admin' | 'terminal' | string;
}

export interface ProjectOrderProfitCommissionRecord {
  id: number;
  staffUserId?: number | null;
  staffUserName: string;
  beauticianId?: number | null;
  beauticianName?: string | null;
  ruleId?: number | null;
  ruleName?: string | null;
  sourceAmount: number;
  rate: number;
  amount: number;
  status: string;
  settleMonth?: string | null;
}

export interface ProjectOrderProfitBomItem {
  projectId?: number;
  productId: number;
  productName: string;
  unit?: string | null;
  standardQty: number;
  quantity: number;
  costPrice: number;
  costAmount: number;
}

export interface ProjectOrderProfitMaterialMovement {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unit?: string | null;
  costPrice: number;
  costAmount: number;
  occurredAt?: string;
  remark?: string | null;
}

export interface ProjectOrderProfitItem {
  orderItemId: number;
  projectId?: number;
  projectName: string;
  quantity: number;
  unitPrice: number;
  income: number;
  standardMaterialCost: number;
  commissionCost: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  beauticianId?: number | null;
  beauticianName?: string | null;
  bomItems: ProjectOrderProfitBomItem[];
  commissionRecords: ProjectOrderProfitCommissionRecord[];
  missingReasons: string[];
}

export interface ProjectOrderProfitDetail {
  orderId: number;
  orderNo: string;
  customerId?: number | null;
  customerName: string;
  customerPhone?: string;
  storeId?: number | null;
  storeName: string;
  status: string;
  source?: string | null;
  createdAt?: string;
  paymentMethod?: string;
  totalIncome: number;
  standardMaterialCost: number;
  actualMaterialCost: number;
  materialCost: number;
  commissionCost: number;
  unassignedCommissionCost: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  materialCostSource: 'actual_stock_movement' | 'standard_bom' | string;
  dataQuality: 'complete' | 'partial' | string;
  missingReasons: string[];
  items: ProjectOrderProfitItem[];
  actualMaterialMovements: ProjectOrderProfitMaterialMovement[];
  unassignedCommissionRecords: ProjectOrderProfitCommissionRecord[];
}

export type ProductOrderProfitCostSource = 'order_snapshot' | 'stock_movement' | 'product_master' | 'missing' | 'mixed' | string;

export interface ProductOrderProfitStockMovement {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  unit?: string | null;
  costPrice: number;
  costAmount: number;
  occurredAt?: string;
  remark?: string | null;
}

export interface ProductOrderProfitItem {
  orderItemId: number;
  productId?: number;
  productName: string;
  sku?: string;
  categoryName?: string;
  brand?: string;
  quantity: number;
  unitPrice: number;
  listAmount: number;
  discountAmount: number;
  salesAmount: number;
  refundAmount: number;
  netSalesAmount: number;
  unitCost: number;
  costSource: ProductOrderProfitCostSource;
  productCost: number;
  commissionCost: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  commissionRecords: ProjectOrderProfitCommissionRecord[];
  missingReasons: string[];
}

export interface ProductOrderProfitDetail {
  orderId: number;
  orderNo: string;
  customerId?: number | null;
  customerName: string;
  customerPhone?: string;
  storeId?: number | null;
  storeName: string;
  status: string;
  source?: string | null;
  createdAt?: string;
  paymentMethod?: string;
  listAmount: number;
  discountAmount: number;
  refundAmount: number;
  totalSalesAmount: number;
  productCost: number;
  commissionCost: number;
  unassignedCommissionCost: number;
  totalCost: number;
  grossProfit: number;
  grossMargin: number;
  costSource: ProductOrderProfitCostSource;
  dataQuality: 'complete' | 'partial' | string;
  missingReasons: string[];
  items: ProductOrderProfitItem[];
  stockMovements: ProductOrderProfitStockMovement[];
  unassignedCommissionRecords: ProjectOrderProfitCommissionRecord[];
}

export interface OrderItem {
  id: number;
  orderId: number;
  itemType: string;
  itemId?: number | null;
  name: string;
  quantity: number;
  unitPrice: number;
  listAmount?: number;
  subtotal: number;
  discount: number;
  itemDiscountAmount?: number;
  orderAllocatedDiscountAmount?: number;
  totalDiscountAmount?: number;
  netAmount?: number;
  discountSource?: string;
  allocationMethod?: string;
  discountPayload?: unknown;
  isGift?: boolean;
  eligibleForOrderDiscount?: boolean;
  beauticianId?: number | null;
  beauticianName?: string | null;
  payload?: unknown;
  createdAt: string;
}

export interface PaymentRecord {
  id: number;
  orderId: number;
  paymentNo: string;
  method: string;
  amount: number;
  status: string;
  transactionNo?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

export interface RefundRecord {
  id: number;
  orderId: number;
  refundNo: string;
  requestId?: string;
  refundMode?: OrderRefundMode;
  amount: number;
  reason?: string | null;
  status: string;
  inventoryStatus?: string;
  items?: RefundItem[];
  refundedAt?: string | null;
  createdAt: string;
}

export interface MarketingAttribution {
  id: number;
  touchId: number;
  strategyId: number;
  executionId?: number | null;
  customerId: number;
  orderId: number;
  attributionType: string;
  attributedRevenue: number;
  attributionWindowDays: number;
  occurredAt: string;
  createdAt: string;
}

export interface Reservation {
  id: number;
  customerName: string;
  customerPhone: string;
  projectName: string;
  beauticianName: string;
  storeName: string;
  date: string;
  time: string;
  duration: number;
  status: '待确认' | '已确认' | '进行中' | '已完成' | '已取消';
  createdAt: string;
}

export interface Card {
  id: number;
  name: string;
  type: string;
  totalTimes: number;
  price: number;
  validDays: number;
  projects: CardProject[];
  status: '在售' | '停售';
}

export interface CardProject {
  projectName: string;
  timesPerCard: number;
}

export interface CardOrder {
  id: number;
  orderNo: string;
  customerName: string;
  cardName: string;
  totalTimes: number;
  remainingTimes: number;
  amount: number;
  status: '使用中' | '已用完' | '已过期';
  purchaseDate: string;
  expiryDate: string;
}

export type MemberCardTransactionType = 'open' | 'recharge' | 'gift' | 'deduct' | 'refund';

export interface MemberCardAccount {
  id: number;
  accountNo: string;
  customerId: number;
  userName: string;
  customerPhone?: string;
  storeId: number;
  storeName: string;
  totalRecharge: number;
  totalConsumed: number;
  availableBalance: number;
  giftBalance: number;
  handlerId?: number;
  handlerName?: string;
  remark?: string;
  lastTransactionNo?: string;
  lastOrderNo?: string;
  lastTransactionType?: MemberCardTransactionType;
  lastTransactionAmount?: number;
  lastTransactionAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MemberCardTransaction {
  id: number;
  accountId: number;
  accountNo?: string;
  customerId?: number;
  customerName?: string;
  customerPhone?: string;
  storeId?: number;
  storeName?: string;
  orderId?: number;
  orderNo?: string;
  transactionNo: string;
  type: MemberCardTransactionType;
  typeLabel: string;
  amount: number;
  giftAmount: number;
  cashBalanceBefore: number;
  cashBalanceAfter: number;
  giftBalanceBefore: number;
  giftBalanceAfter: number;
  paymentMethod?: string;
  operatorId?: number;
  operatorName?: string;
  remark?: string;
  createdAt: string;
}

export interface MemberCardOpenPayload {
  storeId: number;
  storeName?: string;
  customerId: number;
  customerName?: string;
  customerPhone?: string;
  rechargeAmount: number;
  giftAmount?: number;
  giftProjects?: string[];
  paymentMethod?: string;
  remark?: string;
}

export interface MemberCardRechargePayload {
  rechargeAmount: number;
  giftAmount?: number;
  giftProjects?: string[];
  paymentMethod?: string;
  remark?: string;
}

export interface MemberCardGiftPayload {
  giftAmount: number;
  remark?: string;
}

export type OrderRefundMode = 'refund_only' | 'return_and_refund';

export interface RefundItem {
  id: number;
  refundId: number;
  orderItemId: number;
  itemType: string;
  itemId?: number;
  quantity: number;
  refundAmount: number;
  inventoryAction: string;
  inventoryStatus: string;
}

export interface OrderRefundPreviewItem {
  orderItemId: number;
  itemType: string;
  itemId?: number;
  name: string;
  soldQuantity: number;
  refundedQuantity: number;
  remainingRefundableQuantity: number;
  netAmount: number;
  refundedAmount: number;
  remainingRefundableAmount: number;
  inventoryTraceStatus: 'complete' | 'ambiguous' | 'missing' | 'not_required';
}

export interface OrderRefundPreview {
  orderId: number;
  orderNo: string;
  checkoutGroupNo?: string;
  status: string;
  netAmount: number;
  refundedAmount: number;
  remainingRefundableAmount: number;
  inventoryTraceStatus: 'complete' | 'ambiguous' | 'missing';
  allowedModes: OrderRefundMode[];
  items: OrderRefundPreviewItem[];
}

export interface MemberCardDeductItemPayload {
  itemType: 'project' | 'product';
  itemId?: number;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal?: number;
  netAmount?: number;
  beauticianId: number;
  beauticianName?: string;
}

export interface MemberCardDeductPayload {
  amount: number;
  items: MemberCardDeductItemPayload[];
  remark?: string;
}

export interface MemberCardRefundPayload {
  amount: number;
  paymentMethod?: string;
  remark?: string;
}

export interface ProductOrderRefundPayload {
  requestId: string;
  refundMode: OrderRefundMode;
  reason: string;
  items: Array<{
    orderItemId: number;
    quantity: number;
    refundAmount?: number;
  }>;
}
