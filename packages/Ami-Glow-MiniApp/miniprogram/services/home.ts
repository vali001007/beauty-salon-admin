import { buildQuery, request } from "./request";
import type { HomeData } from "./types";

export function getHome(params: { storeId?: number; channel?: string } = {}) {
  return request<HomeData>(`/customer-app/home${buildQuery(params)}`);
}

export function getContact(storeId?: number) {
  return request<{ phone?: string; address?: string; businessHours?: string }>(
    `/customer-app/contact${buildQuery({ storeId })}`,
  );
}
