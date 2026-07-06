import type { Project, ProjectBomItem } from '@/types';
import apiClient from '../client';
import { extractArray, normalizePaginatedResponse } from './response';

type ApiProject = Omit<Partial<Project>, 'type' | 'status'> & {
  store?: { name?: string };
  type?: string | { name?: string };
  status?: Project['status'] | 'active' | 'inactive' | 'disabled';
  bomItems?: ApiProjectBomItem[];
};

type ApiProjectBomItem = Partial<ProjectBomItem> & {
    product?: {
      id?: number;
      name?: string;
      sku?: string;
      unit?: string;
      specUnit?: string | null;
      costPrice?: number | string;
      status?: string;
    };
};

export type ProjectBomPayloadItem = {
  productId: number;
  standardQty: number;
  unit: string;
};

function normalizeProjectBomItem(item: ApiProjectBomItem): NonNullable<Project['bom']>[number] {
  return {
    id: item.id === undefined ? undefined : Number(item.id),
    productId: item.productId === undefined ? item.product?.id : Number(item.productId),
    productName: item.productName ?? item.product?.name ?? '',
    sku: item.sku ?? item.product?.sku ?? '',
    standardQty: Number(item.standardQty ?? 0),
    unit: item.unit ?? item.product?.specUnit ?? item.product?.unit ?? '',
    costPrice: Number(item.costPrice ?? item.product?.costPrice ?? 0),
    productStatus: item.productStatus ?? item.product?.status,
  };
}

function normalizeProject(item: ApiProject): Project {
  return {
    id: Number(item.id),
    name: item.name ?? '',
    description: item.description ?? '',
    type: typeof item.type === 'string' ? item.type : item.type?.name ?? '护理项目',
    duration: Number(item.duration ?? 0),
    careCycleWeeks: item.careCycleWeeks == null ? null : Number(item.careCycleWeeks),
    treatmentCourseTimes: item.treatmentCourseTimes == null ? null : Number(item.treatmentCourseTimes),
    price: Number(item.price ?? 0),
    storeName: item.storeName ?? item.store?.name ?? '',
    recommend: Boolean(item.recommend ?? false),
    online: Boolean(item.online ?? true),
    home: item.home ?? false,
    status: typeof item.status === 'boolean' ? item.status : item.status === undefined || item.status === 'active',
    sort: Number(item.sort ?? item.id ?? 0),
    image: item.image,
    bom: Array.isArray(item.bomItems)
      ? item.bomItems.map(normalizeProjectBomItem)
      : Array.isArray(item.bom)
        ? item.bom.map(normalizeProjectBomItem)
        : undefined,
  };
}

export async function realGetProjects(params?: { keyword?: string; type?: string; status?: string; sellableOnly?: boolean }): Promise<Project[]> {
  const response = await apiClient.get<unknown, unknown>('/projects', { params });
  return extractArray<ApiProject>(response).map(normalizeProject);
}

export async function realGetProjectById(id: number): Promise<Project | undefined> {
  const item = await apiClient.get<unknown, ApiProject>(`/projects/${id}`);
  return normalizeProject(item);
}

export async function realCreateProject(data: Omit<Project, 'id'>): Promise<Project> {
  const item = await apiClient.post<unknown, ApiProject>('/projects', data);
  return normalizeProject(item);
}

export async function realUpdateProject(id: number, data: Partial<Project>): Promise<Project> {
  const item = await apiClient.put<unknown, ApiProject>(`/projects/${id}`, data);
  return normalizeProject(item);
}

export async function realGetProjectBom(id: number): Promise<NonNullable<Project['bom']>> {
  const response = await apiClient.get<unknown, unknown>(`/projects/${id}/bom`);
  return extractArray<ApiProjectBomItem>(response).map(normalizeProjectBomItem);
}

