export interface Product {
  id: number;
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
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  children?: Category[];
}
