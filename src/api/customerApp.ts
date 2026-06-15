import type {
  AmiGlowDisplayConfig,
  AmiGlowDisplayConfigPayload,
  AmiGlowEvent,
  AmiGlowObjectType,
  AmiGlowPublishStatus,
} from '@/types/customer-app';
import type { PaginatedResponse, PaginationParams } from '@/types/pagination';
import {
  realCreateAmiGlowDisplayConfig,
  realDeleteAmiGlowDisplayConfig,
  realGetAmiGlowDisplayConfigs,
  realGetAmiGlowEvents,
  realUpdateAmiGlowDisplayConfig,
} from './real/customerApp';

export const getAmiGlowDisplayConfigs: (
  params: PaginationParams & {
    storeId?: number | null;
    objectType?: AmiGlowObjectType | 'all';
    publishStatus?: AmiGlowPublishStatus | 'all';
    keyword?: string;
  },
) => Promise<PaginatedResponse<AmiGlowDisplayConfig>> = realGetAmiGlowDisplayConfigs;

export const createAmiGlowDisplayConfig: (
  data: AmiGlowDisplayConfigPayload,
) => Promise<AmiGlowDisplayConfig> = realCreateAmiGlowDisplayConfig;

export const updateAmiGlowDisplayConfig: (
  id: number,
  data: Partial<AmiGlowDisplayConfigPayload>,
) => Promise<AmiGlowDisplayConfig> = realUpdateAmiGlowDisplayConfig;

export const deleteAmiGlowDisplayConfig: (id: number) => Promise<void> =
  realDeleteAmiGlowDisplayConfig;

export const getAmiGlowEvents: (
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
) => Promise<PaginatedResponse<AmiGlowEvent>> = realGetAmiGlowEvents;
