import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CustomerMarketingProfile {
  customerId: number;
  lifecycleTags: string[];
  valueTags: string[];
  behaviorTags: string[];
  preferenceTags: string[];
  skinTags: string[];
  cardTags: string[];
  productCycleTags: string[];
  capacityTags: string[];
  channelTags: string[];
  fatigueTags: string[];
  evidence: string[];
  updatedAt: string;
}

@Injectable()
export class CustomerMarketingProfileService {
  constructor(private prisma: PrismaService) {}

  async buildProfiles(storeId: number, customerIds?: number[]): Promise<CustomerMarketingProfile[]> {
    if (!Number.isInteger(storeId) || storeId <= 0) throw new BadRequestException('storeId is required');
    const ids = this.normalizeIds(customerIds);
    const where: any = { storeId, deletedAt: null };
    if (ids.length) where.id = { in: ids };

    const customers = await this.prisma.customer.findMany({
      where,
      include: { healthProfile: true },
      orderBy: { id: 'asc' },
      take: ids.length ? Math.max(ids.length, 1) : 200,
    });
    if (!customers.length) return [];

    const customerIdList = customers.map((customer: any) => Number(customer.id)).filter(Boolean);
    const [snapshotByCustomer, cardsByCustomer, reservationsByCustomer, orderItemsByCustomer, behaviorEventsByCustomer, appEventsByCustomer] = await Promise.all([
      this.latestPredictionSnapshots(customerIdList, storeId),
      this.customerCards(customerIdList),
      this.recentReservations(customerIdList, storeId),
      this.recentOrderItems(customerIdList, storeId),
      this.recentBehaviorEvents(customerIdList, storeId),
      this.recentAppEvents(customerIdList, storeId),
    ]);

    return customers.map((customer: any) => this.buildProfile({
      customer,
      snapshot: snapshotByCustomer.get(Number(customer.id)),
      cards: cardsByCustomer.get(Number(customer.id)) ?? [],
      reservations: reservationsByCustomer.get(Number(customer.id)) ?? [],
      orderItems: orderItemsByCustomer.get(Number(customer.id)) ?? [],
      behaviorEvents: behaviorEventsByCustomer.get(Number(customer.id)) ?? [],
      appEvents: appEventsByCustomer.get(Number(customer.id)) ?? [],
    }));
  }

