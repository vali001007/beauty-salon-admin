import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketingPagesService } from './marketing-pages.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MarketingPagesService', () => {
  let service: MarketingPagesService;
  let prisma: jest.Mocked<any>;

  const now = new Date('2026-06-07T09:00:00.000Z');
  const basePage = {
    id: 1,
    storeId: 8,
    activityId: null,
    sourceType: 'product',
    sourceId: '101',
    title: '水光护理体验页',
    slug: 'mp-product-101',
    runtimeType: 'both',
    pageSchema: { schemaVersion: '1.0', sections: [] },
    snapshotJson: { price: 199 },
    themeJson: { primaryColor: '#2563eb' },
    shareTitle: '水光护理限时体验',
    shareDescription: '适合新客体验',
    shareImage: 'https://example.com/share.jpg',
    status: 'draft',
    shareUrl: 'https://mini.ami-core.com/page/mp-product-101',
    miniappPath: '/pages/marketing/page?slug=mp-product-101',
    aiGenerationId: 'ai-1',
    promptVersion: 'marketing-page.local-generator.v1',
    publishedAt: null,
    offlineAt: null,
    createdBy: 3,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(() => {
    prisma = {
      marketingPage: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketingPageVersion: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      marketingPageEvent: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      marketingPageLead: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      marketingPageAttribution: {
        findMany: jest.fn(),
      },
      customer: {
        findFirst: jest.fn(),
      },
    };
    service = new MarketingPagesService(prisma as unknown as PrismaService);
    process.env.MARKETING_SHARE_BASE_URL = 'https://share.ami.test/';
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.marketingPageAttribution.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.MARKETING_SHARE_BASE_URL;
  });

  describe('findPages', () => {
    it('returns paginated pages with filters', async () => {
      prisma.marketingPage.findMany.mockResolvedValue([basePage]);
      prisma.marketingPage.count.mockResolvedValue(1);
      prisma.marketingPageEvent.findMany.mockResolvedValue([
        { id: 1, pageId: 1, sessionId: 's-1', eventType: 'view' },
        { id: 2, pageId: 1, sessionId: 's-2', eventType: 'view' },
        { id: 3, pageId: 1, sessionId: 's-2', eventType: 'book' },
      ]);
      prisma.marketingPageLead.findMany.mockResolvedValue([{ pageId: 1, intentType: 'book' }]);
      prisma.marketingPageAttribution.findMany.mockResolvedValue([{ pageId: 1, attributedRevenue: 680 }]);

      const result = await service.findPages({
        page: 2,
        pageSize: 10,
        keyword: '水光',
        status: 'published',
        sourceType: 'product',
        storeId: 8,
      });

      const expectedPage = {
        ...basePage,
        shareUrl: 'https://share.ami.test/page/mp-product-101',
        effectSummary: { pv: 2, uv: 2, leadCount: 1, bookingCount: 1, attributionCount: 1, attributedRevenue: 680 },
      };
      expect(result).toEqual({ items: [expectedPage], data: [expectedPage], total: 1, page: 2, pageSize: 10 });
      expect(prisma.marketingPage.findMany).toHaveBeenCalledWith({
        where: {
          status: 'published',
          sourceType: 'product',
          storeId: 8,
          OR: [
            { title: { contains: '水光', mode: 'insensitive' } },
            { slug: { contains: '水光', mode: 'insensitive' } },
            { sourceId: { contains: '水光', mode: 'insensitive' } },
          ],
        },
        skip: 10,
        take: 10,
        orderBy: { updatedAt: 'desc' },
      });
      expect(prisma.marketingPageEvent.findMany).toHaveBeenCalledWith({
        where: { pageId: { in: [1] } },
        select: { id: true, pageId: true, sessionId: true, eventType: true },
      });
      expect(prisma.marketingPageAttribution.findMany).toHaveBeenCalledWith({
        where: { pageId: { in: [1] } },
        select: { pageId: true, attributedRevenue: true },
      });
    });
  });

  describe('createPage', () => {
    it('validates required fields', async () => {
      await expect(service.createPage({ title: '', sourceType: 'product', pageSchema: {} })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createPage({ title: '页面', sourceType: '', pageSchema: {} })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createPage({ title: '页面', sourceType: 'product', pageSchema: undefined as any })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a draft with share url and miniapp path', async () => {
      prisma.marketingPage.create.mockResolvedValue(basePage);

      const result = await service.createPage(
        {
          storeId: 8,
          sourceType: 'product',
          sourceId: 101,
          title: '水光护理体验页',
          slug: 'custom-slug',
          runtimeType: 'both',
          pageSchema: { sections: [] },
          snapshotJson: { price: 199 },
          themeJson: { primaryColor: '#2563eb' },
          shareTitle: '水光护理限时体验',
        },
        3,
      );

      expect(result).toBe(basePage);
      expect(prisma.marketingPage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: 8,
          sourceType: 'product',
          sourceId: '101',
          title: '水光护理体验页',
          slug: 'custom-slug',
          status: 'draft',
          shareUrl: 'https://share.ami.test/page/custom-slug',
          miniappPath: '/pages/marketing/page?slug=custom-slug',
          createdBy: 3,
        }),
      });
    });
  });

  describe('publishPage', () => {
    it('creates a new version and publishes the page', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue(basePage);
      prisma.marketingPageVersion.findFirst.mockResolvedValue({ version: 2 });
      prisma.marketingPageVersion.create.mockResolvedValue({ id: 12 });
      prisma.marketingPage.update.mockResolvedValue({ ...basePage, status: 'published' });

      await service.publishPage(1, 9);

      expect(prisma.marketingPageVersion.create).toHaveBeenCalledWith({
        data: {
          pageId: 1,
          version: 3,
          pageSchema: basePage.pageSchema,
          snapshotJson: basePage.snapshotJson,
          changeSummary: '首次发布',
          aiGenerationId: basePage.aiGenerationId,
          createdBy: 9,
        },
      });
      expect(prisma.marketingPage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'published',
          offlineAt: null,
          shareUrl: 'https://share.ami.test/page/mp-product-101',
          miniappPath: basePage.miniappPath,
        }),
      });
    });

    it('throws when the page does not exist', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue(null);

      await expect(service.publishPage(404, 9)).rejects.toThrow(NotFoundException);
      expect(prisma.marketingPageVersion.create).not.toHaveBeenCalled();
    });
  });

  describe('management actions', () => {
    it('updates editable page fields', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue(basePage);
      prisma.marketingPage.update.mockResolvedValue({ ...basePage, title: '更新后的页面' });

      await service.updatePage(1, {
        title: '更新后的页面',
        pageSchema: { schemaVersion: '1.0', sections: [] },
        shareDescription: '新的分享描述',
      });

      expect(prisma.marketingPage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          title: '更新后的页面',
          pageSchema: { schemaVersion: '1.0', sections: [] },
          shareDescription: '新的分享描述',
        }),
      });
    });

    it('marks a page offline', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue({ ...basePage, status: 'published' });
      prisma.marketingPage.update.mockResolvedValue({ ...basePage, status: 'offline' });

      await service.offlinePage(1);

      expect(prisma.marketingPage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'offline',
          offlineAt: expect.any(Date),
        }),
      });
    });

    it('duplicates a page as a new draft with a new slug', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue(basePage);
      prisma.marketingPage.create.mockResolvedValue({ ...basePage, id: 2, title: '水光护理体验页 副本' });

      await service.duplicatePage(1, 9);

      expect(prisma.marketingPage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          storeId: 8,
          sourceType: 'product',
          sourceId: '101',
          title: '水光护理体验页 副本',
          status: 'draft',
          shareUrl: expect.stringContaining('/page/'),
          miniappPath: expect.stringContaining('/pages/marketing/page?slug='),
          createdBy: 9,
        }),
      });
      expect(prisma.marketingPage.create.mock.calls[0][0].data.slug).not.toBe(basePage.slug);
    });

    it('returns recent events and leads for a page', async () => {
      const events = [{ id: 1, pageId: 1, eventType: 'view' }];
      const leads = [{ id: 2, pageId: 1, phone: '13800138000' }];
      prisma.marketingPage.findUnique.mockResolvedValue(basePage);
      prisma.marketingPageEvent.findMany.mockResolvedValue(events);
      prisma.marketingPageLead.findMany.mockResolvedValue(leads);

      await expect(service.getPageEvents(1)).resolves.toBe(events);
      await expect(service.getPageLeads(1)).resolves.toBe(leads);

      expect(prisma.marketingPageEvent.findMany).toHaveBeenCalledWith({
        where: { pageId: 1 },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      });
      expect(prisma.marketingPageLead.findMany).toHaveBeenCalledWith({
        where: { pageId: 1 },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    });
  });

  describe('public page and events', () => {
    it('returns only published public page payload', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue({ ...basePage, status: 'published', publishedAt: now });

      const result = await service.getPublicPage('mp-product-101');

      expect(result).toEqual({
        slug: 'mp-product-101',
        title: '水光护理体验页',
        pageSchema: basePage.pageSchema,
        shareTitle: '水光护理限时体验',
        shareDescription: '适合新客体验',
        shareImage: 'https://example.com/share.jpg',
        shareUrl: 'https://share.ami.test/page/mp-product-101',
        miniappPath: basePage.miniappPath,
        publishedAt: now,
      });
    });

    it('sanitizes internal fields from public page schema', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue({
        ...basePage,
        status: 'published',
        publishedAt: now,
        pageSchema: {
          schemaVersion: '1.0',
          title: 'Public page',
          sourceId: '101',
          promptVersion: 'internal-prompt-v1',
          safety: {
            customerFacing: true,
            blocked: false,
            reasons: ['internal review reason'],
          },
          sections: [
            {
              type: 'product_recommendation',
              title: 'Products',
              internalCost: 88,
              items: [
                {
                  id: 101,
                  productId: 101,
                  name: 'Hydration serum',
                  activityPrice: 199,
                  costPrice: 80,
                  supplier: 'Internal supplier',
                  matchScore: 96,
                  prompt: 'internal prompt',
                },
              ],
            },
          ],
        },
      });

      const result = await service.getPublicPage('mp-product-101');

      expect(result.pageSchema).toEqual({
        schemaVersion: '1.0',
        title: 'Public page',
        safety: {
          customerFacing: true,
          blocked: false,
        },
        sections: [
          {
            type: 'product_recommendation',
            title: 'Products',
            items: [
              {
                name: 'Hydration serum',
                activityPrice: 199,
              },
            ],
          },
        ],
      });
    });

    it('rejects unpublished pages', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue(basePage);

      await expect(service.getPublicPage('mp-product-101')).rejects.toThrow(NotFoundException);
    });

    it('records public event with channel attribution and hashed ip', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue({ ...basePage, status: 'published' });
      prisma.marketingPageEvent.create.mockResolvedValue({ id: 20 });

      await expect(service.recordPublicEvent(
        'mp-product-101',
        {
          customerId: 6,
          sessionId: 's-1',
          eventType: 'view',
          channel: 'wechat_group',
          staffId: 5,
          metadataJson: {
            ctaAction: 'book',
            phone: '13800138000',
            ip: '127.0.0.1',
            nested: { mobile: '13800138001', sectionType: 'hero' },
          },
          occurredAt: '2026-06-07T10:00:00.000Z',
        },
        { ip: '127.0.0.1', userAgent: 'Vitest' },
      )).resolves.toEqual({ ok: true });

      expect(prisma.marketingPageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pageId: 1,
          storeId: 8,
          customerId: 6,
          sessionId: 's-1',
          eventType: 'view',
          channel: 'wechat_group',
          staffId: 5,
          userAgent: 'Vitest',
          metadataJson: { ctaAction: 'book', nested: { sectionType: 'hero' } },
          occurredAt: new Date('2026-06-07T10:00:00.000Z'),
        }),
      });
      expect(prisma.marketingPageEvent.create.mock.calls[0][0].data.ipHash).toHaveLength(32);
    });

    it('rejects unsupported public event type', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue({ ...basePage, status: 'published' });

      await expect(
        service.recordPublicEvent('mp-product-101', { eventType: 'unknown' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('submitLead', () => {
    it('creates lead and corresponding submit event', async () => {
      const lead = { id: 30, intentType: 'consult' };
      prisma.marketingPage.findUnique.mockResolvedValue({ ...basePage, status: 'published' });
      prisma.customer.findFirst.mockResolvedValue({ id: 6 });
      prisma.marketingPageLead.findMany.mockResolvedValue([]);
      prisma.marketingPageLead.create.mockResolvedValue(lead);
      prisma.marketingPageEvent.create.mockResolvedValue({ id: 31 });

      const result = await service.submitLead('mp-product-101', {
        name: '王女士',
        phone: '13800138000',
        sessionId: 's-2',
        channel: 'poster',
        staffId: 4,
        campaignId: 'summer-hydration',
        source: 'wechat',
        medium: 'poster',
        metadataJson: {
          ctaAction: 'book',
          phone: '13800138000',
          realName: 'Internal name',
          nested: { telephone: '13800138001', sectionType: 'offer' },
        },
      }, { ip: '127.0.0.1', userAgent: 'Vitest' });

      expect(result).toEqual({ ok: true, intentType: 'consult' });
      expect(prisma.marketingPageLead.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          pageId: 1,
          OR: expect.arrayContaining([{ phone: '13800138000' }, { sessionId: 's-2' }]),
        }),
        select: { id: true },
        take: 1,
      });
      expect(prisma.marketingPageLead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pageId: 1,
          storeId: 8,
          customerId: 6,
          name: '王女士',
          phone: '13800138000',
          intentType: 'consult',
          channel: 'poster',
          staffId: 4,
          metadataJson: expect.objectContaining({
            campaignId: 'summer-hydration',
            source: 'wechat',
            medium: 'poster',
            userAgent: 'Vitest',
            ctaAction: 'book',
            nested: { sectionType: 'offer' },
          }),
        }),
      });
      expect(prisma.marketingPageLead.create.mock.calls[0][0].data.metadataJson.phone).toBeUndefined();
      expect(prisma.marketingPageLead.create.mock.calls[0][0].data.metadataJson.realName).toBeUndefined();
      expect(prisma.marketingPageLead.create.mock.calls[0][0].data.metadataJson.nested.telephone).toBeUndefined();
      expect(prisma.marketingPageLead.create.mock.calls[0][0].data.metadataJson.ipHash).toHaveLength(32);
      expect(prisma.marketingPageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pageId: 1,
          customerId: 6,
          eventType: 'lead_submit',
          campaignId: 'summer-hydration',
          source: 'wechat',
          medium: 'poster',
          userAgent: 'Vitest',
          metadataJson: { leadId: 30, intentType: 'consult' },
        }),
      });
    });

    it('creates booking lead through submitBooking', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue({ ...basePage, status: 'published' });
      prisma.marketingPageLead.findMany.mockResolvedValue([]);
      prisma.marketingPageLead.create.mockResolvedValue({ id: 32, intentType: 'book' });
      prisma.marketingPageEvent.create.mockResolvedValue({ id: 33 });

      await expect(service.submitBooking('mp-product-101', { phone: '+8613800138000' })).resolves.toEqual({
        ok: true,
        intentType: 'book',
      });

      expect(prisma.marketingPageLead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ intentType: 'book' }),
      });
      expect(prisma.marketingPageEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: 'book' }),
      });
    });

    it('rejects duplicate lead submissions in a short window', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue({ ...basePage, status: 'published' });
      prisma.marketingPageLead.findMany.mockResolvedValue([{ id: 99 }]);

      await expect(
        service.submitLead('mp-product-101', { phone: '13800138000', sessionId: 's-2' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.marketingPageLead.create).not.toHaveBeenCalled();
    });

    it('rejects invalid phone numbers', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue({ ...basePage, status: 'published' });

      await expect(service.submitLead('mp-product-101', { phone: '12345' })).rejects.toThrow(BadRequestException);
      expect(prisma.marketingPageLead.create).not.toHaveBeenCalled();
    });
  });

  describe('getPageEffects', () => {
    it('aggregates page effect metrics by channel and day', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue(basePage);
      prisma.marketingPageEvent.findMany.mockResolvedValue([
        {
          id: 1,
          eventType: 'view',
          sessionId: 's-1',
          channel: 'wechat_group',
          occurredAt: new Date('2026-06-07T08:00:00.000Z'),
        },
        {
          id: 2,
          eventType: 'view',
          sessionId: 's-1',
          channel: 'wechat_group',
          occurredAt: new Date('2026-06-07T08:05:00.000Z'),
        },
        {
          id: 3,
          eventType: 'share',
          sessionId: 's-2',
          channel: 'moments',
          occurredAt: new Date('2026-06-07T09:00:00.000Z'),
        },
        {
          id: 4,
          eventType: 'click_cta',
          sessionId: 's-3',
          channel: 'poster',
          occurredAt: new Date('2026-06-08T09:00:00.000Z'),
        },
        {
          id: 5,
          eventType: 'lead_submit',
          sessionId: 's-3',
          channel: 'poster',
          occurredAt: new Date('2026-06-08T09:10:00.000Z'),
        },
        {
          id: 6,
          eventType: 'book',
          sessionId: 's-4',
          channel: 'poster',
          occurredAt: new Date('2026-06-08T09:20:00.000Z'),
        },
      ]);
      prisma.marketingPageLead.findMany.mockResolvedValue([
        { id: 10, intentType: 'consult' },
        { id: 11, intentType: 'book' },
      ]);

      const result = await service.getPageEffects(1);

      expect(result).toMatchObject({
        pageId: 1,
        pv: 2,
        uv: 4,
        shareCount: 1,
        ctaClickCount: 1,
        leadCount: 2,
        bookingCount: 1,
        conversionRate: '100%',
      });
      expect(result.channelStats).toEqual([
        { channel: 'wechat_group', pv: 2, uv: 1, leadCount: 0, bookingCount: 0 },
        { channel: 'moments', pv: 0, uv: 1, leadCount: 0, bookingCount: 0 },
        { channel: 'poster', pv: 0, uv: 2, leadCount: 1, bookingCount: 1 },
      ]);
      expect(result.dailyTrend).toEqual([
        { date: '2026-06-07', pv: 2, uv: 2, leadCount: 0, bookingCount: 0 },
        { date: '2026-06-08', pv: 0, uv: 2, leadCount: 1, bookingCount: 1 },
      ]);
    });
  });

  describe('attribution analytics', () => {
    it('returns single page attribution metrics', async () => {
      prisma.marketingPage.findUnique.mockResolvedValue(basePage);
      prisma.marketingPageAttribution.findMany.mockResolvedValue([
        {
          id: 1,
          leadId: 30,
          pageId: 1,
          customerId: 6,
          orderId: 80,
          attributedRevenue: 680,
          touchedAt: new Date('2026-06-07T08:00:00.000Z'),
          convertedAt: new Date('2026-06-10T08:00:00.000Z'),
          attributionType: 'last_touch',
          attributionWindowDays: 30,
        },
      ]);

      await expect(service.getPageAttribution(1)).resolves.toEqual({
        pageId: 1,
        attributionCount: 1,
        totalRevenue: 680,
        averageOrderValue: 680,
        attributions: [
          {
            id: 1,
            leadId: 30,
            customerId: 6,
            orderId: 80,
            revenue: 680,
            touchedAt: new Date('2026-06-07T08:00:00.000Z'),
            convertedAt: new Date('2026-06-10T08:00:00.000Z'),
            attributionType: 'last_touch',
            windowDays: 30,
          },
        ],
      });
    });

    it('returns attribution summary grouped by page', async () => {
      prisma.marketingPageAttribution.findMany.mockResolvedValue([
        { pageId: 1, attributedRevenue: 680, page: { id: 1, title: 'A', sourceType: 'product' } },
        { pageId: 1, attributedRevenue: 320, page: { id: 1, title: 'A', sourceType: 'product' } },
        { pageId: 2, attributedRevenue: 199, page: { id: 2, title: 'B', sourceType: 'project' } },
      ]);

      await expect(service.getAttributionSummary(8, '2026-06-01', '2026-06-30')).resolves.toEqual({
        totalAttributions: 3,
        totalRevenue: 1199,
        byPage: [
          { pageId: 1, title: 'A', sourceType: 'product', count: 2, revenue: 1000 },
          { pageId: 2, title: 'B', sourceType: 'project', count: 1, revenue: 199 },
        ],
      });
      expect(prisma.marketingPageAttribution.findMany).toHaveBeenCalledWith({
        where: {
          page: { storeId: 8 },
          convertedAt: {
            gte: new Date('2026-06-01'),
            lte: new Date('2026-06-30'),
          },
        },
        include: { page: { select: { id: true, title: true, sourceType: true } } },
      });
    });
  });
});
