import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CommissionService } from '../../commission/commission.service.js';
import { isMarketingFeatureEnabledForStore, MarketingFeatureFlagsService } from '../marketing-feature-flags.service.js';
import { MarketingEffectFactService, type MarketingFactDimensions } from './marketing-effect-fact.service.js';
import { ATTRIBUTABLE_TOUCH_STATUSES, ATTRIBUTABLE_TOUCH_STATUS_SET } from '../marketing-touch-status.constants.js';

const PAGE_ATTRIBUTION_WINDOW_DAYS = 30;

export type AttributeMarketingOrderInput = {
  storeId: number;
  orderId: number;
  customerId: number;
  netRevenue: number;
  occurredAt?: Date;
};

export type ReverseMarketingOrderInput = {
  storeId: number;
  orderId: number;
  refundId: number;
  refundAmount: number;
  occurredAt?: Date;
};

type AttributionCandidate = {
  source: 'automation' | 'page';
  id: number;
  occurredAt: Date;
  windowDays: number;
  raw: any;
  dimensions: MarketingFactDimensions;
};

@Injectable()
export class MarketingAttributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factService: MarketingEffectFactService,
    private readonly featureFlags: MarketingFeatureFlagsService,
    @Optional() private readonly commissionService?: CommissionService,
  ) {}

  async attributeOrder(input: AttributeMarketingOrderInput, transactionClient?: any) {
    if (!input.customerId || input.netRevenue <= 0) return { attributed: false, primarySource: null };
    const tx = transactionClient ?? this.prisma;
    const now = input.occurredAt ?? new Date();
    const windowStart = new Date(now.getTime() - PAGE_ATTRIBUTION_WINDOW_DAYS * 86_400_000);

    const [touches, leads] = await Promise.all([
      tx.marketingAutomationTouch.findMany({
        where: {
          customerId: input.customerId,
          status: { in: [...ATTRIBUTABLE_TOUCH_STATUSES] },
          touchedAt: { lte: now },
          execution: { storeId: input.storeId },
        },
        include: {
          strategy: {
            select: { recommendationInstanceId: true, adoptionId: true, actions: true },
          },
        },
        orderBy: { touchedAt: 'desc' },
        take: 10,
      }),
      tx.marketingPageLead.findMany({
        where: {
          customerId: input.customerId,
          status: { not: 'expired' },
          createdAt: { gte: windowStart, lte: now },
          OR: [{ storeId: input.storeId }, { page: { storeId: input.storeId } }],
        },
        include: {
          page: {
            select: {
              storeId: true,
              activityId: true,
              recommendationInstanceId: true,
              adoptionId: true,
              snapshotJson: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const candidates: AttributionCandidate[] = [
      ...touches
        .filter((touch: any) => {
          if (!ATTRIBUTABLE_TOUCH_STATUS_SET.has(String(touch.status))) return false;
          const windowDays = Number(touch.attributionWindowDays ?? 30);
          return new Date(touch.touchedAt).getTime() >= now.getTime() - windowDays * 86_400_000;
        })
        .map((touch: any) => ({
          source: 'automation' as const,
          id: Number(touch.id),
          occurredAt: new Date(touch.touchedAt),
          windowDays: Number(touch.attributionWindowDays ?? 30),
          raw: touch,
          dimensions: {
            recommendationInstanceId: touch.strategy?.recommendationInstanceId ?? null,
            adoptionId: touch.strategy?.adoptionId ?? null,
            strategyId: touch.strategyId,
            executionId: touch.executionId,
            touchId: touch.id,
            promotionId: this.promotionFromActions(touch.strategy?.actions),
            customerId: input.customerId,
            orderId: input.orderId,
            channel: touch.channel ?? null,
          },
        })),
      ...leads.map((lead: any) => ({
        source: 'page' as const,
        id: Number(lead.id),
        occurredAt: new Date(lead.createdAt),
        windowDays: PAGE_ATTRIBUTION_WINDOW_DAYS,
        raw: lead,
        dimensions: {
          recommendationInstanceId: lead.page?.recommendationInstanceId ?? null,
          adoptionId: lead.page?.adoptionId ?? null,
          activityId: lead.page?.activityId ?? null,
          pageId: lead.pageId,
          promotionId: this.promotionFromSnapshot(lead.page?.snapshotJson),
          customerId: input.customerId,
          orderId: input.orderId,
          channel: lead.channel ?? 'marketing_page',
        },
      })),
    ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());

    const primary = candidates[0];
    if (!primary) return { attributed: false, primarySource: null };

    if (primary.source === 'automation') {
      const existed = await tx.marketingAttribution.findFirst({
        where: { orderId: input.orderId },
        select: { id: true },
      });
      if (!existed) {
        await tx.marketingAttribution.create({
          data: {
            touchId: primary.raw.id,
            strategyId: primary.raw.strategyId,
            executionId: primary.raw.executionId,
            customerId: input.customerId,
            orderId: input.orderId,
            attributionType: 'last_touch',
            attributedRevenue: input.netRevenue,
            attributionWindowDays: primary.windowDays,
            occurredAt: now,
          },
        });
        await tx.marketingAutomationTouch.update({
          where: { id: primary.raw.id },
          data: {
            status: 'converted',
            convertedAt: now,
            conversionType: 'order',
            actualRevenue: { increment: input.netRevenue },
          },
        });
      }
    } else {
      const existed = await tx.marketingPageAttribution.findFirst({
        where: { orderId: input.orderId },
        select: { id: true },
      });
      if (!existed) {
        await tx.marketingPageAttribution.create({
          data: {
            leadId: primary.raw.id,
            pageId: primary.raw.pageId,
            customerId: input.customerId,
            orderId: input.orderId,
            attributionType: 'last_touch',
            attributedRevenue: input.netRevenue,
            attributionWindowDays: primary.windowDays,
            touchedAt: primary.occurredAt,
            convertedAt: now,
          },
        });
        await tx.marketingPageLead.update({
          where: { id: primary.raw.id },
          data: { status: 'converted', convertedAt: now },
        });
      }
    }

    if (isMarketingFeatureEnabledForStore(this.featureFlags, 'effectFactWrite', input.storeId)) {
      if (primary.source === 'automation' && primary.dimensions.touchId && tx.marketingEffectFact?.updateMany) {
        await tx.marketingEffectFact.updateMany({
          where: {
            storeId: input.storeId,
            factType: 'conversion',
            sourceSystem: 'terminal_follow_up',
            touchId: primary.dimensions.touchId,
            orderId: null,
            isPrimary: true,
          },
          data: { isPrimary: false },
        });
      }
      await this.factService.recordFact(
        {
          storeId: input.storeId,
          factType: 'conversion',
          metricSource: 'actual',
          sourceSystem: 'marketing_attribution',
          sourceEventId: `order:${input.orderId}`,
          countValue: 1,
          dimensions: primary.dimensions,
          occurredAt: now,
        },
        tx,
      );
      await this.factService.recordFact(
        {
          storeId: input.storeId,
          factType: 'revenue',
          metricSource: 'actual',
          sourceSystem: 'marketing_attribution',
          sourceEventId: `order:${input.orderId}`,
          amountValue: input.netRevenue,
          dimensions: primary.dimensions,
          occurredAt: now,
        },
        tx,
      );
      for (const assist of candidates.slice(1)) {
        await this.factService.recordFact(
          {
            storeId: input.storeId,
            factType: 'conversion',
            metricSource: 'actual',
            sourceSystem: 'marketing_attribution_assist',
            sourceEventId: `order:${input.orderId}:assist:${assist.source}:${assist.id}`,
            countValue: 1,
            dimensions: assist.dimensions,
            isPrimary: false,
            metadata: { assistForOrderId: input.orderId, primarySource: primary.source },
            occurredAt: now,
          },
          tx,
        );
      }
    }

    if (primary.source === 'automation' && this.commissionService) {
      await this.commissionService.recordAmiContribution(
        {
          storeId: input.storeId,
          category: 'marketing_conversion',
          triggerType: 'automation',
          triggerId: primary.id,
          customerId: input.customerId,
          orderId: input.orderId,
          revenueAmount: input.netRevenue,
          metadata: {
            strategyId: primary.dimensions.strategyId,
            executionId: primary.dimensions.executionId,
            attributionWindowDays: primary.windowDays,
          },
        },
        tx,
      );
    }

    return { attributed: true, primarySource: primary.source, primaryId: primary.id };
  }

  async reverseOrder(input: ReverseMarketingOrderInput, transactionClient?: any) {
    if (input.refundAmount <= 0) return { reversed: false };
    const tx = transactionClient ?? this.prisma;
    const now = input.occurredAt ?? new Date();
    const [automationAttributions, pageAttributions, primaryFact] = await Promise.all([
      tx.marketingAttribution.findMany({ where: { orderId: input.orderId }, include: { touch: true } }),
      tx.marketingPageAttribution.findMany({ where: { orderId: input.orderId }, include: { page: true } }),
      tx.marketingEffectFact?.findFirst
        ? tx.marketingEffectFact.findFirst({
            where: { storeId: input.storeId, orderId: input.orderId, factType: 'revenue', isPrimary: true },
          })
        : null,
    ]);

    for (const attribution of automationAttributions) {
      await tx.marketingAttribution.update({
        where: { id: attribution.id },
        data: { attributedRevenue: Math.max(0, Number(attribution.attributedRevenue ?? 0) - input.refundAmount) },
      });
      await tx.marketingAutomationTouch.update({
        where: { id: attribution.touchId },
        data: { actualRevenue: Math.max(0, Number(attribution.touch?.actualRevenue ?? 0) - input.refundAmount) },
      });
    }
    for (const attribution of pageAttributions) {
      await tx.marketingPageAttribution.update({
        where: { id: attribution.id },
        data: { attributedRevenue: Math.max(0, Number(attribution.attributedRevenue ?? 0) - input.refundAmount) },
      });
    }

    if (isMarketingFeatureEnabledForStore(this.featureFlags, 'effectFactWrite', input.storeId)) {
      const fallback = automationAttributions[0]
        ? {
            strategyId: automationAttributions[0].touch?.strategyId,
            executionId: automationAttributions[0].touch?.executionId,
            touchId: automationAttributions[0].touchId,
            channel: automationAttributions[0].touch?.channel,
          }
        : pageAttributions[0]
          ? {
              activityId: pageAttributions[0].page?.activityId,
              pageId: pageAttributions[0].pageId,
              recommendationInstanceId: pageAttributions[0].page?.recommendationInstanceId,
              adoptionId: pageAttributions[0].page?.adoptionId,
            }
          : {};
      await this.factService.recordFact(
        {
          storeId: input.storeId,
          factType: 'revenue_refund',
          metricSource: 'actual',
          sourceSystem: 'marketing_attribution',
          sourceEventId: `refund:${input.refundId}`,
          amountValue: -Math.abs(input.refundAmount),
          dimensions: {
            ...this.dimensionsFromFact(primaryFact),
            ...fallback,
            orderId: input.orderId,
            refundId: input.refundId,
          },
          occurredAt: now,
        },
        tx,
      );
    }
    return { reversed: automationAttributions.length > 0 || pageAttributions.length > 0 };
  }

  private promotionFromActions(actions: unknown) {
    if (!Array.isArray(actions)) return null;
    const id = actions
      .map((action: any) => Number(action?.promotionId))
      .find((value) => Number.isInteger(value) && value > 0);
    return id ?? null;
  }

  private promotionFromSnapshot(snapshot: unknown) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    const value = snapshot as Record<string, any>;
    const id = Number(value.primaryPromotionId ?? value.offer?.promotionId ?? value.selectedPromotion?.promotionId);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private dimensionsFromFact(fact: any): MarketingFactDimensions {
    if (!fact) return {};
    const fields: Array<keyof MarketingFactDimensions> = [
      'recommendationInstanceId',
      'adoptionId',
      'activityId',
      'pageId',
      'strategyId',
      'executionId',
      'touchId',
      'deliveryJobId',
      'terminalFollowUpTaskId',
      'promotionId',
      'customerId',
      'channel',
    ];
    return Object.fromEntries(
      fields.filter((field) => fact[field] !== null && fact[field] !== undefined).map((field) => [field, fact[field]]),
    );
  }
}
