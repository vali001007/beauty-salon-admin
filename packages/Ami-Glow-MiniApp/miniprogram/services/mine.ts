import { buildQuery, request } from "./request";
import type { Paginated } from "./types";

export function getMyCards() {
  return request<any[]>("/customer-app/me/cards");
}

export function getConsumptionRecords(params: { page?: number; pageSize?: number } = {}) {
  return request<Paginated<any>>(`/customer-app/me/consumption-records${buildQuery(params)}`);
}

export function getMemberCard() {
  return request<any>("/customer-app/me/member-card");
}
