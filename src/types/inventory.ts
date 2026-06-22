export interface StockItem {
  id: number;
  productName: string;
  sku: string;
  currentStock: number;
  reserved: number;
  availableStock: number;
  safetyStock: number;
  maxStock: number;
  status: '正常' | '低库存' | '积压' | '缺货';
  lastInboundDate: string;
  storeName: string;
}

export interface StockMovement {
  id: number;
  storeId: number;
  storeName?: string;
  productId: number;
  productName?: string;
  sku?: string;
  batchId?: number | null;
  batchNo?: string;
  movementNo: string;
  movementType: string;
  quantity: number;
  beforeStock?: number | null;
  afterStock?: number | null;
  unit?: string | null;
  sourceType?: string | null;
  sourceId?: number | null;
  sourceNo?: string | null;
  remark?: string | null;
  operatorName?: string;
  occurredAt: string;
  createdAt: string;
}

export interface Batch {
  id: number;
  batchNo: string;
  productId: number;
  inboundQty: number;
  availableQty: number;
  productionDate: string;
  expiryDate: string;
  status: '正常' | '临期' | '已过期';
  inboundDate: string;
}

export interface ExpiringProduct {
  id: number;
  urgency: '临期' | '紧急' | '已过期';
  productName: string;
  sku: string;
  batchNo: string;
  remainingDays: number;
  stock: number;
  costAmount: number;
  storeName: string;
  suggestion: '促销' | '调拨' | '报废';
}

export interface ReplenishmentSuggestion {
  id: number;
  productId?: number;
  productName: string;
  sku: string;
  currentStock: number;
  forecast7Days: number;
  safetyStock: number;
  inTransit: number;
  inTransitQty?: number;
  suggestedQty: number;
  supplierId?: number;
  supplierName?: string;
  supplier: string;
  supplySkuId?: number;
  supplySkuName?: string;
  quoteId?: number;
  supplyPrice?: number;
  moq?: number | null;
  leadDays?: number | null;
  estimatedAmount: number;
  reason?: string;
  availabilityStatus?: 'platform_available' | 'legacy_supplier_available' | 'manual_purchase' | string;
  checked: boolean;
}

export interface PurchaseOrder {
  id: number;
  orderNo: string;
  supplier: string;
  storeName: string;
  productCount: number;
  totalAmount: number;
  status: '草稿' | '待审核' | '已审核' | '已下单' | '已收货' | '已取消';
  createDate: string;
  expectedDate: string;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: number;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}
