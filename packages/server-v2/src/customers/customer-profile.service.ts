import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CustomerProfileDto, CustomerProfilePredictionDto } from './dto/customer-profile.dto.js';

@Injectable()
export class CustomerProfileService {
  constructor(private prisma: PrismaService) {}

  async getCustomerProfile(customerId: number): Promise<CustomerProfileDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        healthProfile: true,
        consumptionRecords: { orderBy: { consumeTime: 'desc' }, take: 20 },
        customerCards: { include: { card: true }, orderBy: { expiryDate: 'asc' } },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');

    const [prediction, recentTouches, recentRecommendationEvents] = await Promise.all([
      this.prisma.customerPredictionSnapshot.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.marketingAutomationTouch.findMany({
        where: { customerId },
        orderBy: { touchedAt: 'desc' },
        take: 5,
      }),
      this.prisma.recommendationEvent.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    const lifecycle = await this.getLifecycleContext(customerId, customer.storeId).catch(() => null);

    return this.assembleProfile(customer, prediction, recentTouches, recentRecommendationEvents, lifecycle);
  }

  private assembleProfile(
    customer: any,
    prediction: any | null,
    recentTouches: any[],
    recentRecommendationEvents: any[],
    lifecycle: any,
  ): CustomerProfileDto {
    const totalSpent = this.toNumber(customer.totalSpent);
    const visitCount = Number(customer.visitCount ?? 0);
    const lastVisitDate = customer.lastVisitDate ? customer.lastVisitDate.toISOString() : null;
    const activeCards = (customer.customerCards ?? []).filter((card: any) => card.status === 'active' && card.remainingTimes > 0);
    const expiringCards = activeCards.filter((card: any) => this.daysUntil(card.expiryDate) <= 30);
    const usedUpCards = (customer.customerCards ?? []).filter((card: any) => card.remainingTimes <= 0 || card.status === 'used_up');

    return {
      customerId: customer.id,
      storeId: customer.storeId,
      generatedAt: new Date().toISOString(),
      basic: {
        name: customer.name,
        phone: customer.phone,
        gender: customer.gender,
        age: customer.age,
        memberLevel: customer.memberLevel,
        source: customer.source,
        tags: customer.tags ?? [],
        skinType: customer.skinType,
        skinCondition: customer.skinCondition,
        totalSpent,
        visitCount,
        lastVisitDate,
      },
      health: customer.healthProfile
        ? {
            skinType: customer.healthProfile.skinType,
            skinStatus: customer.healthProfile.skinStatus,
            mainProblems: customer.healthProfile.mainProblems,
            allergyHistory: customer.healthProfile.allergyHistory,
            goals: customer.healthProfile.goals,
            recommendedCare: customer.healthProfile.recommendedCare,
            instrument: customer.healthProfile.instrument,
            lastCheck: customer.healthProfile.lastCheck?.toISOString?.() ?? null,
          }
        : null,
      consumption: {
        totalSpent,
        visitCount,
        lastVisitDate,
        lastVisitDays: customer.lastVisitDate ? this.daysBetween(customer.lastVisitDate, new Date()) : null,
        avgSpentPerVisit: visitCount > 0 ? Math.round((totalSpent / visitCount) * 100) / 100 : 0,
        preferredProjects: this.buildPreferredProjects(customer.consumptionRecords ?? []),
        recentRecords: (customer.consumptionRecords ?? []).map((record: any) => ({
          id: record.id,
          consumeType: record.consumeType,
          consumeContent: record.consumeContent,
          payMethod: record.payMethod,
          amount: this.toNumber(record.amount),
          consumeTime: record.consumeTime.toISOString(),
        })),
      },
      cards: {
        activeCards: activeCards.map((card: any) => this.serializeCustomerCard(card)),
        expiringCards: expiringCards.map((card: any) => this.serializeCustomerCard(card)),
        usedUpCards: usedUpCards.map((card: any) => this.serializeCustomerCard(card)),
      },
      prediction: prediction ? this.serializePrediction(prediction) : null,
      lifecycle,
      touchHistory: recentTouches.map((touch) => this.serializeTouch(touch)),
      recommendationEvents: recentRecommendationEvents.map((event) => this.serializeRecommendationEvent(event)),
    };
  }

  private async getLifecycleContext(customerId: number, storeId: number) {
    const snapshotDelegate = (this.prisma as any).customerLifecycleSnapshot;
    const opportunityDelegate = (this.prisma as any).customerOpportunity;
    const eventDelegate = (this.prisma as any).customerLifecycleEvent;
    const serviceCycleDelegate = (this.prisma as any).customerServiceCycleState;
    const attributionDelegate = (this.prisma as any).lifecycleAttributionEvent;
    if (!snapshotDelegate?.findFirst || !opportunityDelegate?.findMany) return null;
    const where = { customerId: Number(customerId), storeId: Number(storeId) };
    const [snapshot, opportunities, events, serviceCycles, attributionEvents] = await Promise.all([
      snapshotDelegate.findFirst({ where, orderBy: { computedAt: 'desc' } }),
      opportunityDelegate.findMany({
        where: { ...where, status: 'open' },
        orderBy: [{ priority: 'asc' }, { score: 'desc' }],
        take: 8,
        include: {
          fulfillmentChecks: { orderBy: { checkedAt: 'desc' }, take: 1 },
          attributionEvents: { orderBy: { occurredAt: 'desc' }, take: 5 },
        },
      }),
      eventDelegate?.findMany ? eventDelegate.findMany({ where, orderBy: { occurredAt: 'desc' }, take: 5 }) : Promise.resolve([]),
      serviceCycleDelegate?.findMany
        ? serviceCycleDelegate.findMany({ where, orderBy: [{ nextDueAt: 'asc' }, { updatedAt: 'desc' }], take: 8 })
        : Promise.resolve([]),
      attributionDelegate?.findMany
        ? attributionDelegate.findMany({ where, orderBy: { occurredAt: 'desc' }, take: 12 })
        : Promise.resolve([]),
    ]);
    if (!snapshot && !opportunities.length && !(serviceCycles ?? []).length) return null;
    return {
      snapshot: snapshot ? {
        id: snapshot.id,
        lifecycleStage: snapshot.lifecycleStage,
        lifecycleStageLabel: this.lifecycleStageLabel(snapshot.lifecycleStage),
        ltvTier: snapshot.ltvTier,
        churnRiskLevel: snapshot.churnRiskLevel,
        touchFatigueScore: this.toNumber(snapshot.touchFatigueScore),
        assetSummary: snapshot.assetSummaryJson ?? {},
        servicePreference: snapshot.servicePreferenceJson ?? {},
        evidence: this.asStringArray(snapshot.evidenceJson),
        computedAt: snapshot.computedAt.toISOString?.() ?? String(snapshot.computedAt),
      } : null,
      opportunities: opportunities.map((item: any) => ({
        id: item.id,
        opportunityType: item.opportunityType,
        opportunityTypeLabel: this.opportunityTypeLabel(item.opportunityType),
        priority: item.priority,
        status: item.status,
        score: item.score,
        recommendedExecutionMode: item.recommendedExecutionMode,
        recommendedChannels: item.recommendedChannelsJson ?? [],
        recommendedOffer: item.recommendedOfferJson ?? null,
        recommendedItems: item.recommendedItemsJson ?? [],
        evidence: this.asStringArray(item.evidenceJson),
        fulfillment: item.fulfillmentChecks?.[0] ? this.serializeFulfillmentCheck(item.fulfillmentChecks[0]) : null,
        attributionEventCount: item.attributionEvents?.length ?? 0,
        attributionEvents: (item.attributionEvents ?? []).map((event: any) => this.serializeAttributionEvent(event)),
        expiresAt: item.expiresAt?.toISOString?.() ?? null,
      })),
      events: (events ?? []).map((event: any) => ({
        id: event.id,
        fromStage: event.fromStage,
        toStage: event.toStage,
        toStageLabel: this.lifecycleStageLabel(event.toStage),
        eventType: event.eventType,
        evidence: this.asStringArray(event.evidenceJson),
        occurredAt: event.occurredAt?.toISOString?.() ?? String(event.occurredAt),
      })),
      serviceCycles: (serviceCycles ?? []).map((cycle: any) => ({
        id: cycle.id,
        projectId: cycle.projectId,
        lastServiceAt: cycle.lastServiceAt?.toISOString?.() ?? null,
        cycleDays: cycle.cycleDays,
        nextDueAt: cycle.nextDueAt?.toISOString?.() ?? null,
        sourceType: cycle.sourceType,
        sourceId: cycle.sourceId,
        evidence: this.asStringArray(cycle.evidenceJson),
        updatedAt: cycle.updatedAt?.toISOString?.() ?? String(cycle.updatedAt),
      })),
      attributionEvents: (attributionEvents ?? []).map((event: any) => this.serializeAttributionEvent(event)),
    };
  }

  private serializeFulfillmentCheck(check: any) {
    return {
      id: check.id,
      opportunityId: check.opportunityId,
      inventoryReady: Boolean(check.inventoryReady),
      capacityReady: Boolean(check.capacityReady),
      requiredProducts: check.requiredProductsJson ?? [],
      capacitySnapshot: check.capacitySnapshotJson ?? {},
      risks: check.riskJson ?? [],
      checkedAt: check.checkedAt?.toISOString?.() ?? String(check.checkedAt),
    };
  }

  private serializeAttributionEvent(event: any) {
    return {
      id: event.id,
      eventType: event.eventType,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      opportunityId: event.opportunityId,
      recommendationKey: event.recommendationKey,
      touchId: event.touchId,
      orderId: event.orderId,
      reservationId: event.reservationId,
      stockMovementId: event.stockMovementId,
      evidence: event.evidenceJson ?? {},
      occurredAt: event.occurredAt?.toISOString?.() ?? String(event.occurredAt),
    };
  }

  private serializePrediction(prediction: any): CustomerProfilePredictionDto {
    return {
      id: prediction.id,
      runId: prediction.runId,
      churnScore: prediction.churnScore,
      churnLevel: prediction.churnLevel,
      repurchase30dScore: prediction.repurchase30dScore,
      marketingResponseScore: prediction.marketingResponseScore,
      ltv6m: this.toNumber(prediction.ltv6m),
      ltv12m: this.toNumber(prediction.ltv12m),
      ltvTier: prediction.ltvTier,
      featureJson: prediction.featureJson,
      reasonJson: prediction.reasonJson,
      recommendedActionsJson: prediction.recommendedActionsJson,
      updatedAt: prediction.createdAt.toISOString(),
    };
  }

  private serializeCustomerCard(card: any) {
    return {
      id: card.id,
      cardId: card.cardId,
      cardName: card.cardName,
      totalTimes: card.totalTimes,
      remainingTimes: card.remainingTimes,
      expiryDate: card.expiryDate.toISOString(),
      status: card.status,
      daysUntilExpiry: this.daysUntil(card.expiryDate),
      applicableProjects: Array.isArray(card.card?.projects) ? card.card.projects : [],
    };
  }

  private serializeTouch(touch: any) {
    return {
      id: touch.id,
      strategyId: touch.strategyId,
      channel: touch.channel,
      status: touch.status,
      predictedConversionScore: touch.predictedConversionScore,
      predictedRevenue: this.toNumber(touch.predictedRevenue),
      touchedAt: touch.touchedAt.toISOString(),
      convertedAt: touch.convertedAt?.toISOString?.() ?? null,
      conversionType: touch.conversionType,
      actualRevenue: touch.actualRevenue == null ? null : this.toNumber(touch.actualRevenue),
    };
  }

  private serializeRecommendationEvent(event: any) {
    return {
      id: event.id,
      recommendationId: event.recommendationId,
      eventType: event.eventType,
      taskId: event.taskId,
      orderId: event.orderId,
      note: event.note,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private buildPreferredProjects(records: any[]) {
    const countMap = new Map<string, number>();
    for (const record of records) {
      const name = String(record.consumeContent ?? '').split(',')[0]?.trim();
      if (!name) continue;
      countMap.set(name, (countMap.get(name) ?? 0) + 1);
    }
    return [...countMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  private daysUntil(date?: Date | null) {
    if (!date) return 9999;
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  }

  private daysBetween(from?: Date | null, to = new Date()) {
    if (!from) return 9999;
    return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86400000));
  }

  private toNumber(value: any) {
    if (value == null) return 0;
    if (typeof value === 'number') return value;
    return Number(value) || 0;
  }

  private asStringArray(value: any) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : item?.detail ?? item?.label ?? JSON.stringify(item)).filter(Boolean);
    if (typeof value === 'string') return [value];
    return Object.values(value).map((item) => String(item)).filter(Boolean);
  }

  private lifecycleStageLabel(stage: string) {
    const labels: Record<string, string> = {
      lead: '线索',
      new_customer: '新客',
      trial: '体验客',
      member: '会员',
      active: '活跃客',
      growth: '成长客',
      at_risk: '预流失',
      dormant: '沉睡客',
      lost: '流失客',
    };
    return labels[stage] ?? stage;
  }

  private opportunityTypeLabel(type: string) {
    const labels: Record<string, string> = {
      care_cycle_due: '护理周期到期',
      card_expiring: '次卡/套餐到期',
      dormant_winback: '沉睡客户召回',
      coupon_claimed_unused: '领券未核销',
      browse_abandonment: '浏览未预约',
      project_cycle_due: '项目护理周期到期',
      homecare_bundle: '居家护理组合',
      service_upgrade: '服务升级机会',
      project_idle_capacity: '低峰产能填充',
      inventory_clearance: '库存周转机会',
    };
    return labels[type] ?? type;
  }
}
