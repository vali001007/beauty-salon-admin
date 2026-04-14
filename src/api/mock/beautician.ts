import type { Beautician } from '@/types';

const MOCK_BEAUTICIANS: Beautician[] = [
  { id: 1, name: '小雅', phone: '13800001111', level: '店长顾问', specialties: ['面部护理', '身体养生'], status: '在职', storeName: '凤仪阁美容养生会所', joinDate: '2024-01-15', createdAt: '2026-03-05' },
  { id: 2, name: '婷婷', phone: '13800002222', level: '中级美容师', specialties: ['面部护理', '仪器护理'], status: '在职', storeName: '心悦茗美容养生会所', joinDate: '2024-06-01', createdAt: '2026-03-13' },
];

export async function mockGetBeauticians(params?: { keyword?: string; storeName?: string }): Promise<Beautician[]> {
  let result = [...MOCK_BEAUTICIANS];
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((b) => b.name.includes(kw) || b.phone.includes(kw));
  }
  if (params?.storeName) {
    result = result.filter((b) => b.storeName === params.storeName);
  }
  return result;
}

export async function mockGetBeauticianById(id: number): Promise<Beautician | undefined> {
  return MOCK_BEAUTICIANS.find((b) => b.id === id);
}

export async function mockCreateBeautician(data: Omit<Beautician, 'id' | 'createdAt'>): Promise<Beautician> {
  const newId = Math.max(...MOCK_BEAUTICIANS.map((b) => b.id)) + 1;
  const beautician: Beautician = {
    ...data,
    id: newId,
    createdAt: new Date().toISOString().split('T')[0],
  };
  MOCK_BEAUTICIANS.push(beautician);
  return beautician;
}

export async function mockUpdateBeautician(id: number, data: Partial<Beautician>): Promise<Beautician> {
  const index = MOCK_BEAUTICIANS.findIndex((b) => b.id === id);
  if (index === -1) throw new Error('Beautician not found');
  MOCK_BEAUTICIANS[index] = { ...MOCK_BEAUTICIANS[index], ...data };
  return MOCK_BEAUTICIANS[index];
}
