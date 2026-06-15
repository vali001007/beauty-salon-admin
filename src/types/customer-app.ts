export type AmiGlowObjectType = 'project' | 'product' | 'card' | 'promotion' | 'marketing_page';
export type AmiGlowPublishStatus = 'draft' | 'published' | 'offline';

export interface AmiGlowDisplayObject {
  id: number;
  name: string;
  status?: string;
  image?: string | null;
  description?: string | null;
  price?: number;
  categoryName?: string;
  miniappStatus?: string;
  totalTimes?: number;
  discountText?: string;
  startAt?: string | null;
  endAt?: string | null;
  slug?: string;
  sourceType?: string;
  shareUrl?: string | null;
  miniappPath?: string | null;
  publishedAt?: string | null;
}

export interface AmiGlowDisplayConfig {
  id: number;
  storeId: number;
  storeName?: string;
  objectType: AmiGlowObjectType;
  objectId: number;
  object: AmiGlowDisplayObject | null;
  showInAmiGlow: boolean;
  sortOrder: number;
  tags: string[];
  bannerImage?: string | null;
  summary?: string | null;
  ctaType?: string | null;
  publishStatus: AmiGlowPublishStatus;
  startAt?: string | null;
  endAt?: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AmiGlowDisplayConfigPayload {
  storeId: number;
  objectType: AmiGlowObjectType;
  objectId: number;
  showInAmiGlow?: boolean;
  sortOrder?: number;
  tags?: string[];
  bannerImage?: string | null;
  summary?: string | null;
  ctaType?: string | null;
  publishStatus?: AmiGlowPublishStatus;
  startAt?: string | null;
  endAt?: string | null;
  metadataJson?: Record<string, unknown> | null;
}

export interface AmiGlowEvent {
  id: number;
  storeId: number;
  storeName?: string;
  customerId?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  identityId?: number | null;
  openid?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  sessionId?: string | null;
  eventType: string;
  channel?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  source?: string;
  metadataJson?: Record<string, unknown> | null;
  occurredAt?: string;
  createdAt?: string;
}
