import { buildQuery, request } from './request';
import { getSessionId } from '../stores/session';
import type {
  AuthResponse,
  AvailabilitySlot,
  BeauticianItem,
  CustomerProfile,
  HomeData,
  MarketingNotification,
  MarketingNotificationPage,
  Paginated,
  ProjectItem,
  ReservationItem,
  SkinReport,
  TrackingParams,
} from '../types/customer-app';

export function h5GuestLogin(storeId?: number) {
  return request<AuthResponse>('/customer-app/auth/h5-guest', {
    method: 'POST',
    body: {
      sessionId: getSessionId(),
      storeId,
      nickname: 'H5客户',
    },
  });
}

export function bindPhone(data: { phone: string; name?: string; storeId?: number }) {
  return request<AuthResponse>('/customer-app/auth/bind-phone', {
    method: 'POST',
    body: data,
  });
}

export function getMe() {
  return request<CustomerProfile>('/customer-app/me');
}

export function getHome(params: { storeId?: number; channel?: string } = {}) {
  return request<HomeData>(`/customer-app/home${buildQuery(params)}`);
}

export function getContact(storeId?: number) {
  return request<{ phone?: string; address?: string; businessHours?: string }>(
    `/customer-app/contact${buildQuery({ storeId })}`,
  );
}

export function getProjects(params: {
  storeId?: number;
  keyword?: string;
  recommended?: boolean;
  page?: number;
  pageSize?: number;
}) {
  return request<Paginated<ProjectItem>>(
    `/customer-app/projects${buildQuery({ ...params, recommended: params.recommended ? 'true' : undefined })}`,
  );
}

export function getProjectDetail(id: number, storeId?: number) {
  return request<ProjectItem>(`/customer-app/projects/${id}${buildQuery({ storeId })}`);
}

export function getAvailableBeauticians(projectId: number, storeId?: number) {
  return request<BeauticianItem[]>(`/customer-app/projects/${projectId}/available-beauticians${buildQuery({ storeId })}`);
}

export function getAvailability(params: { storeId: number; projectId: number; beauticianId?: number; date: string }) {
  return request<{ slots: AvailabilitySlot[] }>(`/customer-app/reservations/availability${buildQuery(params)}`);
}

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
  source?: string;
  campaignId?: string;
  staffId?: number;
  promotionId?: number;
}) {
  return request<ReservationItem>('/customer-app/reservations', {
    method: 'POST',
    body: {
      ...data,
      idempotencyKey: `ami-glow-h5-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

export function getMyReservations(params: { status?: string; page?: number; pageSize?: number } = {}) {
  return request<Paginated<ReservationItem>>(`/customer-app/me/reservations${buildQuery(params)}`);
}

export function cancelReservation(id: number, reason?: string) {
  return request<ReservationItem>(`/customer-app/me/reservations/${id}/cancel`, {
    method: 'POST',
    body: { reason },
  });
}

export function getMyCards() {
  return request<any[]>('/customer-app/me/cards');
}

export function getConsumptionRecords(params: { page?: number; pageSize?: number } = {}) {
  return request<Paginated<any>>(`/customer-app/me/consumption-records${buildQuery(params)}`);
}

export function getMemberCard() {
  return request<any>('/customer-app/me/member-card');
}

export function getNotifications(params: { page?: number; pageSize?: number } = {}) {
  return request<MarketingNotificationPage>(`/customer-app/me/notifications${buildQuery(params)}`);
}

export function openNotification(id: number) {
  return request<MarketingNotification>(`/customer-app/me/notifications/${id}/open`, { method: 'POST' });
}

export function claimPromotion(id: number, data: { storeId?: number; channel?: string; source?: string; sessionId?: string } = {}) {
  return request(`/customer-app/promotions/${id}/claim`, {
    method: 'POST',
    body: data,
  });
}

export function analyzeSkin(imageDataUrl: string, images?: string[]) {
  return request<SkinReport>('/customer-app/skin-tests/analyze', {
    method: 'POST',
    body: { imageDataUrl, images, capturedAt: new Date().toISOString() },
  });
}

export function getSkinReport(id: number) {
  return request<SkinReport>(`/customer-app/skin-tests/${id}`);
}

export function getSkinRecommendations(id: number) {
  return request<ProjectItem[]>(`/customer-app/skin-tests/${id}/recommendations`);
}

export function trackEvent(data: {
  eventType: string;
  storeId?: number;
  sessionId?: string;
  channel?: string;
  source?: string;
  targetType?: string;
  targetId?: string | number;
  payload?: Record<string, unknown> & Partial<TrackingParams>;
}) {
  request('/customer-app/events', {
    method: 'POST',
    body: {
      ...data,
      channel: data.channel || 'h5',
      source: data.source || data.payload?.source || 'ami_glow_h5',
      targetId: data.targetId === undefined ? undefined : String(data.targetId),
    },
  }).catch(() => undefined);
}
