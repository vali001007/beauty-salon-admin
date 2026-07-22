import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { RecommendationCandidate } from './marketing-recommendation.types.js';

@Injectable()
export class MarketingRecommendationOfferService {
  constructor(private readonly prisma: PrismaService) {}

  async match(storeId: number, candidate: RecommendationCandidate, now = new Date()): Promise<RecommendationCandidate> {
    const [matched] = await this.matchMany(storeId, [candidate], now);
    return matched;
  }

  async matchMany(storeId: number, candidates: RecommendationCandidate[], now = new Date()): Promise<RecommendationCandidate[]> {
    if (!candidates.length) return [];
    const promotions = await this.prisma.promotion.findMany({
      where: {
        status: 'active',
        approvalStatus: 'approved',
        OR: [{ storeId }, { storeId: null }],
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      },
      orderBy: [{ storeId: 'desc' }, { updatedAt: 'desc' }],
    } as any);
    const available = (promotions as any[]).filter((promotion) =>
      promotion.maxIssueCount == null || Number(promotion.issuedCount ?? 0) < Number(promotion.maxIssueCount),
    );
    return candidates.map((candidate) => this.matchFromPool(storeId, candidate, available, now));
  }

  private matchFromPool(
    storeId: number,
    candidate: RecommendationCandidate,
    available: any[],
    now: Date,
  ): RecommendationCandidate {
    const ranked = available
      .map((promotion) => this.score(storeId, candidate, promotion))
      .filter((item) => item.relevanceScore > 0)
      .sort((left, right) => right.totalScore - left.totalScore || left.promotion.id - right.promotion.id);
    const selected = ranked[0];
    if (!selected) {
      return {
        ...candidate,
        offerContext: {
          ...candidate.offerContext,
          selectedPromotionId: null,
          alternatives: [],
          fitBreakdown: null,
        },
      };
    }

    const promotion = selected.promotion;
    const originalOffer = this.object(candidate.offerContext.offer);
    return {
      ...candidate,
      offerContext: {
        ...candidate.offerContext,
        selectedPromotionId: promotion.id,
        offer: {
          ...originalOffer,
          promotionId: promotion.id,
          promotionName: promotion.name,
          type: promotion.type ?? originalOffer.type,
          label: promotion.discountText ?? originalOffer.label,
          thresholdAmount: this.numberOrNull(promotion.thresholdAmount),
          discountAmount: this.numberOrNull(promotion.discountAmount),
          discountRate: promotion.discountRate ?? null,
          validDays: promotion.validDays ?? originalOffer.validDays,
          estimatedCost: this.numberOrNull(promotion.estimatedCost),
        },
        alternatives: ranked.slice(1, 4).map((item) => this.promotionView(item.promotion, item.totalScore)),
        fitBreakdown: {
          score: selected.totalScore,
          relevanceScore: selected.relevanceScore,
          reasons: selected.reasons,
          matchedAt: now.toISOString(),
        },
        riskWarnings: [
          ...(candidate.offerContext.riskWarnings ?? []),
          ...this.stringArray(this.object(promotion.metadata).riskWarnings),
        ],
      },
    };
  }

  private score(storeId: number, candidate: RecommendationCandidate, promotion: any) {
    const reasons: string[] = [];
    let relevanceScore = 0;
    const context = JSON.stringify({
      recommendationKey: candidate.recommendationKey,
      audienceRule: candidate.audienceRule,
      strategySnapshot: candidate.strategySnapshot,
      evidenceSnapshot: candidate.evidenceSnapshot,
    }).toLowerCase();
    const scenario = String(promotion.scenario ?? '').toLowerCase();
    if (scenario && context.includes(scenario)) {
      relevanceScore += 35;
      reasons.push(`场景匹配:${promotion.scenario}`);
    }
    const offerType = String(this.object(candidate.offerContext.offer).type ?? '').toLowerCase();
    if (offerType && offerType === String(promotion.type ?? '').toLowerCase()) {
      relevanceScore += 20;
      reasons.push(`权益类型匹配:${promotion.type}`);
    }
    const audienceTags = this.stringArray(promotion.audienceTags);
    const matchedTags = audienceTags.filter((tag) => context.includes(tag.toLowerCase()));
    if (matchedTags.length) {
      relevanceScore += Math.min(20, matchedTags.length * 5);
      reasons.push(`受众标签匹配:${matchedTags.join(',')}`);
    }
    const recommendedItemIds = this.recommendedItemIds(candidate.strategySnapshot);
    const applicableProjectIds = this.numberArray(promotion.applicableProjectIds);
    if (recommendedItemIds.some((id) => applicableProjectIds.includes(id))) {
      relevanceScore += 20;
      reasons.push('推荐项目匹配');
    }
    const storeScore = promotion.storeId === storeId ? 15 : 5;
    return { promotion, relevanceScore, totalScore: relevanceScore + storeScore, reasons };
  }

  private recommendedItemIds(strategySnapshot: Record<string, unknown> | undefined) {
    const items = this.object(strategySnapshot).recommendedItems;
    if (!Array.isArray(items)) return [];
    return items.map((item) => Number(this.object(item).id)).filter((id) => Number.isInteger(id) && id > 0);
  }

  private promotionView(promotion: any, fitScore: number) {
    return {
      promotionId: promotion.id,
      promotionName: promotion.name,
      discountText: promotion.discountText,
      type: promotion.type,
      scenario: promotion.scenario,
      fitScore,
    };
  }

  private object(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private stringArray(value: unknown) {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }

  private numberArray(value: unknown) {
    return Array.isArray(value) ? value.map(Number).filter((item) => Number.isInteger(item) && item > 0) : [];
  }

  private numberOrNull(value: unknown) {
    if (value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
