import { buildQuery, request } from "./request";
import type { Paginated, ReservationItem } from "./types";

export function createReservation(data: {
  storeId: number;
  projectId: number;
  beauticianId?: number;
  date: string;
  startTime: string;
  endTime?: string;
  customerName?: string;
  customerPhone?: string;
  remark?: string;
  channel?: string;
}) {
  return request<ReservationItem>("/customer-app/reservations", {
    method: "POST",
    data: { ...data, idempotencyKey: `ami-glow-${Date.now()}` },
  });
}

export function getMyReservations(params: { status?: string; page?: number; pageSize?: number } = {}) {
  return request<Paginated<ReservationItem>>(`/customer-app/me/reservations${buildQuery(params)}`);
}

export function cancelReservation(id: number, reason?: string) {
  return request<ReservationItem>(`/customer-app/me/reservations/${id}/cancel`, {
    method: "POST",
    data: { reason },
  });
}
