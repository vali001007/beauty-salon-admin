import type { BomPayloadItem, Service, ConsumptionRecord, ForecastItem } from '@/types/bom';

const MOCK_PRODUCT_COST_BY_ID: Record<number, number> = {
  1: 480,
  2: 220,
  3: 980,
  5: 320,
  6: 1280,
  7: 85,
};

const MOCK_BOM_LIST: Service[] = [
  {
    id: 1,
    name: '基础面部护理',
    duration: 60,
    price: 298,
    bomCount: 3,
    bom: [
      { id: 1, productId: 7, productName: '氨基酸洁面乳', sku: 'SK-LO-000007', standardQty: 5, unit: 'ml' },
      { id: 2, productId: 1, productName: '玻尿酸精华液', sku: 'SK-LO-000001', standardQty: 3, unit: 'ml' },
      { id: 3, productId: 2, productName: '补水面膜', sku: 'SK-LO-000002', standardQty: 1, unit: '片' },
    ],
  },
  {
    id: 2,
    name: '深层清洁护理',
    duration: 90,
    price: 498,
    bomCount: 4,
    bom: [
      { id: 4, productId: 7, productName: '氨基酸洁面乳', sku: 'SK-LO-000007', standardQty: 8, unit: 'ml' },
      { id: 5, productId: 3, productName: '美白精华', sku: 'SK-LO-000003', standardQty: 5, unit: 'ml' },
      { id: 6, productId: 5, productName: '保湿乳液', sku: 'SK-LO-000005', standardQty: 10, unit: 'ml' },
      { id: 7, productId: 2, productName: '补水面膜', sku: 'SK-LO-000002', standardQty: 1, unit: '片' },
    ],
  },
  {
    id: 3,
    name: '抗衰老护理',
    duration: 120,
    price: 888,
    bomCount: 5,
    bom: [
      { id: 8, productId: 7, productName: '氨基酸洁面乳', sku: 'SK-LO-000007', standardQty: 5, unit: 'ml' },
      { id: 9, productId: 1, productName: '玻尿酸精华液', sku: 'SK-LO-000001', standardQty: 5, unit: 'ml' },
      { id: 10, productId: 6, productName: '眼霜', sku: 'SK-LO-000006', standardQty: 2, unit: 'ml' },
      { id: 11, productId: 3, productName: '美白精华', sku: 'SK-LO-000003', standardQty: 3, unit: 'ml' },
      { id: 12, productId: 5, productName: '保湿乳液', sku: 'SK-LO-000005', standardQty: 8, unit: 'ml' },
    ],
  },
];

const MOCK_CONSUMPTION: ConsumptionRecord[] = [
  { id: 1, date: '2024-11-08', orderNo: 'PO202411080001', serviceName: '基础面部护理', customerName: '张女士', serviceEmployee: '李美容师', beautician: '李美容师', storeName: '总店', productName: '氨基酸洁面乳', standardQty: 5, actualQty: 6, deviation: 1, isAbnormal: false },
  { id: 2, date: '2024-11-08', orderNo: 'PO202411080001', serviceName: '基础面部护理', customerName: '张女士', serviceEmployee: '李美容师', beautician: '李美容师', storeName: '总店', productName: '玻尿酸精华液', standardQty: 3, actualQty: 3, deviation: 0, isAbnormal: false },
  { id: 3, date: '2024-11-07', orderNo: 'PO202411070003', serviceName: '深层清洁护理', customerName: '王女士', serviceEmployee: '赵美容师', beautician: '赵美容师', storeName: '望京分店', productName: '美白精华', standardQty: 5, actualQty: 8, deviation: 3, isAbnormal: true },
  { id: 4, date: '2024-11-07', orderNo: 'PO202411070002', serviceName: '抗衰老护理', customerName: '刘女士', serviceEmployee: '李美容师', beautician: '李美容师', storeName: '总店', productName: '眼霜', standardQty: 2, actualQty: 2, deviation: 0, isAbnormal: false },
  { id: 5, date: '2024-11-06', orderNo: 'PO202411060005', serviceName: '基础面部护理', customerName: '陈女士', serviceEmployee: '孙美容师', beautician: '孙美容师', storeName: '国贸分店', productName: '补水面膜', standardQty: 1, actualQty: 1, deviation: 0, isAbnormal: false },
];

function withBomCosts(service: Service): Service {
  return {
    ...service,
    bom: service.bom.map((item) => ({
      ...item,
      costPrice: item.costPrice ?? MOCK_PRODUCT_COST_BY_ID[item.productId ?? 0] ?? 0,
    })),
  };
}

const MOCK_FORECAST: ForecastItem[] = [
  { productName: '玻尿酸精华液', sku: 'SK-LO-000001', forecastConsumption: 45, currentStock: 70, shortage: 0 },
  { productName: '补水面膜', sku: 'SK-LO-000002', forecastConsumption: 28, currentStock: 13, shortage: 15 },
  { productName: '美白精华', sku: 'SK-LO-000003', forecastConsumption: 32, currentStock: 3, shortage: 29 },
  { productName: '修护洗发水', sku: 'SK-LO-000004', forecastConsumption: 180, currentStock: 270, shortage: 0 },
];

export async function mockGetBomList(): Promise<Service[]> {
  return MOCK_BOM_LIST.map(withBomCosts);
}

export async function mockGetBomConsumption(bomId: number): Promise<ConsumptionRecord[]> {
  const service = MOCK_BOM_LIST.find((s) => s.id === bomId);
  if (!service) return [];
  return MOCK_CONSUMPTION.filter((r) => r.serviceName === service.name);
}

export async function mockGetBomConsumptionRecords(): Promise<ConsumptionRecord[]> {
  return [...MOCK_CONSUMPTION];
}

export async function mockGetBomForecast(): Promise<ForecastItem[]> {
  return [...MOCK_FORECAST];
}

export async function mockCreateBom(data: Omit<Service, 'id'>): Promise<Service> {
  const newId = Math.max(...MOCK_BOM_LIST.map((s) => s.id)) + 1;
  const service: Service = { ...data, id: newId };
  MOCK_BOM_LIST.push(service);
  return service;
}

export async function mockUpdateBom(
  id: number,
  data: Partial<Omit<Service, 'bom'>> & { bom?: BomPayloadItem[] },
): Promise<Service> {
  const index = MOCK_BOM_LIST.findIndex((s) => s.id === id);
  if (index === -1) throw new Error('BOM不存在');
  const { bom: bomPayload, ...servicePatch } = data;
  const bom = bomPayload?.map((item, itemIndex) => {
    const productId = item.productId;
    return {
      id: itemIndex + 1,
      productId,
      productName: item.productName ?? '',
      sku: item.sku ?? '',
      standardQty: Number(item.standardQty || 1),
      unit: item.unit ?? '',
      costPrice: productId ? MOCK_PRODUCT_COST_BY_ID[productId] ?? 0 : 0,
    };
  });
  MOCK_BOM_LIST[index] = {
    ...MOCK_BOM_LIST[index],
    ...servicePatch,
    ...(bom ? { bom, bomCount: bom.length } : {}),
  };
  return MOCK_BOM_LIST[index];
}

export async function mockDeleteBom(id: number): Promise<void> {
  const index = MOCK_BOM_LIST.findIndex((s) => s.id === id);
  if (index === -1) throw new Error('BOM不存在');
  MOCK_BOM_LIST.splice(index, 1);
}
