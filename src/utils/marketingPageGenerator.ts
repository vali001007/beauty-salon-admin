import type { ActivityPageSchema } from '@/types/ai';
import type { MarketingActivity, Product, Project, RecommendedItem } from '@/types';
import type { MarketingPageInput } from '@/types/marketing-page';

export type MarketingPageSourceType = 'product' | 'project';

export interface ActivityMarketingPageItem {
  id: number;
  name: string;
  price?: number;
  type?: string;
  category?: string;
  description?: string;
}

export interface ActivityMarketingPageSchemaInput {
  title: string;
  description: string;
  activityType?: string;
  offer: string;
  targetCustomers: string;
  startDate: string;
  endDate: string;
  posterImage?: string;
  posterBg?: string;
  selectedProjects?: ActivityMarketingPageItem[];
  selectedProducts?: ActivityMarketingPageItem[];
  maxUsagePerPerson?: string;
  minSpend?: string;
  stackable?: boolean;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
}

export interface ActivityMarketingPagePayloadOptions {
  pageSchema: ActivityPageSchema;
  activityType?: string;
  selectedProjects?: ActivityMarketingPageItem[];
  selectedProducts?: ActivityMarketingPageItem[];
  selectedChannels?: string[];
  posterImage?: string;
  offerJson?: unknown;
  audienceSnapshotJson?: unknown;
  recommendedItemsJson?: unknown;
  sourceSignalsJson?: unknown;
}

export interface MarketingPageDraftOptions {
  title?: string;
  description?: string;
  offer?: string;
  targetCustomers?: string;
  startDate?: string;
  endDate?: string;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
  aiGenerationId?: string;
}

