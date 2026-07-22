import { BadRequestException, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';
import {
  CustomerAppAdminDisplayConfigDto,
  CustomerAppAdminDisplayConfigQueryDto,
  CustomerAppAdminEventQueryDto,
  CustomerAppAdminUpdateDisplayConfigDto,
  CustomerAppAnalyzeSkinDto,
  CustomerAppAvailabilityQueryDto,
  CustomerAppBindPhoneDto,
  CustomerAppCreateReservationDto,
  CustomerAppEventDto,
  CustomerAppH5GuestDto,
  CustomerAppHomeQueryDto,
  CustomerAppPaginationDto,
  CustomerAppProjectQueryDto,
  CustomerAppWechatLoginDto,
} from './dto/index.js';
import type { CustomerAppTokenPayload } from './types.js';
import { MarketingEffectFactService } from '../marketing/attribution/marketing-effect-fact.service.js';
import { isMarketingFeatureEnabledForStore, MarketingFeatureFlagsService } from '../marketing/marketing-feature-flags.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';

@Injectable()
export class CustomerAppService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private aiService: AiService,
    @Optional() private readonly factService?: MarketingEffectFactService,
    @Optional() private readonly marketingFeatureFlags?: MarketingFeatureFlagsService,
    @Optional() private readonly reservationsService?: ReservationsService,
  ) {}

  async h5Guest(dto: CustomerAppH5GuestDto) {
    const storeId = dto.storeId ?? (await this.getDefaultStoreId());
    const openid = this.resolveH5GuestOpenid(dto.sessionId);
    const identity = await this.prisma.customerAppIdentity.upsert({
      where: { storeId_openid: { storeId, openid } },
      create: {
        storeId,
        openid,
        nickname: dto.nickname || 'H5客户',
        bindStatus: 'unbound',
        source: 'ami_glow_h5',
        lastLoginAt: new Date(),
      },
      update: {
        nickname: dto.nickname || 'H5客户',
        source: 'ami_glow_h5',
        lastLoginAt: new Date(),
      },
      include: { customer: { include: { store: true, healthProfile: true } } },
    });
    const customer = identity.customer;
    const payload = this.buildTokenPayload({
      openid,
      identityId: identity.id,
      customerId: customer?.id,
      storeId: customer?.storeId ?? storeId,
      phone: customer?.phone ?? undefined,
      nickname: identity.nickname ?? dto.nickname ?? 'H5客户',
      avatarUrl: identity.avatarUrl ?? undefined,
    });

    return {
      token: await this.signToken(payload),
      openid,
      bindStatus: customer ? 'bound' : 'unbound',
      customer: customer ? this.mapCustomer(customer) : null,
    };
  }

  async wechatLogin(dto: CustomerAppWechatLoginDto) {
    const openid = this.resolveDevelopmentOpenid(dto.code);
    const storeId = dto.storeId ?? (await this.getDefaultStoreId());
    const linkedCustomer = await this.findCustomerByWechatOrStore(openid, storeId);
    const identity = await this.prisma.customerAppIdentity.upsert({
      where: { storeId_openid: { storeId, openid } },
      create: {
        storeId,
        openid,
        nickname: dto.nickname,
        avatarUrl: dto.avatarUrl,
        customerId: linkedCustomer?.id,
        phone: linkedCustomer?.phone,
        bindStatus: linkedCustomer ? 'bound' : 'unbound',
        lastLoginAt: new Date(),
      },
      update: {
        nickname: dto.nickname,
        avatarUrl: dto.avatarUrl,
        lastLoginAt: new Date(),
        ...(linkedCustomer
          ? {
              customerId: linkedCustomer.id,
              phone: linkedCustomer.phone,
              bindStatus: 'bound',
            }
          : {}),
      },
      include: { customer: { include: { store: true, healthProfile: true } } },
    });
    const customer = identity.customer;
    const payload = this.buildTokenPayload({
      openid,
      identityId: identity.id,
      customerId: customer?.id,
      storeId: customer?.storeId ?? storeId,
      phone: customer?.phone ?? undefined,
      nickname: dto.nickname,
      avatarUrl: dto.avatarUrl,
    });

    return {
      token: await this.signToken(payload),
      openid,
      bindStatus: customer ? 'bound' : 'unbound',
      customer: customer ? this.mapCustomer(customer) : null,
    };
  }

  async bindPhone(user: CustomerAppTokenPayload, dto: CustomerAppBindPhoneDto) {
    if (!user.openid) throw new UnauthorizedException('Ami Glow 登录态无效');
    const storeId = dto.storeId ?? user.storeId ?? (await this.getDefaultStoreId());
    const phone = dto.phone.trim();
    if (!phone) throw new BadRequestException('手机号不能为空');

    const existing = await this.prisma.customer.findFirst({
      where: { storeId, phone, deletedAt: null },
      include: { store: true, healthProfile: true },
      orderBy: { updatedAt: 'desc' },
    });

    const customer =
      existing ??
      (await this.prisma.customer.create({
        data: {
          storeId,
          phone,
          name: dto.name?.trim() || `微信客户${phone.slice(-4)}`,
          wechat: user.openid,
          source: 'ami_glow',
          memberLevel: '普通会员',
        },
        include: { store: true, healthProfile: true },
      }));

    if (existing && (!existing.wechat || existing.wechat !== user.openid || existing.source !== 'ami_glow')) {
      await this.prisma.customer.update({
        where: { id: existing.id },
        data: {
          wechat: existing.wechat || user.openid,
          source: existing.source || 'ami_glow',
          name: dto.name?.trim() || existing.name,
        },
      });
    }

    const payload = this.buildTokenPayload({
      ...user,
      identityId: await this.upsertBoundIdentity(user, customer.id, customer.storeId, customer.phone ?? phone, dto.name),
      customerId: customer.id,
      storeId: customer.storeId,
      phone: customer.phone ?? phone,
    });

    return {
      token: await this.signToken(payload),
      bindStatus: 'bound',
      customer: this.mapCustomer(customer),
    };
  }

  async getMe(user: CustomerAppTokenPayload) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const [reservationCount, cardCount, latestSkinTest] = await Promise.all([
      this.prisma.reservation.count({ where: { customerId: customer.id, status: { not: 'cancelled' } } }),
      this.prisma.customerCard.count({ where: { customerId: customer.id, status: 'active' } }),
      this.prisma.skinTest.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' } }),
    ]);

    return {
      ...this.mapCustomer(customer),
      stats: {
        reservationCount,
        activeCardCount: cardCount,
        latestSkinTestAt: latestSkinTest?.createdAt.toISOString(),
      },
    };
  }

  async getMyNotifications(user: CustomerAppTokenPayload, query: CustomerAppPaginationDto) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.max(1, Math.min(50, Number(query.pageSize ?? 20)));
    const where = {
      storeId: customer.storeId,
      customerId: customer.id,
      status: { in: ['delivered', 'opened', 'clicked', 'converted'] },
    };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.marketingInAppNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.marketingInAppNotification.count({ where }),
      this.prisma.marketingInAppNotification.count({
        where: { storeId: customer.storeId, customerId: customer.id, status: 'delivered' },
      }),
    ]);

    return {
      items: items.map((item) => this.mapMarketingNotification(item)),
      total,
      unreadCount,
      page,
      pageSize,
    };
  }

  async openMyNotification(user: CustomerAppTokenPayload, id: number) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const notificationWhere = {
      id,
      storeId: customer.storeId,
      customerId: customer.id,
      status: { in: ['delivered', 'opened', 'clicked', 'converted'] },
    };
    const currentNotification = await this.prisma.marketingInAppNotification.findFirst({
      where: notificationWhere,
    });
    if (!currentNotification) throw new NotFoundException('站内通知不存在');
    if (currentNotification.status !== 'delivered') {
      return this.mapMarketingNotification(currentNotification);
    }

    const openedAt = new Date();
    const updateResult = await this.prisma.marketingInAppNotification.updateMany({
      where: { id, storeId: customer.storeId, customerId: customer.id, status: 'delivered' },
      data: { status: 'opened', openedAt },
    });
    if (updateResult.count > 0 && currentNotification.deliveryJobId) {
      await this.propagateInAppNotificationOpen(currentNotification, customer, openedAt);
    }
    const notification = await this.prisma.marketingInAppNotification.findFirst({
      where: {
        ...notificationWhere,
      },
    });
    if (!notification) throw new NotFoundException('站内通知不存在');
    return this.mapMarketingNotification(notification);
  }

  async getHome(query: CustomerAppHomeQueryDto) {
    const storeId = query.storeId ?? (await this.getDefaultStoreId());
    const now = new Date();
    const [store, displayConfigs, projects, promotions, products, cards, marketingPages] = await Promise.all([
      this.prisma.store.findFirst({ where: { id: storeId, deletedAt: null } }),
      this.getActiveDisplayConfigs(storeId, now),
      this.prisma.project.findMany({
        where: { storeId, status: 'active', deletedAt: null },
        include: { type: true },
        orderBy: [{ updatedAt: 'desc' }],
        take: 6,
      }),
      this.prisma.promotion.findMany({
        where: {
          status: 'active',
          approvalStatus: 'approved',
          OR: [{ storeId }, { storeId: null }],
          AND: [
            { OR: [{ startAt: null }, { startAt: { lte: now } }] },
            { OR: [{ endAt: null }, { endAt: { gte: now } }] },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.product.findMany({
        where: { storeId, status: 'active', deletedAt: null, OR: [{ miniappStatus: 'published' }, { miniappStatus: 'unpublished' }] },
        orderBy: [{ miniappPublishedAt: 'desc' }, { updatedAt: 'desc' }],
        take: 4,
      }),
      this.prisma.card.findMany({ where: { status: 'active' }, orderBy: { updatedAt: 'desc' }, take: 4 }),
      this.prisma.marketingPage.findMany({
        where: { OR: [{ storeId }, { storeId: null }], status: 'published' },
        orderBy: { publishedAt: 'desc' },
        take: 5,
      }),
    ]);
    if (!store) throw new NotFoundException('门店不存在');
    const usablePromotions = promotions.filter((promotion) => this.isPromotionIssueAvailable(promotion));

    const projectConfigs = this.filterDisplayConfigs(displayConfigs, 'project');
    const promotionConfigs = this.filterDisplayConfigs(displayConfigs, 'promotion');
    const productConfigs = this.filterDisplayConfigs(displayConfigs, 'product');
    const cardConfigs = this.filterDisplayConfigs(displayConfigs, 'card');
    const pageConfigs = this.filterDisplayConfigs(displayConfigs, 'marketing_page');
    const configuredProjects = this.applyDisplayConfigs(projects, projectConfigs, (item, config) =>
      this.mapProject(item, { hot: true, displayConfig: config }),
    );
    const recommendedProjects = configuredProjects.length
      ? configuredProjects
      : projects.map((project, index) => this.mapProject(project, { hot: index < 2 }));
    const recommendedPromotions = this.applyDisplayConfigs(usablePromotions, promotionConfigs, (item, config) =>
      this.mapPromotion(item, config),
    );
    const recommendedProducts = this.applyDisplayConfigs(products, productConfigs, (item, config) =>
      this.mapProduct(item, config),
    );
    const recommendedCards = this.applyDisplayConfigs(cards, cardConfigs, (item, config) => this.mapCard(item, config));
    const banners = this.buildHomeBanners(
      recommendedProjects,
      recommendedPromotions.length ? recommendedPromotions : usablePromotions.map((promotion) => this.mapPromotion(promotion)),
      marketingPages,
      pageConfigs,
    );
    return {
      store: this.mapStore(store),
      banners,
      recommendedProjects,
      recommendedPromotions: recommendedPromotions.length ? recommendedPromotions : usablePromotions.map((promotion) => this.mapPromotion(promotion)),
      recommendedProducts: recommendedProducts.length ? recommendedProducts : products.map((product) => this.mapProduct(product)),
      recommendedCards: recommendedCards.length ? recommendedCards : cards.map((card) => this.mapCard(card)),
    };
  }

  async getProjects(query: CustomerAppProjectQueryDto) {
    const storeId = query.storeId ?? (await this.getDefaultStoreId());
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 10)));
    const where: any = { storeId, status: 'active', deletedAt: null };
    if (query.keyword) where.name = { contains: query.keyword, mode: 'insensitive' };
    if (query.category) where.type = { name: { contains: query.category, mode: 'insensitive' } };

    const [displayConfigs, items, total] = await Promise.all([
      query.recommended === 'true' ? this.getActiveDisplayConfigs(storeId) : Promise.resolve([]),
      this.prisma.project.findMany({
        where,
        include: { type: true, store: true },
        orderBy: query.recommended === 'true' ? [{ updatedAt: 'desc' }] : [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);
    const projectConfigs = this.filterDisplayConfigs(displayConfigs, 'project');
    const configuredItems =
      query.recommended === 'true'
        ? this.applyDisplayConfigs(items, projectConfigs, (project, config) =>
            this.mapProject(project, { hot: true, displayConfig: config }),
          )
        : [];

    return {
      items: configuredItems.length
        ? configuredItems
        : items.map((project, index) => this.mapProject(project, { hot: query.recommended === 'true' || index < 2 })),
      total,
      page,
      pageSize,
    };
  }

  async getProjectDetail(id: number, storeId?: number) {
    const project = await this.prisma.project.findFirst({
      where: { id, ...(storeId ? { storeId } : {}), deletedAt: null },
      include: {
        type: true,
        store: true,
        bomItems: { include: { product: true } },
      },
    });
    if (!project) throw new NotFoundException('项目不存在或已下线');

    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: {
        status: 'active',
        approvalStatus: 'approved',
        OR: [{ storeId: project.storeId }, { storeId: null }],
        applicableProjectIds: { has: project.id },
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      ...this.mapProject(project, { detail: true, hot: true }),
      store: this.mapStore(project.store),
      details: {
        description: project.description,
        serviceFlow: ['顾问沟通', '皮肤状态确认', '项目护理', '护理建议'],
        suitableFor: this.inferSuitableFor(project),
        notices: ['如有过敏史请提前告知美容师', '护理结果因个人肤质存在差异'],
        bomItems: project.bomItems.map((item) => ({
          productId: item.productId,
          productName: item.product?.name,
          standardQty: this.toNumber(item.standardQty),
          unit: item.unit,
        })),
      },
      promotions: promotions.filter((promotion) => this.isPromotionIssueAvailable(promotion)).slice(0, 3).map((promotion) => this.mapPromotion(promotion)),
    };
  }

  async getAvailableBeauticians(projectId: number, storeId?: number) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, ...(storeId ? { storeId } : {}), deletedAt: null } });
    if (!project) throw new NotFoundException('项目不存在');
    const beauticians = await this.prisma.beautician.findMany({
      where: {
        storeId: project.storeId,
        status: 'active',
        userId: { not: null },
        OR: [
          { projectSkills: { some: { projectId, certified: true } } },
          { projectSkills: { some: { projectId } } },
          { projectSkills: { none: {} } },
        ],
      },
      include: { level: true, projectSkills: { where: { projectId } } },
      orderBy: { createdAt: 'asc' },
    });

    return beauticians.map((beautician) => ({
      id: beautician.id,
      name: beautician.name,
      phone: beautician.phone,
      avatar: beautician.avatar,
      levelName: beautician.level?.name,
      skillLevel: beautician.projectSkills[0]?.skillLevel ?? 1,
      certified: beautician.projectSkills[0]?.certified ?? false,
    }));
  }

  async getReservationAvailability(query: CustomerAppAvailabilityQueryDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: query.projectId, storeId: query.storeId, status: 'active', deletedAt: null },
    });
    if (!project) throw new NotFoundException('项目不存在或不可预约');
    const date = this.parseDateOnly(query.date);
    const dateKey = this.formatDateKey(date);
    const duration = Number(project.duration || 60);
    const business = await this.getBusinessWindow(query.storeId);
    const slots = this.buildTimeSlots(business.startTime, business.endTime, duration);
    const reservations = await this.prisma.reservation.findMany({
      where: {
        storeId: query.storeId,
        date: { gte: date, lt: this.addDays(date, 1) },
        status: { notIn: ['cancelled', 'no_show'] },
        ...(query.beauticianId ? { beauticianId: query.beauticianId } : {}),
      },
      select: { startTime: true, endTime: true, beauticianId: true },
    });
    const timeOffs = query.beauticianId
      ? await this.prisma.beauticianTimeOff.findMany({
          where: { storeId: query.storeId, beauticianId: query.beauticianId, date, status: 'approved' },
          select: { startTime: true, endTime: true },
        })
      : [];
    const now = new Date();

    return {
      storeId: query.storeId,
      projectId: query.projectId,
      beauticianId: query.beauticianId,
      date: dateKey,
      duration,
      slots: slots.map((slot) => {
        const endTime = this.addMinutesToTime(slot, duration);
        const isPast = dateKey === this.formatDateKey(now) && slot <= this.formatTime(now);
        const occupied = reservations.some((reservation) => this.overlaps(slot, endTime, reservation.startTime, reservation.endTime || this.addMinutesToTime(reservation.startTime, duration)));
        const off = timeOffs.some((item) => this.overlaps(slot, endTime, item.startTime, item.endTime));
        return {
          startTime: slot,
          endTime,
          available: !isPast && !occupied && !off,
          reason: isPast ? '已过当前时间' : occupied ? '该时段已被预约' : off ? '美容师该时段不可预约' : undefined,
        };
      }),
    };
  }

  async createReservation(user: CustomerAppTokenPayload, dto: CustomerAppCreateReservationDto) {
    const customer = await this.requireCustomer(user.customerId, dto.storeId);
    const appointment = this.combineDateAndTime(dto.date, dto.startTime);
    const bookingSource = dto.source === 'ami_glow_h5' ? 'ami_glow_h5' : 'ami_glow';
    const reservationService = this.requireReservationsService();
    const recovered = await reservationService.recoverIdempotentCreate({
      ...dto,
      storeId: dto.storeId,
      customerId: customer.id,
      appointmentTime: appointment,
      bookingSource,
    });
    if (recovered) return recovered.reservation;

    if (dto.customerPhone && customer.phone !== dto.customerPhone) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          phone: dto.customerPhone,
          name: dto.customerName?.trim() || customer.name,
        },
      });
    }

    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, storeId: dto.storeId, status: 'active', deletedAt: null },
    });
    if (!project) throw new NotFoundException('项目不存在或不可预约');
    if (dto.beauticianId) {
      const beautician = await this.prisma.beautician.findFirst({ where: { id: dto.beauticianId, storeId: dto.storeId, status: 'active' } });
      if (!beautician) throw new BadRequestException('预约美容师不可用');
    }

    const availability = await this.getReservationAvailability({
      storeId: dto.storeId,
      projectId: dto.projectId,
      beauticianId: dto.beauticianId,
      date: dto.date,
    });
    const selectedSlot = availability.slots.find((slot) => slot.startTime === dto.startTime);
    if (!selectedSlot?.available) throw new BadRequestException(selectedSlot?.reason || '该时段不可预约，请重新选择');

    const endTime = dto.endTime || selectedSlot.endTime;
    const sourceLabel = dto.source === 'ami_glow_h5' || dto.channel?.includes('h5') ? 'Ami Glow H5' : 'Ami Glow';
    const remarkParts = [
      dto.remark,
      `来源：${sourceLabel}`,
      dto.channel ? `渠道：${dto.channel}` : undefined,
      dto.promotionId ? `活动ID：${dto.promotionId}` : undefined,
      dto.campaignId ? `Campaign：${dto.campaignId}` : undefined,
      dto.staffId ? `员工ID：${dto.staffId}` : undefined,
    ].filter(Boolean);

    const created = await reservationService.createIdempotent({
      storeId: dto.storeId,
      customerId: customer.id,
      projectId: dto.projectId,
      beauticianId: dto.beauticianId,
      appointmentTime: appointment,
      startTime: dto.startTime,
      endTime,
      status: 'pending',
      remark: remarkParts.join('；'),
      bookingSource,
      idempotencyKey: dto.idempotencyKey,
    });
    const reservation = created.reservation as any;

    if (!created.replayed) {
      await this.recordEvent(
        { ...user, customerId: customer.id, storeId: dto.storeId },
        {
          eventType: 'miniapp_reservation_success',
          storeId: dto.storeId,
          channel: dto.channel,
          source: dto.source,
          targetType: 'project',
          targetId: String(dto.projectId),
          payload: { reservationId: reservation.id, promotionId: dto.promotionId },
        },
      );
      if (dto.promotionId) {
        await this.recordEvent(
          { ...user, customerId: customer.id, storeId: dto.storeId },
          {
            eventType: 'promotion_reserved',
            storeId: dto.storeId,
            channel: dto.channel,
            source: dto.source,
            targetType: 'promotion',
            targetId: String(dto.promotionId),
            payload: { reservationId: reservation.id, projectId: dto.projectId },
          },
        );
      }
    }

    return reservation;
  }

  private requireReservationsService() {
    if (!this.reservationsService) throw new Error('reservations_service_unavailable');
    return this.reservationsService;
  }

  async claimPromotion(user: CustomerAppTokenPayload, promotionId: number, dto: { storeId?: number; channel?: string; source?: string; sessionId?: string } = {}) {
    const storeId = dto.storeId ?? user.storeId;
    const customer = await this.requireCustomer(user.customerId, storeId);
    const now = new Date();
    const promotion = await this.prisma.promotion.findFirst({
      where: {
        id: promotionId,
        status: 'active',
        approvalStatus: 'approved',
        OR: [{ storeId: null }, { storeId: customer.storeId }],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
    });
    if (!promotion) throw new NotFoundException('权益不存在、未发布或已过期');

    const existingClaim = await this.prisma.customerAppEvent.findFirst({
      where: {
        storeId: customer.storeId,
        customerId: customer.id,
        eventType: 'promotion_claimed',
        targetType: 'promotion',
        targetId: String(promotion.id),
      },
      orderBy: { occurredAt: 'desc' },
    });
    if (existingClaim) {
      return {
        success: true,
        alreadyClaimed: true,
        promotion: this.mapPromotion(promotion),
        claimedAt: existingClaim.occurredAt?.toISOString?.() ?? existingClaim.createdAt?.toISOString?.() ?? new Date().toISOString(),
      };
    }
    if (promotion.maxIssueCount != null && promotion.issuedCount >= promotion.maxIssueCount) {
      throw new BadRequestException('该权益已达到发放上限');
    }

    const updated = await this.prisma.promotion.update({
      where: { id: promotion.id },
      data: { issuedCount: { increment: 1 } },
    });
    await this.recordEvent(
      { ...user, customerId: customer.id, storeId: customer.storeId },
      {
        eventType: 'promotion_claimed',
        storeId: customer.storeId,
        sessionId: dto.sessionId,
        channel: dto.channel ?? 'miniapp',
        source: dto.source,
        targetType: 'promotion',
        targetId: String(promotion.id),
        payload: {
          promotionName: promotion.name,
          discountText: promotion.discountText,
          validDays: promotion.validDays,
        },
      },
    );

    return {
      success: true,
      promotion: this.mapPromotion(updated),
      claimedAt: new Date().toISOString(),
    };
  }

  async getMyReservations(user: CustomerAppTokenPayload, query: CustomerAppPaginationDto) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 10)));
    const where: any = { customerId: customer.id };
    if (query.status) where.status = query.status;
    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        include: { store: true, customer: true, project: true, beautician: true },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return { items: items.map((item) => this.mapReservation(item)), total, page, pageSize };
  }

  async cancelMyReservation(user: CustomerAppTokenPayload, id: number, reason?: string) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const reservation = await this.prisma.reservation.findFirst({
      where: { id, customerId: customer.id },
      include: { store: true, customer: true, project: true, beautician: true },
    });
    if (!reservation) throw new NotFoundException('预约不存在');
    if (!['pending', 'confirmed'].includes(reservation.status)) throw new BadRequestException('当前预约状态不能取消');
    const updated = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'cancelled', remark: reason || reservation.remark },
      include: { store: true, customer: true, project: true, beautician: true },
    });
    return this.mapReservation(updated);
  }

  async getMyCards(user: CustomerAppTokenPayload) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const cards = await this.prisma.customerCard.findMany({
      where: { customerId: customer.id },
      include: { card: true },
      orderBy: { expiryDate: 'asc' },
    });
    return cards.map((item) => ({
      id: item.id,
      cardId: item.cardId,
      cardName: item.cardName,
      totalTimes: item.totalTimes,
      remainingTimes: item.remainingTimes,
      expiryDate: formatBusinessDate(item.expiryDate),
      status: item.remainingTimes <= 0 ? 'used_up' : item.expiryDate < new Date() ? 'expired' : item.status,
      applicableProjects: this.extractCardProjects(item.card.projects),
    }));
  }

  async getMyConsumptionRecords(user: CustomerAppTokenPayload, query: CustomerAppPaginationDto) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 10)));
    const [items, total] = await Promise.all([
      this.prisma.consumptionRecord.findMany({
        where: { customerId: customer.id },
        orderBy: { consumeTime: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.consumptionRecord.count({ where: { customerId: customer.id } }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        consumeType: item.consumeType,
        consumeContent: item.consumeContent,
        payMethod: item.payMethod,
        amount: this.toNumber(item.amount),
        campaign: item.campaign,
        consumeTime: item.consumeTime.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async getMyMemberCard(user: CustomerAppTokenPayload) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const account = await this.prisma.customerBalanceAccount.findFirst({
      where: { customerId: customer.id, storeId: customer.storeId, status: 'active' },
    });
    return {
      customerId: customer.id,
      memberLevel: customer.memberLevel || '普通会员',
      cashBalance: account ? this.toNumber(account.cashBalance) : 0,
      giftBalance: account ? this.toNumber(account.giftBalance) : 0,
      status: account?.status ?? 'inactive',
      benefits: ['会员专属护理建议', '项目预约提醒', '次卡余额查询'],
    };
  }

  async getContact(storeId?: number) {
    const resolvedStoreId = storeId ?? (await this.getDefaultStoreId());
    const store = await this.prisma.store.findFirst({ where: { id: resolvedStoreId, deletedAt: null } });
    if (!store) throw new NotFoundException('门店不存在');
    return {
      store: this.mapStore(store),
      phone: store.phone,
      address: store.address,
      businessHours: '09:00-20:00',
    };
  }

  async analyzeSkin(user: CustomerAppTokenPayload, dto: CustomerAppAnalyzeSkinDto) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const store = await this.prisma.store.findFirst({ where: { id: customer.storeId } });
    const analysis = await this.aiService.analyzeSkinPhoto(
      {
        customerId: customer.id,
        customerName: customer.name,
        storeName: store?.name,
        imageDataUrl: dto.imageDataUrl,
        capturedAt: dto.capturedAt,
      },
      undefined,
      customer.storeId,
    );
    const explanation = await this.aiService.generateSkinTestExplanation(
      { metrics: analysis.metrics, skinType: analysis.skinType },
      undefined,
      customer.storeId,
    );
    const skinTest = await this.prisma.skinTest.create({
      data: {
        customerId: customer.id,
        images: dto.images?.length ? dto.images : analysis.imageUrl ? [analysis.imageUrl] : [],
        metrics: analysis.metrics as any,
        skinType: analysis.skinType,
        skinStatus: analysis.skinStatus,
        mainProblems: analysis.mainProblems,
        recommendationText: analysis.recommendedCare || explanation.text,
      },
    });
    await this.prisma.customerHealthProfile.upsert({
      where: { customerId: customer.id },
      update: {
        skinType: analysis.skinType,
        skinStatus: analysis.skinStatus,
        mainProblems: analysis.mainProblems,
        recommendedCare: analysis.recommendedCare,
        instrument: analysis.instrument,
        lastCheck: new Date(),
      },
      create: {
        customerId: customer.id,
        skinType: analysis.skinType,
        skinStatus: analysis.skinStatus,
        mainProblems: analysis.mainProblems,
        recommendedCare: analysis.recommendedCare,
        instrument: analysis.instrument,
      },
    });
    await this.recordEvent(user, {
      eventType: 'miniapp_complete_skin_test',
      storeId: customer.storeId,
      targetType: 'skin_test',
      targetId: String(skinTest.id),
      payload: { skinType: analysis.skinType, isFallback: analysis.isFallback },
    });

    return {
      id: skinTest.id,
      customerId: customer.id,
      skinType: analysis.skinType,
      skinStatus: analysis.skinStatus,
      mainProblems: analysis.mainProblems,
      scores: analysis.metrics,
      overallScore: this.calculateOverallScore(analysis.metrics),
      summary: analysis.explanation,
      advice: analysis.recommendedCare || explanation.text,
      explanation: explanation.text,
      instrument: analysis.instrument,
      isFallback: analysis.isFallback,
      capturedAt: analysis.capturedAt,
      createdAt: skinTest.createdAt.toISOString(),
    };
  }

  async getSkinTest(user: CustomerAppTokenPayload, id: number) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const skinTest = await this.prisma.skinTest.findFirst({ where: { id, customerId: customer.id } });
    if (!skinTest) throw new NotFoundException('测肤报告不存在');
    return this.mapSkinTest(skinTest);
  }

  async getSkinTestRecommendations(user: CustomerAppTokenPayload, id: number) {
    const customer = await this.requireCustomer(user.customerId, user.storeId);
    const skinTest = await this.prisma.skinTest.findFirst({ where: { id, customerId: customer.id } });
    if (!skinTest) throw new NotFoundException('测肤报告不存在');
    const keywords = this.getSkinRecommendationKeywords(`${skinTest.skinType} ${skinTest.skinStatus ?? ''} ${skinTest.mainProblems ?? ''}`);
    const projects = await this.prisma.project.findMany({
      where: {
        storeId: customer.storeId,
        status: 'active',
        deletedAt: null,
        OR: keywords.map((keyword) => ({ name: { contains: keyword, mode: 'insensitive' } })),
      },
      include: { type: true },
      take: 5,
    });
    const fallbackProjects =
      projects.length > 0
        ? projects
        : await this.prisma.project.findMany({
            where: { storeId: customer.storeId, status: 'active', deletedAt: null },
            include: { type: true },
            orderBy: { updatedAt: 'desc' },
            take: 3,
          });

    return fallbackProjects.map((project) => ({
      type: 'project',
      id: project.id,
      name: project.name,
      reason: `${skinTest.skinType}适合关注${keywords[0] || '护理'}类项目`,
      project: this.mapProject(project, { hot: true }),
    }));
  }

  async recordEvent(user: Partial<CustomerAppTokenPayload> | undefined, dto: CustomerAppEventDto) {
    const storeId = dto.storeId ?? user?.storeId;
    const customerId = user?.customerId;
    const source = dto.source || 'ami_glow';
    if (storeId) {
      const metadataJson = this.buildEventMetadata(user, dto);
      const event = await this.prisma.customerAppEvent.create({
        data: {
          storeId,
          customerId,
          identityId: user?.identityId,
          openid: user?.openid,
          sessionId: dto.sessionId ?? user?.openid,
          eventType: dto.eventType,
          channel: dto.channel,
          source,
          targetType: dto.targetType,
          targetId: dto.targetId,
          metadataJson,
        },
      });
      await this.recordCustomerAppFact(event, dto, storeId, customerId);
      if (customerId) {
        await this.prisma.customerBehaviorEvent.create({
          data: {
            storeId,
            customerId,
            eventType: dto.eventType,
            targetType: dto.targetType,
            targetId: dto.targetId,
            sessionId: dto.sessionId ?? user?.openid,
            metadataJson,
          },
        });
      }
    }
    return { ok: true };
  }

  private async recordCustomerAppFact(event: any, dto: CustomerAppEventDto, storeId: number, customerId?: number) {
    if (
      !isMarketingFeatureEnabledForStore(this.marketingFeatureFlags, 'effectFactWrite', storeId)
      || !this.factService
      || !event?.id
    ) return;
    const eventType = String(dto.eventType ?? '').toLowerCase();
    const factType = eventType.includes('view')
      ? 'open'
      : /(claimed|reserved|click)/.test(eventType)
        ? 'click'
        : /(redeemed|used|verified|converted)/.test(eventType)
          ? 'conversion'
          : null;
    if (!factType) return;
    const metadata = dto.payload && typeof dto.payload === 'object' ? dto.payload as Record<string, any> : {};
    const promotionId = dto.targetType === 'promotion' ? Number(dto.targetId) : Number(metadata.promotionId);
    try {
      await this.factService.recordFact({
        storeId,
        factType,
        metricSource: 'actual',
        sourceSystem: 'customer_app_event',
        sourceEventId: `event:${event.id}`,
        countValue: 1,
        dimensions: {
          recommendationInstanceId: metadata.recommendationInstanceId ?? null,
          adoptionId: Number(metadata.adoptionId) || null,
          promotionId: Number.isInteger(promotionId) && promotionId > 0 ? promotionId : null,
          customerId: customerId ?? null,
          channel: dto.channel ?? 'ami_glow',
        },
        occurredAt: event.occurredAt ?? event.createdAt ?? new Date(),
      });
    } catch {
      // Customer interaction succeeds even when fact dual-write is temporarily unavailable.
    }
  }

  private async propagateInAppNotificationOpen(notification: any, customer: any, openedAt: Date) {
    try {
      const deliveryJob = await this.prisma.marketingDeliveryJob.findFirst({
        where: {
          id: notification.deliveryJobId,
          storeId: customer.storeId,
          customerId: customer.id,
          channel: 'in_app',
        },
        include: {
          strategy: {
            select: { recommendationInstanceId: true, adoptionId: true, actions: true },
          },
        },
      });
      if (!deliveryJob) return;
      await this.prisma.marketingAutomationTouch.updateMany({
        where: { id: deliveryJob.touchId, status: { in: ['sent', 'delivered'] } },
        data: { status: 'opened' },
      });
      if (
        !isMarketingFeatureEnabledForStore(this.marketingFeatureFlags, 'effectFactWrite', customer.storeId)
        || !this.factService
      ) return;
      await this.factService.recordFact({
        storeId: customer.storeId,
        factType: 'open',
        metricSource: 'actual',
        sourceSystem: 'customer_app_in_app_notification',
        sourceEventId: `notification:${notification.id}`,
        countValue: 1,
        dimensions: {
          recommendationInstanceId: deliveryJob.strategy?.recommendationInstanceId ?? null,
          adoptionId: deliveryJob.strategy?.adoptionId ?? null,
          strategyId: deliveryJob.strategyId,
          executionId: deliveryJob.executionId,
          touchId: deliveryJob.touchId,
          deliveryJobId: deliveryJob.id,
          promotionId: this.promotionFromMarketingActions(deliveryJob.strategy?.actions),
          customerId: customer.id,
          channel: 'in_app',
        },
        metadata: { status: 'opened', notificationId: notification.id },
        occurredAt: openedAt,
      });
    } catch {
      // Notification state is authoritative; touch/fact dual-write is repaired asynchronously.
    }
  }

  private promotionFromMarketingActions(actions: unknown) {
    if (!Array.isArray(actions)) return null;
    const promotionId = actions
      .map((action: any) => Number(action?.promotionId))
      .find((value) => Number.isInteger(value) && value > 0);
    return promotionId ?? null;
  }

  async findAdminDisplayConfigs(query: CustomerAppAdminDisplayConfigQueryDto = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const keyword = query.keyword?.trim();
    const where: Prisma.AmiGlowDisplayConfigWhereInput = {
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.objectType ? { objectType: query.objectType } : {}),
      ...(query.publishStatus && query.publishStatus !== 'all' ? { publishStatus: query.publishStatus } : {}),
      ...(keyword
        ? {
            OR: [
              { summary: { contains: keyword, mode: 'insensitive' } },
              { bannerImage: { contains: keyword, mode: 'insensitive' } },
              { ctaType: { contains: keyword, mode: 'insensitive' } },
              { tags: { has: keyword } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.amiGlowDisplayConfig.findMany({
        where,
        include: { store: true },
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.amiGlowDisplayConfig.count({ where }),
    ]);
    const objectSummaries = await this.resolveDisplayConfigObjectSummaries(items);

    return {
      items: items.map((item) => this.mapAdminDisplayConfig(item, objectSummaries)),
      data: items.map((item) => this.mapAdminDisplayConfig(item, objectSummaries)),
      total,
      page,
      pageSize,
    };
  }

  async createAdminDisplayConfig(dto: CustomerAppAdminDisplayConfigDto) {
    await this.ensureDisplayTargetExists(dto.storeId, dto.objectType, dto.objectId);
    const item = await this.prisma.amiGlowDisplayConfig.upsert({
      where: {
        storeId_objectType_objectId: {
          storeId: dto.storeId,
          objectType: dto.objectType,
          objectId: dto.objectId,
        },
      },
      create: this.normalizeDisplayConfigData(dto) as Prisma.AmiGlowDisplayConfigUncheckedCreateInput,
      update: this.normalizeDisplayConfigData(dto) as Prisma.AmiGlowDisplayConfigUncheckedUpdateInput,
      include: { store: true },
    });
    const objectSummaries = await this.resolveDisplayConfigObjectSummaries([item]);
    return this.mapAdminDisplayConfig(item, objectSummaries);
  }

  async updateAdminDisplayConfig(id: number, dto: CustomerAppAdminUpdateDisplayConfigDto) {
    const current = await this.prisma.amiGlowDisplayConfig.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Ami Glow 展示配置不存在');
    const nextStoreId = dto.storeId ?? current.storeId;
    const nextObjectType = dto.objectType ?? current.objectType;
    const nextObjectId = dto.objectId ?? current.objectId;
    await this.ensureDisplayTargetExists(nextStoreId, nextObjectType, nextObjectId);

    const item = await this.prisma.amiGlowDisplayConfig.update({
      where: { id },
      data: this.normalizeDisplayConfigData(dto) as Prisma.AmiGlowDisplayConfigUncheckedUpdateInput,
      include: { store: true },
    });
    const objectSummaries = await this.resolveDisplayConfigObjectSummaries([item]);
    return this.mapAdminDisplayConfig(item, objectSummaries);
  }

  async deleteAdminDisplayConfig(id: number) {
    const current = await this.prisma.amiGlowDisplayConfig.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Ami Glow 展示配置不存在');
    await this.prisma.amiGlowDisplayConfig.delete({ where: { id } });
    return { ok: true };
  }

  async findAdminEvents(query: CustomerAppAdminEventQueryDto = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const keyword = query.keyword?.trim();
    const dateFilter = this.buildDateRangeFilter(query.startDate, query.endDate);
    const where: Prisma.CustomerAppEventWhereInput = {
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(dateFilter ? { occurredAt: dateFilter } : {}),
      ...(keyword
        ? {
            OR: [
              { eventType: { contains: keyword, mode: 'insensitive' } },
              { openid: { contains: keyword, mode: 'insensitive' } },
              { sessionId: { contains: keyword, mode: 'insensitive' } },
              { targetId: { contains: keyword, mode: 'insensitive' } },
              { customer: { name: { contains: keyword, mode: 'insensitive' } } },
              { customer: { phone: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customerAppEvent.findMany({
        where,
        include: { store: true, customer: true, identity: true },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customerAppEvent.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapAdminEvent(item)),
      data: items.map((item) => this.mapAdminEvent(item)),
      total,
      page,
      pageSize,
    };
  }

  private buildEventMetadata(user: Partial<CustomerAppTokenPayload> | undefined, dto: CustomerAppEventDto) {
    const metadataJson: Prisma.InputJsonObject = {
      source: dto.source || 'ami_glow',
      ...(dto.channel ? { channel: dto.channel } : {}),
      ...(user?.openid ? { openid: user.openid } : {}),
      ...(dto.payload ? { payload: dto.payload as Prisma.InputJsonObject } : {}),
    };
    return metadataJson;
  }

  private normalizeDisplayConfigData(
    dto: CustomerAppAdminDisplayConfigDto | CustomerAppAdminUpdateDisplayConfigDto,
  ) {
    const data: Record<string, unknown> = {};
    if (dto.storeId !== undefined) data.storeId = dto.storeId;
    if (dto.objectType !== undefined) data.objectType = dto.objectType;
    if (dto.objectId !== undefined) data.objectId = dto.objectId;
    if (dto.showInAmiGlow !== undefined) data.showInAmiGlow = dto.showInAmiGlow;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.bannerImage !== undefined) data.bannerImage = this.emptyToNull(dto.bannerImage);
    if (dto.summary !== undefined) data.summary = this.emptyToNull(dto.summary);
    if (dto.ctaType !== undefined) data.ctaType = this.emptyToNull(dto.ctaType);
    if (dto.publishStatus !== undefined) data.publishStatus = dto.publishStatus;
    if (dto.startAt !== undefined) data.startAt = dto.startAt ? new Date(dto.startAt) : null;
    if (dto.endAt !== undefined) data.endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (dto.metadataJson !== undefined) data.metadataJson = dto.metadataJson ?? Prisma.JsonNull;
    return data;
  }

  private async ensureDisplayTargetExists(storeId: number, objectType: string, objectId: number) {
    const exists = await this.findDisplayTarget(storeId, objectType, objectId);
    if (!exists) throw new NotFoundException('展示对象不存在或不属于当前门店');
  }

  private findDisplayTarget(storeId: number, objectType: string, objectId: number) {
    switch (objectType) {
      case 'project':
        return this.prisma.project.findFirst({ where: { id: objectId, storeId, deletedAt: null } });
      case 'product':
        return this.prisma.product.findFirst({ where: { id: objectId, storeId, deletedAt: null } });
      case 'card':
        return this.prisma.card.findFirst({ where: { id: objectId } });
      case 'promotion':
        return this.prisma.promotion.findFirst({
          where: { id: objectId, OR: [{ storeId }, { storeId: null }] },
        });
      case 'marketing_page':
        return this.prisma.marketingPage.findFirst({
          where: { id: objectId, OR: [{ storeId }, { storeId: null }] },
        });
      default:
        throw new BadRequestException('不支持的展示对象类型');
    }
  }

  private async resolveDisplayConfigObjectSummaries(configs: any[]) {
    const result = new Map<string, any>();
    const idsByType = configs.reduce<Map<string, Set<number>>>((accumulator, config) => {
      const values = accumulator.get(config.objectType) ?? new Set<number>();
      values.add(Number(config.objectId));
      accumulator.set(config.objectType, values);
      return accumulator;
    }, new Map<string, Set<number>>());

    await Promise.all(
      Array.from(idsByType.entries()).map(async ([objectType, ids]) => {
        const idList = Array.from(ids);
        let items: any[] = [];
        if (objectType === 'project') {
          items = await this.prisma.project.findMany({ where: { id: { in: idList } }, include: { type: true } });
        } else if (objectType === 'product') {
          items = await this.prisma.product.findMany({ where: { id: { in: idList } }, include: { category: true } });
        } else if (objectType === 'card') {
          items = await this.prisma.card.findMany({ where: { id: { in: idList } } });
        } else if (objectType === 'promotion') {
          items = await this.prisma.promotion.findMany({ where: { id: { in: idList } } });
        } else if (objectType === 'marketing_page') {
          items = await this.prisma.marketingPage.findMany({ where: { id: { in: idList } } });
        }
        for (const item of items) {
          result.set(this.displayConfigObjectKey(objectType, item.id), this.mapDisplayObjectSummary(objectType, item));
        }
      }),
    );

    return result;
  }

  private mapDisplayObjectSummary(objectType: string, item: any) {
    const common = {
      id: item.id,
      name: item.name ?? item.title ?? item.shareTitle ?? `#${item.id}`,
      status: item.status,
      image: item.image ?? item.shareImage,
      description: item.description ?? item.salesDescription ?? item.shareDescription,
    };
    if (objectType === 'project') {
      return { ...common, price: this.toNumber(item.price), categoryName: item.type?.name };
    }
    if (objectType === 'product') {
      return {
        ...common,
        price: this.toNumber(item.salePrice ?? item.retailPrice),
        categoryName: item.category?.name,
        miniappStatus: item.miniappStatus,
      };
    }
    if (objectType === 'card') {
      return { ...common, price: this.toNumber(item.price), totalTimes: item.totalTimes };
    }
    if (objectType === 'promotion') {
      return {
        ...common,
        discountText: item.discountText,
        startAt: item.startAt?.toISOString(),
        endAt: item.endAt?.toISOString(),
      };
    }
    if (objectType === 'marketing_page') {
      return {
        ...common,
        slug: item.slug,
        sourceType: item.sourceType,
        shareUrl: item.shareUrl,
        miniappPath: item.miniappPath,
        publishedAt: item.publishedAt?.toISOString(),
      };
    }
    return common;
  }

  private mapAdminDisplayConfig(config: any, objectSummaries: Map<string, any>) {
    return {
      id: config.id,
      storeId: config.storeId,
      storeName: config.store?.name,
      objectType: config.objectType,
      objectId: config.objectId,
      object: objectSummaries.get(this.displayConfigObjectKey(config.objectType, config.objectId)) ?? null,
      showInAmiGlow: config.showInAmiGlow,
      sortOrder: config.sortOrder,
      tags: config.tags ?? [],
      bannerImage: config.bannerImage,
      summary: config.summary,
      ctaType: config.ctaType,
      publishStatus: config.publishStatus,
      startAt: config.startAt?.toISOString(),
      endAt: config.endAt?.toISOString(),
      metadataJson: config.metadataJson ?? null,
      createdAt: config.createdAt?.toISOString(),
      updatedAt: config.updatedAt?.toISOString(),
    };
  }

  private mapAdminEvent(event: any) {
    return {
      id: event.id,
      storeId: event.storeId,
      storeName: event.store?.name,
      customerId: event.customerId,
      customerName: event.customer?.name,
      customerPhone: event.customer?.phone,
      identityId: event.identityId,
      openid: event.openid,
      nickname: event.identity?.nickname,
      avatarUrl: event.identity?.avatarUrl,
      sessionId: event.sessionId,
      eventType: event.eventType,
      channel: event.channel,
      targetType: event.targetType,
      targetId: event.targetId,
      source: event.source,
      metadataJson: event.metadataJson ?? null,
      occurredAt: event.occurredAt?.toISOString(),
      createdAt: event.createdAt?.toISOString(),
    };
  }

  private displayConfigObjectKey(objectType: string, objectId: number) {
    return `${objectType}:${Number(objectId)}`;
  }

  private buildDateRangeFilter(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    if (startDate) filter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) end.setHours(23, 59, 59, 999);
      filter.lte = end;
    }
    return filter;
  }

  private emptyToNull(value?: string | null) {
    if (value === undefined) return undefined;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async signToken(payload: CustomerAppTokenPayload) {
    return this.jwtService.signAsync(payload, { expiresIn: '30d' });
  }

  private buildTokenPayload(input: Partial<CustomerAppTokenPayload> & { openid: string }): CustomerAppTokenPayload {
    return {
      sub: `ami_glow:${input.openid}`,
      openid: input.openid,
      identityId: input.identityId,
      unionid: input.unionid,
      customerId: input.customerId,
      storeId: input.storeId,
      phone: input.phone,
      nickname: input.nickname,
      avatarUrl: input.avatarUrl,
    };
  }

  private resolveDevelopmentOpenid(code: string) {
    return code.startsWith('openid:') ? code.slice('openid:'.length) : `dev_${Buffer.from(code).toString('base64url').slice(0, 24)}`;
  }

  private resolveH5GuestOpenid(sessionId: string) {
    const normalized = sessionId.trim();
    if (!normalized) throw new BadRequestException('H5 会话不能为空');
    return `h5_${Buffer.from(normalized).toString('base64url').slice(0, 48)}`;
  }

  private async findCustomerByWechatOrStore(openid: string, storeId?: number) {
    return this.prisma.customer.findFirst({
      where: {
        ...(storeId ? { storeId } : {}),
        wechat: openid,
        deletedAt: null,
      },
      include: { store: true, healthProfile: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async upsertBoundIdentity(
    user: CustomerAppTokenPayload,
    customerId: number,
    storeId: number,
    phone?: string | null,
    nickname?: string,
  ) {
    const identity = await this.prisma.customerAppIdentity.upsert({
      where: { storeId_openid: { storeId, openid: user.openid } },
      create: {
        storeId,
        customerId,
        openid: user.openid,
        unionid: user.unionid,
        nickname: nickname || user.nickname,
        avatarUrl: user.avatarUrl,
        phone: phone ?? user.phone,
        bindStatus: 'bound',
        lastLoginAt: new Date(),
      },
      update: {
        customerId,
        unionid: user.unionid,
        nickname: nickname || user.nickname,
        avatarUrl: user.avatarUrl,
        phone: phone ?? user.phone,
        bindStatus: 'bound',
        lastLoginAt: new Date(),
      },
    });
    return identity.id;
  }

  private async requireCustomer(customerId?: number, storeId?: number) {
    if (!customerId) throw new UnauthorizedException('请先绑定手机号');
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...(storeId ? { storeId } : {}), deletedAt: null },
      include: { store: true, healthProfile: true },
    });
    if (!customer) throw new UnauthorizedException('客户绑定信息无效，请重新绑定');
    return customer;
  }

  private async getDefaultStoreId() {
    const store = await this.prisma.store.findFirst({ where: { status: 'active', deletedAt: null }, orderBy: { id: 'asc' } });
    if (!store) throw new NotFoundException('暂无可用门店');
    return store.id;
  }

  private async getBusinessWindow(storeId: number) {
    const config = await this.prisma.schedulingRuleConfig.findFirst({
      where: { storeId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      startTime: config?.businessStartTime ?? '09:00',
      endTime: config?.businessEndTime ?? '20:00',
    };
  }

  private mapStore(store: any) {
    return {
      id: store.id,
      name: store.name,
      city: store.city,
      address: store.address,
      phone: store.phone,
      status: store.status,
    };
  }

  private mapCustomer(customer: any) {
    return {
      id: customer.id,
      storeId: customer.storeId,
      name: customer.name,
      phone: customer.phone,
      avatar: customer.avatar,
      memberLevel: customer.memberLevel || '普通会员',
      skinType: customer.healthProfile?.skinType ?? customer.skinType,
      skinStatus: customer.healthProfile?.skinStatus ?? customer.skinCondition,
      store: customer.store ? this.mapStore(customer.store) : undefined,
    };
  }

  private mapMarketingNotification(notification: any) {
    return {
      id: notification.id,
      title: notification.title,
      content: notification.content,
      status: notification.status,
      deliveredAt: notification.deliveredAt?.toISOString?.() ?? notification.deliveredAt ?? null,
      openedAt: notification.openedAt?.toISOString?.() ?? notification.openedAt ?? null,
      createdAt: notification.createdAt?.toISOString?.() ?? notification.createdAt,
    };
  }

  private mapProject(project: any, options: { hot?: boolean; detail?: boolean; displayConfig?: any } = {}) {
    const config = options.displayConfig;
    return {
      id: project.id,
      storeId: project.storeId,
      name: project.name,
      description: config?.summary ?? project.description,
      image: config?.bannerImage ?? project.image,
      price: this.toNumber(project.price),
      memberPrice: this.toNumber(project.price),
      duration: Number(project.duration || 60),
      typeName: project.type?.name,
      status: project.status,
      tags: config?.tags?.length ? config.tags : [options.hot ? '热门' : '推荐'].filter(Boolean),
      canBook: project.status === 'active',
      ctaType: config?.ctaType,
      detail: options.detail ? project.description : undefined,
    };
  }

  private mapProduct(product: any, config?: any) {
    return {
      id: product.id,
      name: product.name,
      image: config?.bannerImage ?? product.image,
      price: this.toNumber(product.salePrice ?? product.retailPrice),
      retailPrice: this.toNumber(product.retailPrice),
      discountLabel: product.discountLabel,
      description: config?.summary ?? product.salesDescription,
      tags: config?.tags ?? [],
      ctaType: config?.ctaType,
      targetType: 'product',
    };
  }

  private mapCard(card: any, config?: any) {
    return {
      id: card.id,
      name: card.name,
      description: config?.summary ?? card.description,
      image: config?.bannerImage,
      price: this.toNumber(card.price),
      totalTimes: card.totalTimes,
      projects: this.extractCardProjects(card.projects),
      tags: config?.tags ?? [],
      ctaType: config?.ctaType,
      targetType: 'card',
    };
  }

  private mapPromotion(promotion: any, config?: any) {
    return {
      id: promotion.id,
      name: promotion.name,
      title: promotion.name,
      description: config?.summary ?? promotion.description,
      image: config?.bannerImage,
      discountText: promotion.discountText,
      type: promotion.type,
      source: promotion.source,
      scenario: promotion.scenario,
      approvalStatus: promotion.approvalStatus,
      validDays: promotion.validDays,
      maxIssueCount: promotion.maxIssueCount,
      issuedCount: promotion.issuedCount,
      usedCount: promotion.usedCount,
      applicableProjectIds: promotion.applicableProjectIds ?? [],
      startAt: promotion.startAt?.toISOString(),
      endAt: promotion.endAt?.toISOString(),
      tags: config?.tags ?? ['活动'],
      ctaType: config?.ctaType,
      targetType: 'promotion',
    };
  }

  private isPromotionIssueAvailable(promotion: any) {
    return promotion.maxIssueCount == null || Number(promotion.issuedCount ?? 0) < Number(promotion.maxIssueCount);
  }

  private mapReservation(reservation: any) {
    return {
      id: reservation.id,
      storeId: reservation.storeId,
      storeName: reservation.store?.name,
      customerId: reservation.customerId,
      customerName: reservation.customer?.name,
      customerPhone: reservation.customer?.phone,
      projectId: reservation.projectId,
      projectName: reservation.project?.name,
      projectImage: reservation.project?.image,
      beauticianId: reservation.beauticianId,
      beauticianName: reservation.beautician?.name ?? '到店分配',
      date: this.formatDateKey(reservation.date),
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      status: reservation.status,
      remark: reservation.remark,
      createdAt: reservation.createdAt?.toISOString(),
    };
  }

  private mapSkinTest(skinTest: any) {
    const metrics = skinTest.metrics ?? {};
    return {
      id: skinTest.id,
      customerId: skinTest.customerId,
      images: skinTest.images,
      metrics,
      skinType: skinTest.skinType,
      skinStatus: skinTest.skinStatus,
      mainProblems: skinTest.mainProblems,
      recommendationText: skinTest.recommendationText,
      overallScore: this.calculateOverallScore(metrics),
      createdAt: skinTest.createdAt.toISOString(),
    };
  }

  private async getActiveDisplayConfigs(storeId: number, now = new Date()) {
    return this.prisma.amiGlowDisplayConfig.findMany({
      where: {
        storeId,
        showInAmiGlow: true,
        publishStatus: 'published',
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  private filterDisplayConfigs(configs: any[], objectType: string) {
    return configs.filter((config) => config.objectType === objectType);
  }

  private applyDisplayConfigs<T extends { id: number }>(
    items: T[],
    configs: any[],
    mapper: (item: T, config?: any) => any,
  ) {
    if (!configs.length) return [];
    const itemMap = new Map(items.map((item) => [Number(item.id), item]));
    return configs
      .map((config) => {
        const item = itemMap.get(Number(config.objectId));
        return item ? mapper(item, config) : undefined;
      })
      .filter(Boolean);
  }

  private buildHomeBanners(projects: any[], promotions: any[], marketingPages: any[], pageConfigs: any[] = []) {
    const configuredPageIds = new Set(pageConfigs.map((config) => Number(config.objectId)));
    const sortedPages = pageConfigs.length
      ? pageConfigs
          .map((config) => ({ page: marketingPages.find((item) => item.id === Number(config.objectId)), config }))
          .filter((item) => item.page)
      : marketingPages.map((page) => ({ page, config: undefined }));
    const pageBanners = sortedPages.map(({ page, config }) => ({
      id: `page-${page.id}`,
      title: page.shareTitle || page.title,
      image: config?.bannerImage ?? page.shareImage,
      targetType: 'marketing_page',
      targetId: page.id,
      tag: config?.tags?.[0] ?? '推荐',
      subtitle: config?.summary ?? page.shareDescription,
      path: page.miniappPath,
    }));
    const promotionBanners = promotions.map((promotion) => ({
      id: `promotion-${promotion.id}`,
      title: promotion.name || promotion.title,
      image: promotion.image,
      targetType: 'promotion',
      targetId: promotion.id,
      tag: promotion.tags?.[0] ?? '活动',
      subtitle: promotion.discountText,
    }));
    const projectBanners = projects.slice(0, 3).map((project) => ({
      id: `project-${project.id}`,
      title: project.name,
      image: project.image,
      targetType: 'project',
      targetId: project.id,
      tag: project.tags?.[0] ?? '推荐',
      subtitle: project.description,
    }));
    return [...pageBanners, ...promotionBanners, ...projectBanners]
      .filter((item) => item.targetType !== 'marketing_page' || configuredPageIds.size === 0 || configuredPageIds.has(Number(item.targetId)))
      .slice(0, 5);
  }

  private inferSuitableFor(project: any) {
    const text = `${project.name} ${project.description ?? ''}`;
    if (/补水|保湿|修护/.test(text)) return ['干皮缺水', '换季护理', '屏障修护'];
    if (/清洁|黑头|毛孔/.test(text)) return ['毛孔粗大', '黑头闭口', '油脂分泌旺盛'];
    if (/抗衰|紧致|提升/.test(text)) return ['初老细纹', '松弛下垂', '轮廓管理'];
    return ['日常护理', '到店咨询后确认'];
  }

  private extractCardProjects(projects: any) {
    if (!Array.isArray(projects)) return [];
    return projects.map((item) => (typeof item === 'string' ? item : item.projectName ?? item.name ?? '护理项目'));
  }

  private getSkinRecommendationKeywords(text: string) {
    if (/干|缺水|水分|屏障|敏感/.test(text)) return ['补水', '修护', '保湿'];
    if (/油|毛孔|黑头|痘/.test(text)) return ['清洁', '毛孔', '控油'];
    if (/纹|松弛|抗衰|弹性/.test(text)) return ['抗衰', '紧致', '提升'];
    return ['护理', '补水', '修护'];
  }

  private calculateOverallScore(metrics: Record<string, any>) {
    const values = Object.values(metrics ?? {})
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return undefined;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  private parseDateOnly(value: string) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式无效');
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private combineDateAndTime(dateValue: string, timeValue: string) {
    const date = new Date(`${dateValue}T${timeValue}:00`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('预约时间无效');
    return date;
  }

  private formatDateKey(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(value: Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private buildTimeSlots(startTime: string, endTime: string, duration: number) {
    const slots: string[] = [];
    let cursor = this.timeToMinutes(startTime);
    const end = this.timeToMinutes(endTime);
    const step = duration >= 60 ? 30 : 20;
    while (cursor + duration <= end) {
      slots.push(this.minutesToTime(cursor));
      cursor += step;
    }
    return slots;
  }

  private addMinutesToTime(time: string, minutes: number) {
    return this.minutesToTime(this.timeToMinutes(time) + minutes);
  }

  private overlaps(startA: string, endA: string, startB: string, endB: string) {
    const aStart = this.timeToMinutes(startA);
    const aEnd = this.timeToMinutes(endA);
    const bStart = this.timeToMinutes(startB);
    const bEnd = this.timeToMinutes(endB);
    return aStart < bEnd && bStart < aEnd;
  }

  private timeToMinutes(time: string) {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  }

  private minutesToTime(value: number) {
    const hour = Math.floor(value / 60);
    const minute = value % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private toNumber(value: any) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && typeof value.toNumber === 'function') return value.toNumber();
    return Number(value) || 0;
  }
}
