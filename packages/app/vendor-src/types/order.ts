export interface ProductOrder {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  storeName: string;
  items: ProductOrderItem[];
  totalAmount: number;
  status: '待付款' | '已付款' | '已完成' | '已取消' | '已退款';
  paymentMethod: '现金' | '微信' | '支付宝' | '银行卡' | '次卡抵扣';
  createdAt: string;
  completedAt?: string;
}

export interface ProductOrderItem {
  id: number;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
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
