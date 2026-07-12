import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';

type PageQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  sourceType?: string;
  storeId?: number;
};

type MarketingPageDto = {
  storeId?: number;
  activityId?: number;
  sourceType: string;
  sourceId?: string | number;
  title: string;
  slug?: string;
  runtimeType?: string;
  pageSchema: Record<string, unknown>;
  snapshotJson?: Record<string, unknown>;
  themeJson?: Record<string, unknown>;
  shareTitle?: string;
  shareDescription?: string;
  shareImage?: string;
  aiGenerationId?: string;
  promptVersion?: string;
};

type PublicEventDto = {
  customerId?: number;
  sessionId?: string;
  openId?: string;
  eventType: string;
  channel?: string;
  referrer?: string;
  staffId?: number;
  campaignId?: string;
  source?: string;
  medium?: string;
  metadataJson?: Record<string, unknown>;
  occurredAt?: string;
};

type PublicLeadDto = {
  customerId?: number;
  sessionId?: string;
  openId?: string;
  name?: string;
  phone: string;
  intentType?: string;
  message?: string;
  channel?: string;
  referrer?: string;
  staffId?: number;
  campaignId?: string;
  source?: string;
  medium?: string;
  metadataJson?: Record<string, unknown>;
};

type RequestMeta = {
  ip?: string;
  userAgent?: string;
};

const EVENT_TYPES = new Set(['view', 'share', 'click_cta', 'lead_submit', 'book', 'coupon_claim']);
const PUBLIC_SCHEMA_SENSITIVE_KEYS = new Set([
  'aiGenerationId',
  'aiUsage',
  'costPrice',
  'createdBy',
  'deletedBy',
  'estimatedCost',
  'featureJson',
  'grossMargin',
  'inputTokens',
  'internalCost',
  'ltv',
  'ltv12m',
  'ltv6m',
  'ltvTier',
  'margin',
  'matchScore',
  'model',
  'outputTokens',
  'predictionSnapshotId',
  'profit',
  'profitMargin',
  'prompt',
  'promptTemplateVersion',
  'promptVersion',
  'purchasePrice',
  'reasonJson',
  'recommendedActionsJson',
  'repurchase30dScore',
  'score',
  'sourceRecommendationId',
  'supplier',
  'systemPrompt',
  'targetCustomerIds',
  'tokens',
  'triggerReasons',
  'updatedBy',
  'usage',
  'userPrompt',
  'wholesalePrice',
]);
const PUBLIC_METADATA_PRIVATE_KEYS = new Set([
  'address',
  'contact',
  'email',
  'idCard',
  'idcard',
  'identityCard',
  'ip',
  'mobile',
  'name',
  'phone',
  'phoneNumber',
  'realName',
  'tel',
  'telephone',
  'wechat',
  'wechatId',
]);

type PageEffectSummary = {
  pv: number;
  uv: number;
  leadCount: number;
  bookingCount: number;
  attributionCount: number;
  attributedRevenue: number;
};

@Injectable()
export class MarketingPagesService {
  constructor(private prisma: PrismaService) {}

  private get pageDelegate() {
    return (this.prisma as any).marketingPage;
  }

  private get versionDelegate() {
    return (this.prisma as any).marketingPageVersion;
  }

  private get eventDelegate() {
    return (this.prisma as any).marketingPageEvent;
  }

  private get leadDelegate() {
    return (this.prisma as any).marketingPageLead;
  }

  private get attributionDelegate() {
    return (this.prisma as any).marketingPageAttribution ?? { findMany: async () => [] };
  }

  private getShareBaseUrl() {
    return (
      process.env.MARKETING_SHARE_BASE_URL ||
      process.env.VITE_MARKETING_SHARE_BASE_URL ||
      'http://127.0.0.1:5177'
    ).replace(/\/+$/, '');
  }

  private buildShareUrl(slug: string) {
    return `${this.getShareBaseUrl()}/page/${slug}`;
  }

