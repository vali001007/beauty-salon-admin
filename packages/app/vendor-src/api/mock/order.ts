import type { ProductOrder } from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

const MOCK_PRODUCT_ORDERS: ProductOrder[] = [
  { id: 1, orderNo: 'GO-2026-03-001', customerName: '张女士', customerPhone: '138****1234', storeName: '心悦美容养生会所', items: [{ id: 1, productName: '玻尿酸精华液', sku: 'SK-LO-000001', quantity: 2, unitPrice: 680, subtotal: 1360 }], totalAmount: 1360, status: '已完成', paymentMethod: '微信', createdAt: '2026-03-20 14:30', completedAt: '2026-03-20 14:32' },
  { id: 2, orderNo: 'GO-2026-03-002', customerName: '王女士', customerPhone: '139****5678', storeName: '凤仪阁美容养生会所', items: [{ id: 2, productName: '补水面膜', sku: 'SK-LO-000002', quantity: 3, unitPrice: 350, subtotal: 1050 }, { id: 3, productName: '保湿乳液', sku: 'SK-LO-000005', quantity: 1, unitPrice: 480, subtotal: 480 }], totalAmount: 1530, status: '已付款', paymentMethod: '支付宝', createdAt: '2026-03-22 10:15' },
  { id: 3, orderNo: 'GO-2026-03-003', customerName: '李女士', customerPhone: '136****9012', storeName: '心悦美容养生会所', items: [{ id: 4, productName: '美白精华', sku: 'SK-LO-000003', quantity: 1, unitPrice: 1280, subtotal: 1280 }], totalAmount: 1280, status: '待付款', paymentMethod: '现金', createdAt: '2026-03-25 16:00' },
  { id: 4, orderNo: 'GO-2026-03-004', customerName: '赵女士', customerPhone: '137****3456', storeName: '凤仪阁美容养生会所', items: [{ id: 5, productName: '修护洗发水', sku: 'SK-LO-000004', quantity: 2, unitPrice: 128, subtotal: 256 }], totalAmount: 256, status: '已取消', paymentMethod: '微信', createdAt: '2026-03-19 09:45' },
  { id: 5, orderNo: 'GO-2026-03-005', customerName: '刘女士', customerPhone: '135****7890', storeName: '心悦美容养生会所', items: [{ id: 6, productName: '眼霜', sku: 'SK-LO-000006', quantity: 1, unitPrice: 1680, subtotal: 1680 }], totalAmount: 1680, status: '已完成', paymentMethod: '银行卡', createdAt: '2026-03-21 11:20', completedAt: '2026-03-21 11:22' },
];

export async function mockGetProductOrders(params?: { status?: string; keyword?: string }): Promise<ProductOrder[]> {
  let result = [...MOCK_PRODUCT_ORDERS];
  if (params?.status && params.status !== '全部') {
    result = result.filter((o) => o.status === params.status);
  }
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((o) => o.orderNo.toLowerCase().includes(kw) || o.customerName.includes(kw));
  }
  return result;
}

export async function mockGetProductOrderById(id: number): Promise<ProductOrder | undefined> {
  return MOCK_PRODUCT_ORDERS.find((o) => o.id === id);
}

export async function mockGetProductOrdersPaginated(params: PaginationParams & { status?: string; keyword?: string }): Promise<PaginatedResponse<ProductOrder>> {
  let result = [...MOCK_PRODUCT_ORDERS];
  if (params.status && params.status !== '全部') {
    result = result.filter((o) => o.status === params.status);
  }
  if (params.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((o) => o.orderNo.toLowerCase().includes(kw) || o.customerName.includes(kw));
  }
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return { data, total, page: params.page, pageSize: params.pageSize };
}