export async function realSetProjectBom(
  id: number,
  items: ProjectBomPayloadItem[],
): Promise<NonNullable<Project['bom']>> {
  const response = await apiClient.put<unknown, unknown>(`/projects/${id}/bom`, { items });
  return extractArray<ApiProjectBomItem>(response).map(normalizeProjectBomItem);
}

export async function realDeleteProject(id: number): Promise<void> {
  return apiClient.delete(`/projects/${id}`);
}

import type { PaginatedResponse, PaginationParams } from '@/types/pagination';

export async function realGetProjectsPaginated(params: PaginationParams & { keyword?: string; type?: string; status?: string; sellableOnly?: boolean }): Promise<PaginatedResponse<Project>> {
  const response = await apiClient.get<unknown, unknown>('/projects/paginated', { params });
  return normalizePaginatedResponse<ApiProject, Project>(response, normalizeProject);
}

type ApiReservation = Record<string, any>;

function inferReservationSource(item: ApiReservation) {
  const remark = String(item.remark ?? '');
  const source = String(item.source ?? item.channel ?? '');
  if (/ami[_\s-]?glow[_\s-]?h5|Ami Glow H5|h5/i.test(`${source} ${remark}`)) return 'Ami Glow H5';
  if (/Ami Glow|ami[_\s-]?glow/i.test(`${source} ${remark}`)) return 'Ami Glow';
  return item.sourceLabel ?? item.channel ?? '管理端';
}

function normalizeReservation(item: ApiReservation) {
  const customerName = item.userName ?? item.customerName ?? item.customer?.name ?? '';
  const projectName = item.projectName ?? item.project?.name ?? '';
  const beauticianName = item.beauticianName ?? item.beautician?.name ?? '待分配';
  const storeName = item.storeName ?? item.store?.name ?? '';
  const appointmentTime =
    item.appointmentTime ??
    (item.date ? `${String(item.date).slice(0, 10)} ${item.startTime ?? '00:00'}:00` : '');

  return {
    ...item,
    id: String(item.id),
    storeName,
    userName: customerName,
    customerName,
    customerPhone: item.customerPhone ?? item.customer?.phone ?? '',
    projectName,
    beauticianName,
    appointmentTime,
    status: item.status ?? 'pending',
    createTime: item.createTime ?? item.createdAt ?? '',
    sourceLabel: inferReservationSource(item),
  };
}

export async function realGetReservationsPaginated(
  params: PaginationParams & {
    storeName?: string;
    userName?: string;
    projectName?: string;
    beauticianName?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    scope?: 'future' | 'history';
  },
): Promise<PaginatedResponse<any>> {
  const response = await apiClient.get<unknown, unknown>('/reservations/paginated', { params });
  return normalizePaginatedResponse<ApiReservation, any>(response, normalizeReservation);
}

export async function realGetReservationById(id: string | number): Promise<any> {
  const response = await apiClient.get<unknown, ApiReservation>(`/reservations/${id}`);
  return normalizeReservation(response);
}

export async function realCreateReservation(data: Record<string, any>): Promise<any> {
  const response = await apiClient.post<unknown, ApiReservation>('/reservations', data);
  return normalizeReservation(response);
}

export async function realUpdateReservation(id: string | number, data: Record<string, any>): Promise<any> {
  const response = await apiClient.put<unknown, ApiReservation>(`/reservations/${id}`, data);
  return normalizeReservation(response);
}

export async function realConfirmReservation(id: string | number): Promise<any> {
  const response = await apiClient.post<unknown, ApiReservation>(`/reservations/${id}/confirm`);
  return normalizeReservation(response);
}

export async function realCheckInReservation(id: string | number): Promise<any> {
  const response = await apiClient.post<unknown, ApiReservation>(`/reservations/${id}/check-in`);
  return normalizeReservation(response);
}

export async function realCancelReservation(id: string | number, reason?: string): Promise<any> {
  const response = await apiClient.post<unknown, ApiReservation>(`/reservations/${id}/cancel`, { reason });
  return normalizeReservation(response);
}