  private buildProfile(input: {
    customer: any;
    snapshot?: any;
    cards: any[];
    reservations: any[];
    orderItems: any[];
    behaviorEvents: any[];
    appEvents: any[];
  }): CustomerMarketingProfile {
    const now = new Date();
    const customerId = Number(input.customer.id);
    const evidence: string[] = [];
    const lifecycleTags: string[] = [];
    const valueTags: string[] = [];
    const behaviorTags: string[] = [];
    const preferenceTags: string[] = [];
    const skinTags: string[] = [];
    const cardTags: string[] = [];
    const productCycleTags: string[] = [];
    const capacityTags: string[] = [];
    const channelTags: string[] = [];
    const fatigueTags: string[] = [];

    const visitCount = Number(input.customer.visitCount ?? 0);
    const totalSpent = this.toNumber(input.customer.totalSpent);
    const daysSinceLastVisit = input.customer.lastVisitDate ? this.daysBetween(input.customer.lastVisitDate, now) : null;

    if (visitCount <= 0 || totalSpent <= 0) {
      lifecycleTags.push('新客未首单');
      evidence.push('客户暂无消费记录，归类为新客未首单。');
    } else if (visitCount === 1 && daysSinceLastVisit != null && daysSinceLastVisit >= 21) {
      lifecycleTags.push('首单后未复购');
      evidence.push(`客户首单后 ${daysSinceLastVisit} 天未再次到店。`);
    } else if (daysSinceLastVisit != null && daysSinceLastVisit >= 120) {
      lifecycleTags.push('流失高风险', '久未到店');
      evidence.push(`客户 ${daysSinceLastVisit} 天未到店，进入高流失挽回窗口。`);
    } else if (daysSinceLastVisit != null && daysSinceLastVisit >= 60) {
      lifecycleTags.push('沉睡', '久未到店');
      evidence.push(`客户 ${daysSinceLastVisit} 天未到店，进入沉睡唤醒窗口。`);
    } else {
      lifecycleTags.push('活跃老客');
      evidence.push('客户近期有消费或到店记录，归类为活跃老客。');
    }

    if (input.snapshot) {
      if (Number(input.snapshot.churnScore ?? 0) >= 80 || ['高', '极高'].includes(String(input.snapshot.churnLevel ?? ''))) {
        lifecycleTags.push('流失高风险');
        evidence.push(`预测流失分 ${Number(input.snapshot.churnScore ?? 0)}。`);
      }
      if (Number(input.snapshot.repurchase30dScore ?? 0) >= 60) {
        lifecycleTags.push('复购窗口');
        behaviorTags.push('护理周期到期');
        evidence.push(`30 天复购分 ${Number(input.snapshot.repurchase30dScore ?? 0)}。`);
      }
      if (Number(input.snapshot.marketingResponseScore ?? 0) >= 70) {
        behaviorTags.push('高响应客户');
        evidence.push(`营销响应分 ${Number(input.snapshot.marketingResponseScore ?? 0)}。`);
      }
      if (['铂金', '黄金'].includes(String(input.snapshot.ltvTier ?? '')) || Number(input.snapshot.ltv12m ?? 0) >= 5000) {
        valueTags.push('高 LTV', '高价值客户');
        evidence.push(`LTV 分层为 ${input.snapshot.ltvTier ?? '高价值'}。`);
      }
    }

    if (/VIP|铂金|黄金|钻石/.test(String(input.customer.memberLevel ?? ''))) {
      valueTags.push('VIP', '高价值客户');
      evidence.push(`会员等级为 ${input.customer.memberLevel}。`);
    } else if (totalSpent >= 5000) {
      valueTags.push('高 LTV', '高价值客户');
      evidence.push(`累计消费 ${totalSpent} 元。`);
    } else if (totalSpent >= 1000) {
      valueTags.push('中 LTV');
    } else {
      valueTags.push('低 LTV');
    }

    const skinType = input.customer.skinType ?? input.customer.healthProfile?.skinType;
    const skinText = [skinType, input.customer.skinCondition, input.customer.healthProfile?.mainProblems, input.customer.healthProfile?.goals].filter(Boolean).join(' ');
    if (skinText) {
      skinTags.push(...this.skinTagsFromText(skinText));
      evidence.push(`肤质/问题标签来自客户档案：${skinText}。`);
    }

    const activeCards = input.cards.filter((card) => !['expired', 'disabled', 'inactive', '已过期'].includes(String(card.status ?? '').toLowerCase()));
    for (const card of activeCards) {
      const remainingTimes = Number(card.remainingTimes ?? 0);
      const daysToExpiry = this.daysBetween(now, card.expiryDate);
      if (daysToExpiry <= 30) cardTags.push('次卡临期', '套餐临期');
      if (remainingTimes <= 1) cardTags.push('剩余次数低');
      if (remainingTimes > 0) cardTags.push('次卡剩余');
    }
    if (cardTags.length) evidence.push(`客户有 ${activeCards.length} 张有效卡项，存在 ${this.unique(cardTags).join('、')} 信号。`);

    const futureReservations = input.reservations.filter((item) => new Date(item.date).getTime() >= now.getTime());
    if (futureReservations.length) {
      behaviorTags.push('已有预约');
      evidence.push(`客户未来已有 ${futureReservations.length} 条预约，营销触达需排除重复邀约。`);
    }

    const projectNames = input.orderItems.filter((item) => item.itemType === 'project').map((item) => String(item.name));
    const productNames = input.orderItems.filter((item) => item.itemType === 'product').map((item) => String(item.name));
    preferenceTags.push(...this.preferenceTagsFromText(projectNames.join(' ')));
    productCycleTags.push(...this.productCycleTagsFromText(productNames.join(' ')));
    if (projectNames.length) evidence.push(`近 180 天服务项目：${projectNames.slice(0, 3).join('、')}。`);
    if (productNames.length) evidence.push(`近 180 天购买商品：${productNames.slice(0, 3).join('、')}。`);

    const allEvents = [...input.behaviorEvents, ...input.appEvents];
    const eventTypes = allEvents.map((event) => String(event.eventType ?? ''));
    if (eventTypes.some((type) => /view|browse|page_view|project_viewed|promotion_viewed/.test(type))) {
      behaviorTags.push('浏览未预约', '预约意向');
    }
    if (eventTypes.some((type) => /booking_abandon|reservation_abandon/.test(type))) {
      behaviorTags.push('预约放弃');
    }
    if (eventTypes.some((type) => /coupon_claimed|promotion_claimed/.test(type))) {
      behaviorTags.push('已领券', '已领未核销');
    }
    if (eventTypes.some((type) => /promotion_used|coupon_used/.test(type))) {
      behaviorTags.push('近期已核销');
    }
    if (allEvents.length) {
      channelTags.push('小程序活跃');
      evidence.push(`近 30 天小程序/行为事件 ${allEvents.length} 条。`);
    }
    if (input.appEvents.some((event) => ['wechat', 'miniapp'].includes(String(event.channel ?? '')))) {
      channelTags.push('微信可达');
    }

    const touchEvents = allEvents.filter((event) => /push|sms|touch|message|coupon_claimed|promotion_claimed/.test(String(event.eventType ?? '')));
    if (touchEvents.length >= 3) {
      fatigueTags.push('触达疲劳', '近期已触达');
      evidence.push(`近 30 天触达/领券相关事件 ${touchEvents.length} 条，需控制频率。`);
    }

    return {
      customerId,
      lifecycleTags: this.unique(lifecycleTags),
      valueTags: this.unique(valueTags),
      behaviorTags: this.unique(behaviorTags),
      preferenceTags: this.unique(preferenceTags),
      skinTags: this.unique(skinTags),
      cardTags: this.unique(cardTags),
      productCycleTags: this.unique(productCycleTags),
      capacityTags: this.unique(capacityTags),
      channelTags: this.unique(channelTags),
      fatigueTags: this.unique(fatigueTags),
      evidence: this.unique(evidence),
      updatedAt: new Date().toISOString(),
    };
  }

