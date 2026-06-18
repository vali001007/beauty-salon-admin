export interface Product {
  id: number;
  storeId?: number;
  storeName?: string;
  name: string;
  sku: string;
  brand: string;
  spec: string;
  unit: '瓶' | '盒' | '支' | '个' | '套';
  costPrice: number;
  retailPrice: number;
  shelfLife: number;
  categoryId: number;
  categoryName: string;
  supplier: string;
  minPurchaseQty: number;
  image?: string;
  status: '在售' | '停售';
  salePrice?: number | null;
  discountRate?: number | null;
  discountLabel?: string | null;
  salesDescription?: string | null;
  miniappStatus?: 'published' | 'unpublished' | '下架' | '上架';
  miniappPublishedAt?: string | null;
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  description?: string;
  status?: '启用' | '停用';
  productCount?: number;
  children?: Category[];
}