export interface MarketingPageDraft {
  sourceType: MarketingPageSourceType;
  sourceId: number;
  sourceName: string;
  sourceLabel: string;
  title: string;
  description: string;
  offer: string;
  targetCustomers: string;
  startDate: string;
  endDate: string;
  storeName: string;
  storePhone?: string;
  posterImage?: string;
  posterBg: string;
  aiGenerationId: string;
  pageSchema: ActivityPageSchema;
  recommendedItems: RecommendedItem[];
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultPeriod() {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
}

function formatCurrency(value?: number | null) {
  const amount = Number(value || 0);
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getProductSalePrice(product: Product) {
  return Number(product.salePrice ?? product.retailPrice ?? 0);
}

function getProductOffer(product: Product) {
  const salePrice = getProductSalePrice(product);
  const retailPrice = Number(product.retailPrice || 0);
  if (product.discountLabel) return product.discountLabel;
  if (salePrice > 0 && retailPrice > 0 && salePrice < retailPrice) {
    return `小程序专享 ${formatCurrency(salePrice)}`;
  }
  return '到店咨询享专属护理建议';
}

function buildSafety() {
  return {
    customerFacing: true,
    blocked: false,
    reasons: [],
  };
}

function getActivityTone(activityType?: string): ActivityPageSchema['theme']['tone'] {
  if (!activityType) return 'warm';
  if (/储值|生日|VIP|会员/.test(activityType)) return 'premium';
  if (/拼团|老带新|节日/.test(activityType)) return 'friendly';
  if (/体验价/.test(activityType)) return 'professional';
  return 'warm';
}

function getActivityCta(activityType?: string): ActivityPageSchema['cta'] {
  if (/体验价|预约|项目/.test(activityType || '')) {
    return { text: '立即预约', action: 'book' };
  }
  if (/折扣|满减|节日|生日|储值/.test(activityType || '')) {
    return { text: '领取权益', action: 'claim_coupon' };
  }
  return { text: '咨询顾问', action: 'contact_consultant' };
}

function getActivityRuleNotices(input: ActivityMarketingPageSchemaInput) {
  const notices = [
    input.maxUsagePerPerson && input.maxUsagePerPerson !== '不限'
      ? `每位客户限用 ${input.maxUsagePerPerson} 次。`
      : '权益使用次数以门店最终确认为准。',
    input.minSpend ? `最低消费门槛：${input.minSpend}。` : '如有消费门槛，以门店活动说明为准。',
    input.stackable ? '可与门店确认后的其他权益叠加使用。' : '不可与未注明的其他优惠叠加使用。',
    '提交信息后，门店顾问会尽快联系确认权益和到店安排。',
  ];
  return notices.filter(Boolean);
}

function activityItemsToRecommendedItems(
  selectedProjects: ActivityMarketingPageItem[] = [],
  selectedProducts: ActivityMarketingPageItem[] = [],
): RecommendedItem[] {
  return [
    ...selectedProjects.map((item) => ({
      type: 'project' as const,
      id: item.id,
      name: item.name,
      category: item.type || '护理项目',
      price: Number(item.price || 0),
      activityPrice: Number(item.price || 0),
      reason: '活动参与项目',
      confidence: 0.85,
    })),
    ...selectedProducts.map((item) => ({
      type: 'product' as const,
      id: item.id,
      name: item.name,
      category: item.category || '护理商品',
      price: Number(item.price || 0),
      activityPrice: Number(item.price || 0),
      reason: '活动参与商品',
      confidence: 0.82,
    })),
  ];
}

export function buildMarketingActivityPageSchema(input: ActivityMarketingPageSchemaInput): ActivityPageSchema {
  const tone = getActivityTone(input.activityType);
  const primaryColor = input.posterBg || '#DB2777';
  const selectedProjects = input.selectedProjects ?? [];
  const selectedProducts = input.selectedProducts ?? [];
  const sections: ActivityPageSchema['sections'] = [
    {
      type: 'hero',
      badge: input.activityType || '营销活动',
      title: input.title,
      subtitle: input.targetCustomers,
      description: input.description,
      imageUrl: input.posterImage,
    },
    {
      type: 'offer',
      title: '本期权益',
      offer: input.offer,
      description: `活动期 ${input.startDate} 至 ${input.endDate}，提交信息后由门店顾问确认权益和适用方案。`,
      validFrom: input.startDate,
      validTo: input.endDate,
      highlights: [input.activityType || '门店活动', input.targetCustomers, input.offer].filter(Boolean),
    },
    {
      type: 'benefits',
      title: '活动亮点',
      items: [
        {
          title: '权益清晰',
          description: '客户在页面内可以直接看到活动时间、适用人群和本期权益。',
        },
        {
          title: '顾问确认',
          description: '提交咨询或预约后，顾问会结合客户状态确认适合的护理安排。',
        },
        {
          title: '适合渠道分发',
          description: '页面可用于小程序、微信、社群、朋友圈和门店二维码传播。',
        },
      ],
    },
  ];

  if (selectedProjects.length) {
    sections.push({
      type: 'project_recommendation',
      title: '参与项目',
      items: selectedProjects.map((item) => ({
        name: item.name,
        description: item.description || `${item.type || '护理项目'} · 到店后由顾问确认服务方案。`,
        originalPrice: Number(item.price || 0) || undefined,
        activityPrice: Number(item.price || 0) || undefined,
        reason: '适合本期活动推广',
      })),
    });
  }

  if (selectedProducts.length) {
    sections.push({
      type: 'product_recommendation',
      title: '参与商品',
      items: selectedProducts.map((item) => ({
        name: item.name,
        category: item.category || '护理商品',
        description: item.description || '可到店咨询顾问，确认是否适合当前护理需求。',
        originalPrice: Number(item.price || 0) || undefined,
        activityPrice: Number(item.price || 0) || undefined,
      })),
    });
  }

  sections.push(
    {
      type: 'faq',
      title: '常见问题',
      items: [
        {
          question: '提交后是否立即预约成功？',
          answer: '提交后门店会根据排班、房间和顾问时间与你确认最终到店安排。',
        },
        {
          question: '活动权益如何使用？',
          answer: '到店后由顾问根据页面权益、门店规则和你的实际情况确认。',
        },
      ],
    },
    {
      type: 'notice',
      title: '活动须知',
      items: getActivityRuleNotices(input),
    },
    {
      type: 'store_info',
      title: '活动门店',
      storeName: input.storeName || '心悦芸美容养生会所',
      phone: input.storePhone || '0571-88888888',
      address: input.storeAddress,
    },
  );

  return {
    schemaVersion: '1.0',
    title: input.title,
    subtitle: input.description,
    audienceLabel: input.targetCustomers,
    theme: {
      tone,
      primaryColor,
      backgroundColor: tone === 'professional' ? '#EFF6FF' : '#FFF7ED',
    },
    sections,
    cta: getActivityCta(input.activityType),
    safety: buildSafety(),
  };
}

export function buildProductMarketingPageDraft(
  product: Product,
  options: MarketingPageDraftOptions = {},
): MarketingPageDraft {
  const period = getDefaultPeriod();
  const startDate = options.startDate || period.startDate;
  const endDate = options.endDate || period.endDate;
  const salePrice = getProductSalePrice(product);
  const title = options.title?.trim() || `${product.name}护理优选`;
  const offer = options.offer?.trim() || getProductOffer(product);
  const targetCustomers = options.targetCustomers?.trim() || '适合关注居家护理和到店搭配护理的会员';
  const description =
    options.description?.trim() ||
    product.salesDescription?.trim() ||
    `为你精选${product.name}，到店可由顾问结合肤况和护理记录确认适合的使用方式。`;
  const storeName = options.storeName || product.storeName || '当前门店';
  const primaryColor = '#DB2777';

  const pageSchema: ActivityPageSchema = {
    schemaVersion: '1.0',
    title,
    subtitle: description,
    audienceLabel: targetCustomers,
    theme: {
      tone: 'warm',
      primaryColor,
      backgroundColor: '#FFF7ED',
    },
    sections: [
      {
        type: 'hero',
        badge: '商品推广',
        title,
        subtitle: product.brand ? `${product.brand} · ${product.spec || product.categoryName || '门店优选'}` : product.categoryName || '门店优选',
        description,
        imageUrl: product.image,
      },
      {
        type: 'offer',
        title: '本期权益',
        offer,
        description: `活动期 ${startDate} 至 ${endDate}，到店后由顾问确认适合你的护理搭配。`,
        validFrom: startDate,
        validTo: endDate,
        highlights: [product.categoryName || '护理商品', product.spec || product.unit || '门店优选'].filter(Boolean),
      },
      {
        type: 'benefits',
        title: '为什么推荐',
        items: [
          {
            title: '适合到店咨询',
            description: '顾问会结合当前肤况、护理频次和居家护理习惯给出建议。',
          },
          {
            title: '可搭配项目',
            description: '商品可与门店护理项目组合推荐，帮助客户形成完整护理方案。',
          },
          {
            title: '权益清晰',
            description: '页面展示活动价、有效期和到店核销说明，便于转发推广。',
          },
        ],
      },
      {
        type: 'product_recommendation',
        title: '推荐商品',
        items: [
          {
            name: product.name,
            category: product.categoryName || product.brand || '护理商品',
            description,
            originalPrice: Number(product.retailPrice || 0) || undefined,
            activityPrice: salePrice || Number(product.retailPrice || 0) || undefined,
          },
        ],
      },
      {
        type: 'faq',
        title: '常见问题',
        items: [
          {
            question: '可以直接线上购买吗？',
            answer: '当前页面用于到店咨询和预约，门店顾问会根据实际肤况确认是否适合。',
          },
          {
            question: '活动权益如何使用？',
            answer: '提交预约或联系顾问后，到店按页面展示的活动规则确认。',
          },
        ],
      },
      {
        type: 'notice',
        title: '活动须知',
        items: ['权益以门店确认结果为准。', '商品适用建议需结合个人肤况和顾问判断。', '活动不可与未注明的其他优惠叠加。'],
      },
      {
        type: 'store_info',
        title: '活动门店',
        storeName,
        phone: options.storePhone,
        address: options.storeAddress,
      },
    ],
    cta: {
      text: '咨询顾问',
      action: 'contact_consultant',
    },
    safety: buildSafety(),
  };

  return {
    sourceType: 'product',
    sourceId: product.id,
    sourceName: product.name,
    sourceLabel: '商品',
    title,
    description,
    offer,
    targetCustomers,
    startDate,
    endDate,
    storeName,
    storePhone: options.storePhone,
    posterImage: product.image,
    posterBg: primaryColor,
    aiGenerationId: options.aiGenerationId || `product-page-${product.id}-${Date.now()}`,
    pageSchema,
    recommendedItems: [
      {
        type: 'product',
        id: product.id,
        name: product.name,
        category: product.categoryName || product.brand || '护理商品',
        price: Number(product.retailPrice || 0),
        activityPrice: salePrice || Number(product.retailPrice || 0),
        reason: '商品推广页自动生成',
        confidence: 0.9,
      },
    ],
  };
}

export function buildProjectMarketingPageDraft(
  project: Project,
  options: MarketingPageDraftOptions = {},
): MarketingPageDraft {
  const period = getDefaultPeriod();
  const startDate = options.startDate || period.startDate;
  const endDate = options.endDate || period.endDate;
  const title = options.title?.trim() || `${project.name}预约体验`;
  const offer = options.offer?.trim() || `${formatCurrency(project.price)} 到店预约体验`;
  const targetCustomers = options.targetCustomers?.trim() || '适合近期有护理预约需求的会员';
  const description =
    options.description?.trim() ||
    `${project.name}约 ${project.duration || 60} 分钟，适合希望安排到店护理体验的客户。`;
  const storeName = options.storeName || project.storeName || '当前门店';
  const primaryColor = '#2563EB';

  const pageSchema: ActivityPageSchema = {
    schemaVersion: '1.0',
    title,
    subtitle: description,
    audienceLabel: targetCustomers,
    theme: {
      tone: 'professional',
      primaryColor,
      backgroundColor: '#EFF6FF',
    },
    sections: [
      {
        type: 'hero',
        badge: '项目预约',
        title,
        subtitle: `${project.type || '护理项目'} · ${project.duration || 60} 分钟`,
        description,
        imageUrl: project.image,
      },
      {
        type: 'offer',
        title: '预约权益',
        offer,
        description: `活动期 ${startDate} 至 ${endDate}，在线预约后由门店确认到店时间。`,
        validFrom: startDate,
        validTo: endDate,
        highlights: [project.type || '护理项目', `${project.duration || 60} 分钟`, '到店确认方案'],
      },
      {
        type: 'benefits',
        title: '项目亮点',
        items: [
          {
            title: '在线预约更高效',
            description: '客户提交预约意向后，门店可提前安排顾问和服务时间。',
          },
          {
            title: '到店确认方案',
            description: '顾问会结合肤况、护理记录和当前需求确认最终服务方案。',
          },
          {
            title: '适合渠道推广',
            description: '页面可用于微信、社群、朋友圈、门店二维码等渠道传播。',
          },
        ],
      },
      {
        type: 'project_recommendation',
        title: '推荐项目',
        items: [
          {
            name: project.name,
            description,
            originalPrice: Number(project.price || 0) || undefined,
            activityPrice: Number(project.price || 0) || undefined,
            reason: project.recommend ? '门店推荐项目' : '适合本期推广',
          },
        ],
      },
      {
        type: 'faq',
        title: '常见问题',
        items: [
          {
            question: '预约后是否一定能按该时间到店？',
            answer: '提交预约后，门店会根据排班与房间情况与你确认最终时间。',
          },
          {
            question: '项目是否适合所有人？',
            answer: '到店后顾问会结合实际肤况和身体状态确认是否适合。',
          },
        ],
      },
      {
        type: 'notice',
        title: '预约须知',
        items: ['项目体验需提前预约。', '最终服务方案以到店顾问确认结果为准。', '如需改期，请提前联系门店。'],
      },
      {
        type: 'store_info',
        title: '服务门店',
        storeName,
        phone: options.storePhone,
        address: options.storeAddress,
      },
    ],
    cta: {
      text: '立即预约',
      action: 'book',
    },
    safety: buildSafety(),
  };

  return {
    sourceType: 'project',
    sourceId: project.id,
    sourceName: project.name,
    sourceLabel: '项目',
    title,
    description,
    offer,
    targetCustomers,
    startDate,
    endDate,
    storeName,
    storePhone: options.storePhone,
    posterImage: project.image,
    posterBg: primaryColor,
    aiGenerationId: options.aiGenerationId || `project-page-${project.id}-${Date.now()}`,
    pageSchema,
    recommendedItems: [
      {
        type: 'project',
        id: project.id,
        name: project.name,
        category: project.type || '护理项目',
        price: Number(project.price || 0),
        activityPrice: Number(project.price || 0),
        reason: '项目推广页自动生成',
        confidence: 0.9,
      },
    ],
  };
}

export function buildMarketingActivityPayloadFromPageDraft(
  draft: MarketingPageDraft,
  publishStatus: MarketingActivity['publishStatus'] = 'published',
): Omit<MarketingActivity, 'id'> {
  return {
    title: draft.title,
    description: draft.description,
    image: draft.posterImage || '',
    status: publishStatus === 'published' ? '进行中' : '草稿',
    participants: 0,
    conversion: '0%',
    startDate: draft.startDate,
    endDate: draft.endDate,
    targetCustomers: draft.targetCustomers,
    discount: draft.offer,
    source: '手动创建',
    strategyName: `${draft.sourceLabel}推广页：${draft.sourceName}`,
    posterBg: draft.posterBg,
    posterImage: draft.posterImage,
    posterTitleColor: '#FFFFFF',
    pageSchema: draft.pageSchema,
    sourceRecommendationId: `${draft.sourceType}:${draft.sourceId}`,
    recommendedItemsJson: draft.recommendedItems,
    aiGenerationId: draft.aiGenerationId,
    publishStatus,
    publishedAt: publishStatus === 'published' ? new Date().toISOString() : undefined,
  };
}

export function buildMarketingPagePayloadFromPageDraft(draft: MarketingPageDraft): MarketingPageInput {
  return {
    sourceType: draft.sourceType,
    sourceId: draft.sourceId,
    title: draft.title,
    runtimeType: 'h5',
    pageSchema: draft.pageSchema,
    snapshotJson: {
      sourceType: draft.sourceType,
      sourceId: draft.sourceId,
      sourceName: draft.sourceName,
      sourceLabel: draft.sourceLabel,
      offer: draft.offer,
      targetCustomers: draft.targetCustomers,
      startDate: draft.startDate,
      endDate: draft.endDate,
      storeName: draft.storeName,
      recommendedItems: draft.recommendedItems,
    },
    themeJson: draft.pageSchema.theme,
    shareTitle: draft.title,
    shareDescription: draft.description,
    shareImage: draft.posterImage,
    aiGenerationId: draft.aiGenerationId,
    promptVersion: 'marketing-page.local-generator.v1',
  };
}

export function buildMarketingPagePayloadFromActivity(
  activity: MarketingActivity,
  options: ActivityMarketingPagePayloadOptions,
): MarketingPageInput {
  const recommendedItems = activityItemsToRecommendedItems(options.selectedProjects, options.selectedProducts);
  return {
    activityId: activity.id,
    sourceType: 'activity',
    sourceId: activity.id,
    title: activity.title,
    runtimeType: 'h5',
    pageSchema: options.pageSchema,
    snapshotJson: {
      sourceType: 'activity',
      activityId: activity.id,
      activityType: options.activityType,
      title: activity.title,
      description: activity.description,
      offer: activity.discount,
      targetCustomers: activity.targetCustomers,
      startDate: activity.startDate,
      endDate: activity.endDate,
      selectedChannels: options.selectedChannels ?? [],
      selectedProjects: options.selectedProjects ?? [],
      selectedProducts: options.selectedProducts ?? [],
      recommendedItems,
      offerJson: options.offerJson,
      audienceSnapshotJson: options.audienceSnapshotJson,
      recommendedItemsJson: options.recommendedItemsJson,
      sourceSignalsJson: options.sourceSignalsJson,
    },
    themeJson: options.pageSchema.theme,
    shareTitle: activity.title,
    shareDescription: activity.description,
    shareImage: options.posterImage || activity.image,
    aiGenerationId: activity.aiGenerationId || `activity-page-${activity.id}`,
    promptVersion: 'marketing-page.activity-generator.v1',
  };
}
