export type ProductOrderStatus = '待付款' | '已付款' | '已完成' | '已取消' | '已退款';
export type ProductOrderPaymentMethod = '现金' | '微信' | '支付宝' | '银行卡' | '会员卡划扣';

export interface ProductOrder {
  id: number;
  orderNo: string;
  customerId?: number;
  customerName: string;
  customerPhone: string;
  storeId?: number;
  storeName: string;
  items: ProductOrderItem[];
  totalAmount: number;
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
}

export interface ProductOrderItem {
  id: number;
  itemId?: number;
  itemType?: 'product' | 'project' | 'card' | 'recharge' | string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discount?: number;
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
  status: ProductOrderStatus;
  paymentMethod: ProductOrderPaymentMethod;
  payMethod?: string;
  paidAmount?: number;
  transactionNo?: string;
  remark?: string;
  source?: 'admin' | 'terminal' | string;
}

export interface OrderItem {
  id: number;
  orderId: number;
  itemType: string;
  itemId?: number | null;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
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
  amount: number;
  reason?: string | null;
  status: string;
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

export type MemberCardTransactionType = 'open' | 'recharge' | 'gift' | 'deduct';

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
  remark?: string;
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
  paymentMethod?: string;
  remark?: string;
}

export interface MemberCardRechargePayload {
  rechargeAmount: number;
  giftAmount?: number;
  paymentMethod?: string;
  remark?: string;
}

export interface MemberCardGiftPayload {
  giftAmount: number;
  remark?: string;
}

export interface MemberCardDeductPayload {
  amount: number;
  remark?: string;
}
