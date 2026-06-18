import { request } from "./request";

export function trackEvent(data: {
  eventType: string;
  storeId?: number;
  sessionId?: string;
  channel?: string;
  targetType?: string;
  targetId?: string | number;
  payload?: Record<string, unknown>;
}) {
  request("/customer-app/events", {
    method: "POST",
    data: { ...data, targetId: data.targetId === undefined ? undefined : String(data.targetId) },
  }).catch(() => undefined);
}
