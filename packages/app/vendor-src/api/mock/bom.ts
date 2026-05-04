import type { Service, ConsumptionRecord } from '@/types/bom';

const MOCK_BOM_LIST: Service[] = [
  {
    id: 1,
    name: '基础面部护理',
    duration: 60,
    price: 298,
    bomCount: 3,
    bom: [
      { id: 1, productName: '氨基酸洁面乳', sku: 'SK-LO-000007', standardQty: 5, unit: 'ml' },
      { id: 2, productName: '玻尿酸精华液', sku: 'SK-LO-000001', standardQty: 3, unit: 'ml' },
      { id: 3, productName: '补水面膜', sku: 'SK-LO-000002', standardQty: 1, unit: '片' },
    ],
  },
  {
    id: 2,
    name: '深层清洁护理',
    duration: 90,
    price: 498,
    bomCount: 4,
    bom: [
      { id: 4, productName: '氨基酸洁面乳', sku: 'SK-LO-000007', standardQty: 8, unit: 'ml' },
      { id: 5, productName: '美白精华', sku: 'SK-LO-000003', standardQty: 5, unit: 'ml' },
      { id: 6, productName: '保湿乳液', sku: 'SK-LO-000005', standardQty: 10, unit: 'ml' },
      { id: 7, productName: '补水面膜', sku: 'SK-LO-000002', standardQty: 1, unit: '片' },
    ],
  },
  {
    id: 3,
    name: '抗衰老护理',
    duration: 120,
    price: 888,
    bomCount: 5,
    bom: [
      { id: 8, productName: '氨基酸洁面乳', sku: 'SK-LO-000007', standardQty: 5, unit: 'ml' },
      { id: 9, productName: '玻尿酸精华液', sku: 'SK-LO-000001', standardQty: 5, unit: 'ml' },
      { id: 10, productName: '眼霜', sku: 'SK-LO-000006', standardQty: 2, unit: 'ml' },
      { id: 11, productName: '美白精华', sku: 'SK-LO-000003', standardQty: 3, unit: 'ml' },
      { id: 12, productName: '保湿乳液', sku: 'SK-LO-000005', standardQty: 8, unit: 'ml' },
    ],
  },
];

const MOCK_CONSUMPTION: ConsumptionRecord[] = [
  { id: 1, date: '2024-11-08', serviceName: '基础面部护理', customerName: '张女士', beautician: '李美容师', storeName: '总店', productName: '氨基酸洁面乳', standardQty: 5, actualQty: 6, deviation: 1, isAbnormal: false },
  { id: 2, date: '2024-11-08', serviceName: '基础面部护理', customerName: '张女士', beautician: '李美容师', storeName: '总店', productName: '玻尿酸精华液', standardQty: 3, actualQty: 3, deviation: 0, isAbnormal: false },
  { id: 3, date: '2024-11-07', serviceName: '深层清洁护理', customerName: '王女士', beautician: '赵美容师', storeName: '望京分店', productName: '美白精华', standardQty: 5, actualQty: 8, deviation: 3, isAbnormal: true },
  { id: 4, date: '2024-11-07', serviceName: '抗衰老护理', customerName: '刘女士', beautician: '李美容师', storeName: '总店', productName: '眼霜', standardQty: 2, actualQty: 2, deviation: 0, isAbnormal: false },
  { id: 5, date: '2024-11-06', serviceName: '基础面部护理', customerName: '陈女士', beautician: '孙美容师', storeName: '国贸分店', productName: '补水面膜', standardQty: 1, actualQty: 1, deviation: 0, isAbnormal: false },
];

export async function mockGetBomList(): Promise<Service[]> {
  return [...MOCK_BOM_LIST];
}

export async function mockGetBomConsumption(bomId: number): Promise<ConsumptionRecord[]> {
  const service = MOCK_BOM_LIST.find((s) => s.id === bomId);
  if (!service) return [];
  return MOCK_CONSUMPTION.filter((r) => r.serviceName === service.name);
}