  private normalizeShareUrl(value?: string | null, slug?: string) {
    if (!value) return slug ? this.buildShareUrl(slug) : '';
    try {
      const url = new URL(value);
      const shouldRewriteToMarketingH5 =
        url.hostname === 'mini.ami-core.com' ||
        ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && ['5175', '5176'].includes(url.port));
      if (shouldRewriteToMarketingH5) {
        const baseUrl = new URL(this.getShareBaseUrl());
        url.protocol = baseUrl.protocol;
        url.host = baseUrl.host;
      }
      return url.toString();
    } catch {
      return value;
    }
  }

  private withNormalizedShareUrl<T extends { shareUrl?: string | null; slug?: string | null }>(page: T) {
    return {
      ...page,
      shareUrl: this.normalizeShareUrl(page.shareUrl, page.slug ?? undefined),
    };
  }

  private buildMiniappPath(slug: string) {
    return `/pages/marketing/page?slug=${encodeURIComponent(slug)}`;
  }

  private normalizeSourceId(value?: string | number) {
    return value === undefined || value === null || value === '' ? undefined : String(value);
  }

  private normalizeJson<T>(value: T | undefined) {
    return value === undefined ? undefined : value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private isPublicSchemaSensitiveKey(key: string) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (PUBLIC_SCHEMA_SENSITIVE_KEYS.has(key)) return true;

    const normalized = key.replace(/[-_\s]+/g, '').toLowerCase();
    if ([...PUBLIC_SCHEMA_SENSITIVE_KEYS].some((sensitiveKey) => sensitiveKey.toLowerCase() === normalized)) {
      return true;
    }

    if (/^id$/i.test(key) || /(?:Id|ID|Ids|IDs)$/.test(key) || /(?:^|[-_\s])(id|ids)$/i.test(key)) {
      return true;
    }

    return (
      normalized.startsWith('internal') ||
      normalized.startsWith('private') ||
      normalized.startsWith('admin') ||
      normalized.includes('backend') ||
      normalized.includes('cost') ||
      normalized.includes('margin') ||
      normalized.includes('supplier') ||
      normalized.includes('prompt')
    );
  }

  private sanitizePublicSafety(value: Record<string, unknown>) {
    return {
      ...(typeof value.customerFacing === 'boolean' ? { customerFacing: value.customerFacing } : {}),
      ...(typeof value.blocked === 'boolean' ? { blocked: value.blocked } : {}),
    };
  }

  private sanitizePublicSchemaValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizePublicSchemaValue(item));
    }
    if (!this.isRecord(value)) {
      return value;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(value)) {
      if (this.isPublicSchemaSensitiveKey(key)) continue;
      if (key === 'safety' && this.isRecord(rawValue)) {
        sanitized[key] = this.sanitizePublicSafety(rawValue);
        continue;
      }
      sanitized[key] = this.sanitizePublicSchemaValue(rawValue);
    }
    return sanitized;
  }

  private isPublicMetadataPrivateKey(key: string) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (PUBLIC_METADATA_PRIVATE_KEYS.has(key)) return true;
    const normalized = key.replace(/[-_\s]+/g, '').toLowerCase();
    return (
      PUBLIC_METADATA_PRIVATE_KEYS.has(normalized) ||
      normalized.includes('phone') ||
      normalized.includes('mobile') ||
      normalized.includes('telephone') ||
      normalized.includes('idcard') ||
      normalized.includes('identitycard') ||
      normalized.includes('realname') ||
      normalized === 'ip' ||
      normalized.endsWith('ip')
    );
  }

  private sanitizePublicMetadata(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizePublicMetadata(item));
    }
    if (!this.isRecord(value)) {
      return value;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, rawValue] of Object.entries(value)) {
      if (this.isPublicMetadataPrivateKey(key)) continue;
      sanitized[key] = this.sanitizePublicMetadata(rawValue);
    }
    return sanitized;
  }

  private createSlug(sourceType: string, sourceId?: string | number) {
    const source = String(sourceType || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const idPart = this.normalizeSourceId(sourceId) ?? Date.now().toString(36);
    const suffix = randomBytes(4).toString('hex');
    return `mp-${source || 'page'}-${String(idPart).replace(/[^a-zA-Z0-9_-]+/g, '-')}-${suffix}`;
  }

  private hashIp(ip?: string) {
    if (!ip) return undefined;
    return createHash('sha256').update(ip).digest('hex').slice(0, 32);
  }

  private normalizePageData(dto: Partial<MarketingPageDto>) {
    const data: any = {};
    const stringFields = [
      'title',
      'runtimeType',
      'shareTitle',
      'shareDescription',
      'shareImage',
      'aiGenerationId',
      'promptVersion',
    ];
    for (const field of stringFields) {
      if ((dto as any)[field] !== undefined) data[field] = (dto as any)[field];
    }
    if (dto.storeId !== undefined) data.storeId = dto.storeId ? Number(dto.storeId) : null;
    if (dto.activityId !== undefined) data.activityId = dto.activityId ? Number(dto.activityId) : null;
    if (dto.sourceType !== undefined) data.sourceType = dto.sourceType;
    if (dto.sourceId !== undefined) data.sourceId = this.normalizeSourceId(dto.sourceId);
    if (dto.pageSchema !== undefined) data.pageSchema = this.normalizeJson(dto.pageSchema);
    if (dto.snapshotJson !== undefined) data.snapshotJson = this.normalizeJson(dto.snapshotJson);
    if (dto.themeJson !== undefined) data.themeJson = this.normalizeJson(dto.themeJson);
    return data;
  }

  private emptyEffectSummary(): PageEffectSummary & { uvSessions: Set<string> } {
    return {
      pv: 0,
      uv: 0,
      leadCount: 0,
      bookingCount: 0,
      attributionCount: 0,
      attributedRevenue: 0,
      uvSessions: new Set<string>(),
    };
  }

  private async buildListEffectSummaries(pageIds: number[]) {
    const summaries = new Map<number, PageEffectSummary & { uvSessions: Set<string> }>();
    pageIds.forEach((id) => summaries.set(id, this.emptyEffectSummary()));
    if (!pageIds.length) return new Map<number, PageEffectSummary>();

    const [events, leads, attributions] = await Promise.all([
      this.eventDelegate.findMany({
        where: { pageId: { in: pageIds } },
        select: { id: true, pageId: true, sessionId: true, eventType: true },
      }),
      this.leadDelegate.findMany({
        where: { pageId: { in: pageIds } },
        select: { pageId: true, intentType: true },
      }),
      this.attributionDelegate.findMany({
        where: { pageId: { in: pageIds } },
        select: { pageId: true, attributedRevenue: true },
      }),
    ]);

    const fallbackBookingEvents = new Map<number, number>();
    for (const event of events) {
      const stats = summaries.get(event.pageId);
      if (!stats) continue;
      if (event.eventType === 'view') stats.pv += 1;
      stats.uvSessions.add(event.sessionId || `event-${event.id}`);
      if (event.eventType === 'book') {
        fallbackBookingEvents.set(event.pageId, (fallbackBookingEvents.get(event.pageId) ?? 0) + 1);
      }
    }

    const bookingLeads = new Map<number, number>();
    for (const lead of leads) {
      const stats = summaries.get(lead.pageId);
      if (!stats) continue;
      stats.leadCount += 1;
      if (lead.intentType === 'book') {
        bookingLeads.set(lead.pageId, (bookingLeads.get(lead.pageId) ?? 0) + 1);
      }
    }

    for (const attribution of attributions) {
      const stats = summaries.get(attribution.pageId);
      if (!stats) continue;
      stats.attributionCount += 1;
      stats.attributedRevenue += Number(attribution.attributedRevenue || 0);
    }

    const result = new Map<number, PageEffectSummary>();
    for (const [pageId, stats] of summaries.entries()) {
      const bookingCount = bookingLeads.get(pageId) ?? fallbackBookingEvents.get(pageId) ?? 0;
      result.set(pageId, {
        pv: stats.pv,
        uv: stats.uvSessions.size,
        leadCount: stats.leadCount,
        bookingCount,
        attributionCount: stats.attributionCount,
        attributedRevenue: stats.attributedRevenue,
      });
    }
    return result;
  }

  async findPages(query: PageQuery = {}) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 20) || 20));
    const { keyword, status, sourceType, storeId } = query;
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (sourceType && sourceType !== 'all') where.sourceType = sourceType;
    if (storeId) where.storeId = Number(storeId);
    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { slug: { contains: keyword, mode: 'insensitive' } },
        { sourceId: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.pageDelegate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.pageDelegate.count({ where }),
    ]);

    const effectSummaries = await this.buildListEffectSummaries(items.map((item: any) => item.id));
    const enrichedItems = items.map((item: any) => ({
      ...this.withNormalizedShareUrl(item),
      effectSummary: effectSummaries.get(item.id) ?? {
        pv: 0,
        uv: 0,
        leadCount: 0,
        bookingCount: 0,
        attributionCount: 0,
        attributedRevenue: 0,
      },
    }));

    return { items: enrichedItems, data: enrichedItems, total, page, pageSize };
  }

  async getPage(id: number) {
    const page = await this.pageDelegate.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('营销页面不存在');
    return this.withNormalizedShareUrl(page);
  }

  async createPage(dto: MarketingPageDto, createdBy?: number) {
    if (!dto.title?.trim()) throw new BadRequestException('页面标题不能为空');
    if (!dto.sourceType?.trim()) throw new BadRequestException('来源类型不能为空');
    if (!dto.pageSchema) throw new BadRequestException('页面 Schema 不能为空');
    if (dto.activityId) {
      if (!dto.storeId) throw new BadRequestException('活动营销页必须指定门店');
      const activity = await this.prisma.marketingActivity.findFirst({ where: { id: Number(dto.activityId), storeId: Number(dto.storeId) }, select: { id: true } });
      if (!activity) throw new BadRequestException('营销活动不存在或不属于当前门店');
    }
    const slug = dto.slug || this.createSlug(dto.sourceType, dto.sourceId);
    const shareUrl = this.buildShareUrl(slug);

    return this.pageDelegate.create({
      data: {
        ...this.normalizePageData(dto),
        slug,
        status: 'draft',
        shareUrl,
        miniappPath: this.buildMiniappPath(slug),
        createdBy,
      },
    });
  }

  async updatePage(id: number, dto: Partial<MarketingPageDto>) {
    await this.getPage(id);
    return this.pageDelegate.update({
      where: { id },
      data: this.normalizePageData(dto),
    });
  }

  async publishPage(id: number, userId?: number) {
    const page = await this.getPage(id);
    const latest = await this.versionDelegate.findFirst({
      where: { pageId: id },
      orderBy: { version: 'desc' },
    });
    const nextVersion = Number(latest?.version ?? 0) + 1;
    await this.versionDelegate.create({
      data: {
        pageId: id,
        version: nextVersion,
        pageSchema: page.pageSchema,
        snapshotJson: page.snapshotJson,
        changeSummary: page.status === 'published' ? '重新发布' : '首次发布',
        aiGenerationId: page.aiGenerationId,
        createdBy: userId,
      },
    });

    return this.pageDelegate.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: new Date(),
        offlineAt: null,
        shareUrl: this.normalizeShareUrl(page.shareUrl, page.slug),
        miniappPath: page.miniappPath || this.buildMiniappPath(page.slug),
      },
    });
  }

  async offlinePage(id: number) {
    await this.getPage(id);
    return this.pageDelegate.update({
      where: { id },
      data: { status: 'offline', offlineAt: new Date() },
    });
  }

  async duplicatePage(id: number, userId?: number) {
    const page = await this.getPage(id);
    const slug = this.createSlug(page.sourceType, page.sourceId);
    return this.pageDelegate.create({
      data: {
        storeId: page.storeId,
        activityId: page.activityId,
        sourceType: page.sourceType,
        sourceId: page.sourceId,
        title: `${page.title} 副本`,
        slug,
        runtimeType: page.runtimeType,
        pageSchema: page.pageSchema,
        snapshotJson: page.snapshotJson,
        themeJson: page.themeJson,
        shareTitle: page.shareTitle,
        shareDescription: page.shareDescription,
        shareImage: page.shareImage,
        status: 'draft',
        shareUrl: this.buildShareUrl(slug),
        miniappPath: this.buildMiniappPath(slug),
        aiGenerationId: page.aiGenerationId,
        promptVersion: page.promptVersion,
        createdBy: userId,
      },
    });
  }

  private async getPublishedPageRecord(slug: string) {
    const page = await this.pageDelegate.findUnique({ where: { slug } });
    if (!page || page.status !== 'published') {
      throw new NotFoundException('页面不存在或已下线');
    }
    return page;
  }

  async getPublicPage(slug: string) {
    const page = await this.getPublishedPageRecord(slug);
    return {
      slug: page.slug,
      title: page.title,
      pageSchema: this.sanitizePublicSchemaValue(page.pageSchema),
      shareTitle: page.shareTitle || page.title,
      shareDescription: page.shareDescription,
      shareImage: page.shareImage,
      shareUrl: this.normalizeShareUrl(page.shareUrl, page.slug),
      miniappPath: page.miniappPath,
      publishedAt: page.publishedAt,
    };
  }

  async recordPublicEvent(slug: string, dto: PublicEventDto, requestMeta: { ip?: string; userAgent?: string } = {}) {
    const page = await this.getPublishedPageRecord(slug);
    const eventType = dto.eventType || 'view';
    if (!EVENT_TYPES.has(eventType)) throw new BadRequestException('不支持的事件类型');
    await this.eventDelegate.create({
      data: {
        pageId: page.id,
        storeId: page.storeId,
        customerId: dto.customerId ? Number(dto.customerId) : null,
        sessionId: dto.sessionId,
        openId: dto.openId,
        eventType,
        channel: dto.channel,
        referrer: dto.referrer,
        staffId: dto.staffId ? Number(dto.staffId) : null,
        campaignId: dto.campaignId,
        source: dto.source,
        medium: dto.medium,
        userAgent: requestMeta.userAgent,
        ipHash: this.hashIp(requestMeta.ip),
        metadataJson: this.sanitizePublicMetadata(dto.metadataJson),
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
    });
    return { ok: true };
  }

  private async assertLeadNotDuplicated(pageId: number, phone: string, dto: PublicLeadDto, requestMeta: RequestMeta = {}) {
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const duplicateFilters: any[] = [{ phone }];
    if (dto.sessionId) {
      duplicateFilters.push({ sessionId: dto.sessionId });
    }
    const ipHash = this.hashIp(requestMeta.ip);
    if (ipHash) {
      duplicateFilters.push({ metadataJson: { path: ['ipHash'], equals: ipHash } });
    }
    const duplicate = await this.leadDelegate.findMany({
      where: {
        pageId,
        createdAt: { gte: since },
        OR: duplicateFilters,
      },
      select: { id: true },
      take: 1,
    });
    if (duplicate.length) {
      throw new BadRequestException('提交过于频繁，请稍后再试');
    }
    return ipHash;
  }

  private async matchCustomerIdByPhone(phone: string, storeId?: number | null) {
    if (!phone) return null;
    const where: Record<string, unknown> = {
      phone,
      deletedAt: null,
    };
    if (storeId) where.storeId = Number(storeId);
    const customerDelegate = (this.prisma as any).customer;
    if (!customerDelegate?.findFirst) return null;
    const customer = await customerDelegate.findFirst({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return customer?.id ?? null;
  }

  async submitLead(slug: string, dto: PublicLeadDto, requestMeta: RequestMeta = {}) {
    const page = await this.getPublishedPageRecord(slug);
    const phone = String(dto.phone || '').trim();
    if (!/^1\d{10}$/.test(phone) && !/^\+?\d{6,20}$/.test(phone)) {
      throw new BadRequestException('手机号格式不正确');
    }
    const ipHash = await this.assertLeadNotDuplicated(page.id, phone, dto, requestMeta);
    const matchedCustomerId =
      dto.customerId ? Number(dto.customerId) : await this.matchCustomerIdByPhone(phone, page.storeId);
    const attributionMetadata = {
      ...(dto.openId ? { openId: dto.openId } : {}),
      ...(dto.referrer ? { referrer: dto.referrer } : {}),
      ...(dto.campaignId ? { campaignId: dto.campaignId } : {}),
      ...(dto.source ? { source: dto.source } : {}),
      ...(dto.medium ? { medium: dto.medium } : {}),
    };
    const lead = await this.leadDelegate.create({
      data: {
        pageId: page.id,
        storeId: page.storeId,
        customerId: matchedCustomerId,
        sessionId: dto.sessionId,
        name: dto.name,
        phone,
        intentType: dto.intentType || 'consult',
        message: dto.message,
        channel: dto.channel,
        staffId: dto.staffId ? Number(dto.staffId) : null,
        metadataJson: {
          ...(this.sanitizePublicMetadata(dto.metadataJson) as Record<string, unknown> | undefined),
          ...attributionMetadata,
          ...(ipHash ? { ipHash } : {}),
          ...(requestMeta.userAgent ? { userAgent: requestMeta.userAgent } : {}),
        },
      },
    });
    await this.eventDelegate.create({
      data: {
        pageId: page.id,
        storeId: page.storeId,
        customerId: matchedCustomerId,
        sessionId: dto.sessionId,
        openId: dto.openId,
        eventType: dto.intentType === 'book' ? 'book' : 'lead_submit',
        channel: dto.channel,
        referrer: dto.referrer,
        staffId: dto.staffId ? Number(dto.staffId) : null,
        campaignId: dto.campaignId,
        source: dto.source,
        medium: dto.medium,
        userAgent: requestMeta.userAgent,
        ipHash,
        metadataJson: { leadId: lead.id, intentType: lead.intentType },
      },
    });
    return { ok: true, intentType: lead.intentType };
  }

  submitBooking(slug: string, dto: PublicLeadDto, requestMeta: RequestMeta = {}) {
    return this.submitLead(slug, { ...dto, intentType: 'book' }, requestMeta);
  }

  async getPageEffects(id: number) {
    await this.getPage(id);
    const [events, leads, attributions] = await Promise.all([
      this.eventDelegate.findMany({ where: { pageId: id }, orderBy: { occurredAt: 'asc' } }),
      this.leadDelegate.findMany({ where: { pageId: id }, orderBy: { createdAt: 'desc' } }),
      this.attributionDelegate.findMany({ where: { pageId: id }, select: { attributedRevenue: true } }),
    ]);
    const uniqueSessions = new Set(events.map((event: any) => event.sessionId || `event-${event.id}`));
    const byType = (type: string) => events.filter((event: any) => event.eventType === type).length;
    const channelMap = new Map<string, { channel: string; pv: number; uvSessions: Set<string>; leadCount: number; bookingCount: number }>();
    for (const event of events) {
      const channel = event.channel || 'direct';
      const stats = channelMap.get(channel) ?? { channel, pv: 0, uvSessions: new Set<string>(), leadCount: 0, bookingCount: 0 };
      if (event.eventType === 'view') stats.pv += 1;
      stats.uvSessions.add(event.sessionId || `event-${event.id}`);
      if (event.eventType === 'lead_submit') stats.leadCount += 1;
      if (event.eventType === 'book') stats.bookingCount += 1;
      channelMap.set(channel, stats);
    }
    const dailyMap = new Map<string, { date: string; pv: number; uvSessions: Set<string>; leadCount: number; bookingCount: number }>();
    for (const event of events) {
      const date = formatBusinessDate(event.occurredAt);
      const stats = dailyMap.get(date) ?? { date, pv: 0, uvSessions: new Set<string>(), leadCount: 0, bookingCount: 0 };
      if (event.eventType === 'view') stats.pv += 1;
      stats.uvSessions.add(event.sessionId || `event-${event.id}`);
      if (event.eventType === 'lead_submit') stats.leadCount += 1;
      if (event.eventType === 'book') stats.bookingCount += 1;
      dailyMap.set(date, stats);
    }

    const pv = byType('view');
    const leadCount = leads.length;
    const bookingLeadCount = leads.filter((lead: any) => lead.intentType === 'book').length;
    const attributedRevenue = attributions.reduce((sum: number, item: any) => sum + Number(item.attributedRevenue || 0), 0);
    return {
      pageId: id,
      pv,
      uv: uniqueSessions.size,
      shareCount: byType('share'),
      ctaClickCount: byType('click_cta'),
      leadCount,
      bookingCount: bookingLeadCount || byType('book'),
      attributionCount: attributions.length,
      attributedRevenue,
      conversionRate: pv ? `${Math.round((leadCount / pv) * 1000) / 10}%` : '0%',
      channelStats: Array.from(channelMap.values()).map((item) => ({
        channel: item.channel,
        pv: item.pv,
        uv: item.uvSessions.size,
        leadCount: item.leadCount,
        bookingCount: item.bookingCount,
      })),
      dailyTrend: Array.from(dailyMap.values()).map((item) => ({
        date: item.date,
        pv: item.pv,
        uv: item.uvSessions.size,
        leadCount: item.leadCount,
        bookingCount: item.bookingCount,
      })),
    };
  }

  async getPageEvents(id: number) {
    await this.getPage(id);
    return this.eventDelegate.findMany({ where: { pageId: id }, orderBy: { occurredAt: 'desc' }, take: 200 });
  }

  async getPageLeads(id: number) {
    await this.getPage(id);
    return this.leadDelegate.findMany({ where: { pageId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async getPageAttribution(pageId: number) {
    await this.getPage(pageId);
    const attributions = await this.attributionDelegate.findMany({
      where: { pageId },
      orderBy: { convertedAt: 'desc' },
      take: 100,
    });
    const totalRevenue = attributions.reduce(
      (sum: number, item: any) => sum + Number(item.attributedRevenue || 0),
      0,
    );

    return {
      pageId,
      attributionCount: attributions.length,
      totalRevenue,
      averageOrderValue: attributions.length ? totalRevenue / attributions.length : 0,
      attributions: attributions.map((item: any) => ({
        id: item.id,
        leadId: item.leadId,
        customerId: item.customerId,
        orderId: item.orderId,
        revenue: Number(item.attributedRevenue || 0),
        touchedAt: item.touchedAt,
        convertedAt: item.convertedAt,
        attributionType: item.attributionType,
        windowDays: item.attributionWindowDays,
      })),
    };
  }

  async getAttributionSummary(storeId?: number, startDate?: string, endDate?: string) {
    const where: any = {};
    if (storeId) {
      where.page = { storeId };
    }
    if (startDate || endDate) {
      where.convertedAt = {};
      if (startDate) where.convertedAt.gte = new Date(startDate);
      if (endDate) where.convertedAt.lte = new Date(endDate);
    }

    const attributions = await this.attributionDelegate.findMany({
      where,
      include: { page: { select: { id: true, title: true, sourceType: true } } },
    });
    const byPage = new Map<number, { title: string; sourceType: string; count: number; revenue: number }>();
    let totalRevenue = 0;

    for (const item of attributions) {
      const revenue = Number(item.attributedRevenue || 0);
      totalRevenue += revenue;
      const existing = byPage.get(item.pageId) ?? {
        title: item.page?.title ?? `页面 #${item.pageId}`,
        sourceType: item.page?.sourceType ?? 'unknown',
        count: 0,
        revenue: 0,
      };
      existing.count += 1;
      existing.revenue += revenue;
      byPage.set(item.pageId, existing);
    }

    return {
      totalAttributions: attributions.length,
      totalRevenue,
      byPage: Array.from(byPage.entries())
        .map(([pageId, data]) => ({ pageId, ...data }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  }
}
