import type { StockItem, StockMovement, Batch, ExpiringProduct, ReplenishmentSuggestion, PurchaseOrder, TransferOrder } from '@/types';
import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';
import type { InboundFormData, PurchaseOrderFormData, TransferFormData } from '@/schemas/inventory';

const MOCK_STOCK: StockItem[] = [
  { id: 1, productName: '玫瑰精华液', sku: 'SK-LO-000001', currentStock: 85, reserved: 15, availableStock: 70, safetyStock: 30, maxStock: 200, status: '正常', lastInboundDate: '2026-03-15', storeName: '心悦美容养生会所' },
  { id: 2, productName: '补水面膜', sku: 'SK-LO-000002', currentStock: 18, reserved: 5, availableStock: 13, safetyStock: 50, maxStock: 200, status: '低库存', lastInboundDate: '2026-03-10', storeName: '心悦美容养生会所' },
  { id: 3, productName: '美白精华', sku: 'SK-LO-000003', currentStock: 5, reserved: 2, availableStock: 3, safetyStock: 20, maxStock: 100, status: '缺货', lastInboundDate: '2026-02-28', storeName: '心悦美容养生会所' },
  { id: 4, productName: '修护洗发水', sku: 'SK-LO-000004', currentStock: 280, reserved: 10, availableStock: 270, safetyStock: 50, maxStock: 300, status: '积压', lastInboundDate: '2026-03-20', storeName: '心悦美容养生会所' },
  { id: 5, productName: '保湿乳液', sku: 'SK-LO-000005', currentStock: 45, reserved: 8, availableStock: 37, safetyStock: 20, maxStock: 100, status: '正常', lastInboundDate: '2026-03-18', storeName: '心悦美容养生会所' },
  { id: 6, productName: '眼霜', sku: 'SK-LO-000006', currentStock: 12, reserved: 2, availableStock: 10, safetyStock: 15, maxStock: 50, status: '低库存', lastInboundDate: '2026-03-05', storeName: '心悦美容养生会所' },
];

const MOCK_BATCHES: Batch[] = [
  { id: 1, batchNo: 'B-2024-06-003', productId: 1, inboundQty: 50, availableQty: 35, productionDate: '2024-06-01', expiryDate: '2026-06-01', status: '正常', inboundDate: '2024-06-15' },
  { id: 2, batchNo: 'B-2025-01-001', productId: 1, inboundQty: 50, availableQty: 50, productionDate: '2025-01-10', expiryDate: '2027-01-10', status: '正常', inboundDate: '2025-01-20' },
];

const MOCK_STOCK_MOVEMENTS: StockMovement[] = [
  {
    id: 1,
    storeId: 1,
    storeName: '心悦美容养生会所',
    productId: 1,
    productName: '玫瑰精华液',
    sku: 'SK-LO-000001',
    batchId: 1,
    batchNo: 'B-2024-06-003',
    movementNo: 'IN-MOCK-001',
    movementType: 'inbound',
    quantity: 50,
    beforeStock: 35,
    afterStock: 85,
    unit: '瓶',
    sourceType: 'stock_batch',
    sourceId: 1,
    sourceNo: 'B-2024-06-003',
    remark: 'mock inbound',
    occurredAt: '2026-03-15T09:00:00.000Z',
    createdAt: '2026-03-15T09:00:00.000Z',
  },
];

const MOCK_TRANSFERS: TransferOrder[] = [
  { id: 1, orderNo: 'TF-2026-03-001', fromStore: '心悦美容养生会所', toStore: '凤仪阁美容养生会所', productCount: 3, status: '运输中', createdAt: '2026-03-20 09:30:00' },
  { id: 2, orderNo: 'TF-2026-03-002', fromStore: '凤仪阁美容养生会所', toStore: '雅韵美容会所', productCount: 5, status: '待确认', createdAt: '2026-03-21 15:12:00' },
  { id: 3, orderNo: 'TF-2026-03-003', fromStore: '心悦美容养生会所', toStore: '雅韵美容会所', productCount: 2, status: '已完成', createdAt: '2026-03-18 11:05:00' },
];

export async function mockGetStockItems(params?: { storeId?: number; status?: string; keyword?: string }): Promise<StockItem[]> {
  let result = [...MOCK_STOCK];
  if (params?.status && params.status !== '全部') {
    result = result.filter((s) => s.status === params.status);
  }
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((s) => s.productName.includes(kw) || s.sku.toLowerCase().includes(kw));
  }
  return result;
}

export async function mockGetBatches(productId: number): Promise<Batch[]> {
  return MOCK_BATCHES.filter((b) => b.productId === productId);
}

