import { request } from "./request";

export function claimPromotion(id: number, data: { storeId?: number; channel?: string; sessionId?: string } = {}) {
  return request(`/customer-app/promotions/${id}/claim`, {
    method: "POST",
    data,
  });
}
