export interface ProjectType {
  id: number;
  name: string;
  description: string;
  status: '启用' | '停用';
  createTime: string;
}

const MOCK_PROJECT_TYPES: ProjectType[] = [
  { id: 1, name: '面部护理', description: '包含各类面部清洁、保养、美白等项目', status: '启用', createTime: '2024-01-15 10:30' },
  { id: 2, name: '身体护理', description: '包含身体按摩、SPA、排毒等项目', status: '启用', createTime: '2024-01-15 10:35' },
  { id: 3, name: '美甲美睫', description: '包含美甲、美睫、修眉等项目', status: '启用', createTime: '2024-01-15 10:40' },
  { id: 4, name: '皮肤管理', description: '包含痘痘治疗、祛斑、抗衰等专业皮肤管理项目', status: '启用', createTime: '2024-01-16 09:20' },
  { id: 5, name: '脱毛护理', description: '包含激光脱毛、蜜蜡脱毛等项目', status: '停用', createTime: '2024-01-16 11:15' },
  { id: 6, name: '养生理疗', description: '包含中医理疗、养生调理等项目', status: '启用', createTime: '2024-01-17 14:50' },
  { id: 7, name: '头部护理', description: '包含头部按摩、头皮护理等项目', status: '启用', createTime: '2024-01-18 16:30' },
  { id: 8, name: '水疗项目', description: '包含各类水疗、温泉护理项目', status: '停用', createTime: '2024-01-19 10:00' },
];

let nextId = 100;

function now() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function mockGetProjectTypes(): Promise<ProjectType[]> {
  return [...MOCK_PROJECT_TYPES];
}

export async function mockCreateProjectType(data: { name: string; description: string; status: '启用' | '停用' }): Promise<ProjectType> {
  if (MOCK_PROJECT_TYPES.some((t) => t.name === data.name)) {
    throw new Error('类型名称已存在');
  }
  const pt: ProjectType = { id: nextId++, ...data, createTime: now() };
  MOCK_PROJECT_TYPES.push(pt);
  return pt;
}

export async function mockUpdateProjectType(id: number, data: Partial<{ name: string; description: string; status: '启用' | '停用' }>): Promise<ProjectType> {
  const idx = MOCK_PROJECT_TYPES.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error('类型不存在');
  MOCK_PROJECT_TYPES[idx] = { ...MOCK_PROJECT_TYPES[idx], ...data };
  return MOCK_PROJECT_TYPES[idx];
}

export async function mockDeleteProjectTypes(ids: number[]): Promise<void> {
  for (const id of ids) {
    const idx = MOCK_PROJECT_TYPES.findIndex((t) => t.id === id);
    if (idx !== -1) MOCK_PROJECT_TYPES.splice(idx, 1);
  }
}
