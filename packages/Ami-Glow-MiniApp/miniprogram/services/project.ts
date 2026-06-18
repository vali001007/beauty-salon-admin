import { buildQuery, request } from "./request";
import type { AvailabilitySlot, BeauticianItem, Paginated, ProjectItem } from "./types";

export function getProjects(params: {
  storeId?: number;
  keyword?: string;
  recommended?: boolean;
  page?: number;
  pageSize?: number;
}) {
  return request<Paginated<ProjectItem>>(
    `/customer-app/projects${buildQuery({ ...params, recommended: params.recommended ? "true" : undefined })}`,
  );
}

export function getProjectDetail(id: number, storeId?: number) {
  return request<ProjectItem & { details?: any; store?: any; promotions?: any[] }>(
    `/customer-app/projects/${id}${buildQuery({ storeId })}`,
  );
}

export function getAvailableBeauticians(projectId: number, storeId?: number) {
  return request<BeauticianItem[]>(`/customer-app/projects/${projectId}/available-beauticians${buildQuery({ storeId })}`);
}

export function getAvailability(params: {
  storeId: number;
  projectId: number;
  beauticianId?: number;
  date: string;
}) {
  return request<{ slots: AvailabilitySlot[] }>(`/customer-app/reservations/availability${buildQuery(params)}`);
}
