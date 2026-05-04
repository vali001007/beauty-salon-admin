export interface BeauticianLevel {
  id: number;
  name: string;
  status: '可用' | '停用';
  createTime: string;
}

const MOCK_BEAUTICIAN_LEVELS: BeauticianLevel[] = [
  { id: 1, name: '资深美容师', status: '可用', createTime: '2026-01-07 10:23' },
  { id: 2, name: '见习员工', status: '可用', createTime: '2025-11-25 15:42' },
  { id: 3, name: '店长顾问', status: '可用', createTime: '2025-10-20 14:39' },
  { id: 4, name: '高级美容师', status: '可用', createTime: '2025-10-16 20:54' },
  { id: 5, name: '中级美容师', status: '可用', createTime: '2025-10-16 20:54' },
  { id: 6, name: '初级美容师', status: '可用', createTime: '2025-10-16 20:31' },
];

let nextId = 100;

function now() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function mockGetBeauticianLevels(): Promise<BeauticianLevel[]> {
  return [...MOCK_BEAUTICIAN_LEVELS];
}

export async function mockCreateBeauticianLevel(data: { name: string; status: '可用' | '停用' }): Promise<BeauticianLevel> {
  if (MOCK_BEAUTICIAN_LEVELS.some((l) => l.name === data.name)) {
    throw new Error('等级名称已存在');
  }
  const level: BeauticianLevel = { id: nextId++, ...data, createTime: now() };
  MOCK_BEAUTICIAN_LEVELS.push(level);
  return level;
}

export async function mockUpdateBeauticianLevel(id: number, data: Partial<{ name: string; status: '可用' | '停用' }>): Promise<BeauticianLevel> {
  const idx = MOCK_BEAUTICIAN_LEVELS.findIndex((l) => l.id === id);
  if (idx === -1) throw new Error('等级不存在');
  if (data.name && MOCK_BEAUTICIAN_LEVELS.some((l) => l.name === data.name && l.id !== id)) {
    throw new Error('等级名称已存在');
  }
  MOCK_BEAUTICIAN_LEVELS[idx] = { ...MOCK_BEAUTICIAN_LEVELS[idx], ...data };
  return MOCK_BEAUTICIAN_LEVELS[idx];
}

export async function mockDeleteBeauticianLevels(ids: number[]): Promise<void> {
  for (const id of ids) {
    const idx = MOCK_BEAUTICIAN_LEVELS.findIndex((l) => l.id === id);
    if (idx !== -1) MOCK_BEAUTICIAN_LEVELS.splice(idx, 1);
  }
}
