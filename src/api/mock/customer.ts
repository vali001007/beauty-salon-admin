import type { Customer } from '@/types';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import type { ImportResult } from '@/types/excel';
import rawCustomers from './data/customers.json';

const MOCK_CUSTOMERS: Customer[] = (rawCustomers as any[]).map((c) => ({
  ...c,
  tags: c.tags || [],
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
  return { data, total, page: params.page, pageSize: params.pageSize };
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
