import type {
  OrderItem,
  PaymentRecord,
  ProductOrder,
  ProductOrderCreatePayload,
  ProductOrderItem,
  ProductOrderPaymentMethod,
  ProductOrderStatus,
} from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiProductOrder = Partial<ProductOrder> & {
  customer?: { id?: number; name?: string; phone?: string };
  store?: { id?: number; name?: string };
  status?: string;
  payMethod?: string;
  paymentMethod?: string;
  items?: unknown;
  totalAmount?: number | string;
  orderItems?: OrderItem[];
  paymentRecords?: PaymentRecord[];
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
};

const STATUS_TO_API: Record<ProductOrderStatus, string> = {
  待付款: 'pending',
  已付款: 'paid',
  已完成: 'completed',
  已取消: 'cancelled',
  已退款: 'refunded',
};

const STATUS_FROM_API: Record<string, ProductOrderStatus> = {
  pending: '待付款',
  pending_payment: '待付款',
  unpaid: '待付款',
  paid: '已付款',
  completed: '已完成',
  cancelled: '已取消',
  canceled: '已取消',
  refunded: '已退款',
  待付款: '待付款',
  已付款: '已付款',
  已完成: '已完成',
  已取消: '已取消',
  已退款: '已退款',
};

const PAYMENT_TO_API: Record<ProductOrderPaymentMethod, string> = {
  现金: 'cash',
  微信: 'wechat',
  支付宝: 'alipay',
  银行卡: 'card',
  次卡抵扣: 'customer_card',
};

const PAYMENT_FROM_API: Record<string, ProductOrderPaymentMethod> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
  card: '银行卡',
  bank_card: '银行卡',
  customer_card: '次卡抵扣',
  现金: '现金',
  微信: '微信',
  支付宝: '支付宝',
  银行卡: '银行卡',
  次卡抵扣: '次卡抵扣',
};

function normalizeDateTime(value?: string): string {
  return value ? value.replace('T', ' ').slice(0, 19) : '';
}

function normalizeOrderItem(item: Partial<ProductOrderItem> & Partial<OrderItem>, index: number): ProductOrderItem {
  const quantity = Number(item.quantity ?? 1);
  const unitPrice = Number(item.unitPrice ?? 0);
  const subtotal = Number(item.subtotal ?? quantity * unitPrice);
  return {
    id: Number(item.id ?? index + 1),
    itemId: item.itemId,
    itemType: item.itemType ?? 'product',
    productName: item.productName ?? item.name ?? '未命名商品',
    sku: item.sku ?? '',
    quantity,
    unitPrice,
    subtotal,
    discount: item.discount === undefined ? undefined : Number(item.discount),
    payload: item.payload,
  };
}

function normalizeOrderItems(item: ApiProductOrder): ProductOrderItem[] {
  const orderItems = extractArray<Partial<ProductOrderItem> & Partial<OrderItem>>(item.orderItems);
  if (orderItems.length) return orderItems.map(normalizeOrderItem);

  const jsonItems = extractArray<Partial<ProductOrderItem> & Partial<OrderItem>>(item.items);
  return jsonItems.map(normalizeOrderItem);
}

function normalizeProductOrder(item: ApiProductOrder): ProductOrder {
  const rawStatus = String(item.status ?? 'completed');
  const rawPayment = String(item.paymentMethod ?? item.payMethod ?? item.paymentRecords?.[0]?.method ?? 'cash');
  const items = normalizeOrderItems(item);
  const totalAmount = Number(item.totalAmount ?? items.reduce((sum, orderItem) => sum + orderItem.subtotal, 0));

  return {
    id: Number(item.id ?? 0),
    orderNo: item.orderNo ?? '',
    customerId: item.customerId ?? item.customer?.id,
    customerName: item.customerName ?? item.customer?.name ?? '散客',
    customerPhone: item.customerPhone ?? item.customer?.phone ?? '',
    storeId: item.storeId ?? item.store?.id,
    storeName: item.storeName ?? item.store?.name ?? '未指定门店',
    items,
    totalAmount,
    status: STATUS_FROM_API[rawStatus] ?? '已完成',
    paymentMethod: PAYMENT_FROM_API[rawPayment] ?? '现金',
    payMethod: item.payMethod,
    remark: item.remark,
    source: item.source,
    createdAt: normalizeDateTime(item.createdAt),
    completedAt: normalizeDateTime(item.completedAt ?? item.paidAt ?? item.paymentRecords?.[0]?.paidAt ?? item.updatedAt),
    orderItems: item.orderItems,
    paymentRecords: item.paymentRecords,
    refundRecords: item.refundRecords,
    marketingAttributions: item.marketingAttributions,
  };
}

function toApiCreatePayload(data: ProductOrderCreatePayload) {
  return {
    customerId: data.customerId,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    storeId: data.storeId,
    totalAmount: data.totalAmount,
    status: STATUS_TO_API[data.status] ?? data.status,
    paymentMethod: PAYMENT_TO_API[data.paymentMethod] ?? data.paymentMethod,
    payMethod: data.payMethod ?? PAYMENT_TO_API[data.paymentMethod] ?? data.paymentMethod,
    paidAmount: data.paidAmount,
    transactionNo: data.transactionNo,
    remark: data.remark,
    source: data.source ?? 'admin',
    items: data.items.map((item) => ({
      itemType: item.itemType ?? 'product',
      itemId: item.itemId ?? item.productId,
      productId: item.productId ?? item.itemId,
      productName: item.productName || item.name,
      name: item.name || item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      discount: item.discount,
    })),
  };
}

function toApiParams(params?: { status?: string; keyword?: string; storeId?: number }) {
  return {
    ...params,
    status: params?.status && params.status in STATUS_TO_API ? STATUS_TO_API[params.status as ProductOrderStatus] : params?.status,
  };
}

export async function realGetProductOrders(params?: { status?: string; keyword?: string; storeId?: number }): Promise<ProductOrder[]> {
  const response = await apiClient.get<unknown, unknown>('/orders/product', { params: toApiParams(params) });
  return extractArray<ApiProductOrder>(response).map(normalizeProductOrder);
}

export async function realGetProductOrderById(id: number): Promise<ProductOrder | undefined> {
  const item = await apiClient.get<unknown, ApiProductOrder>(`/orders/product/${id}`);
  return normalizeProductOrder(item);
}

export async function realCreateProductOrder(data: ProductOrderCreatePayload): Promise<ProductOrder> {
  const item = await apiClient.post<unknown, ApiProductOrder>('/orders/product', toApiCreatePayload(data));
  return normalizeProductOrder(item);
}

export async function realUpdateProductOrder(id: number, data: Partial<ProductOrder>): Promise<ProductOrder> {
  const item = await apiClient.put<unknown, ApiProductOrder>(`/orders/product/${id}`, data);
  return normalizeProductOrder(item);
}

export async function realDeleteProductOrder(id: number): Promise<void> {
  return apiClient.delete(`/orders/product/${id}`);
}

export async function realRefundProductOrder(id: number): Promise<ProductOrder> {
  const item = await apiClient.post<unknown, ApiProductOrder>(`/orders/product/${id}/refund`);
  return normalizeProductOrder(item);
}

export async function realGetProductOrdersPaginated(
  params: PaginationParams & { status?: string; keyword?: string; storeId?: number },
): Promise<PaginatedResponse<ProductOrder>> {
  const response = await apiClient.get<unknown, unknown>('/orders/product/paginated', { params: toApiParams(params) });
  return normalizePaginatedResponse<ApiProductOrder, ProductOrder>(response, normalizeProductOrder);
}
