export interface Project {
  id: number;
  name: string;
  description?: string;
  type: string;
  duration: number;
  price: number;
  storeName: string;
  recommend: boolean;
  online: boolean;
  home: boolean;
  status: boolean;
  sort: number;
  image?: string;
  bom?: ProjectBomItem[];
}

export interface ProjectBomItem {
  id?: number;
  productId?: number;
  productName: string;
  sku: string;
  standardQty: number;
  unit: string;
}
