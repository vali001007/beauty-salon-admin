export type StoreInfo = {
  id: number;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  businessHours?: string;
};

export type BannerItem = {
  id: string;
  title: string;
  image?: string;
  targetType: string;
  targetId: number | string;
  tag?: string;
  subtitle?: string;
  path?: string;
};

export type ProjectItem = {
  id: number;
  storeId: number;
  name: string;
  description?: string;
  image?: string;
  price: number;
  memberPrice?: number;
  duration: number;
  typeName?: string;
  tags?: string[];
  canBook: boolean;
  details?: {
    description?: string;
    serviceFlow?: string[];
    suitableFor?: string[];
    notices?: string[];
    bomItems?: Array<{ productId?: number; productName?: string; standardQty?: number; unit?: string }>;
  };
  store?: StoreInfo;
  promotions?: PromotionItem[];
};

export type PromotionItem = {
  id: number;
  name: string;
  title?: string;
  description?: string;
  discountText?: string;
  validDays?: number;
  image?: string;
};

export type HomeData = {
  store: StoreInfo;
  banners: BannerItem[];
  recommendedProjects: ProjectItem[];
  recommendedPromotions: PromotionItem[];
  recommendedProducts: any[];
  recommendedCards: any[];
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type CustomerProfile = {
  id: number;
  storeId: number;
  name: string;
  phone?: string;
  avatar?: string;
  memberLevel: string;
  skinType?: string;
  skinStatus?: string;
  store?: StoreInfo;
  stats?: {
    reservationCount: number;
    activeCardCount: number;
    latestSkinTestAt?: string;
  };
};

export type ReservationItem = {
  id: number;
  storeId: number;
  storeName?: string;
  projectId: number;
  projectName?: string;
  projectImage?: string;
  beauticianId?: number;
  beauticianName?: string;
  date: string;
  startTime: string;
  endTime?: string;
  status: string;
  remark?: string;
};

export type BeauticianItem = {
  id: number;
  name: string;
  avatar?: string;
  levelName?: string;
  certified?: boolean;
};

export type AvailabilitySlot = {
  startTime: string;
  endTime: string;
  available: boolean;
  reason?: string;
};

export type SkinReport = {
  id: number;
  skinType: string;
  skinStatus?: string;
  mainProblems?: string;
  overallScore?: number;
  scores?: Record<string, number>;
  metrics?: Record<string, number>;
  advice?: string;
  explanation?: string;
  recommendationText?: string;
  isFallback?: boolean;
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  openid?: string;
  bindStatus: string;
  customer: CustomerProfile | null;
};

export type TrackingParams = {
  channel?: string;
  campaignId?: string;
  promotionId?: number;
  staffId?: number;
  source?: string;
  medium?: string;
  wechatCode?: string;
  oauthState?: string;
  inWechat?: boolean;
};
