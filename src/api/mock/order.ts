import type { ProductOrder, ProductOrderCreatePayload, ProductOrderItem } from '@/types';
import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';

const MOCK_PRODUCT_ORDERS: ProductOrder[] = [
  {
    id: 1,
    orderNo: 'GO-2026-03-001',
    customerId: 101,
    customerName: '张女士',
    customerPhone: '138****1234',
    storeId: 2,
    storeName: '心悦美容养生会所',
    items: [{ id: 1, itemType: 'product', itemId: 1, productName: '玻尿酸精华液', sku: 'SK-LO-000001', quantity: 2, unitPrice: 680, subtotal: 1360 }],
    totalAmount: 1360,
    status: '已完成',
    paymentMethod: '微信',
    source: 'terminal',
    createdAt: '2026-03-20 14:30',
    completedAt: '2026-03-20 14:32',
  },
  {
    id: 2,
    orderNo: 'GO-2026-03-002',
    customerId: 102,
    customerName: '王女士',
    customerPhone: '139****5678',
    storeId: 1,
    storeName: '凤仪阁美容养生会所',
    items: [
      { id: 2, itemType: 'product', itemId: 2, productName: '补水面膜', sku: 'SK-LO-000002', quantity: 3, unitPrice: 350, subtotal: 1050 },
      { id: 3, itemType: 'product', itemId: 5, productName: '保湿乳液', sku: 'SK-LO-000005', quantity: 1, unitPrice: 480, subtotal: 480 },
    ],
    totalAmount: 1530,
    status: '已付款',
    paymentMethod: '支付宝',
    source: 'admin',
    createdAt: '2026-03-22 10:15',
  },
  {
    id: 3,
    orderNo: 'GO-2026-03-003',
    customerName: '李女士',
    customerPhone: '136****9012',
    storeId: 2,
    storeName: '心悦美容养生会所',
    items: [{ id: 4, itemType: 'product', itemId: 3, productName: '美白精华', sku: 'SK-LO-000003', quantity: 1, unitPrice: 1280, subtotal: 1280 }],
    totalAmount: 1280,
    status: '待付款',
    paymentMethod: '现金',
    source: 'admin',
    createdAt: '2026-03-25 16:00',
  },
  {
    id: 4,
    orderNo: 'GO-2026-03-004',
    customerName: '赵女士',
    customerPhone: '137****3456',
    storeId: 1,
    storeName: '凤仪阁美容养生会所',
    items: [{ id: 5, itemType: 'product', itemId: 4, productName: '修护洗发水', sku: 'SK-LO-000004', quantity: 2, unitPrice: 128, subtotal: 256 }],
    totalAmount: 256,
    status: '已取消',
    paymentMethod: '微信',
    source: 'admin',
    createdAt: '2026-03-19 09:45',
  },
  {
    id: 5,
    orderNo: 'GO-2026-03-005',
    customerName: '刘女士',
    customerPhone: '135****7890',
    storeId: 2,
    storeName: '心悦美容养生会所',
    items: [{ id: 6, itemType: 'product', itemId: 6, productName: '眼霜', sku: 'SK-LO-000006', quantity: 1, unitPrice: 1680, subtotal: 1680 }],
    totalAmount: 1680,
    status: '已完成',
    paymentMethod: '银行卡',
    source: 'terminal',
    createdAt: '2026-03-21 11:20',
    completedAt: '2026-03-21 11:22',
  },
];

function matchesOrder(order: ProductOrder, params?: { status?: string; keyword?: string; storeId?: number }) {
  if (params?.storeId && order.storeId !== params.storeId) return false;
  if (params?.status && params.status !== '全部' && order.status !== params.status) return false;
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    return (
      order.orderNo.toLowerCase().includes(kw) ||
      order.customerName.includes(params.keyword) ||
      order.customerPhone.includes(params.keyword)
    );
  }
  return true;
}

function normalizeCreateItems(items: ProductOrderCreatePayload['items']): ProductOrderItem[] {
  return items.map((item, index) => {
    const quantity = Number(item.quantity || 1);
    const unitPrice = Number(item.unitPrice || 0);
    const subtotal = Number(item.subtotal ?? quantity * unitPrice);
    return {
      id: item.id ?? Date.now() + index,
      itemId: item.itemId ?? item.productId,
      itemType: item.itemType ?? 'product',
      productName: item.productName || item.name || '未命名商品',
      sku: item.sku || (item.itemId ? `SKU-${item.itemId}` : ''),
      quantity,
      unitPrice,
      subtotal,
      discount: item.discount,
      payload: item.payload,
    };
  });
}

export async function mockGetProductOrders(params?: { status?: string; keyword?: string; storeId?: number }): Promise<ProductOrder[]> {
  return MOCK_PRODUCT_ORDERS.filter((order) => matchesOrder(order, params));
}

export async function mockGetProductOrderById(id: number): Promise<ProductOrder | undefined> {
  return MOCK_PRODUCT_ORDERS.find((order) => order.id === id);
}

export async function mockGetProductOrdersPaginated(
  params: PaginationParams & { status?: string; keyword?: string; storeId?: number },
): Promise<PaginatedResponse<ProductOrder>> {
  const result = MOCK_PRODUCT_ORDERS.filter((order) => matchesOrder(order, params));
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockCreateProductOrder(data: ProductOrderCreatePayload): Promise<ProductOrder> {
  const items = normalizeCreateItems(data.items);
  const totalAmount = Number(data.totalAmount || items.reduce((sum, item) => sum + item.subtotal, 0));
  const completedAt = ['已付款', '已完成'].includes(data.status)
    ? new Date().toISOString().replace('T', ' ').slice(0, 19)
    : undefined;
  const newOrder: ProductOrder = {
    id: Date.now(),
    orderNo: `GO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
    customerId: data.customerId,
    customerName: data.customerName,
    customerPhone: data.customerPhone || '',
    storeId: data.storeId,
    storeName: data.storeName || '未指定门店',
    items,
    totalAmount,
    status: data.status,
    paymentMethod: data.paymentMethod,
    payMethod: data.payMethod,
    remark: data.remark,
    source: data.source || 'admin',
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    completedAt,
  };
  MOCK_PRODUCT_ORDERS.unshift(newOrder);
  return newOrder;
}

export async function mockUpdateProductOrder(id: number, data: Partial<ProductOrder>): Promise<ProductOrder> {
  const index = MOCK_PRODUCT_ORDERS.findIndex((order) => order.id === id);
  if (index === -1) throw new Error('订单不存在');
  MOCK_PRODUCT_ORDERS[index] = { ...MOCK_PRODUCT_ORDERS[index], ...data };
  return MOCK_PRODUCT_ORDERS[index];
}

export async function mockDeleteProductOrder(id: number): Promise<void> {
  const index = MOCK_PRODUCT_ORDERS.findIndex((order) => order.id === id);
  if (index === -1) throw new Error('订单不存在');
  MOCK_PRODUCT_ORDERS.splice(index, 1);
}

export async function mockRefundProductOrder(id: number): Promise<ProductOrder> {
  const index = MOCK_PRODUCT_ORDERS.findIndex((order) => order.id === id);
  if (index === -1) throw new Error('订单不存在');
  MOCK_PRODUCT_ORDERS[index] = { ...MOCK_PRODUCT_ORDERS[index], status: '已退款' };
  return MOCK_PRODUCT_ORDERS[index];
}
