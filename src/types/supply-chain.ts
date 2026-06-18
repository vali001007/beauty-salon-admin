export interface ProductSupplierLink {
  id: number;
  productId: number;
  productName: string;
  sku?: string;
  categoryName?: string;
  supplyPrice: number;
  moq?: number | null;
  leadDays?: number | null;
  isPrimary: boolean;
}

export interface Supplier {
  id: number;
  storeId?: number | null;
  storeName?: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  rebateRate?: number;
  paymentTerms?: string;
  status: 'active' | 'disabled' | 'archived';
  productCount?: number;
  products?: ProductSupplierLink[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierPayload {
  storeId?: number | null;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  rebateRate?: number;
  paymentTerms?: string;
  status?: Supplier['status'];
}

export interface ProductSupplierPayload {
  productId: number;
  supplyPrice?: number;
  moq?: number | null;
  leadDays?: number | null;
  isPrimary?: boolean;
}

export type SupplierOrderStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'ordered'
  | 'partial_received'
  | 'received'
  | 'cancelled'
  | 'settled';

export interface SupplierOrderItem {
  id: number;
  productId: number;
  productName: string;
  sku?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  receivedQty: number;
  moq?: number | null;
}

export interface SupplierOrder {
  id: number;
  orderNo: string;
  supplierId: number;
  supplierName: string;
  storeId: number;
  storeName: string;
  totalAmount: number;
  platformFee: number;
  rebateAmount: number;
  netAmount: number;
  platformRevenue: number;
  status: SupplierOrderStatus;
  orderedAt?: string;
  receivedAt?: string | null;
  settledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  productCount: number;
  totalQuantity: number;
  receivedQuantity: number;
  items: SupplierOrderItem[];
}

export interface SupplierOrderPayloadItem {
  productId: number;
  quantity: number;
  unitPrice?: number;
}

export interface SupplierOrderPayload {
  storeId?: number | null;
  supplierId: number;
  status?: SupplierOrderStatus;
  platformFee?: number | null;
  rebateAmount?: number | null;
  items: SupplierOrderPayloadItem[];
}

export interface ReceiveSupplierOrderPayloadItem {
  orderItemId?: number;
  productId?: number;
  receivedQty: number;
  batchNo?: string;
  productionDate?: string;
  expiryDate?: string;
}

export interface ReceiveSupplierOrderPayload {
  items: ReceiveSupplierOrderPayloadItem[];
  remark?: string;
}

export type SupplierSettlementStatus = 'draft' | 'confirmed' | 'paid';

export interface SupplierSettlement {
  id: number;
  supplierId: number;
  supplierName: string;
  settleMonth: string;
  orderCount: number;
  totalAmount: number;
  rebateAmount: number;
  platformFee: number;
  platformRevenue: number;
  netPayable: number;
  status: SupplierSettlementStatus;
  confirmedAt?: string | null;
  paidAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