  private async latestPredictionSnapshots(customerIds: number[], storeId: number) {
    const result = new Map<number, any>();
    const delegate = (this.prisma as any).customerPredictionSnapshot;
    if (!delegate?.findMany || !customerIds.length) return result;
    const snapshots = await delegate.findMany({
      where: { customerId: { in: customerIds }, storeId },
      orderBy: { createdAt: 'desc' },
      take: customerIds.length * 2,
    });
    for (const snapshot of snapshots as any[]) {
      const customerId = Number(snapshot.customerId);
      if (!result.has(customerId)) result.set(customerId, snapshot);
    }
    return result;
  }

  private async customerCards(customerIds: number[]) {
    return this.groupByCustomer(await this.safeFindMany('customerCard', {
      where: { customerId: { in: customerIds } },
      take: Math.max(1, customerIds.length * 5),
      orderBy: { expiryDate: 'asc' },
    }));
  }

  private async recentReservations(customerIds: number[], storeId: number) {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const until = new Date(Date.now() + 30 * DAY_MS);
    return this.groupByCustomer(await this.safeFindMany('reservation', {
      where: {
        customerId: { in: customerIds },
        date: { gte: since, lte: until },
        storeId,
      },
      take: Math.max(1, customerIds.length * 5),
      orderBy: { date: 'desc' },
    }));
  }

