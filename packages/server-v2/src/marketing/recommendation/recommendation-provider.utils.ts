import type {
  RecommendationBuildContext,
  RecommendationCandidate,
  RecommendationExecutionMode,
  RecommendationSourceType,
} from './marketing-recommendation.types.js';

function executionMode(value: unknown): RecommendationExecutionMode | null {
  const normalized = String(value ?? '');
  if (normalized === 'advisor_task') return 'terminal_follow_up';
  return ['activity', 'automation', 'terminal_follow_up'].includes(normalized)
    ? normalized as RecommendationExecutionMode
    : null;
}

function expiry(card: any, context: RecommendationBuildContext, defaultHours: number) {
  const value = card.expiresAt ?? card.offer?.expiresAt;
  const parsed = value ? new Date(value) : null;
  if (parsed && Number.isFinite(parsed.getTime())) return parsed;
  const windowMs = defaultHours * 3600000;
  const businessStart = new Date(`${context.businessDate}T00:00:00+08:00`).getTime();
  const elapsed = Math.max(0, context.generatedAt.getTime() - businessStart);
  const windowEnd = businessStart + (Math.floor(elapsed / windowMs) + 1) * windowMs;
  return new Date(windowEnd);
}

function priority(card: any): 'P0' | 'P1' | 'P2' {
  if (['P0', 'P1', 'P2'].includes(card.priority)) return card.priority;
  if (card.urgency === 'urgent' || card.priority === 'high') return 'P0';
  if (card.urgency === 'opportunity' || card.priority === 'low') return 'P2';
  return 'P1';
}

export function normalizeRecommendationCard(
  card: any,
  context: RecommendationBuildContext,
  sourceType: RecommendationSourceType,
  recommendationKey: string,
  defaultExpiryHours: number,
): RecommendationCandidate {
  const audienceSnapshot = card.audienceSnapshot ?? {};
  const customerIds = [...new Set(
    (card.targetCustomerIds ?? audienceSnapshot.customerIds ?? [])
      .map(Number)
      .filter((id: number) => Number.isInteger(id) && id > 0),
  )] as number[];
  const modes = [...new Set(
    (card.executionModes ?? [card.preferredMode ?? 'activity'])
      .map(executionMode)
      .filter(Boolean),
  )] as RecommendationExecutionMode[];
  const preferredMode = executionMode(card.preferredMode) ?? modes[0] ?? 'activity';
  const sampleReasons = Array.isArray(audienceSnapshot.sampleReasons) ? audienceSnapshot.sampleReasons : [];
  const rawOffer = card.offer && typeof card.offer === 'object' ? card.offer : null;
  const canonicalOffer = rawOffer ? { ...rawOffer } : null;
  if (canonicalOffer) {
    delete canonicalOffer.promotionId;
    delete canonicalOffer.promotionName;
    delete canonicalOffer.fitScore;
    delete canonicalOffer.riskWarnings;
  }

  return {
    recommendationKey,
    sourceType,
    sourceVersion: String(card.sourceVersion ?? card.modelVersion ?? context.predictionModelVersion),
    title: String(card.title ?? recommendationKey),
    description: String(card.reason ?? card.description ?? ''),
    priority: priority(card),
    urgency: ['urgent', 'recommended', 'opportunity'].includes(card.urgency) ? card.urgency : 'recommended',
    preferredMode,
    executionModes: modes.length ? modes : [preferredMode],
    customerIds,
    audienceRule: card.audienceRule ?? card.triggerRule ?? { ruleSummary: audienceSnapshot.ruleSummary ?? card.targetCustomers },
    audienceReasons: sampleReasons.map((item: any) => ({
      customerId: Number(item.customerId),
      score: Number(item.score ?? 0),
      reason: String(item.reason ?? '命中推荐规则'),
    })).filter((item: any) => Number.isInteger(item.customerId) && item.customerId > 0),
    evidenceSnapshot: {
      legacyRecommendationId: Number.isInteger(Number(card.id)) ? Number(card.id) : null,
      dataEvidence: card.dataEvidence ?? [],
      sourceSignals: card.sourceSignals ?? [],
      recommendationType: card.recommendationType ?? card.predictionType ?? card.triggerType,
      audienceSnapshot,
    },
    strategySnapshot: {
      triggerRule: card.triggerRule ?? null,
      recommendedActions: card.recommendedActions ?? [],
      recommendedChannels: card.recommendedChannels ?? [],
      recommendedItems: card.recommendedItems ?? [],
      modeReason: card.modeReason ?? null,
    },
    offerContext: {
      selectedPromotionId: null,
      offer: canonicalOffer,
      alternatives: [],
      fitBreakdown: null,
      inventorySnapshot: card.inventorySnapshot ?? null,
      capacitySnapshot: card.capacitySnapshot ?? null,
      riskWarnings: card.riskWarnings ?? [],
    },
    expiresAt: expiry(card, context, defaultExpiryHours),
  };
}
