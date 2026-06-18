import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

type ProductProjectRecommendationType =
  | 'product_expiry_clearance'
  | 'project_idle_capacity'
  | 'product_replenishment'
  | 'project_cycle_due';

type RecommendationBuildOptions = {
  type?: string;
};

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

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.defaultRecommendationImage = this.config.get(
      'MARKETING_RECOMMENDATION_IMAGE_URL',
      'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=400',
    );
  }

  isProductProjectRecommendationId(id: number) {
    return id >= PRODUCT_PROJECT_RECOMMENDATION_MIN_ID && id <= PRODUCT_PROJECT_RECOMMENDATION_MAX_ID;
  }

  async getCards(storeId?: number, options: RecommendationBuildOptions = {}) {
    const [expiryCards, idleCapacityCards, replenishmentCards, projectCycleCards] = await Promise.all([
      this.buildProductExpiryCards(storeId),
      this.buildIdleCapacityCards(storeId),
      this.buildProductReplenishmentCards(storeId),
      this.buildProjectCycleDueCards(storeId),
    ]);

    return [...expiryCards, ...idleCapacityCards, ...replenishmentCards, ...projectCycleCards]
      .filter((card) => !options.type || card.recommendationType === options.type || card.triggerType === options.type)
      .sort((a, b) => this.priorityRank(a.priority) - this.priorityRank(b.priority) || b.matchScore - a.matchScore);
  }

  async getAudience(recommendationId: number, storeId?: number) {
    const cards = await this.getCards(storeId);
    const card = cards.find((item) => item.id === recommendationId);
    if (!card) return [];

    const customerIds = Array.isArray(card.targetCustomerIds) ? card.targetCustomerIds : [];
    if (!customerIds.length) return [];

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds }, ...(storeId ? { storeId } : {}) },
      include: { store: { select: { name: true } } },
      orderBy: { id: 'asc' },
    });
    const reasonByCustomer = new Map<number, any>(
      (card.audienceSnapshot?.sampleReasons ?? []).map((item: any) => [Number(item.customerId), item]),
    );

    return customers.map((customer: any) => ({
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
  }

  private async buildProductExpiryCards(storeId?: number) {
    const now = new Date();
    const sixtyDaysLater = new Date(now.getTime() + 60 * DAY_MS);
    const batches = await this.prisma.stockBatch.findMany({
      where: {
        expiryDate: { lte: sixtyDaysLater, gte: now },
        stock: { gt: 0 },
        product: { deletedAt: null, status: 'active', ...(storeId ? { storeId } : {}) },
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
    const snapshotsContext = await this.getLatestSnapshots(storeId);
    const snapshots = snapshotsContext.snapshots;

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
          title: `${product.name} ${daysToExpiry} 天内临期，建议消化 ${gapQty} ${product.unit ?? '件'}`,
          reason: `当前批次 ${batch.batchNo} 剩余 ${stock}${product.unit ?? ''}，按近 30 天销量预测到期前自然消化约 ${forecastSellThroughQty}${product.unit ?? ''}，存在 ${gapQty}${product.unit ?? ''} 缺口。`,
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
              reason: `批次 ${batch.batchNo} 临期，预计缺口 ${gapQty}${product.unit ?? ''}。`,
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
            `批次 ${batch.batchNo} 剩余 ${stock}${product.unit ?? ''}`,
            `距离到期 ${daysToExpiry} 天`,
            `预计自然消化 ${forecastSellThroughQty}${product.unit ?? ''}，缺口 ${gapQty}${product.unit ?? ''}`,
            `预计可避免损耗 ¥${Math.round(expectedLossAmount).toLocaleString()}`,
          ],
          riskWarnings,
          predictionRunId: snapshotsContext.run?.id,
          modelVersion: snapshotsContext.run?.modelVersion,
        });
      })
      .filter(Boolean) as any[];

    return cards.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
  }

  private async buildIdleCapacityCards(storeId?: number) {
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * DAY_MS);
    const schedules = await this.prisma.schedule.findMany({
      where: {
        date: { gte: this.startOfDay(now), lte: sevenDaysLater },
        status: { in: ['available', 'active', 'normal', '可预约', '空闲'] },
        ...(storeId ? { storeId } : {}),
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
        ...(storeId ? { storeId } : {}),
      },
      select: { id: true, customerId: true, projectId: true, beauticianId: true, date: true, startTime: true, endTime: true, status: true },
    });
    const snapshotsContext = await this.getLatestSnapshots(storeId);
    const bookedCustomerIds = new Set(reservations.map((item: any) => Number(item.customerId)).filter(Boolean));
    const targetSnapshots = this.pickTargetSnapshots(
      snapshotsContext.snapshots,
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
          predictionRunId: snapshotsContext.run?.id,
          modelVersion: snapshotsContext.run?.modelVersion,
        });
      })
      .filter(Boolean) as any[];

    return cards.sort((a, b) => b.capacitySnapshot.idleMinutes - a.capacitySnapshot.idleMinutes).slice(0, 3);
  }

  private async buildProductReplenishmentCards(storeId?: number) {
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
          ...(storeId ? { storeId } : {}),
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
      where: { id: { in: productIds }, deletedAt: null, status: 'active', ...(storeId ? { storeId } : {}) },
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

    const snapshotsContext = await this.getLatestSnapshots(storeId);
    const snapshotByCustomer = new Map(snapshotsContext.snapshots.map((snapshot) => [Number(snapshot.customerId), snapshot]));

    const cards = Array.from(dueByProduct.values())
      .filter((group) => group.items.length >= 1)
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 3)
      .map((group, index) => {
        const customerIds = [...new Set(group.items.map((item) => Number(item.order.customerId)).filter(Boolean))];
        const targetSnapshots = customerIds
          .map((customerId) => snapshotByCustomer.get(customerId))
          .filter(Boolean) as SnapshotWithCustomer[];
        const fallbackSnapshots = targetSnapshots.length ? targetSnapshots : this.pickTargetSnapshots(snapshotsContext.snapshots, Math.min(40, customerIds.length || 20));
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
            `当前库存 ${this.toNumber(group.product.currentStock)}${group.product.unit ?? ''}`,
            `安全库存 ${this.toNumber(group.product.safetyStock)}${group.product.unit ?? ''}`,
          ],
          riskWarnings: ['库存低于安全库存时不扩大营销曝光', '同客户同商品 14 天内最多触达 1 次'],
          predictionRunId: snapshotsContext.run?.id,
          modelVersion: snapshotsContext.run?.modelVersion,
        });
      });

    return cards;
  }

  private async buildProjectCycleDueCards(storeId?: number) {
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
          ...(storeId ? { storeId } : {}),
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
      where: { id: { in: projectIds }, deletedAt: null, status: 'active', ...(storeId ? { storeId } : {}) },
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
            ...(storeId ? { storeId } : {}),
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

    const snapshotsContext = await this.getLatestSnapshots(storeId);
    const snapshotByCustomer = new Map(snapshotsContext.snapshots.map((snapshot) => [Number(snapshot.customerId), snapshot]));

    return Array.from(dueByProject.values())
      .filter((group) => group.items.length >= 1)
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 3)
      .map((group, index) => {
        const targetCustomerIds = [...new Set(group.items.map((item) => Number(item.order.customerId)).filter(Boolean))];
        const targetSnapshots = targetCustomerIds
          .map((customerId) => snapshotByCustomer.get(customerId))
          .filter(Boolean) as SnapshotWithCustomer[];
        const fallbackSnapshots = targetSnapshots.length ? targetSnapshots : this.pickTargetSnapshots(snapshotsContext.snapshots, Math.min(50, targetCustomerIds.length || 20));
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
          predictionRunId: snapshotsContext.run?.id,
          modelVersion: snapshotsContext.run?.modelVersion,
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
      recommendationKey: `${input.recommendationType}:${input.id}:${new Date().toISOString().slice(0, 10)}`,
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

  private async getLatestSnapshots(storeId?: number): Promise<{ run: any | null; snapshots: SnapshotWithCustomer[] }> {
    const run = await this.prisma.predictionRun.findFirst({
      where: { ...(storeId ? { storeId } : {}), status: 'completed' },
      orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
    });
    if (!run) return { run: null, snapshots: [] };

    const snapshots = await this.prisma.customerPredictionSnapshot.findMany({
      where: { runId: run.id, ...(storeId ? { storeId } : {}) },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            memberLevel: true,
            skinType: true,
            visitCount: true,
            totalSpent: true,
            lastVisitDate: true,
            store: { select: { name: true } },
          },
        },
      },
      orderBy: [{ marketingResponseScore: 'desc' }, { repurchase30dScore: 'desc' }],
      take: 500,
    });
    return { run, snapshots };
  }

  private async getProductSalesQuantity(productIds: number[], since: Date, storeId?: number) {
    const result = new Map<number, number>();
    if (!productIds.length) return result;
    const items = await this.prisma.orderItem.findMany({
      where: {
        itemType: 'product',
        itemId: { in: productIds },
        order: {
          createdAt: { gte: since },
          status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
          ...(storeId ? { storeId } : {}),
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

  private async getProjectCapacityByProject(projectIds: number[], storeId: number | undefined, now: Date) {
    const result = new Map<number, any>();
    if (!projectIds.length) return result;

    const sevenDaysLater = new Date(now.getTime() + 7 * DAY_MS);
    const schedules = await this.prisma.schedule.findMany({
      where: {
        date: { gte: this.startOfDay(now), lte: sevenDaysLater },
        status: { in: ['available', 'active', 'normal', '可预约', '空闲'] },
        ...(storeId ? { storeId } : {}),
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
        ...(storeId ? { storeId } : {}),
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
    return new Date(date).toISOString().slice(0, 10);
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