export async function mockGetStockMovements(params: PaginationParams & {
  storeId?: number;
  productId?: number;
  sourceType?: string;
  sourceId?: number;
  movementType?: string;
}): Promise<PaginatedResponse<StockMovement>> {
  let result = [...MOCK_STOCK_MOVEMENTS];
  if (params.storeId) result = result.filter((item) => item.storeId === params.storeId);
  if (params.productId) result = result.filter((item) => item.productId === params.productId);
  if (params.sourceType) result = result.filter((item) => item.sourceType === params.sourceType);
  if (params.sourceId) result = result.filter((item) => item.sourceId === params.sourceId);
  if (params.movementType) result = result.filter((item) => item.movementType === params.movementType);

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const total = result.length;
  const start = (page - 1) * pageSize;
  return createPaginatedResponse(result.slice(start, start + pageSize), total, page, pageSize);
}

export async function mockGetExpiringProducts(): Promise<ExpiringProduct[]> {
  return [
    { id: 1, urgency: '已过期', productName: '美白精华', sku: 'SK-LO-000003', batchNo: 'B-2023-08-001', remainingDays: -5, stock: 8, costAmount: 7840, storeName: '心悦美容养生会所', suggestion: '报废' },
    { id: 2, urgency: '紧急', productName: '补水面膜', sku: 'SK-LO-000002', batchNo: 'B-2024-05-002', remainingDays: 15, stock: 12, costAmount: 2640, storeName: '凤仪阁美容养生会所', suggestion: '促销' },
    { id: 3, urgency: '紧急', productName: '玫瑰精华液', sku: 'SK-LO-000001', batchNo: 'B-2024-06-003', remainingDays: 28, stock: 15, costAmount: 7200, storeName: '心悦美容养生会所', suggestion: '促销' },
    { id: 4, urgency: '临期', productName: '修护洗发水', sku: 'SK-LO-000004', batchNo: 'B-2024-08-004', remainingDays: 45, stock: 30, costAmount: 1950, storeName: '凤仪阁美容养生会所', suggestion: '调拨' },
    { id: 5, urgency: '临期', productName: '眼霜', sku: 'SK-LO-000006', batchNo: 'B-2024-09-005', remainingDays: 52, stock: 10, costAmount: 12800, storeName: '心悦美容养生会所', suggestion: '促销' },
  ];
}

export async function mockGetReplenishmentSuggestions(): Promise<ReplenishmentSuggestion[]> {
  return [
    { id: 1, productName: '玫瑰精华液', sku: 'SK-LO-000001', currentStock: 70, forecast7Days: 45, safetyStock: 30, inTransit: 0, suggestedQty: 50, supplier: '兰蔻官方旗舰店', estimatedAmount: 24000, checked: false },
    { id: 2, productName: '补水面膜', sku: 'SK-LO-000002', currentStock: 13, forecast7Days: 28, safetyStock: 50, inTransit: 20, suggestedQty: 80, supplier: '雅诗兰黛专柜', estimatedAmount: 17600, checked: false },
    { id: 3, productName: '美白精华', sku: 'SK-LO-000003', currentStock: 3, forecast7Days: 18, safetyStock: 20, inTransit: 0, suggestedQty: 60, supplier: 'SK-II官方授权店', estimatedAmount: 58800, checked: false },
    { id: 4, productName: '修护洗发水', sku: 'SK-LO-000004', currentStock: 270, forecast7Days: 15, safetyStock: 50, inTransit: 0, suggestedQty: 0, supplier: '欧莱雅旗舰店', estimatedAmount: 0, checked: false },
  ];
}

const MOCK_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 1,
    orderNo: 'PO-2026-03-001',
    supplier: '兰蔻官方旗舰店',
    storeName: '心悦美容养生会所',
    productCount: 2,
    totalAmount: 28400,
    status: '已审核',
    createDate: '2026-03-20',
    expectedDate: '2026-03-27',
    items: [
      { id: 1, productName: '玫瑰精华液', sku: 'SK-LO-000001', quantity: 50, unitPrice: 480, subtotal: 24000 },
      { id: 2, productName: '补水面膜', sku: 'SK-LO-000002', quantity: 20, unitPrice: 220, subtotal: 4400 },
    ],
  },
  {
    id: 2,
    orderNo: 'PO-2026-03-002',
    supplier: '雅诗兰黛专柜',
    storeName: '凤仪阁美容养生会所',
    productCount: 1,
    totalAmount: 17600,
    status: '已下单',
    createDate: '2026-03-18',
    expectedDate: '2026-03-25',
    items: [
      { id: 3, productName: '补水面膜', sku: 'SK-LO-000002', quantity: 80, unitPrice: 220, subtotal: 17600 },
    ],
  },
  {
    id: 3,
    orderNo: 'PO-2026-03-003',
    supplier: 'SK-II官方授权店',
    storeName: '心悦美容养生会所',
    productCount: 1,
    totalAmount: 58800,
    status: '待审核',
    createDate: '2026-03-22',
    expectedDate: '2026-03-29',
    items: [
      { id: 4, productName: '美白精华', sku: 'SK-LO-000003', quantity: 60, unitPrice: 980, subtotal: 58800 },
    ],
  },
  {
    id: 4,
    orderNo: 'PO-2026-03-004',
    supplier: '资生堂旗舰店',
    storeName: '凤仪阁美容养生会所',
    productCount: 1,
    totalAmount: 56000,
    status: '草稿',
    createDate: '2026-03-24',
    expectedDate: '2026-03-31',
    items: [
      { id: 5, productName: '保湿乳液', sku: 'SK-LO-000005', quantity: 175, unitPrice: 320, subtotal: 56000 },
    ],
  },
];

