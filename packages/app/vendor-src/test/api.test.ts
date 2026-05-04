import { describe, it, expect } from 'vitest';
import { getProducts, getCategories, createProduct } from '@/api/product';
import { getStockItems, getExpiringProducts } from '@/api/inventory';
import { getCustomers } from '@/api/customer';
import { getProductOrders } from '@/api/order';

describe('Product API', () => {
  it('returns all products', async () => {
    const products = await getProducts();
    expect(products.length).toBeGreaterThan(0);
    expect(products[0]).toHaveProperty('sku');
    expect(products[0]).toHaveProperty('name');
  });

  it('filters products by keyword', async () => {
    const products = await getProducts({ keyword: '精华' });
    expect(products.every((p) => p.name.includes('精华'))).toBe(true);
  });

  it('filters products by status', async () => {
    const products = await getProducts({ status: '停售' });
    expect(products.every((p) => p.status === '停售')).toBe(true);
  });

  it('returns categories with children', async () => {
    const categories = await getCategories();
    expect(categories.length).toBeGreaterThan(0);
    const skincare = categories.find((c) => c.name === '护肤品');
    expect(skincare?.children?.length).toBeGreaterThan(0);
  });

  it('creates a new product', async () => {
    const newProduct = await createProduct({
      name: '测试产品',
      brand: '测试品牌',
      spec: '100ml',
      unit: '瓶',
      costPrice: 100,
      retailPrice: 200,
      shelfLife: 365,
      categoryId: 12,
      categoryName: '精华',
      supplier: '测试供应商',
      minPurchaseQty: 10,
      status: '在售',
    });
    expect(newProduct.id).toBeDefined();
    expect(newProduct.sku).toMatch(/^SK-LO-/);
  });
});

describe('Inventory API', () => {
  it('returns stock items', async () => {
    const items = await getStockItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveProperty('availableStock');
  });

  it('filters stock by status', async () => {
    const items = await getStockItems({ status: '低库存' });
    expect(items.every((s) => s.status === '低库存')).toBe(true);
  });

  it('returns expiring products sorted by urgency', async () => {
    const products = await getExpiringProducts();
    expect(products.length).toBeGreaterThan(0);
    expect(products[0]).toHaveProperty('remainingDays');
  });
});

describe('Customer API', () => {
  it('returns customers', async () => {
    const customers = await getCustomers();
    expect(customers.length).toBeGreaterThan(0);
    expect(customers[0]).toHaveProperty('memberLevel');
  });

  it('filters customers by keyword', async () => {
    const customers = await getCustomers({ keyword: '张' });
    expect(customers.every((c) => c.name.includes('张'))).toBe(true);
  });
});

describe('Order API', () => {
  it('returns product orders', async () => {
    const orders = await getProductOrders();
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0]).toHaveProperty('orderNo');
  });

  it('filters orders by status', async () => {
    const orders = await getProductOrders({ status: '已完成' });
    expect(orders.every((o) => o.status === '已完成')).toBe(true);
  });
});
