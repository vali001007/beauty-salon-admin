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

export interface TransferSuggestion {
  id: number;
  fromStore: string;
  toStore: string;
  productName: string;
  suggestedQty: number;
  reason: string;
}

export interface TransferOrder {
  id: number;
  orderNo: string;
  fromStore: string;
  toStore: string;
  productCount: number;
  status: '待确认' | '运输中' | '已完成' | '已取消';
  createdAt: string;
}
