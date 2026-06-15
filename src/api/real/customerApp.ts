import type {
  AmiGlowDisplayConfig,
  AmiGlowDisplayConfigPayload,
  AmiGlowEvent,
  AmiGlowObjectType,
  AmiGlowPublishStatus,
} from '@/types/customer-app';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import apiClient from '../client';
import { normalizePaginatedResponse } from './response';

type ApiDisplayConfig = Partial<AmiGlowDisplayConfig> & {
  id: number;
  storeId: number;
  objectId: number;
  objectType: AmiGlowObjectType;
};

type ApiAmiGlowEvent = Partial<AmiGlowEvent> & {
  id: number;
  storeId: number;
  eventType: string;
};

function normalizeDisplayConfig(item: ApiDisplayConfig): AmiGlowDisplayConfig {
  return {
    id: Number(item.id),
    storeId: Number(item.storeId),
    storeName: item.storeName ?? '',
    objectType: item.objectType,
    objectId: Number(item.objectId),
    object: item.object ?? null,
    showInAmiGlow: item.showInAmiGlow ?? true,
    sortOrder: Number(item.sortOrder ?? 0),
    tags: Array.isArray(item.tags) ? item.tags : [],
    bannerImage: item.bannerImage ?? null,
    summary: item.summary ?? null,
    ctaType: item.ctaType ?? null,
    publishStatus: (item.publishStatus ?? 'published') as AmiGlowPublishStatus,
    startAt: item.startAt ?? null,
    endAt: item.endAt ?? null,
    metadataJson: item.metadataJson ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function normalizeAmiGlowEvent(item: ApiAmiGlowEvent): AmiGlowEvent {
  return {
    id: Number(item.id),
    storeId: Number(item.storeId),
    storeName: item.storeName ?? '',
    customerId: item.customerId ?? null,
    customerName: item.customerName ?? null,
    customerPhone: item.customerPhone ?? null,
    identityId: item.identityId ?? null,
    openid: item.openid ?? null,
    nickname: item.nickname ?? null,
    avatarUrl: item.avatarUrl ?? null,
    sessionId: item.sessionId ?? null,
    eventType: item.eventType,
    channel: item.channel ?? null,
    targetType: item.targetType ?? null,
    targetId: item.targetId ?? null,
    source: item.source ?? 'ami_glow',
    metadataJson: item.metadataJson ?? null,
    occurredAt: item.occurredAt,
    createdAt: item.createdAt,
  };
}

export async function realGetAmiGlowDisplayConfigs(
  params: PaginationParams & {
    storeId?: number | null;
    objectType?: AmiGlowObjectType | 'all';
    publishStatus?: AmiGlowPublishStatus | 'all';
    keyword?: string;
  },
): Promise<PaginatedResponse<AmiGlowDisplayConfig>> {
  const response = await apiClient.get<unknown, unknown>('/customer-app/admin/display-configs', {
    params: {
      ...params,
      storeId: params.storeId ?? undefined,
      objectType: params.objectType === 'all' ? undefined : params.objectType,
      publishStatus: params.publishStatus === 'all' ? undefined : params.publishStatus,
    },
  });
  return normalizePaginatedResponse<ApiDisplayConfig, AmiGlowDisplayConfig>(response, normalizeDisplayConfig);
}

export async function realCreateAmiGlowDisplayConfig(
  data: AmiGlowDisplayConfigPayload,
): Promise<AmiGlowDisplayConfig> {
  const response = await apiClient.post<unknown, ApiDisplayConfig>('/customer-app/admin/display-configs', data);
  return normalizeDisplayConfig(response);
}

export async function realUpdateAmiGlowDisplayConfig(
  id: number,
  data: Partial<AmiGlowDisplayConfigPayload>,
): Promise<AmiGlowDisplayConfig> {
  const response = await apiClient.put<unknown, ApiDisplayConfig>(`/customer-app/admin/display-configs/${id}`, data);
  return normalizeDisplayConfig(response);
}

export async function realDeleteAmiGlowDisplayConfig(id: number): Promise<void> {
  await apiClient.delete(`/customer-app/admin/display-configs/${id}`);
}

export async function realGetAmiGlowEvents(
  params: PaginationParams & {
    storeId?: number | null;
    customerId?: number;
    eventType?: string;
    channel?: string;
    targetType?: string;
    targetId?: string;
    source?: string;
    keyword?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<PaginatedResponse<AmiGlowEvent>> {
  const response = await apiClient.get<unknown, unknown>('/customer-app/admin/events/paginated', {
    params: {
      ...params,
      storeId: params.storeId ?? undefined,
    },
  });
  return normalizePaginatedResponse<ApiAmiGlowEvent, AmiGlowEvent>(response, normalizeAmiGlowEvent);
}
