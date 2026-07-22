import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { CustomerMarketingProfileService } from './customer-marketing-profile.service.js';
import { formatBusinessDate } from '../common/utils/business-time.js';

type ProductProjectRecommendationType =
  | 'product_expiry_clearance'
  | 'project_idle_capacity'
  | 'product_replenishment'
  | 'project_cycle_due';

type RecommendationBuildOptions = {
  type?: string;
  limit?: number;
  matchPromotion?: boolean;
};

type SnapshotContext = { run: any | null; snapshots: SnapshotWithCustomer[] };

type SnapshotWithCustomer = {
  id?: number;
  runId?: number;
  customerId: number;
  churnScore?: number;
  churnLevel?: string;
  repurchase30dScore?: number;
  marketingResponseScore?: number;
  ltv6m?: unknown;
  ltv12m?: unknown;
  ltvTier?: string;
  reasonJson?: unknown;
  customer?: {
    id?: number;
    name?: string;
    phone?: string | null;
    memberLevel?: string | null;
    skinType?: string | null;
    visitCount?: number;
    totalSpent?: unknown;
    lastVisitDate?: Date | string | null;
    store?: { name?: string } | null;
  };
};

const PRODUCT_PROJECT_RECOMMENDATION_MIN_ID = 2100;
const PRODUCT_PROJECT_RECOMMENDATION_MAX_ID = 2499;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ProductProjectRecommendationService {
  private readonly defaultRecommendationImage: string;
  private readonly recommendationPromotionCache = new Map<string, { expiresAt: number; items: any[] }>();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() private customerMarketingProfileService?: CustomerMarketingProfileService,
  ) {
    this.defaultRecommendationImage = this.config.get(
      'MARKETING_RECOMMENDATION_IMAGE_URL',
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400',
    );
  }

  isProductProjectRecommendationId(id: number) {
    return id >= PRODUCT_PROJECT_RECOMMENDATION_MIN_ID && id <= PRODUCT_PROJECT_RECOMMENDATION_MAX_ID;
  }

  async getCards(storeId: number, options: RecommendationBuildOptions = {}) {
    if (!storeId) throw new BadRequestException('storeId is required');
    const snapshotsContext = await this.getLatestSnapshots(storeId);
    const requestedTypes = this.parseTypes(options.type);
    const shouldBuild = (types: string[]) => !requestedTypes.length || types.some((type) => requestedTypes.includes(type));
    const [expiryCards, idleCapacityCards, replenishmentCards, projectCycleCards] = await Promise.all([
      shouldBuild(['product_expiry_clearance']) ? this.buildProductExpiryCards(storeId, snapshotsContext) : Promise.resolve([]),
      shouldBuild(['project_idle_capacity']) ? this.buildIdleCapacityCards(storeId, snapshotsContext) : Promise.resolve([]),
      shouldBuild(['product_replenishment']) ? this.buildProductReplenishmentCards(storeId, snapshotsContext) : Promise.resolve([]),
      shouldBuild(['project_cycle_due', 'care_cycle']) ? this.buildProjectCycleDueCards(storeId, snapshotsContext) : Promise.resolve([]),
    ]);

    const baseCards = [...expiryCards, ...idleCapacityCards, ...replenishmentCards, ...projectCycleCards];
    const enrichedCards = options.matchPromotion === false
      ? baseCards
      : await this.enrichCardsWithPromotions(baseCards, storeId);
    const eligibleCards = await this.applyAudienceExclusionsToCards(enrichedCards, storeId);

    return eligibleCards
      .filter((card) => this.matchesType(card, options.type))
      .sort((a, b) => this.priorityRank(a.priority) - this.priorityRank(b.priority) || b.matchScore - a.matchScore)
      .slice(0, Math.max(1, Math.min(50, Number(options.limit ?? 20))));
  }

  async getAudience(recommendationId: number, storeId: number) {
    if (!storeId) throw new BadRequestException('storeId is required');
    const cards = await this.getCards(storeId);
    const card = cards.find((item) => item.id === recommendationId);
    if (!card) return [];

    const customerIds = Array.isArray(card.targetCustomerIds) ? card.targetCustomerIds : [];
    if (!customerIds.length) return [];

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds }, storeId },
      include: { store: { select: { name: true } } },
      orderBy: { id: 'asc' },
    });
    const reasonByCustomer = new Map<number, any>(
      (card.audienceSnapshot?.sampleReasons ?? []).map((item: any) => [Number(item.customerId), item]),
    );

    const profiles = customers.map((customer: any) => ({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
      segment: customer.memberLevel || '普通会员',
      skinType: customer.skinType,
      storeName: customer.store?.name ?? '',
      lastVisitDate: customer.lastVisitDate?.toISOString?.().slice(0, 10) ?? '',
      visitCount: customer.visitCount ?? 0,
      totalSpent: Number(customer.totalSpent ?? 0),
      recommendationId,
      matchReason: reasonByCustomer.get(customer.id)?.reason ?? card.reason,
    }));
    const filteredProfiles = await this.filterRecommendationAudienceProfiles(profiles, { storeId });
    return this.enrichRecommendationAudienceAssignees(filteredProfiles, storeId, this.getRecommendationAssigneeRole(card));
  }

  private async filterRecommendationAudienceProfiles<T extends { customerId?: number }>(
    profiles: T[],
    options: { storeId: number },
  ) {
    const customerIds = [...new Set(profiles.map((profile) => Number(profile.customerId)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!customerIds.length) return profiles;

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const storeWhere = { storeId: options.storeId };
    const excludedCustomerIds = new Set<number>();
    const touchEventPattern = /push|sms|touch|message|coupon_claimed|promotion_claimed|promotion_sent|marketing|follow_up/i;

    const [recentAutomationTouches, recentFollowUps, appEvents30d, futureReservations] = await Promise.all([
      this.safeFindMany((this.prisma as any).marketingAutomationTouch, {
        where: { customerId: { in: customerIds }, touchedAt: { gte: sevenDaysAgo } },
        select: { customerId: true },
      }),
      this.safeFindMany((this.prisma as any).terminalFollowUpTask, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          deletedAt: null,
          status: { notIn: ['cancelled', 'canceled', 'expired'] },
          createdAt: { gte: sevenDaysAgo },
        },
        select: { customerId: true },
      }),
      this.safeFindMany((this.prisma as any).customerAppEvent, {
        where: { customerId: { in: customerIds }, ...storeWhere, occurredAt: { gte: thirtyDaysAgo } },
        select: { customerId: true, eventType: true, occurredAt: true },
      }),
      this.safeFindMany((this.prisma as any).reservation, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          date: { gte: startOfToday },
          status: { notIn: ['cancelled', 'canceled', 'completed', 'no_show'] },
        },
        select: { customerId: true },
      }),
    ]);

    for (const touch of recentAutomationTouches) excludedCustomerIds.add(Number(touch.customerId));
    for (const task of recentFollowUps) excludedCustomerIds.add(Number(task.customerId));
    for (const reservation of futureReservations) excludedCustomerIds.add(Number(reservation.customerId));

    const touchEventCountByCustomer = new Map<number, number>();
    for (const event of appEvents30d) {
      const customerId = Number(event.customerId);
      if (!customerId || !touchEventPattern.test(String(event.eventType ?? ''))) continue;
      touchEventCountByCustomer.set(customerId, (touchEventCountByCustomer.get(customerId) ?? 0) + 1);
      const occurredAt = event.occurredAt ? new Date(event.occurredAt) : null;
      if (occurredAt && occurredAt >= sevenDaysAgo) excludedCustomerIds.add(customerId);
    }
    for (const [customerId, count] of touchEventCountByCustomer) {
      if (count >= 3) excludedCustomerIds.add(customerId);
    }

    return profiles.filter((profile) => !excludedCustomerIds.has(Number(profile.customerId)));
  }

  private getRecommendationAssigneeRole(card: any) {
    const text = [card.recommendationType, card.triggerType, card.source, card.title, card.reason].filter(Boolean).join(' ');
    if (/expiry|inventory|stock|capacity|临期|库存|低峰|排期|产能|补货/.test(text)) return 'manager';
    if (/booking|appointment|reservation|预约|浏览|放弃|到店/.test(text)) return 'reception';
    return 'consultant';
  }

  private async enrichRecommendationAudienceAssignees<T extends { customerId?: number }>(
    profiles: T[],
    storeId: number,
    assigneeRole = 'consultant',
  ) {
    const customerIds = [...new Set(profiles.map((profile) => Number(profile.customerId)).filter((id) => Number.isFinite(id) && id > 0))];
    if (!customerIds.length) return profiles;

    const storeWhere = { storeId };
    const beauticianUserSelect = {
      id: true,
      name: true,
      username: true,
      status: true,
      deletedAt: true,
      stores: { select: { storeId: true } },
    };
    const beauticianSelect = {
      id: true,
      name: true,
      userId: true,
      user: { select: beauticianUserSelect },
    };
    const [serviceTasks, reservations, fallbackBeauticians, fallbackUsers] = await Promise.all([
      this.safeFindMany((this.prisma as any).serviceTask, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          beauticianId: { not: null },
        },
        include: { beautician: { select: beauticianSelect } },
        orderBy: [{ completedAt: 'desc' }, { appointmentTime: 'desc' }],
      }),
      this.safeFindMany((this.prisma as any).reservation, {
        where: {
          customerId: { in: customerIds },
          ...storeWhere,
          beauticianId: { not: null },
        },
        include: { beautician: { select: beauticianSelect } },
        orderBy: { date: 'desc' },
      }),
      this.safeFindMany((this.prisma as any).beautician, {
        where: {
          ...storeWhere,
          status: 'active',
          userId: { not: null },
          user: {
            status: 'active',
            deletedAt: null,
            stores: { some: { storeId } },
          },
        },
        select: beauticianSelect,
        orderBy: [{ userId: 'desc' }, { id: 'asc' }],
        take: 1,
      }),
      this.safeFindMany((this.prisma as any).user, {
        where: {
          deletedAt: null,
          status: 'active',
          stores: { some: { storeId } },
        },
        include: { roles: { include: { role: true } } },
        orderBy: { id: 'asc' },
        take: 50,
      }),
    ]);

    const getSystemUserFromBeautician = (beautician: any) => {
      const user = beautician?.user;
      if (!user || user.status !== 'active' || user.deletedAt) return null;
      if (!user.stores?.some((store: any) => Number(store.storeId) === Number(storeId))) return null;
      return user;
    };
    const getUserDisplayName = (user: any) => user?.name || user?.username || '系统用户';

    const assigneeByCustomer = new Map<number, Record<string, unknown>>();
    for (const task of serviceTasks) {
      const customerId = Number(task.customerId);
      if (!customerId || assigneeByCustomer.has(customerId) || !task.beautician) continue;
      const assigneeUser = getSystemUserFromBeautician(task.beautician);
      if (!assigneeUser) continue;
      assigneeByCustomer.set(customerId, {
        preferredAssigneeRole: 'consultant',
        preferredAssigneeRoleLabel: '顾问/美容师',
        preferredAssigneeName: getUserDisplayName(assigneeUser),
        preferredAssigneeUserId: assigneeUser.id,
        preferredAssigneeBeauticianId: task.beautician.id,
        preferredAssigneeReason: '最近服务美容师',
      });
    }
    for (const reservation of reservations) {
      const customerId = Number(reservation.customerId);
      if (!customerId || assigneeByCustomer.has(customerId) || !reservation.beautician) continue;
      const assigneeUser = getSystemUserFromBeautician(reservation.beautician);
      if (!assigneeUser) continue;
      assigneeByCustomer.set(customerId, {
        preferredAssigneeRole: 'consultant',
        preferredAssigneeRoleLabel: '顾问/美容师',
        preferredAssigneeName: getUserDisplayName(assigneeUser),
        preferredAssigneeUserId: assigneeUser.id,
        preferredAssigneeBeauticianId: reservation.beautician.id,
        preferredAssigneeReason: '最近预约美容师',
      });
    }
    const roleSignals: Record<string, string[]> = {
      manager: ['store_manager', 'manager', '店长'],
      reception: ['reception', 'frontdesk', 'cashier', '前台'],
      consultant: ['consultant', 'advisor', 'beautician', '顾问', '美容师'],
    };
    const fallbackUser =
      fallbackUsers.find((user: any) =>
        user.roles?.some(({ role }: any) => {
          const text = `${role.key} ${role.name}`.toLowerCase();
          return (roleSignals[assigneeRole] ?? roleSignals.consultant).some((signal) => text.includes(signal.toLowerCase()));
        }),
      ) ?? fallbackUsers[0];
    const fallbackBeautician = fallbackBeauticians.find((beautician: any) => getSystemUserFromBeautician(beautician));
    const fallbackBeauticianUser = getSystemUserFromBeautician(fallbackBeautician);

    return profiles.map((profile) => ({
      ...profile,
      ...(assigneeByCustomer.get(Number(profile.customerId)) ??
        (assigneeRole === 'consultant' && fallbackBeautician && fallbackBeauticianUser
          ? {
              preferredAssigneeRole: 'consultant',
              preferredAssigneeRoleLabel: '顾问/美容师',
              preferredAssigneeName: getUserDisplayName(fallbackBeauticianUser),
              preferredAssigneeUserId: fallbackBeauticianUser.id,
              preferredAssigneeBeauticianId: fallbackBeautician.id,
              preferredAssigneeReason: '无历史服务人，按门店兜底分派',
            }
          : fallbackUser
            ? {
                preferredAssigneeRole: assigneeRole,
                preferredAssigneeRoleLabel: assigneeRole === 'manager' ? '店长' : assigneeRole === 'reception' ? '前台' : '顾问/美容师',
                preferredAssigneeName: fallbackUser.name || fallbackUser.username,
                preferredAssigneeUserId: fallbackUser.id,
                preferredAssigneeBeauticianId: undefined,
                preferredAssigneeReason:
                  assigneeRole === 'manager'
                    ? '经营协调类任务，按店长兜底分派'
                    : assigneeRole === 'reception'
                      ? '预约邀约类任务，按前台兜底分派'
                      : '无历史服务人，按门店员工兜底分派',
              }
            : {})),
    }));
  }

  private async safeFindMany(delegate: any, args: any) {
    if (!delegate?.findMany) return [];
    try {
      return await delegate.findMany(args);
    } catch (error) {
      console.warn('recommendation audience exclusion query failed', error);
      return [];
    }
  }

  private async buildProductExpiryCards(storeId: number, snapshotsContext?: SnapshotContext) {
    const now = new Date();
    const sixtyDaysLater = new Date(now.getTime() + 60 * DAY_MS);
    const batches = await this.prisma.stockBatch.findMany({
      where: {
        expiryDate: { lte: sixtyDaysLater, gte: now },
        stock: { gt: 0 },
        product: { deletedAt: null, status: 'active', storeId },
      },
      include: {
        product: {
          include: {
            category: true,
            bomItems: { include: { project: { include: { type: true } } } },
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
      take: 20,
    });
    if (!batches.length) return [];

    const productIds = [...new Set(batches.map((batch: any) => Number(batch.productId)).filter(Boolean))];
    const sales30d = await this.getProductSalesQuantity(productIds, new Date(now.getTime() - 30 * DAY_MS), storeId);
    const context = snapshotsContext ?? await this.getLatestSnapshots(storeId);
    const snapshots = context.snapshots;

    const cards = batches
      .map((batch: any, index: number) => {
        const product = batch.product;
        if (!product) return null;

        const productId = Number(product.id);
        const stock = this.toNumber(batch.stock);
        const daysToExpiry = Math.max(0, this.daysBetween(now, batch.expiryDate));
        const dailySales = (sales30d.get(productId) ?? 0) / 30;
        const forecastSellThroughQty = Math.round(dailySales * daysToExpiry);
        const gapQty = Math.max(0, Math.ceil(stock - forecastSellThroughQty));
        const expectedLossAmount = gapQty * this.toNumber(product.costPrice);
        if (gapQty <= 0 && expectedLossAmount < 100) return null;

        const relatedProjects = (product.bomItems ?? [])
          .map((item: any) => item.project)
          .filter((project: any) => project && !project.deletedAt && project.status !== 'inactive')
          .slice(0, 2);
        const targetSnapshots = this.pickTargetSnapshots(snapshots, 40, (snapshot) =>
          this.toNumber(snapshot.marketingResponseScore) >= 55 || this.toNumber(snapshot.repurchase30dScore) >= 50,
        );
        const urgency = daysToExpiry <= 15 ? 'urgent' : 'recommended';
        const riskWarnings = [
          '活动库存上限不得超过临期可用库存',
          ...(daysToExpiry <= 7 ? ['7 天内临期商品不建议大范围对客促销，优先顾问确认或合规处理'] : []),
        ];
        const score = this.clamp(
          this.scoreDaysToExpiry(daysToExpiry) * 0.35
            + this.scoreRatio(gapQty, Math.max(stock, 1)) * 0.3
            + this.scoreAmount(expectedLossAmount, 3000) * 0.2
            + (relatedProjects.length ? 80 : 45) * 0.15,
          60,
          98,
        );

        return this.buildCard({
          id: 2100 + index,
          recommendationType: 'product_expiry_clearance',
          title: `${product.name} ${daysToExpiry} 天内临期，建议消化 ${gapQty} ${product.specUnit ?? product.unit ?? '件'}`,
          reason: `当前批次 ${batch.batchNo} 剩余 ${stock}${product.specUnit ?? product.unit ?? ''}，按近 30 天销量预测到期前自然消化约 ${forecastSellThroughQty}${product.specUnit ?? product.unit ?? ''}，存在 ${gapQty}${product.specUnit ?? product.unit ?? ''} 缺口。`,
          targetLabel: `临期商品高匹配客户（${targetSnapshots.length}人）`,
          targetSnapshots,
          matchScore: Math.round(score),
          expectedConversionRate: daysToExpiry <= 15 ? 0.32 : 0.24,
          expectedRevenue: Math.max(0, Math.min(gapQty, targetSnapshots.length) * this.toNumber(product.retailPrice) * 0.55),
          expectedLossAvoided: expectedLossAmount,
          expectedGrossProfit: Math.max(0, Math.min(gapQty, targetSnapshots.length) * (this.toNumber(product.retailPrice) - this.toNumber(product.costPrice)) * 0.55),
          strategy: relatedProjects.length
            ? `将 ${product.name} 与 ${relatedProjects[0].name} 组合为护理权益，优先顾问跟进高响应客户。`
            : `对 ${product.name} 设置会员限时权益，先小范围触达高响应客户。`,
          discount: relatedProjects.length ? '项目搭赠/护理组合权益' : '会员限时临期专属权益',
          category: 'inventory-opportunity',
          source: 'inventory',
          triggerType: 'product_expiry_clearance',
          priority: 'P0',
          urgency,
          urgencyLabel: daysToExpiry <= 15 ? '紧急' : '推荐',
          executionModes: daysToExpiry <= 7 ? ['advisor_task'] : ['activity', 'advisor_task'],
          preferredMode: daysToExpiry <= 7 ? 'advisor_task' : 'activity',
          modeReason: daysToExpiry <= 7
            ? '剩余可售窗口过短，不默认发起大范围对客活动，建议先由顾问确认合规处理。'
            : '临期库存有明确时间窗口，适合用一次性活动或顾问任务集中消化。',
          offer: {
            type: 'bundle',
            label: relatedProjects.length ? `${relatedProjects[0].name} 搭赠 ${product.name}` : `${product.name} 会员限时权益`,
            validDays: Math.min(30, Math.max(3, daysToExpiry - 3)),
            reason: '优先用项目权益或会员权益消化临期库存，减少直接降价伤害。',
          },
          recommendedItems: [
            {
              type: 'product',
              id: productId,
              name: product.name,
              category: product.category?.name ?? product.category ?? '商品',
              price: this.toNumber(product.retailPrice),
              reason: `批次 ${batch.batchNo} 临期，预计缺口 ${gapQty}${product.specUnit ?? product.unit ?? ''}。`,
              confidence: 92,
            },
            ...relatedProjects.map((project: any) => ({
              type: 'project',
              id: project.id,
              name: project.name,
              category: project.type?.name ?? '关联项目',
              price: this.toNumber(project.price),
              reason: '项目 BOM 与临期商品存在服务关联，适合组合承接。',
              confidence: 78,
            })),
          ],
          recommendedChannels: [
            { channel: 'miniapp', label: '小程序', reason: '活动页承接领券、预约和商品说明。', priority: 'P0' },
            { channel: 'store', label: '顾问跟进', reason: '临期商品需要顾问解释适用场景并控制客诉风险。', priority: 'P0' },
          ],
          inventorySnapshot: {
            productId,
            productName: product.name,
            batchId: batch.id,
            batchNo: batch.batchNo,
            stock,
            daysToExpiry,
            forecastSellThroughQty,
            gapQty,
            expectedLossAmount: Math.round(expectedLossAmount),
          },
          sourceSignals: ['stock_batch', 'product_sales_30d', 'project_bom', 'prediction_snapshot'],
          dataEvidence: [
            `批次 ${batch.batchNo} 剩余 ${stock}${product.specUnit ?? product.unit ?? ''}`,
            `距离到期 ${daysToExpiry} 天`,
            `预计自然消化 ${forecastSellThroughQty}${product.specUnit ?? product.unit ?? ''}，缺口 ${gapQty}${product.specUnit ?? product.unit ?? ''}`,
            `预计可避免损耗 ¥${Math.round(expectedLossAmount).toLocaleString()}`,
          ],
          riskWarnings,
          predictionRunId: context.run?.id,
          modelVersion: context.run?.modelVersion,
        });
      })
      .filter(Boolean) as any[];

    return cards.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
  }

  private async buildIdleCapacityCards(storeId: number, snapshotsContext?: SnapshotContext) {
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * DAY_MS);
    const schedules = await this.prisma.schedule.findMany({
      where: {
        date: { gte: this.startOfDay(now), lte: sevenDaysLater },
        status: { in: ['available', 'active', 'normal', '可预约', '空闲'] },
        storeId,
      },
      include: { beautician: { include: { projectSkills: { include: { project: { include: { type: true } } } } } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 300,
    });
    if (!schedules.length) return [];

    const reservations = await this.prisma.reservation.findMany({
      where: {
        date: { gte: this.startOfDay(now), lte: sevenDaysLater },
        status: { notIn: ['cancelled', 'canceled', '已取消'] },
        storeId,
      },
      select: { id: true, customerId: true, projectId: true, beauticianId: true, date: true, startTime: true, endTime: true, status: true },
    });
    const context = snapshotsContext ?? await this.getLatestSnapshots(storeId);
    const bookedCustomerIds = new Set(reservations.map((item: any) => Number(item.customerId)).filter(Boolean));
    const targetSnapshots = this.pickTargetSnapshots(
      context.snapshots,
      60,
      (snapshot) =>
        !bookedCustomerIds.has(Number(snapshot.customerId)) &&
        (this.toNumber(snapshot.repurchase30dScore) >= 55 || this.toNumber(snapshot.marketingResponseScore) >= 65),
    );
    if (!targetSnapshots.length) return [];

    const groups = new Map<string, any[]>();
    for (const schedule of schedules as any[]) {
      const dateKey = this.toDateKey(schedule.date);
      const timeBand = this.lowPeakBand(schedule.startTime) ?? `${schedule.startTime}-${schedule.endTime}`;
      const key = `${schedule.storeId}:${dateKey}:${timeBand}`;
      groups.set(key, [...(groups.get(key) ?? []), schedule]);
    }

    const cards = Array.from(groups.entries())
      .map(([key, group], index) => {
        const [store, date, timeRange] = key.split(':');
        const scheduledMinutes = group.reduce((sum, item) => sum + this.minutesBetween(item.startTime, item.endTime), 0);
        const relevantReservations = reservations.filter((reservation: any) => {
          if (String(reservation.storeId ?? store) !== store) return false;
          if (this.toDateKey(reservation.date) !== date) return false;
          return group.some((schedule) =>
            (!reservation.beauticianId || reservation.beauticianId === schedule.beauticianId) &&
            this.overlaps(schedule.startTime, schedule.endTime, reservation.startTime, reservation.endTime ?? reservation.startTime),
          );
        });
        const bookedMinutes = relevantReservations.reduce(
          (sum: number, item: any) => sum + Math.max(30, this.minutesBetween(item.startTime, item.endTime ?? this.addMinutesToTime(item.startTime, 60))),
          0,
        );
        const idleMinutes = Math.max(0, scheduledMinutes - bookedMinutes);
        const utilizationRate = scheduledMinutes > 0 ? bookedMinutes / scheduledMinutes : 1;
        if (utilizationRate >= 0.6 || idleMinutes < 120) return null;

        const beauticianIds = [...new Set(group.map((item) => Number(item.beauticianId)).filter(Boolean))];
        const skilledProjects = group
          .flatMap((item) => item.beautician?.projectSkills ?? [])
          .map((skill: any) => skill.project)
          .filter((project: any) => project && !project.deletedAt && project.status !== 'inactive');
        const uniqueProjects = Array.from(new Map(skilledProjects.map((project: any) => [project.id, project])).values()).slice(0, 3);
        const projectName = uniqueProjects[0]?.name ?? '低峰护理项目';
        const score = this.clamp((1 - utilizationRate) * 100 * 0.45 + Math.min(100, idleMinutes / 4) * 0.25 + 80 * 0.3, 60, 96);

        return this.buildCard({
          id: 2200 + index,
          recommendationType: 'project_idle_capacity',
          title: `${date} ${timeRange} 预约占用率 ${Math.round(utilizationRate * 100)}%，建议推低峰护理`,
          reason: `该时段可预约工时约 ${Math.round(scheduledMinutes / 60)} 小时，已预约约 ${Math.round(bookedMinutes / 60)} 小时，仍有 ${Math.round(idleMinutes / 60)} 小时可售产能。`,
          targetLabel: `低峰可预约客户（${targetSnapshots.length}人）`,
          targetSnapshots,
          matchScore: Math.round(score),
          expectedConversionRate: 0.28,
          expectedRevenue: targetSnapshots.length * 280 * 0.28,
          expectedGrossProfit: targetSnapshots.length * 160 * 0.28,
          strategy: `针对复购窗口和高响应客户推送 ${projectName} 低峰专享权益，绑定 ${date} ${timeRange} 使用。`,
          discount: '低峰专享护理券',
          category: 'capacity-opportunity',
          source: 'capacity',
          triggerType: 'project_idle_capacity',
          priority: 'P0',
          urgency: 'urgent',
          urgencyLabel: '紧急',
          executionModes: ['activity', 'advisor_task'],
          preferredMode: 'activity',
          modeReason: '排期空档有明确日期和时段，适合一次性低峰活动或顾问邀约任务。',
          offer: {
            type: 'low_peak_privilege',
            label: `${date} ${timeRange} 低峰专享护理券`,
            validDays: 7,
            usableTimeRange: `${date} ${timeRange}`,
            reason: '低峰权益只绑定空闲时段，避免影响黄金时段价格体系。',
          },
          recommendedItems: uniqueProjects.length
            ? uniqueProjects.map((project: any) => ({
                type: 'project',
                id: project.id,
                name: project.name,
                category: project.type?.name ?? '可服务项目',
                price: this.toNumber(project.price),
                activityPrice: Math.round(this.toNumber(project.price) * 0.85),
                reason: '该时段美容师具备项目服务能力，适合低峰承接。',
                confidence: 84,
              }))
            : [{ type: 'project', name: '低峰护理项目', category: '预约填充', activityPrice: 298, reason: '当前时段存在可售产能。', confidence: 70 }],
          recommendedChannels: [
            { channel: 'miniapp', label: '小程序', reason: '直接展示可约时段和预约入口。', priority: 'P0' },
            { channel: 'store', label: '顾问跟进', reason: '空闲美容师可优先回访老客。', priority: 'P0' },
          ],
          capacitySnapshot: {
            dateRange: `${date} ${timeRange}`,
            idleSlots: Math.floor(idleMinutes / 60),
            idleMinutes,
            utilizationRate: Number(utilizationRate.toFixed(2)),
            beauticianIds,
            projectIds: uniqueProjects.map((project: any) => Number(project.id)),
          },
          sourceSignals: ['schedule', 'reservation', 'beautician_skill', 'prediction_snapshot'],
          dataEvidence: [
            `可预约工时约 ${Math.round(scheduledMinutes / 60)} 小时`,
            `已预约工时约 ${Math.round(bookedMinutes / 60)} 小时`,
            `预约占用率 ${Math.round(utilizationRate * 100)}%`,
            `可服务美容师 ${beauticianIds.length} 位`,
          ],
          riskWarnings: ['低峰券必须绑定指定日期/时段', '活动发布前需实时校验余位，避免超卖'],
          predictionRunId: context.run?.id,
          modelVersion: context.run?.modelVersion,
        });
      })
      .filter(Boolean) as any[];

    return cards.sort((a, b) => b.capacitySnapshot.idleMinutes - a.capacitySnapshot.idleMinutes).slice(0, 3);
  }

  private async buildProductReplenishmentCards(storeId: number, snapshotsContext?: SnapshotContext) {
    const now = new Date();
    const lookbackDate = new Date(now.getTime() - 150 * DAY_MS);
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'product',
        itemId: { not: null },
        order: {
          createdAt: { gte: lookbackDate },
          status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
          customerId: { not: null },
          storeId,
        },
      },
      include: {
        order: { select: { id: true, customerId: true, customerName: true, storeId: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    if (!orderItems.length) return [];

    const productIds = [...new Set(orderItems.map((item: any) => Number(item.itemId)).filter(Boolean))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null, status: 'active', storeId },
      include: { category: true },
    });
    const productMap = new Map(products.map((product: any) => [Number(product.id), product]));
    const latestByCustomerProduct = new Map<string, any>();
    for (const item of orderItems as any[]) {
      const productId = Number(item.itemId);
      const customerId = Number(item.order?.customerId);
      if (!productId || !customerId || !productMap.has(productId)) continue;
      const key = `${customerId}:${productId}`;
      const existing = latestByCustomerProduct.get(key);
      if (!existing || new Date(item.order.createdAt) > new Date(existing.order.createdAt)) {
        latestByCustomerProduct.set(key, item);
      }
    }

    const dueByProduct = new Map<number, { product: any; items: any[]; replenishmentDays: number }>();
    for (const item of latestByCustomerProduct.values()) {
      const productId = Number(item.itemId);
      const product = productMap.get(productId);
      const replenishmentDays = this.productReplenishmentDays(product);
      const lastPurchaseDate = new Date(item.order.createdAt);
      const daysSincePurchase = this.daysBetween(lastPurchaseDate, now);
      const currentStock = this.toNumber(product.currentStock);
      const safetyStock = this.toNumber(product.safetyStock);
      if (daysSincePurchase < replenishmentDays) continue;
      if (safetyStock > 0 && currentStock <= safetyStock) continue;
      const group = dueByProduct.get(productId) ?? { product, items: [], replenishmentDays };
      group.items.push(item);
      dueByProduct.set(productId, group);
    }

    const context = snapshotsContext ?? await this.getLatestSnapshots(storeId);
    const snapshotByCustomer = new Map(context.snapshots.map((snapshot) => [Number(snapshot.customerId), snapshot]));

    const cards = Array.from(dueByProduct.values())
      .filter((group) => group.items.length >= 1)
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 3)
      .map((group, index) => {
        const customerIds = [...new Set(group.items.map((item) => Number(item.order.customerId)).filter(Boolean))];
        const targetSnapshots = customerIds
          .map((customerId) => snapshotByCustomer.get(customerId))
          .filter(Boolean) as SnapshotWithCustomer[];
        const fallbackSnapshots = targetSnapshots.length ? targetSnapshots : this.pickTargetSnapshots(context.snapshots, Math.min(40, customerIds.length || 20));
        const avgPrice = this.toNumber(group.product.retailPrice);
        const expectedRevenue = Math.max(0, customerIds.length * avgPrice * 0.26);
        const score = this.clamp(70 + Math.min(20, customerIds.length * 2) + (this.toNumber(group.product.currentStock) > this.toNumber(group.product.safetyStock) * 2 ? 5 : 0), 65, 96);

        return this.buildCard({
          id: 2300 + index,
          recommendationType: 'product_replenishment',
          title: `${customerIds.length} 位客户进入 ${group.product.name} 补货周期`,
          reason: `客户上次购买 ${group.product.name} 已达到约 ${group.replenishmentDays} 天消耗周期，且当前库存高于安全库存，适合自动提醒复购。`,
          targetLabel: `${group.product.name} 补货周期客户（${customerIds.length}人）`,
          targetCustomerIds: customerIds,
          targetSnapshots: fallbackSnapshots,
          matchScore: Math.round(score),
          expectedConversionRate: 0.26,
          expectedRevenue,
          expectedGrossProfit: Math.max(0, customerIds.length * (avgPrice - this.toNumber(group.product.costPrice)) * 0.26),
          strategy: '按商品消耗周期自动提醒补货，并可搭配下一次护理预约入口。',
          discount: '补货复购专属提醒',
          category: 'product-replenishment',
          source: 'product',
          triggerType: 'product_replenishment',
          priority: 'P0',
          urgency: 'recommended',
          urgencyLabel: '推荐',
          executionModes: ['automation', 'activity'],
          preferredMode: 'automation',
          modeReason: '商品补货周期按客户滚动变化，最适合配置为自动营销规则。',
          offer: { type: 'money_off', label: '补货复购小额券', amount: 30, validDays: 14, reason: '补货客户已有明确需求，小额权益即可促进复购。' },
          recommendedItems: [{
            type: 'product',
            id: Number(group.product.id),
            name: group.product.name,
            category: group.product.category?.name ?? '商品补货',
            price: avgPrice,
            reason: `默认消耗周期 ${group.replenishmentDays} 天，当前客户已到补货窗口。`,
            confidence: 88,
          }],
          recommendedChannels: [
            { channel: 'miniapp', label: '小程序', reason: '补货提醒可直接承接商品详情和下单。', priority: 'P0' },
            { channel: 'wechat', label: '微信', reason: '顾问可补充居家护理建议。', priority: 'P1' },
          ],
          sourceSignals: ['order_item', 'product_replenishment_cycle', 'stock_safety'],
          dataEvidence: [
            `默认补货周期 ${group.replenishmentDays} 天`,
            `命中客户 ${customerIds.length} 位`,
            `当前库存 ${this.toNumber(group.product.currentStock)}${group.product.specUnit ?? group.product.unit ?? ''}`,
            `安全库存 ${this.toNumber(group.product.safetyStock)}${group.product.specUnit ?? group.product.unit ?? ''}`,
          ],
          riskWarnings: ['库存低于安全库存时不扩大营销曝光', '同客户同商品 14 天内最多触达 1 次'],
          predictionRunId: context.run?.id,
          modelVersion: context.run?.modelVersion,
        });
      });

    return cards;
  }

  private async buildProjectCycleDueCards(storeId: number, snapshotsContext?: SnapshotContext) {
    const now = new Date();
    const lookbackDate = new Date(now.getTime() - 180 * DAY_MS);
    const projectItems = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'project',
        itemId: { not: null },
        order: {
          createdAt: { gte: lookbackDate },
          status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
          customerId: { not: null },
          storeId,
        },
      },
      include: {
        order: { select: { id: true, customerId: true, storeId: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1200,
    });
    if (!projectItems.length) return [];

    const projectIds = [...new Set(projectItems.map((item: any) => Number(item.itemId)).filter(Boolean))];
    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds }, deletedAt: null, status: 'active', storeId },
      include: { type: true },
    });
    const projectMap = new Map(projects.map((project: any) => [Number(project.id), project]));
    const projectCapacityMap = await this.getProjectCapacityByProject(projectIds, storeId, now);
    const latestByCustomerProject = new Map<string, any>();
    for (const item of projectItems as any[]) {
      const customerId = Number(item.order?.customerId);
      const projectId = Number(item.itemId);
      if (!customerId || !projectId || !projectMap.has(projectId)) continue;
      const key = `${customerId}:${projectId}`;
      const existing = latestByCustomerProject.get(key);
      if (!existing || new Date(item.order.createdAt) > new Date(existing.order.createdAt)) {
        latestByCustomerProject.set(key, item);
      }
    }

    const customerIds = [...new Set(Array.from(latestByCustomerProject.values()).map((item: any) => Number(item.order.customerId)).filter(Boolean))];
    const futureReservations = customerIds.length
      ? await this.prisma.reservation.findMany({
          where: {
            customerId: { in: customerIds },
            date: { gte: now },
            status: { notIn: ['cancelled', 'canceled', '已取消'] },
            storeId,
          },
          select: { customerId: true, projectId: true },
        })
      : [];
    const bookedKeys = new Set(futureReservations.map((item: any) => `${item.customerId}:${item.projectId}`));
    const dueByProject = new Map<number, { project: any; items: any[]; cycleDays: number; capacity: any }>();
    for (const item of latestByCustomerProject.values()) {
      const projectId = Number(item.itemId);
      const project = projectMap.get(projectId);
      const capacity = projectCapacityMap.get(projectId);
      const cycleDays = this.projectCycleDays(project);
      const lastServiceDate = new Date(item.order.createdAt);
      const daysSinceService = this.daysBetween(lastServiceDate, now);
      if (daysSinceService < cycleDays) continue;
      if (bookedKeys.has(`${item.order.customerId}:${projectId}`)) continue;
      if (!capacity || capacity.idleMinutes < 60) continue;
      const group = dueByProject.get(projectId) ?? { project, items: [], cycleDays, capacity };
      group.items.push(item);
      dueByProject.set(projectId, group);
    }

    const context = snapshotsContext ?? await this.getLatestSnapshots(storeId);
    const snapshotByCustomer = new Map(context.snapshots.map((snapshot) => [Number(snapshot.customerId), snapshot]));

    return Array.from(dueByProject.values())
      .filter((group) => group.items.length >= 1)
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 3)
      .map((group, index) => {
        const targetCustomerIds = [...new Set(group.items.map((item) => Number(item.order.customerId)).filter(Boolean))];
        const targetSnapshots = targetCustomerIds
          .map((customerId) => snapshotByCustomer.get(customerId))
          .filter(Boolean) as SnapshotWithCustomer[];
        const fallbackSnapshots = targetSnapshots.length ? targetSnapshots : this.pickTargetSnapshots(context.snapshots, Math.min(50, targetCustomerIds.length || 20));
        const price = this.toNumber(group.project.price);
        const score = this.clamp(68 + Math.min(18, targetCustomerIds.length * 2) + this.average(fallbackSnapshots.map((item) => this.toNumber(item.repurchase30dScore))) * 0.12, 65, 96);

        return this.buildCard({
          id: 2400 + index,
          recommendationType: 'project_cycle_due',
          title: `${targetCustomerIds.length} 位客户进入 ${group.project.name} 护理周期`,
          reason: `客户距离上次 ${group.project.name} 已达到约 ${group.cycleDays} 天护理周期，且未来未预约同项目，适合自动提醒复购。`,
          targetLabel: `${group.project.name} 护理周期客户（${targetCustomerIds.length}人）`,
          targetCustomerIds,
          targetSnapshots: fallbackSnapshots,
          matchScore: Math.round(score),
          expectedConversionRate: 0.32,
          expectedRevenue: Math.max(0, targetCustomerIds.length * price * 0.32),
          expectedGrossProfit: Math.max(0, targetCustomerIds.length * price * 0.55 * 0.32),
          strategy: `按 ${group.cycleDays} 天护理周期推送 ${group.project.name} 预约提醒，配合小额项目券和顾问建议。`,
          discount: '护理周期复购专享券',
          category: 'project-cycle',
          source: 'project',
          triggerType: 'care_cycle',
          priority: 'P0',
          urgency: 'recommended',
          urgencyLabel: '推荐',
          executionModes: ['automation', 'activity'],
          preferredMode: 'automation',
          modeReason: '护理周期按客户滚动变化，适合长期自动提醒；也可叠加低峰活动集中转化。',
          offer: { type: 'money_off', label: '护理周期专享满500减80', threshold: 500, amount: 80, validDays: 21, reason: '小额项目券配合预约入口即可推动复购。' },
          recommendedItems: [{
            type: 'project',
            id: Number(group.project.id),
            name: group.project.name,
            category: group.project.type?.name ?? '护理项目',
            price,
            activityPrice: price ? Math.round(price * 0.9) : undefined,
            reason: `默认护理周期 ${group.cycleDays} 天，当前客户已到复购提醒点。`,
            confidence: 88,
          }],
          recommendedChannels: [
            { channel: 'miniapp', label: '小程序', reason: '周期提醒需要直接承接预约入口。', priority: 'P0' },
            { channel: 'sms', label: '短信', reason: '未读小程序消息时补充提醒。', priority: 'P1' },
          ],
          sourceSignals: ['order_item', 'project_cycle', 'reservation_exclusion', 'prediction_snapshot'],
          capacitySnapshot: {
            dateRange: group.capacity.dateRange,
            idleSlots: Math.floor(group.capacity.idleMinutes / 60),
            idleMinutes: group.capacity.idleMinutes,
            utilizationRate: group.capacity.utilizationRate,
            beauticianIds: group.capacity.beauticianIds,
            projectIds: [Number(group.project.id)],
          },
          dataEvidence: [
            `默认护理周期 ${group.cycleDays} 天`,
            `命中客户 ${targetCustomerIds.length} 位`,
            `未来 7 天同项目可预约工时约 ${Math.round(group.capacity.idleMinutes / 60)} 小时`,
            '已排除未来有同项目预约的客户',
          ],
          riskWarnings: ['已有未来预约客户不重复触达', '同客户同项目 7 天内最多触达 1 次'],
          predictionRunId: context.run?.id,
          modelVersion: context.run?.modelVersion,
        });
      });
  }

  private buildCard(input: any) {
    const targetSnapshots: SnapshotWithCustomer[] = input.targetSnapshots ?? [];
    const snapshotCustomerIds = targetSnapshots.map((item) => Number(item.customerId)).filter(Boolean);
    const targetCustomerIds = input.targetCustomerIds?.length ? input.targetCustomerIds : snapshotCustomerIds;
    const targetCount = input.targetCount ?? targetCustomerIds.length ?? targetSnapshots.length;
    const audienceSnapshot = {
      predictionRunId: input.predictionRunId,
      generatedAt: new Date().toISOString(),
      ruleSummary: input.targetLabel ?? input.reason,
      customerIds: targetCustomerIds,
      totalCustomers: targetCount,
      sampleReasons: targetSnapshots.slice(0, 10).map((snapshot) => ({
        customerId: snapshot.customerId,
        reason: this.formatSnapshotReason(snapshot, input.reason),
        score: this.toNumber(snapshot.marketingResponseScore) || this.toNumber(snapshot.repurchase30dScore) || this.toNumber(snapshot.churnScore),
      })),
    };

    return {
      id: input.id,
      recommendationType: input.recommendationType,
      recommendationKey: `${input.recommendationType}:${input.id}:${formatBusinessDate(new Date())}`,
      title: input.title,
      reason: input.reason,
      targetCustomers: input.targetLabel ?? `目标客户（${targetCount}人）`,
      targetCount,
      targetCustomerIds,
      expectedConversion: `预计转化率 ${Math.round((input.expectedConversionRate ?? 0.25) * 100)}%`,
      expectedRevenue: `预计营收 ¥${Math.round(input.expectedRevenue ?? 0).toLocaleString()}`,
      expectedGrossProfit: input.expectedGrossProfit != null ? `预计毛利 ¥${Math.round(input.expectedGrossProfit).toLocaleString()}` : undefined,
      expectedLossAvoided: input.expectedLossAvoided != null ? `预计避免损耗 ¥${Math.round(input.expectedLossAvoided).toLocaleString()}` : undefined,
      strategy: input.strategy,
      discount: input.discount,
      duration: input.duration ?? '建议周期: 30天',
      matchScore: input.matchScore,
      image: this.defaultRecommendationImage,
      tags: input.tags ?? ['经营推荐', input.priority],
      category: input.category,
      source: input.source,
      triggerType: input.triggerType,
      triggerRule: {
        type: input.triggerType,
        params: this.defaultTriggerParams(input.triggerType, input),
        defaultEditable: true,
        reason: input.modeReason,
      },
      preferAutoRule: input.preferredMode === 'automation',
      executionModes: input.executionModes,
      preferredMode: input.preferredMode,
      modeReason: input.modeReason,
      priority: input.priority,
      recommendedChannels: input.recommendedChannels,
      recommendedActions: input.recommendedActions ?? input.recommendedChannels.map((channel: any) => ({
        type: channel.channel === 'store' ? 'consultant_task' : 'coupon',
        value: input.offer?.label ?? input.discount,
        channel: channel.channel,
        reason: channel.reason,
      })),
      offer: input.offer,
      recommendedItems: input.recommendedItems,
      audienceSnapshot,
      sourceSignals: input.sourceSignals,
      urgency: input.urgency,
      urgencyLabel: input.urgencyLabel,
      predictionRunId: input.predictionRunId,
      modelVersion: input.modelVersion,
      predictionType: input.recommendationType,
      predictionRunFinishedAt: new Date().toISOString(),
      dataEvidence: input.dataEvidence,
      totalCustomers: targetCount,
      inventorySnapshot: input.inventorySnapshot,
      capacitySnapshot: input.capacitySnapshot,
      riskWarnings: input.riskWarnings ?? [],
    };
  }

  private async applyAudienceExclusionsToCards(cards: any[], storeId: number) {
    return Promise.all(cards.map(async (card) => {
      const originalCustomerIds = this.uniqueNumbers(card.targetCustomerIds ?? []);
      if (!originalCustomerIds.length) return card;
      const eligibleProfiles = await this.filterRecommendationAudienceProfiles(
        originalCustomerIds.map((customerId) => ({ customerId })),
        { storeId },
      );
      const targetCustomerIds = eligibleProfiles.map((profile: any) => Number(profile.customerId)).filter(Boolean);
      const targetCount = targetCustomerIds.length;
      return {
        ...card,
        title: this.replaceRecommendationCount(card.title, targetCount),
        targetCustomers: this.replaceRecommendationCount(card.targetCustomers, targetCount),
        targetCount,
        targetCustomerIds,
        audienceSnapshot: card.audienceSnapshot
          ? {
              ...card.audienceSnapshot,
              customerIds: targetCustomerIds,
              totalCustomers: targetCount,
            }
          : card.audienceSnapshot,
        dataEvidence: Array.isArray(card.dataEvidence)
          ? card.dataEvidence.map((item: string) => String(item).replace(/命中客户\s*\d+\s*位/, `命中客户 ${targetCount} 位`))
          : card.dataEvidence,
        totalCustomers: targetCount,
      };
    }));
  }

  private replaceRecommendationCount(text: string | undefined, count: number) {
    if (!text) return text;
    if (/^\d+\s*位/.test(text)) return text.replace(/^\d+\s*位/, `${count} 位`);
    if (/（\d+\s*人）/.test(text)) return text.replace(/（\d+\s*人）/, `（${count}人）`);
    if (/\(\d+\s*人\)/.test(text)) return text.replace(/\(\d+\s*人\)/, `（${count}人）`);
    return text;
  }

  private async enrichCardsWithPromotions(cards: any[], storeId: number) {
    if (!cards.length) return cards;
    const promotions = await this.getRecommendationPromotions(storeId);
    const allCustomerIds = this.uniqueNumbers(cards.flatMap((card) => card.targetCustomerIds ?? [])).slice(0, 80);
    const profileContext = await this.buildRecommendationProfileContext(storeId, allCustomerIds);

    if (!promotions.length) {
      return cards.map((card) => ({
        ...card,
        audienceTags: profileContext.audienceTags,
        audienceRule: profileContext.audienceRule,
        dataEvidence: [...(card.dataEvidence ?? []), ...(profileContext.profileEvidence ?? [])],
      }));
    }

    return cards.map((card) => {
      const match = this.matchCardPromotion(card, promotions, profileContext);
      const selectedPromotion = match.selected;
      if (!selectedPromotion) {
        return {
          ...card,
          audienceTags: match.audienceTags,
          audienceRule: match.audienceRule,
          dataEvidence: [...(card.dataEvidence ?? []), ...(match.profileEvidence ?? [])],
        };
      }

      const enrichedOffer = {
        ...(card.offer ?? {}),
        promotionId: selectedPromotion.promotionId,
        promotionName: selectedPromotion.promotionName,
        type: selectedPromotion.type ?? card.offer?.type,
        label: selectedPromotion.discountText ?? card.offer?.label,
        validDays: selectedPromotion.promotion?.validDays ?? card.offer?.validDays,
        reason: selectedPromotion.fitReason ?? card.offer?.reason,
        fitScore: selectedPromotion.fitScore,
        riskWarnings: selectedPromotion.riskWarnings ?? [],
      };

      return {
        ...card,
        offer: enrichedOffer,
        primaryPromotion: selectedPromotion,
        alternativePromotions: match.items.slice(1, 4),
        offerFitBreakdown: selectedPromotion.scoreBreakdown,
        audienceTags: match.audienceTags,
        audienceRule: match.audienceRule,
        recommendedActions: (card.recommendedActions ?? []).map((action: any) => ({
          ...action,
          value: action.value || enrichedOffer.label,
          promotionId: selectedPromotion.promotionId,
          promotionName: selectedPromotion.promotionName,
        })),
        dataEvidence: [
          ...(card.dataEvidence ?? []),
          ...(match.profileEvidence ?? []),
          `权益匹配：${selectedPromotion.promotionName}，匹配分 ${selectedPromotion.fitScore}`,
        ],
        riskWarnings: [...(card.riskWarnings ?? []), ...(selectedPromotion.riskWarnings ?? [])],
      };
    });
  }

  private matchCardPromotion(card: any, promotions: any[], profileContext: any) {
    const scenario = this.offerScenario(card.triggerType, card.recommendationType);
    const projectIds = this.uniqueNumbers((card.recommendedItems ?? [])
      .filter((item: any) => item.type === 'project' && item.id)
      .map((item: any) => item.id));
    const productIds = this.uniqueNumbers([
      ...(card.recommendedItems ?? []).filter((item: any) => item.type === 'product' && item.id).map((item: any) => item.id),
      card.inventorySnapshot?.productId,
    ]);
    const customerTags = this.uniqueStrings([...this.cardCustomerTags(card), ...(profileContext.audienceTags ?? [])]);
    const channelTags = (card.recommendedChannels ?? []).map((item: any) => item.label ?? item.channel).filter(Boolean);

    const items = promotions
      .map((promotion) => {
        const score = this.scoreRecommendationPromotion(promotion, {
          scenario,
          recommendationType: card.recommendationType,
          executionMode: card.preferredMode,
          customerTags,
          projectIds,
          productIds,
          channelTags,
          context: {
            usableTimeRange: card.offer?.usableTimeRange ?? card.capacitySnapshot?.dateRange,
            inventoryCap: card.inventorySnapshot?.gapQty,
          },
        });
        return {
          promotionId: promotion.id,
          promotionName: promotion.name,
          name: promotion.name,
          discountText: promotion.discountText,
          type: promotion.type,
          scenario: promotion.scenario,
          source: promotion.source,
          fitScore: score.score,
          fitLevel: this.fitLevel(score.score),
          fitReason: score.reasons.length ? score.reasons.join('、') : '通用权益，可作为营销承接备选',
          fitReasons: score.reasons,
          riskWarnings: score.riskWarnings,
          scoreBreakdown: score.breakdown,
          estimatedCost: promotion.estimatedCost === null || promotion.estimatedCost === undefined ? undefined : Number(promotion.estimatedCost),
          promotion: this.normalizePromotionForRecommendation(promotion),
        };
      })
      .filter((item) => item.fitScore >= 35)
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 5);

    return {
      items,
      selected: items[0] ?? null,
      audienceTags: profileContext.audienceTags ?? [],
      audienceRule: profileContext.audienceRule ?? { relation: 'AND', include: [], exclude: [] },
      profileEvidence: profileContext.profileEvidence ?? [],
    };
  }

  private async buildRecommendationProfileContext(storeId: number, customerIds?: number[]) {
    const normalizedIds = this.uniqueNumbers(customerIds ?? []).slice(0, 80);
    if (!this.customerMarketingProfileService || !normalizedIds.length) {
      return {
        audienceTags: [],
        audienceRule: { relation: 'AND', include: [], exclude: [] },
        profileEvidence: [],
      };
    }
    try {
      const profiles = await this.customerMarketingProfileService.buildProfiles(storeId, normalizedIds);
      const dimensions = [
        ['生命周期', 'lifecycleTags'],
        ['消费价值', 'valueTags'],
        ['行为意图', 'behaviorTags'],
        ['服务偏好', 'preferenceTags'],
        ['肤质问题', 'skinTags'],
        ['卡项状态', 'cardTags'],
        ['商品周期', 'productCycleTags'],
        ['预约容量', 'capacityTags'],
        ['渠道偏好', 'channelTags'],
        ['触达疲劳', 'fatigueTags'],
      ] as const;
      const include = dimensions
        .map(([dimension, key]) => {
          const tags = this.topTags(profiles.flatMap((profile: any) => profile[key] ?? []), 6);
          return tags.length ? { dimension, tags } : null;
        })
        .filter(Boolean);
      const audienceTags = this.uniqueStrings(include.flatMap((item: any) => item.tags));
      const profileEvidence = profiles
        .flatMap((profile: any) => profile.evidence ?? [])
        .slice(0, 5)
        .map((item: string) => `画像证据：${item}`);
      return {
        audienceTags,
        audienceRule: {
          relation: 'AND',
          include,
          exclude: audienceTags.includes('触达疲劳') ? [{ dimension: '触达疲劳', tags: ['触达疲劳'] }] : [],
        },
        profileEvidence,
      };
    } catch {
      return {
        audienceTags: [],
        audienceRule: { relation: 'AND', include: [], exclude: [] },
        profileEvidence: [],
      };
    }
  }

  private async getRecommendationPromotions(storeId: number) {
    const cacheKey = String(storeId);
    const cached = this.recommendationPromotionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.items;

    try {
      const now = new Date();
      const where: any = {
        status: 'active',
        approvalStatus: 'approved',
        OR: [{ storeId: null }],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      };
      if (storeId) where.OR.push({ storeId });
      const items = await this.prisma.promotion.findMany({
        where,
        orderBy: [{ source: 'asc' }, { updatedAt: 'desc' }],
        take: 120,
      });
      this.recommendationPromotionCache.set(cacheKey, { expiresAt: Date.now() + 60_000, items });
      return items;
    } catch {
      return [];
    }
  }

  private scoreRecommendationPromotion(promotion: any, dto: any) {
    const breakdown = {
      scenarioScore: 0,
      audienceScore: 0,
      behaviorIntentScore: 0,
      itemFitScore: 0,
      timingUrgencyScore: 0,
      valueProtectionScore: 0,
      channelFitScore: 0,
      operationFitScore: 0,
      historicalEffectScore: 0,
      fatiguePenalty: 0,
      marginRiskPenalty: 0,
      conflictPenalty: 0,
    };
    const reasons: string[] = [];
    const riskWarnings: string[] = [];
    const metadata = this.asObject(promotion.metadata);
    const grossMarginGuard = this.asObject(promotion.grossMarginGuard);
    const scenario = String(dto.scenario || dto.recommendationType || '');
    const customerTags = this.uniqueStrings(dto.customerTags ?? []);
    const audienceTags = Array.isArray(promotion.audienceTags) ? promotion.audienceTags.map(String) : [];

    if (scenario && promotion.scenario === scenario) {
      breakdown.scenarioScore = 100;
      reasons.push('适用场景匹配');
    } else if (scenario && this.scenarioFamily(promotion.scenario) === this.scenarioFamily(scenario)) {
      breakdown.scenarioScore = 70;
      reasons.push('权益场景相近');
    } else {
      breakdown.scenarioScore = scenario ? 20 : 45;
    }

    const audienceHits = this.countTagHits(customerTags, [
      ...audienceTags,
      ...this.metadataTags(metadata, ['lifecycleTags', 'valueTags', 'includeTags']),
    ]);
    breakdown.audienceScore = audienceHits ? Math.min(100, 55 + audienceHits * 15) : (customerTags.length ? 25 : 45);
    if (audienceHits) reasons.push('适用客户标签匹配');

    const behaviorHits = this.countTagHits(customerTags, this.metadataTags(metadata, ['behaviorTags']));
    breakdown.behaviorIntentScore = behaviorHits ? Math.min(100, 60 + behaviorHits * 20) : (this.scenarioFamily(scenario) === 'behavior' ? 70 : 35);
    if (behaviorHits) reasons.push('行为意图匹配');

    const projectIds = Array.isArray(dto.projectIds) ? dto.projectIds.map(Number).filter(Boolean) : [];
    const productIds = Array.isArray(dto.productIds) ? dto.productIds.map(Number).filter(Boolean) : [];
    const applicableProjectIds = Array.isArray(promotion.applicableProjectIds) ? promotion.applicableProjectIds.map(Number).filter(Boolean) : [];
    const applicableProductIds = Array.isArray(promotion.applicableProductIds) ? promotion.applicableProductIds.map(Number).filter(Boolean) : [];
    if (
      (projectIds.length && applicableProjectIds.some((id: number) => projectIds.includes(id)))
      || (productIds.length && applicableProductIds.some((id: number) => productIds.includes(id)))
    ) {
      breakdown.itemFitScore = 100;
      reasons.push('适用项目/商品匹配');
    } else if (!applicableProjectIds.length && !applicableProductIds.length) {
      breakdown.itemFitScore = projectIds.length || productIds.length ? 70 : 50;
    } else {
      breakdown.itemFitScore = 25;
    }

    const timingTags = this.metadataTags(metadata, ['timingTags', 'productCycleTags', 'capacityTags']);
    const timingHits = this.countTagHits(customerTags, timingTags);
    breakdown.timingUrgencyScore = timingHits ? Math.min(100, 60 + timingHits * 20) : (scenario.includes('expiry') || scenario.includes('idle') || scenario.includes('cycle') ? 70 : 40);
    if (timingHits) reasons.push('触达时机匹配');

    const isHighValue = customerTags.some((tag) => /VIP|高价值|高客单|高消费|gold|platinum|diamond/i.test(tag));
    const avoidDeepDiscount = this.truthy(grossMarginGuard.avoidDeepDiscount) || this.truthy(metadata.avoidDeepDiscount);
    if (isHighValue && avoidDeepDiscount) {
      breakdown.valueProtectionScore = 95;
      reasons.push('高价值客户权益保护');
    } else if (isHighValue && /discount|money_off|percentage/i.test(String(promotion.type))) {
      breakdown.valueProtectionScore = 45;
      breakdown.marginRiskPenalty += 10;
      riskWarnings.push('高价值客户不宜优先使用强折扣权益');
    } else {
      breakdown.valueProtectionScore = 70;
    }

    const preferredModes = this.metadataTags(metadata, ['preferredExecutionModes']);
    if (dto.executionMode && preferredModes.includes(String(dto.executionMode))) {
      breakdown.operationFitScore = 100;
      reasons.push('执行方式匹配');
    } else {
      breakdown.operationFitScore = preferredModes.length ? 50 : 70;
    }

    const channelHits = this.countTagHits(
      this.uniqueStrings(dto.channelTags ?? []),
      this.metadataTags(metadata, ['channelTags', 'preferredChannels']),
    );
    breakdown.channelFitScore = channelHits ? Math.min(100, 65 + channelHits * 15) : 55;
    if (channelHits) reasons.push('触达渠道匹配');

    const effect = this.asObject(promotion.effectSummary);
    const conversionRate = Number(effect.conversionRate ?? effect.conversion ?? 0);
    breakdown.historicalEffectScore = conversionRate > 0 ? this.clamp(conversionRate * 100, 40, 100) : 55;

    if (customerTags.includes('触达疲劳')) {
      breakdown.fatiguePenalty = 15;
      riskWarnings.push('目标客户存在触达疲劳，建议限制频次或改为顾问私域跟进');
    }
    if (this.truthy(grossMarginGuard.noAdditionalDiscount) && /coupon_claimed_unused|claimed_unused/.test(scenario)) {
      breakdown.conflictPenalty += 25;
      riskWarnings.push('已领券未核销场景不建议叠加额外折扣');
    }
    if (this.truthy(grossMarginGuard.usableTimeRangeRequired) && !dto.context?.usableTimeRange) {
      breakdown.conflictPenalty += 15;
      riskWarnings.push('低峰权益需要配置可用时段');
    }
    if (this.truthy(grossMarginGuard.inventoryCapRequired) && !dto.context?.inventoryCap) {
      breakdown.conflictPenalty += 10;
      riskWarnings.push('库存消化权益需要限制发放数量');
    }

    const score = (
      breakdown.scenarioScore * 0.2
      + breakdown.audienceScore * 0.14
      + breakdown.behaviorIntentScore * 0.12
      + breakdown.itemFitScore * 0.12
      + breakdown.timingUrgencyScore * 0.1
      + breakdown.valueProtectionScore * 0.1
      + breakdown.channelFitScore * 0.08
      + breakdown.operationFitScore * 0.08
      + breakdown.historicalEffectScore * 0.06
      - breakdown.fatiguePenalty
      - breakdown.marginRiskPenalty
      - breakdown.conflictPenalty
    );

    return { score: this.clamp(score, 0, 100), breakdown, reasons, riskWarnings };
  }

  private offerScenario(triggerType?: string, recommendationType?: string) {
    const type = String(triggerType || recommendationType || '');
    const scenarios: Record<string, string> = {
      product_expiry_clearance: 'product_expiry_clearance',
      project_idle_capacity: 'project_idle_capacity',
      product_replenishment: 'product_bundle',
      care_cycle: 'care_cycle_due',
      project_cycle_due: 'care_cycle_due',
    };
    return scenarios[type] ?? type;
  }

  private cardCustomerTags(card: any) {
    const tags = [
      ...(card.tags ?? []),
      ...(card.sourceSignals ?? []),
      card.triggerType,
      card.recommendationType,
      card.priority,
      card.category,
      card.urgency,
    ];
    const scenarioTags: Record<string, string[]> = {
      product_expiry_clearance: ['临期库存适配', '库存消化', '商品临期'],
      project_idle_capacity: ['低峰可约', '美容师空档', '高响应客户'],
      product_replenishment: ['产品补货周期', '产品搭售', '复购窗口'],
      care_cycle: ['护理周期到期', '复购窗口', '项目复购'],
      project_cycle_due: ['护理周期到期', '复购窗口', '项目复购'],
    };
    return this.uniqueStrings([...tags, ...(scenarioTags[card.triggerType] ?? []), ...(scenarioTags[card.recommendationType] ?? [])]);
  }

  private normalizePromotionForRecommendation(promotion: any) {
    return {
      id: promotion.id,
      name: promotion.name,
      type: promotion.type,
      discountText: promotion.discountText,
      scenario: promotion.scenario,
      source: promotion.source,
      validDays: promotion.validDays,
      estimatedCost: promotion.estimatedCost === null || promotion.estimatedCost === undefined ? undefined : Number(promotion.estimatedCost),
      audienceTags: promotion.audienceTags ?? [],
      applicableProjectIds: promotion.applicableProjectIds ?? [],
      applicableProductIds: promotion.applicableProductIds ?? [],
      metadata: promotion.metadata ?? {},
      grossMarginGuard: promotion.grossMarginGuard ?? {},
    };
  }

  private fitLevel(score: number) {
    if (score >= 85) return 'high';
    if (score >= 65) return 'medium';
    if (score >= 45) return 'low';
    return 'weak';
  }

  private scenarioFamily(scenario?: string | null) {
    const value = String(scenario ?? '');
    if (/product|inventory|replenishment|bundle/.test(value)) return 'product';
    if (/idle|capacity|booking|reservation/.test(value)) return 'capacity';
    if (/cycle|expiry|expire|card/.test(value)) return 'cycle';
    if (/vip|member|birthday|stored/.test(value)) return 'member';
    if (/churn|dormant|winback|visit_gap/.test(value)) return 'retention';
    if (/new|first|browse|claimed|second/.test(value)) return 'conversion';
    return value || 'general';
  }

  private metadataTags(metadata: any, keys: string[]) {
    return this.uniqueStrings(keys.flatMap((key) => {
      const value = metadata?.[key];
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return value.split(/[、,，\s]+/);
      return [];
    }));
  }

  private countTagHits(left: string[], right: string[]) {
    if (!left.length || !right.length) return 0;
    let hits = 0;
    for (const item of left) {
      if (right.some((candidate) => this.tagMatches(item, candidate))) hits += 1;
    }
    return hits;
  }

  private tagMatches(left: string, right: string) {
    const a = String(left ?? '').trim().toLowerCase();
    const b = String(right ?? '').trim().toLowerCase();
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  private asObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private truthy(value: unknown) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  private uniqueStrings(values: unknown[]) {
    return [...new Set(values.flatMap((value) => {
      if (Array.isArray(value)) return value;
      if (value === null || value === undefined || value === '') return [];
      return String(value).split(/[、,，\s]+/);
    }).map((value) => String(value).trim()).filter(Boolean))];
  }

  private uniqueNumbers(values: unknown[]) {
    return [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  }

  private topTags(tags: string[], limit: number) {
    const counts = new Map<string, number>();
    for (const tag of this.uniqueStrings(tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + tags.filter((item) => item === tag).length);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .slice(0, limit)
      .map(([tag]) => tag);
  }

  private async getLatestSnapshots(storeId: number): Promise<{ run: any | null; snapshots: SnapshotWithCustomer[] }> {
    const run = await this.prisma.predictionRun.findFirst({
      where: { storeId, status: 'completed' },
      orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
    });
    if (!run) return { run: null, snapshots: [] };

    const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
      where: { runId: run.id, storeId },
      select: {
        customerId: true,
        churnScore: true,
        churnLevel: true,
        repurchase30dScore: true,
        marketingResponseScore: true,
        ltv6m: true,
        ltv12m: true,
        ltvTier: true,
        reasonJson: true,
      },
      orderBy: [{ marketingResponseScore: 'desc' }, { repurchase30dScore: 'desc' }],
      take: 80,
    });
    return { run, snapshots };
  }

  private async getProductSalesQuantity(productIds: number[], since: Date, storeId: number) {
    const result = new Map<number, number>();
    if (!productIds.length) return result;
    const items = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'product',
        itemId: { in: productIds },
        order: {
          createdAt: { gte: since },
          status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
          storeId,
        },
      },
      select: { itemId: true, quantity: true },
    });
    for (const item of items as any[]) {
      const productId = Number(item.itemId);
      result.set(productId, (result.get(productId) ?? 0) + this.toNumber(item.quantity));
    }
    return result;
  }

  private async getProjectCapacityByProject(projectIds: number[], storeId: number, now: Date) {
    const result = new Map<number, any>();
    if (!projectIds.length) return result;

    const sevenDaysLater = new Date(now.getTime() + 7 * DAY_MS);
    const schedules = await this.prisma.schedule.findMany({
      where: {
        date: { gte: this.startOfDay(now), lte: sevenDaysLater },
        status: { in: ['available', 'active', 'normal', '可预约', '空闲'] },
        storeId,
      },
      include: { beautician: { include: { projectSkills: { where: { projectId: { in: projectIds } } } } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 500,
    });
    if (!schedules.length) return result;

    const reservations = await this.prisma.reservation.findMany({
      where: {
        projectId: { in: projectIds },
        date: { gte: this.startOfDay(now), lte: sevenDaysLater },
        status: { notIn: ['cancelled', 'canceled', '已取消'] },
        storeId,
      },
      select: { projectId: true, beauticianId: true, date: true, startTime: true, endTime: true },
    });

    for (const projectId of projectIds) {
      const matchedSchedules = (schedules as any[]).filter((schedule) =>
        (schedule.beautician?.projectSkills ?? []).some((skill: any) => Number(skill.projectId) === Number(projectId)),
      );
      if (!matchedSchedules.length) continue;

      const scheduledMinutes = matchedSchedules.reduce(
        (sum, item) => sum + this.minutesBetween(item.startTime, item.endTime),
        0,
      );
      const bookedMinutes = (reservations as any[])
        .filter((reservation) => Number(reservation.projectId) === Number(projectId))
        .reduce((sum, reservation) => {
          const overlapsSchedule = matchedSchedules.some(
            (schedule) =>
              this.toDateKey(schedule.date) === this.toDateKey(reservation.date) &&
              (!reservation.beauticianId || reservation.beauticianId === schedule.beauticianId) &&
              this.overlaps(schedule.startTime, schedule.endTime, reservation.startTime, reservation.endTime ?? reservation.startTime),
          );
          if (!overlapsSchedule) return sum;
          return sum + Math.max(30, this.minutesBetween(reservation.startTime, reservation.endTime ?? this.addMinutesToTime(reservation.startTime, 60)));
        }, 0);
      const idleMinutes = Math.max(0, scheduledMinutes - bookedMinutes);
      if (idleMinutes <= 0) continue;

      const dates = matchedSchedules.map((schedule) => this.toDateKey(schedule.date)).sort();
      result.set(Number(projectId), {
        dateRange: `${dates[0]} 至 ${dates[dates.length - 1]}`,
        idleMinutes,
        utilizationRate: scheduledMinutes > 0 ? Number((bookedMinutes / scheduledMinutes).toFixed(2)) : 1,
        beauticianIds: [...new Set(matchedSchedules.map((schedule) => Number(schedule.beauticianId)).filter(Boolean))],
      });
    }

    return result;
  }

  private pickTargetSnapshots(snapshots: SnapshotWithCustomer[], limit: number, filter?: (snapshot: SnapshotWithCustomer) => boolean) {
    return snapshots
      .filter((snapshot) => (filter ? filter(snapshot) : true))
      .sort((a, b) =>
        (this.toNumber(b.marketingResponseScore) + this.toNumber(b.repurchase30dScore))
        - (this.toNumber(a.marketingResponseScore) + this.toNumber(a.repurchase30dScore)),
      )
      .slice(0, limit);
  }

  private defaultTriggerParams(triggerType: string, input: any) {
    const defaults: Record<string, any> = {
      product_expiry_clearance: {
        beforeDays: input.inventorySnapshot?.daysToExpiry ?? 60,
        productId: input.inventorySnapshot?.productId,
        batchId: input.inventorySnapshot?.batchId,
        maxQuantity: input.inventorySnapshot?.gapQty,
        channels: ['miniapp', 'store'],
      },
      project_idle_capacity: {
        windowDays: 7,
        maxUtilizationRate: 0.6,
        usableTimeRange: input.capacitySnapshot?.dateRange,
        beauticianIds: input.capacitySnapshot?.beauticianIds ?? [],
        projectIds: input.capacitySnapshot?.projectIds ?? [],
        channels: ['miniapp', 'store'],
      },
      product_replenishment: {
        replenishmentDays: 45,
        excludePurchasedRecently: true,
        sameProductOnly: true,
        channels: ['miniapp', 'wechat'],
      },
      care_cycle: {
        cycleDays: 28,
        lastServiceType: 'project',
        excludeBooked: true,
        channels: ['miniapp', 'sms'],
      },
    };
    return defaults[triggerType] ?? {};
  }

  private productReplenishmentDays(product: any) {
    const text = `${product?.name ?? ''} ${product?.category?.name ?? product?.category ?? ''}`.toLowerCase();
    if (/面膜|mask/.test(text)) return 28;
    if (/精华|serum/.test(text)) return 45;
    if (/洁面|cleanser/.test(text)) return 60;
    if (/面霜|cream/.test(text)) return 60;
    if (/防晒|sunscreen/.test(text)) return new Date().getMonth() + 1 >= 6 && new Date().getMonth() + 1 <= 8 ? 28 : 35;
    if (/身体|body|spa/.test(text)) return 75;
    return 45;
  }

  private projectCycleDays(project: any) {
    const text = `${project?.name ?? ''} ${project?.type?.name ?? ''}`.toLowerCase();
    if (/清洁|控油|clean|oil/.test(text)) return 21;
    if (/补水|修护|基础|hydr/.test(text)) return 28;
    if (/抗衰|紧致|anti|firm/.test(text)) return 35;
    if (/身体|spa|body/.test(text)) return 45;
    return 28;
  }

  private scoreDaysToExpiry(days: number) {
    if (days <= 7) return 100;
    if (days <= 15) return 85;
    if (days <= 30) return 70;
    return 45;
  }

  private scoreRatio(value: number, base: number) {
    return this.clamp((value / Math.max(base, 1)) * 100, 0, 100);
  }

  private scoreAmount(amount: number, max: number) {
    return this.clamp((amount / Math.max(max, 1)) * 100, 0, 100);
  }

  private priorityRank(priority?: string) {
    const ranks: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return ranks[priority ?? 'P3'] ?? 9;
  }

  private matchesType(card: any, type?: string) {
    const types = this.parseTypes(type);
    if (!types.length) return true;
    return types.some((item) => card.recommendationType === item || card.triggerType === item);
  }

  private parseTypes(type?: string) {
    return String(type ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  }

  private lowPeakBand(startTime: string) {
    const minutes = this.timeToMinutes(startTime);
    if (minutes >= this.timeToMinutes('14:00') && minutes < this.timeToMinutes('17:00')) return '14:00-17:00';
    return null;
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private daysBetween(start: Date | string, end: Date | string) {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    return Math.max(0, Math.ceil((endTime - startTime) / DAY_MS));
  }

  private minutesBetween(startTime: string, endTime?: string | null) {
    return Math.max(0, this.timeToMinutes(endTime ?? startTime) - this.timeToMinutes(startTime));
  }

  private overlaps(startA: string, endA: string, startB: string, endB?: string | null) {
    const aStart = this.timeToMinutes(startA);
    const aEnd = this.timeToMinutes(endA);
    const bStart = this.timeToMinutes(startB);
    const bEnd = this.timeToMinutes(endB ?? this.addMinutesToTime(startB, 60));
    return aStart < bEnd && bStart < aEnd;
  }

  private addMinutesToTime(time: string, minutes: number) {
    const total = this.timeToMinutes(time) + minutes;
    const hour = Math.floor(total / 60) % 24;
    const minute = total % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private timeToMinutes(time?: string | null) {
    const [hour = '0', minute = '0'] = String(time ?? '00:00').split(':');
    return Number(hour) * 60 + Number(minute);
  }

  private toDateKey(date: Date | string) {
    return formatBusinessDate(date);
  }

  private average(values: number[]) {
    const valid = values.filter((value) => Number.isFinite(value));
    if (!valid.length) return 0;
    return Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return 0;
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  private formatSnapshotReason(snapshot: SnapshotWithCustomer, fallback: string) {
    if (Array.isArray(snapshot.reasonJson) && snapshot.reasonJson.length) {
      const first = snapshot.reasonJson[0] as any;
      return first.detail ?? first.label ?? fallback;
    }
    return fallback;
  }
}
