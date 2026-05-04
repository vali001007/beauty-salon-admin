import type { Product, Category } from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

const MOCK_CATEGORIES: Category[] = [
  {
    id: 1, name: '护肤品', parentId: null, children: [
      { id: 11, name: '洁面', parentId: 1 },
      { id: 12, name: '精华', parentId: 1 },
      { id: 13, name: '面霜', parentId: 1 },
      { id: 14, name: '面膜', parentId: 1 },
      { id: 15, name: '防晒', parentId: 1 },
    ],
  },
  {
    id: 2, name: '美发产品', parentId: null, children: [
      { id: 21, name: '洗发水', parentId: 2 },
      { id: 22, name: '护发素', parentId: 2 },
      { id: 23, name: '发膜', parentId: 2 },
    ],
  },
  {
    id: 3, name: '美甲产品', parentId: null, children: [
      { id: 31, name: '甲油', parentId: 3 },
      { id: 32, name: '美甲工具', parentId: 3 },
    ],
  },
  { id: 4, name: '仪器耗材', parentId: null, children: [] },
  { id: 5, name: '日用消耗品', parentId: null, children: [] },
];

const MOCK_PRODUCTS: Product[] = [
  { id: 1, name: '玻尿酸精华液', sku: 'SK-LO-000001', brand: '兰蔻', spec: '30ml', unit: '瓶', costPrice: 480, retailPrice: 680, shelfLife: 730, categoryId: 12, categoryName: '精华', supplier: '兰蔻官方旗舰店', minPurchaseQty: 10, status: '在售' },
  { id: 2, name: '补水面膜', sku: 'SK-LO-000002', brand: '雅诗兰黛', spec: '5片/盒', unit: '盒', costPrice: 220, retailPrice: 350, shelfLife: 365, categoryId: 14, categoryName: '面膜', supplier: '雅诗兰黛专柜', minPurchaseQty: 20, status: '在售' },
  { id: 3, name: '美白精华', sku: 'SK-LO-000003', brand: 'SK-II', spec: '50ml', unit: '瓶', costPrice: 980, retailPrice: 1280, shelfLife: 730, categoryId: 12, categoryName: '精华', supplier: 'SK-II官方授权店', minPurchaseQty: 5, status: '在售' },
  { id: 4, name: '修护洗发水', sku: 'SK-LO-000004', brand: '欧莱雅', spec: '500ml', unit: '瓶', costPrice: 65, retailPrice: 128, shelfLife: 1095, categoryId: 21, categoryName: '洗发水', supplier: '欧莱雅旗舰店', minPurchaseQty: 30, status: '在售' },
  { id: 5, name: '保湿乳液', sku: 'SK-LO-000005', brand: '资生堂', spec: '100ml', unit: '瓶', costPrice: 320, retailPrice: 480, shelfLife: 730, categoryId: 13, categoryName: '面霜', supplier: '资生堂旗舰店', minPurchaseQty: 10, status: '在售' },
  { id: 6, name: '眼霜', sku: 'SK-LO-000006', brand: '海蓝之谜', spec: '15ml', unit: '瓶', costPrice: 1280, retailPrice: 1680, shelfLife: 365, categoryId: 13, categoryName: '面霜', supplier: '海蓝之谜专柜', minPurchaseQty: 5, status: '在售' },
  { id: 7, name: '氨基酸洁面乳', sku: 'SK-LO-000007', brand: '芙丽芳丝', spec: '120ml', unit: '支', costPrice: 85, retailPrice: 150, shelfLife: 730, categoryId: 11, categoryName: '洁面', supplier: '芙丽芳丝旗舰店', minPurchaseQty: 20, status: '在售' },
  { id: 8, name: '防晒霜SPF50', sku: 'SK-LO-000008', brand: '安耐晒', spec: '60ml', unit: '支', costPrice: 180, retailPrice: 280, shelfLife: 365, categoryId: 15, categoryName: '防晒', supplier: '安耐晒旗舰店', minPurchaseQty: 15, status: '停售' },
];

export async function mockGetProducts(params?: { categoryId?: number; status?: string; keyword?: string }): Promise<Product[]> {
  let result = [...MOCK_PRODUCTS];
  if (params?.categoryId) {
    result = result.filter((p) => p.categoryId === params.categoryId);
  }
  if (params?.status) {
    result = result.filter((p) => p.status === params.status);
  }
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((p) => p.name.includes(kw) || p.sku.toLowerCase().includes(kw) || p.brand.includes(kw));
  }
  return result;
}

export async function mockGetProductById(id: number): Promise<Product | undefined> {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}

export async function mockGetCategories(): Promise<Category[]> {
  return MOCK_CATEGORIES;
}

export async function mockCreateProduct(data: Omit<Product, 'id' | 'sku'>): Promise<Product> {
  const newId = Math.max(...MOCK_PRODUCTS.map((p) => p.id)) + 1;
  const sku = `SK-LO-${String(newId).padStart(6, '0')}`;
  const product: Product = { ...data, id: newId, sku };
  MOCK_PRODUCTS.push(product);
  return product;
}

export async function mockUpdateProduct(id: number, data: Partial<Product>): Promise<Product> {
  const index = MOCK_PRODUCTS.findIndex((p) => p.id === id);
  if (index === -1) throw new Error('Product not found');
  MOCK_PRODUCTS[index] = { ...MOCK_PRODUCTS[index], ...data };
  return MOCK_PRODUCTS[index];
}

export async function mockGetProductsPaginated(params: PaginationParams & { categoryId?: number; status?: string; keyword?: string }): Promise<PaginatedResponse<Product>> {
  let result = [...MOCK_PRODUCTS];
  if (params.categoryId) {
    result = result.filter((p) => p.categoryId === params.categoryId);
  }
  if (params.status) {
    result = result.filter((p) => p.status === params.status);
  }
  if (params.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((p) => p.name.includes(kw) || p.sku.toLowerCase().includes(kw) || p.brand.includes(kw));
  }
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return { data, total, page: params.page, pageSize: params.pageSize };
}

import type { ImportResult } from '@/types/excel';

export async function mockImportProducts(data: Record<string, any>[]): Promise<ImportResult> {
  const errors: ImportResult['errors'] = [];
  let success = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row['产品名称'] || !row['品牌']) {
      errors.push({ row: i + 2, field: row['产品名称'] ? '品牌' : '产品名称', message: '必填字段为空' });
    } else {
      success++;
    }
  }
  return { success, failed: errors.length, errors };
}