export async function mockGetPurchaseOrders(): Promise<PurchaseOrder[]> {
  return [...MOCK_PURCHASE_ORDERS];
}

export async function mockCreateInbound(data: InboundFormData): Promise<Batch> {
  const product = MOCK_STOCK.find((item) => item.id === data.productId);
  const beforeStock = product?.currentStock ?? 0;
  const afterStock = beforeStock + data.quantity;
  const newBatch: Batch = {
    id: Date.now(),
    batchNo: data.batchNo,
    productId: data.productId,
    inboundQty: data.quantity,
    availableQty: data.quantity,
    productionDate: data.productionDate,
    expiryDate: data.expiryDate,
    status: '正常',
    inboundDate: new Date().toISOString().split('T')[0],
  };
  MOCK_BATCHES.unshift(newBatch);
  if (product) {
    product.currentStock = afterStock;
    product.availableStock += data.quantity;
    product.lastInboundDate = newBatch.inboundDate;
  }
  MOCK_STOCK_MOVEMENTS.unshift({
    id: Date.now() + 1,
    storeId: 1,
    storeName: product?.storeName ?? '心悦美容养生会所',
    productId: data.productId,
    productName: product?.productName,
    sku: product?.sku,
    batchId: newBatch.id,
    batchNo: newBatch.batchNo,
    movementNo: `IN-MOCK-${Date.now()}`,
    movementType: 'inbound',
    quantity: data.quantity,
    beforeStock,
    afterStock,
    sourceType: 'stock_batch',
    sourceId: newBatch.id,
    sourceNo: newBatch.batchNo,
    occurredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  return newBatch;
}

export async function mockCreatePurchaseOrder(data: PurchaseOrderFormData): Promise<PurchaseOrder> {
  const today = new Date().toISOString().split('T')[0];
  const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const newOrder: PurchaseOrder = {
    id: Date.now(),
    orderNo: `PO-${today}-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
    supplier: data.supplier,
    storeName: data.storeName,
    productCount: data.items.length,
    totalAmount,
    status: '草稿',
    createDate: today,
    expectedDate: data.expectedDate,
    items: data.items.map((item, index) => ({
      id: Date.now() + index,
      ...item,
      subtotal: item.quantity * item.unitPrice,
    })),
  };
  MOCK_PURCHASE_ORDERS.unshift(newOrder);
  return newOrder;
}

export async function mockCreateTransfer(data: TransferFormData): Promise<TransferOrder> {
  const formatStoreName = (storeId: number) => {
    const stock = MOCK_STOCK.find((item) => item.storeName && item.id === Number(data.items?.[0]?.productId));
    return stock?.storeName && storeId === Number(data.fromStoreId) ? stock.storeName : `门店 #${storeId}`;
  };
  const newTransfer: TransferOrder = {
    id: Date.now(),
    orderNo: `TF-${new Date().toISOString().slice(0, 10)}-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
    fromStore: formatStoreName(data.fromStoreId),
    toStore: formatStoreName(data.toStoreId),
    productCount: data.items.length,
    status: '待确认',
    createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
  MOCK_TRANSFERS.unshift(newTransfer);
  return newTransfer;
}

export async function mockGetStockItemsPaginated(params: PaginationParams & { storeId?: number; status?: string; keyword?: string }): Promise<PaginatedResponse<StockItem>> {
  let result = [...MOCK_STOCK];
  if (params.status && params.status !== '全部') {
    result = result.filter((s) => s.status === params.status);
  }
  if (params.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((s) => s.productName.includes(kw) || s.sku.toLowerCase().includes(kw));
  }
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockGetPurchaseOrdersPaginated(params: PaginationParams): Promise<PaginatedResponse<PurchaseOrder>> {
  const all = await mockGetPurchaseOrders();
  const total = all.length;
  const start = (params.page - 1) * params.pageSize;
  const data = all.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockGetExpiringProductsPaginated(params: PaginationParams): Promise<PaginatedResponse<ExpiringProduct>> {
  const all = await mockGetExpiringProducts();
  const total = all.length;
  const start = (params.page - 1) * params.pageSize;
  const data = all.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockGetTransferOrdersPaginated(params: PaginationParams): Promise<PaginatedResponse<TransferOrder>> {
  const total = MOCK_TRANSFERS.length;
  const start = (params.page - 1) * params.pageSize;
  const data = MOCK_TRANSFERS.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockCancelPurchaseOrder(id: number): Promise<void> {
  const orders = await mockGetPurchaseOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) throw new Error('采购单不存在');
}

export async function mockCancelTransfer(id: number): Promise<void> {
  const index = MOCK_TRANSFERS.findIndex((t) => t.id === id);
  if (index === -1) throw new Error('调拨单不存在');
  MOCK_TRANSFERS.splice(index, 1);
}
