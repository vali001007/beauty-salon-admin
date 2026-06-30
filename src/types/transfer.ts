export interface StockComparison {
  productName: string;
  sku: string;
  stores: StoreStock[];
}

export interface StoreStock {
  storeId: number;
  storeName: string;
  stock: number;
  status: '正常' | '偏低' | '缺货';
}

export interface TransferOrder {
  id: number;
  orderNo: string;
  fromStore: string;
  toStore: string;
  productCount: number;
  status: '待确认' | '运输中' | '已完成' | '已取消';
  createdAt: string;
  reason?: string;
}

export interface TransferSuggestion {
  id: string;
  sku: string;
  productName: string;
  productId: number;
  fromStoreId: number;
  fromStoreName: string;
  toStoreId: number;
  toStoreName: string;
  sourceStock: number;
  targetStock: number;
  safetyStock: number;
  suggestedQty: number;
  unit?: string | null;
  reason: string;
}
