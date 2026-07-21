import { describe, expect, it } from 'vitest';
import type { ActivityPageSchema, MarketingActivity, Product, Project } from '@/types';
import {
  buildMarketingActivityPageSchema,
  buildMarketingActivityPayloadFromPageDraft,
  buildMarketingPagePayloadFromActivity,
  buildMarketingPagePayloadFromPageDraft,
  buildProductMarketingPageDraft,
  buildProjectMarketingPageDraft,
  type ActivityMarketingPageItem,
} from './marketingPageGenerator';

function findSection<TType extends ActivityPageSchema['sections'][number]['type']>(
  schema: ActivityPageSchema,
  type: TType,
): Extract<ActivityPageSchema['sections'][number], { type: TType }> {
  const section = schema.sections.find(
    (item): item is Extract<ActivityPageSchema['sections'][number], { type: TType }> => item.type === type,
  );

  if (!section) {
    throw new Error(`Expected ${type} section to exist`);
  }
  return section;
}

describe('marketing page generator payloads', () => {
  it('builds a publish-ready MarketingPage payload from a product draft', () => {
    const product: Product = {
      id: 101,
      storeId: 1,
      storeName: 'Ami Aura West Lake',
      name: 'Hydra Serum',
      sku: 'SKU-HYDRA-101',
      brand: 'Ami Aura',
      spec: '30ml',
      specUnit: 'ml',
      packageUnit: 'bottle',
      costPrice: 88,
      retailPrice: 299,
      salePrice: 199,
      discountLabel: 'Miniapp price 199',
      shelfLife: 365,
      categoryId: 12,
      categoryName: 'Skin Care',
      supplier: 'Ami Lab',
      minPurchaseQty: 1,
      image: 'https://cdn.example.com/hydra-serum.png',
      status: 'active' as Product['status'],
      salesDescription: 'Daily hydration care serum.',
    };

    const draft = buildProductMarketingPageDraft(product, {
      title: 'Hydra Serum Member Offer',
      description: 'Invite members to ask consultants about the serum.',
      targetCustomers: 'Members with home care needs',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      storePhone: '0571-88888888',
      storeAddress: 'West Lake Road 1',
      aiGenerationId: 'ai-product-101',
    });
    const payload = buildMarketingPagePayloadFromPageDraft(draft);
    const recommendation = findSection(payload.pageSchema, 'product_recommendation');

    expect(payload).toMatchObject({
      sourceType: 'product',
      sourceId: 101,
      title: 'Hydra Serum Member Offer',
      runtimeType: 'h5',
      shareTitle: 'Hydra Serum Member Offer',
      shareDescription: 'Invite members to ask consultants about the serum.',
      shareImage: 'https://cdn.example.com/hydra-serum.png',
      aiGenerationId: 'ai-product-101',
      promptVersion: 'marketing-page.local-generator.v1',
    });
    expect(payload.activityId).toBeUndefined();
    expect(payload.pageSchema).toBe(draft.pageSchema);
    expect(payload.themeJson).toEqual(draft.pageSchema.theme);
    expect(recommendation.items).toEqual([
      expect.objectContaining({
        name: 'Hydra Serum',
        category: 'Skin Care',
        originalPrice: 299,
        activityPrice: 199,
      }),
    ]);
    expect(payload.snapshotJson).toMatchObject({
      sourceType: 'product',
      sourceId: 101,
      sourceName: 'Hydra Serum',
      sourceLabel: draft.sourceLabel,
      offer: 'Miniapp price 199',
      targetCustomers: 'Members with home care needs',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      storeName: 'Ami Aura West Lake',
      recommendedItems: [
        expect.objectContaining({
          type: 'product',
          id: 101,
          name: 'Hydra Serum',
          category: 'Skin Care',
          price: 299,
          activityPrice: 199,
        }),
      ],
    });
    expect(buildMarketingActivityPayloadFromPageDraft(draft, 'published').status).toBe('active');
    expect(buildMarketingActivityPayloadFromPageDraft(draft, 'draft').status).toBe('draft');
  });

  it('builds a publish-ready MarketingPage payload from a project draft', () => {
    const project: Project = {
      id: 202,
      name: 'Hydra Facial Care',
      type: 'Facial',
      duration: 60,
      price: 399,
      storeName: 'Ami Aura West Lake',
      recommend: true,
      online: true,
      home: false,
      status: true,
      sort: 1,
      image: 'https://cdn.example.com/hydra-facial.png',
    };

    const draft = buildProjectMarketingPageDraft(project, {
      title: 'Hydra Facial Booking',
      description: 'Book a consultant-confirmed facial care session.',
      offer: 'Book now for 399',
      targetCustomers: 'Members who need a facial booking',
      startDate: '2026-06-05',
      endDate: '2026-07-05',
      storePhone: '0571-66666666',
      storeAddress: 'West Lake Road 2',
      aiGenerationId: 'ai-project-202',
    });
    const payload = buildMarketingPagePayloadFromPageDraft(draft);
    const recommendation = findSection(payload.pageSchema, 'project_recommendation');

    expect(payload).toMatchObject({
      sourceType: 'project',
      sourceId: 202,
      title: 'Hydra Facial Booking',
      runtimeType: 'h5',
      shareTitle: 'Hydra Facial Booking',
      shareDescription: 'Book a consultant-confirmed facial care session.',
      shareImage: 'https://cdn.example.com/hydra-facial.png',
      aiGenerationId: 'ai-project-202',
      promptVersion: 'marketing-page.local-generator.v1',
    });
    expect(payload.activityId).toBeUndefined();
    expect(payload.pageSchema).toBe(draft.pageSchema);
    expect(payload.pageSchema.cta.action).toBe('book');
    expect(payload.themeJson).toEqual(draft.pageSchema.theme);
    expect(recommendation.items).toEqual([
      expect.objectContaining({
        name: 'Hydra Facial Care',
        originalPrice: 399,
        activityPrice: 399,
      }),
    ]);
    expect(payload.snapshotJson).toMatchObject({
      sourceType: 'project',
      sourceId: 202,
      sourceName: 'Hydra Facial Care',
      sourceLabel: draft.sourceLabel,
      offer: 'Book now for 399',
      targetCustomers: 'Members who need a facial booking',
      startDate: '2026-06-05',
      endDate: '2026-07-05',
      storeName: 'Ami Aura West Lake',
      recommendedItems: [
        expect.objectContaining({
          type: 'project',
          id: 202,
          name: 'Hydra Facial Care',
          category: 'Facial',
          price: 399,
          activityPrice: 399,
        }),
      ],
    });
  });

  it('builds a publish-ready MarketingPage payload from an activity schema', () => {
    const selectedProjects: ActivityMarketingPageItem[] = [
      {
        id: 301,
        name: 'Brightening Facial',
        type: 'Facial',
        price: 299,
        description: 'A consultant-confirmed brightening care session.',
      },
    ];
    const selectedProducts: ActivityMarketingPageItem[] = [
      {
        id: 401,
        name: 'Repair Mask',
        category: 'Mask',
        price: 129,
        description: 'Home care mask for post-service repair.',
      },
    ];
    const activity: MarketingActivity = {
      id: 303,
      title: 'June Hydration Campaign',
      description: 'Hydration benefits for selected members.',
      image: 'https://cdn.example.com/june-campaign.png',
      status: 'active' as MarketingActivity['status'],
      participants: 0,
      conversion: '0%',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      targetCustomers: 'VIP hydration members',
      discount: 'Claim hydration benefits',
      source: 'manual' as MarketingActivity['source'],
      aiGenerationId: 'ai-activity-303',
    };
    const pageSchema = buildMarketingActivityPageSchema({
      title: activity.title,
      description: activity.description,
      activityType: 'member campaign',
      offer: activity.discount,
      targetCustomers: activity.targetCustomers,
      startDate: activity.startDate,
      endDate: activity.endDate,
      posterImage: activity.image,
      selectedProjects,
      selectedProducts,
      storeName: 'Ami Aura West Lake',
      storePhone: '0571-99999999',
      storeAddress: 'West Lake Road 3',
    });

    const payload = buildMarketingPagePayloadFromActivity(activity, {
      pageSchema,
      activityType: 'member campaign',
      selectedProjects,
      selectedProducts,
      selectedChannels: ['miniapp', 'wechat_group'],
      posterImage: 'https://cdn.example.com/june-campaign-share.png',
      offerJson: { type: 'gift', label: 'Hydration gift' },
      audienceSnapshotJson: { totalCustomers: 48, customerIds: [1, 2, 3] },
      recommendedItemsJson: [{ type: 'project', id: 301, name: 'Brightening Facial' }],
      sourceSignalsJson: { trigger: 'member_level' },
    });

    expect(payload).toMatchObject({
      activityId: 303,
      sourceType: 'activity',
      sourceId: 303,
      title: 'June Hydration Campaign',
      runtimeType: 'h5',
      pageSchema,
      themeJson: pageSchema.theme,
      shareTitle: 'June Hydration Campaign',
      shareDescription: 'Hydration benefits for selected members.',
      shareImage: 'https://cdn.example.com/june-campaign-share.png',
      aiGenerationId: 'ai-activity-303',
      promptVersion: 'marketing-page.activity-generator.v1',
    });
    expect(findSection(payload.pageSchema, 'project_recommendation').items).toHaveLength(1);
    expect(findSection(payload.pageSchema, 'product_recommendation').items).toHaveLength(1);
    expect(payload.snapshotJson).toMatchObject({
      sourceType: 'activity',
      activityId: 303,
      activityType: 'member campaign',
      title: 'June Hydration Campaign',
      description: 'Hydration benefits for selected members.',
      offer: 'Claim hydration benefits',
      targetCustomers: 'VIP hydration members',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      selectedChannels: ['miniapp', 'wechat_group'],
      selectedProjects,
      selectedProducts,
      offerJson: { type: 'gift', label: 'Hydration gift' },
      audienceSnapshotJson: { totalCustomers: 48, customerIds: [1, 2, 3] },
      recommendedItemsJson: [{ type: 'project', id: 301, name: 'Brightening Facial' }],
      sourceSignalsJson: { trigger: 'member_level' },
      recommendedItems: [
        expect.objectContaining({
          type: 'project',
          id: 301,
          name: 'Brightening Facial',
          category: 'Facial',
          price: 299,
          activityPrice: 299,
        }),
        expect.objectContaining({
          type: 'product',
          id: 401,
          name: 'Repair Mask',
          category: 'Mask',
          price: 129,
          activityPrice: 129,
        }),
      ],
    });
  });
});
