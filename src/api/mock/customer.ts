import type { Customer, CustomerConsumptionRecord, CustomerHealthProfile } from '@/types';
import { createPaginatedResponse, type PaginatedResponse, type PaginationParams } from '@/types/pagination';
import type { ImportResult } from '@/types/excel';
import { FIXTURE_CONSUMPTION_RECORDS, FIXTURE_CUSTOMERS, FIXTURE_HEALTH_PROFILES } from './fixtures';

const MOCK_CUSTOMERS: Customer[] = FIXTURE_CUSTOMERS.map((c) => ({
  ...c,
  tags: c.tags || [],
}));

const MOCK_CONSUMPTION_RECORDS: CustomerConsumptionRecord[] = FIXTURE_CONSUMPTION_RECORDS.map((item) => ({
  ...item,
}));

const MOCK_HEALTH_PROFILES: CustomerHealthProfile[] = FIXTURE_HEALTH_PROFILES.map((item) => ({
  ...item,
}));

export async function mockGetCustomers(params?: { keyword?: string; memberLevel?: string; storeName?: string }): Promise<Customer[]> {
  let result = [...MOCK_CUSTOMERS];
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((c) => c.name.includes(kw) || c.phone.includes(kw));
  }
  if (params?.memberLevel) {
    result = result.filter((c) => c.memberLevel === params.memberLevel);
  }
  if (params?.storeName) {
    result = result.filter((c) => c.storeName === params.storeName);
  }
  return result;
}

export async function mockGetCustomerById(id: number): Promise<Customer | undefined> {
  return MOCK_CUSTOMERS.find((c) => c.id === id);
}

export async function mockCreateCustomer(data: Omit<Customer, 'id' | 'totalSpent' | 'visitCount' | 'lastVisitDate' | 'createdAt'>): Promise<Customer> {
  const newId = Math.max(...MOCK_CUSTOMERS.map((c) => c.id)) + 1;
  const customer: Customer = {
    ...data,
    id: newId,
    totalSpent: 0,
    visitCount: 0,
    lastVisitDate: '',
    createdAt: new Date().toISOString().split('T')[0],
  };
  MOCK_CUSTOMERS.push(customer);
  return customer;
}

export async function mockUpdateCustomer(id: number, data: Partial<Customer>): Promise<Customer> {
  const index = MOCK_CUSTOMERS.findIndex((c) => c.id === id);
  if (index === -1) throw new Error('Customer not found');
  MOCK_CUSTOMERS[index] = { ...MOCK_CUSTOMERS[index], ...data };
  return MOCK_CUSTOMERS[index];
}

export async function mockGetCustomersPaginated(params: PaginationParams & { keyword?: string; memberLevel?: string; storeName?: string }): Promise<PaginatedResponse<Customer>> {
  let result = [...MOCK_CUSTOMERS];
  if (params.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((c) => c.name.includes(kw) || c.phone.includes(kw));
  }
  if (params.memberLevel) {
    result = result.filter((c) => c.memberLevel === params.memberLevel);
  }
  if (params.storeName) {
    result = result.filter((c) => c.storeName === params.storeName);
  }
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return createPaginatedResponse(data, total, params.page, params.pageSize);
}

export async function mockImportCustomers(data: Record<string, any>[]): Promise<ImportResult> {
  const errors: ImportResult['errors'] = [];
  let success = 0;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row['客户名称'] && !row['客户姓名']) {
      errors.push({ row: i + 2, field: '客户名称', message: '必填字段为空' });
    } else {
      success++;
    }
  }
  return { success, failed: errors.length, errors };
}

export async function mockDeleteCustomers(ids: number[]): Promise<void> {
  for (const id of ids) {
    const idx = MOCK_CUSTOMERS.findIndex((c) => c.id === id);
    if (idx !== -1) MOCK_CUSTOMERS.splice(idx, 1);
  }
}

export async function mockGetCustomerConsumptionRecords(): Promise<CustomerConsumptionRecord[]> {
  return [...MOCK_CONSUMPTION_RECORDS];
}

export async function mockGetCustomerHealthProfiles(): Promise<CustomerHealthProfile[]> {
  return [...MOCK_HEALTH_PROFILES];
}

export async function mockUpdateCustomerHealthProfile(
  customerId: number,
  data: Partial<Omit<CustomerHealthProfile, 'id' | 'customerId' | 'name'>>,
): Promise<CustomerHealthProfile> {
  const customer = MOCK_CUSTOMERS.find((item) => item.id === customerId);
  if (!customer) throw new Error('Customer not found');

  const index = MOCK_HEALTH_PROFILES.findIndex((item) => item.customerId === customerId);
  const previous = index >= 0 ? MOCK_HEALTH_PROFILES[index] : undefined;
  const profile: CustomerHealthProfile = {
    id: previous?.id ?? Math.max(0, ...MOCK_HEALTH_PROFILES.map((item) => item.id)) + 1,
    customerId,
    name: customer.name,
    photo: data.photo ?? previous?.photo ?? '',
    skinType: data.skinType ?? previous?.skinType ?? '未检测',
    skinStatus: data.skinStatus ?? previous?.skinStatus ?? '',
    mainProblems: data.mainProblems ?? previous?.mainProblems ?? '',
    allergyHistory: data.allergyHistory ?? previous?.allergyHistory ?? '',
    goals: data.goals ?? previous?.goals ?? '',
    recommendedCare: data.recommendedCare ?? previous?.recommendedCare ?? '',
    instrument: data.instrument ?? previous?.instrument ?? '',
    lastCheck: data.lastCheck ?? previous?.lastCheck ?? new Date().toISOString().slice(0, 10),
  };

  if (index >= 0) {
    MOCK_HEALTH_PROFILES[index] = profile;
  } else {
    MOCK_HEALTH_PROFILES.push(profile);
  }

  return profile;
}