  private async recentOrderItems(customerIds: number[], storeId: number) {
    const since = new Date(Date.now() - 180 * DAY_MS);
    const items = await this.safeFindMany('orderItem', {
      where: {
        order: {
          customerId: { in: customerIds },
          createdAt: { gte: since },
          status: { notIn: ['cancelled', 'canceled', 'refunded', '已取消'] },
          storeId,
        },
      },
      include: { order: { select: { customerId: true, createdAt: true } } },
      take: Math.max(1, customerIds.length * 10),
      orderBy: { createdAt: 'desc' },
    });
    const grouped = new Map<number, any[]>();
    for (const item of items as any[]) {
      const customerId = Number(item.order?.customerId);
      if (!customerId) continue;
      grouped.set(customerId, [...(grouped.get(customerId) ?? []), item]);
    }
    return grouped;
  }

  private async recentBehaviorEvents(customerIds: number[], storeId: number) {
    const since = new Date(Date.now() - 30 * DAY_MS);
    return this.groupByCustomer(await this.safeFindMany('customerBehaviorEvent', {
      where: { customerId: { in: customerIds }, occurredAt: { gte: since }, storeId },
      take: Math.max(1, customerIds.length * 20),
      orderBy: { occurredAt: 'desc' },
    }));
  }

  private async recentAppEvents(customerIds: number[], storeId: number) {
    const since = new Date(Date.now() - 30 * DAY_MS);
    return this.groupByCustomer(await this.safeFindMany('customerAppEvent', {
      where: { customerId: { in: customerIds }, occurredAt: { gte: since }, storeId },
      take: Math.max(1, customerIds.length * 20),
      orderBy: { occurredAt: 'desc' },
    }));
  }

  private async safeFindMany(delegateName: string, args: any) {
    const delegate = (this.prisma as any)[delegateName];
    if (!delegate?.findMany) return [];
    try {
      return await delegate.findMany(args);
    } catch {
      return [];
    }
  }

  private groupByCustomer(items: any[]) {
    const grouped = new Map<number, any[]>();
    for (const item of items) {
      const customerId = Number(item.customerId);
      if (!customerId) continue;
      grouped.set(customerId, [...(grouped.get(customerId) ?? []), item]);
    }
    return grouped;
  }

  private skinTagsFromText(text: string) {
    const tags: string[] = [];
    if (/干|缺水|补水|hydr/i.test(text)) tags.push('干皮', '缺水', '补水');
    if (/油|控油|毛孔|clean|oil/i.test(text)) tags.push('油皮', '清洁', '控油');
    if (/敏|红|屏障|修护|sensitive|repair/i.test(text)) tags.push('敏感', '屏障受损', '修护');
    if (/痘|粉刺|acne/i.test(text)) tags.push('痘肌', '清洁');
    if (/抗衰|紧致|皱|firm|anti/i.test(text)) tags.push('抗衰', '紧致');
    return tags;
  }

  private preferenceTagsFromText(text: string) {
    const tags: string[] = [];
    if (/补水|水光|hydr/i.test(text)) tags.push('补水', '面部护理');
    if (/清洁|小气泡|控油|clean/i.test(text)) tags.push('清洁', '控油', '面部护理');
    if (/敏|修护|舒缓|repair/i.test(text)) tags.push('敏感修护', '修护', '面部护理');
    if (/抗衰|紧致|提拉|anti|firm/i.test(text)) tags.push('抗衰', '紧致');
    if (/身体|spa|肩颈|body/i.test(text)) tags.push('身体护理');
    return tags;
  }

  private productCycleTagsFromText(text: string) {
    const tags: string[] = [];
    if (/面膜|精华|防晒|洁面|面霜|乳液|serum|mask|cream|sunscreen/i.test(text)) tags.push('产品补货周期');
    if (/补水|修护|防晒|清洁/i.test(text)) tags.push('产品搭售');
    return tags;
  }

  private normalizeIds(ids?: number[]) {
    return [...new Set((ids ?? []).map(Number).filter(Boolean))];
  }

  private daysBetween(start: Date | string, end: Date | string) {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    return Math.max(0, Math.ceil((endTime - startTime) / DAY_MS));
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return 0;
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }

  private unique(values: string[]) {
    return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
  }
}
