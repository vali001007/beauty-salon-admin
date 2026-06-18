import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateActivityPage } from '@/api/ai';
import { createMarketingPage, publishMarketingPage } from '@/api/marketingPage';
import type { ActivityPageSchema, Product } from '@/types';
import { MarketingPageGeneratorDialog } from './MarketingPageGeneratorDialog';

vi.mock('@/api/ai', () => ({
  generateActivityPage: vi.fn(),
}));

vi.mock('@/api/marketingPage', () => ({
  createMarketingPage: vi.fn(),
  publishMarketingPage: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function createSchema(title: string, tone: ActivityPageSchema['theme']['tone']): ActivityPageSchema {
  return {
    schemaVersion: '1.0',
    title,
    subtitle: `${title} description`,
    audienceLabel: `${title} audience`,
    theme: {
      tone,
      primaryColor: '#2563eb',
      backgroundColor: '#eff6ff',
    },
    sections: [
      {
        type: 'hero',
        badge: 'AI',
        title,
        description: `${title} hero`,
      },
      {
        type: 'offer',
        title: 'Offer',
        offer: `${title} offer`,
      },
    ],
    cta: {
      text: 'Book now',
      action: 'book',
    },
    safety: {
      customerFacing: true,
      blocked: false,
      reasons: [],
    },
  };
}

describe('MarketingPageGeneratorDialog AI generation', () => {
  const product = {
    id: 101,
    storeId: 1,
    storeName: 'Ami Aura',
    name: 'Hydra Serum',
    sku: 'SKU-101',
    brand: 'Ami Aura',
    spec: '30ml',
    unit: 'bottle',
    costPrice: 88,
    retailPrice: 299,
    salePrice: 199,
    shelfLife: 365,
    categoryId: 1,
    categoryName: 'Skin Care',
    supplier: 'Ami Lab',
    minPurchaseQty: 1,
    status: 'active',
  } as unknown as Product;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createMarketingPage).mockResolvedValue({
      id: 900,
      sourceType: 'product',
      title: 'AI Premium Page',
      slug: 'mp-product-101',
      runtimeType: 'h5',
      pageSchema: createSchema('AI Premium Page', 'premium'),
      status: 'draft',
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T00:00:00.000Z',
    });
    vi.mocked(publishMarketingPage).mockResolvedValue({
      id: 900,
      sourceType: 'product',
      title: 'AI Premium Page',
      slug: 'mp-product-101',
      runtimeType: 'h5',
      pageSchema: createSchema('AI Premium Page', 'premium'),
      status: 'published',
      shareUrl: 'https://mini.ami-core.com/page/mp-product-101',
      createdAt: '2026-06-07T00:00:00.000Z',
      updatedAt: '2026-06-07T00:00:00.000Z',
    });
  });

  it('applies AI variants and publishes the selected AI schema', async () => {
    vi.mocked(generateActivityPage).mockResolvedValue({
      id: 'ai-page-101',
      scenario: 'activity_page',
      text: 'AI generated page',
      pageSchema: createSchema('AI Warm Page', 'warm'),
      pageVariants: [
        { id: 'warm', name: '温和关怀版', pageSchema: createSchema('AI Warm Page', 'warm'), reasonTags: [] },
        { id: 'premium', name: '专业权益版', pageSchema: createSchema('AI Premium Page', 'premium'), reasonTags: [] },
      ],
      safety: { masked: false, blocked: false, reasons: [] },
      usage: { provider: 'mock', model: 'mock', inputTokens: 1, outputTokens: 1 },
    });

    render(
      <MarketingPageGeneratorDialog
        source={{ type: 'product', item: product, storeName: 'Ami Aura', storePhone: '0571-88888888' }}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /AI 生成/ }));

    expect(await screen.findByDisplayValue('AI Warm Page')).toBeInTheDocument();
    expect(screen.getByDisplayValue('AI Warm Page offer')).toBeInTheDocument();
    expect(generateActivityPage).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignName: expect.any(String),
        productNames: ['Hydra Serum'],
        storeName: 'Ami Aura',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '专业权益版' }));
    expect(await screen.findByDisplayValue('AI Premium Page')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '发布推广页' }));

    await waitFor(() => expect(createMarketingPage).toHaveBeenCalled());
    expect(createMarketingPage).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'product',
        sourceId: 101,
        title: 'AI Premium Page',
        aiGenerationId: 'ai-page-101',
        pageSchema: expect.objectContaining({
          title: 'AI Premium Page',
          theme: expect.objectContaining({ tone: 'premium' }),
        }),
        snapshotJson: expect.objectContaining({
          sourceType: 'product',
          sourceId: 101,
        }),
      }),
    );
    expect(publishMarketingPage).toHaveBeenCalledWith(900);
  });
});
