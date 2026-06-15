import { request } from "./request";
import type { SkinReport } from "./types";

export function analyzeSkin(imageDataUrl: string, images?: string[]) {
  return request<SkinReport>("/customer-app/skin-tests/analyze", {
    method: "POST",
    data: { imageDataUrl, images, capturedAt: new Date().toISOString() },
  });
}

export function getSkinReport(id: number) {
  return request<SkinReport>(`/customer-app/skin-tests/${id}`);
}

export function getSkinRecommendations(id: number) {
  return request<any[]>(`/customer-app/skin-tests/${id}/recommendations`);
}
