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

    return this.assembleProfile(customer, prediction, recentTouches, recentRecommendationEvents);
  }

  private assembleProfile(
    customer: any,
    prediction: any | null,
    recentTouches: any[],
    recentRecommendationEvents: any[],
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
      touchHistory: recentTouches.map((touch) => this.serializeTouch(touch)),
      recommendationEvents: recentRecommendationEvents.map((event) => this.serializeRecommendationEvent(event)),
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
}
