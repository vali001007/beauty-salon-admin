import type { Project } from '@/types';

const MOCK_PROJECTS: Project[] = [
  { id: 101, name: '巨补水', type: '面部护理', duration: 40, price: 199, storeName: '心悦芸美容养生会所', recommend: true, online: true, home: true, status: true, sort: 0 },
  { id: 102, name: '古方灸', type: '中医养生', duration: 60, price: 298, storeName: '心悦芸美容养生会所', recommend: true, online: true, home: true, status: true, sort: 0 },
  { id: 103, name: '泡澡', type: '中医养生', duration: 30, price: 188, storeName: '心悦芸美容养生会所', recommend: true, online: true, home: true, status: true, sort: 0 },
  { id: 104, name: '负氧离子舱', type: '仪器护理', duration: 0, price: 0, storeName: '凤仪阁美容养生会所', recommend: false, online: true, home: false, status: true, sort: 0 },
];

export async function mockGetProjects(params?: { keyword?: string; type?: string }): Promise<Project[]> {
  let result = [...MOCK_PROJECTS];
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    result = result.filter((p) => p.name.includes(kw));
  }
  if (params?.type) {
    result = result.filter((p) => p.type === params.type);
  }
  return result;
}

export async function mockGetProjectById(id: number): Promise<Project | undefined> {
  return MOCK_PROJECTS.find((p) => p.id === id);
}

export async function mockCreateProject(data: Omit<Project, 'id'>): Promise<Project> {
  const newId = Math.max(...MOCK_PROJECTS.map((p) => p.id)) + 1;
  const project: Project = { ...data, id: newId };
  MOCK_PROJECTS.push(project);
  return project;
}

export async function mockUpdateProject(id: number, data: Partial<Project>): Promise<Project> {
  const index = MOCK_PROJECTS.findIndex((p) => p.id === id);
  if (index === -1) throw new Error('Project not found');
  MOCK_PROJECTS[index] = { ...MOCK_PROJECTS[index], ...data };
  return MOCK_PROJECTS[index];
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

interface Reservation {
  id: string;
  storeName: string;
  userName: string;
  projectName: string;
  beauticianName: string;
  appointmentTime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createTime: string;
}

const MOCK_RESERVATIONS: Reservation[] = [
  { id: '202603240001', storeName: '凤仪阁美容养生会所', userName: '陈洁蓉', projectName: '面部护理（巨补水）', beauticianName: '张美容师', appointmentTime: '2026-03-25 14:00:00', status: 'pending', createTime: '2026-03-24 10:30:00' },
  { id: '202603240002', storeName: '凤仪阁美容养生会所', userName: '陈爱琴', projectName: '膏方灸', beauticianName: '李美容师', appointmentTime: '2026-03-25 15:30:00', status: 'confirmed', createTime: '2026-03-24 09:20:00' },
  { id: '202603240003', storeName: '心悦美容养生会所', userName: '楮倩', projectName: '古方灸', beauticianName: '王美容师', appointmentTime: '2026-03-24 10:00:00', status: 'completed', createTime: '2026-03-23 16:45:00' },
  { id: '202603240004', storeName: '凤仪阁美容养生会所', userName: '陈茶娟（阿慧）', projectName: '欧蜜丽养盘', beauticianName: '赵美容师', appointmentTime: '2026-03-26 11:00:00', status: 'pending', createTime: '2026-03-24 08:15:00' },
  { id: '202603240005', storeName: '心悦美容养生会所', userName: '陈途', projectName: '泡澡', beauticianName: '刘美容师', appointmentTime: '2026-03-25 09:00:00', status: 'cancelled', createTime: '2026-03-23 14:30:00' },
  { id: '202603240006', storeName: '凤仪阁美容养生会所', userName: '释团梅', projectName: '能量屋', beauticianName: '张美容师', appointmentTime: '2026-03-25 16:00:00', status: 'confirmed', createTime: '2026-03-24 07:50:00' },
  { id: '202603240007', storeName: '心悦美容养生会所', userName: '陈吉', projectName: '负氧离子舱', beauticianName: '李美容师', appointmentTime: '2026-03-26 14:30:00', status: 'pending', createTime: '2026-03-24 11:20:00' },
  { id: '202603240008', storeName: '凤仪阁美容养生会所', userName: '陈洁蓉', projectName: '八戒享秀仪器', beauticianName: '王美容师', appointmentTime: '2026-03-27 10:30:00', status: 'pending', createTime: '2026-03-24 10:00:00' },
  { id: '202603240009', storeName: '心悦美容养生会所', userName: '陈爱琴', projectName: '面部护理（巨补水）', beauticianName: '赵美容师', appointmentTime: '2026-03-25 13:00:00', status: 'confirmed', createTime: '2026-03-23 18:40:00' },
  { id: '202603240010', storeName: '凤仪阁美容养生会所', userName: '楮倩', projectName: '膏方灸', beauticianName: '刘美容师', appointmentTime: '2026-03-26 15:00:00', status: 'completed', createTime: '2026-03-24 09:10:00' },
];

export async function mockGetReservationsPaginated(params: PaginationParams & { storeName?: string; userName?: string; projectName?: string; status?: string }): Promise<PaginatedResponse<Reservation>> {
  let result = [...MOCK_RESERVATIONS];
  if (params.storeName) {
    result = result.filter((r) => r.storeName === params.storeName);
  }
  if (params.userName) {
    result = result.filter((r) => r.userName.includes(params.userName!));
  }
  if (params.projectName) {
    result = result.filter((r) => r.projectName === params.projectName);
  }
  if (params.status) {
    result = result.filter((r) => r.status === params.status);
  }
  const total = result.length;
  const start = (params.page - 1) * params.pageSize;
  const data = result.slice(start, start + params.pageSize);
  return { data, total, page: params.page, pageSize: params.pageSize };
}
